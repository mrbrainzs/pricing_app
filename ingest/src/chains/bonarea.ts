/**
 * bonÀrea: the online shop's search page (bonarea-online.com/es/shop/find), which lists
 * every result as server-rendered HTML product cards. bonÀrea has one price for all of
 * Catalonia (zone "cat"). Built against a real page captured from the production server
 * on 4 Nov 2026 (ingest/fixtures/retailer-search/2026-11-04/bonarea-leche.html).
 *
 * A card looks like:
 *   <div class="block-product block-product-shopping none" id=liArticle0>
 *     <a data-identifier=13*0004 data-friendly=https://…/13_0004 class=article-link>
 *       <img data-src="https://images.bonarea.com/…png" …>
 *       <div class=text><p>Leche semidesnatada paq. de 6 brics<div class=weight>6 l</div></div>
 *     </a>
 *     <div class=price><span>5,34 €/u.</span> (0,89 €/l)</div>
 *     … <div class=block-no-stock><span>SIN STOCK</span></div>   (only when out of stock)
 */
import { classifyProduct, detectBrand, parseSize, round, toSize, type Size } from '@pricing/core';
import type { PoliteClient } from '../http';
import type { ScrapedPrice, ScrapedProduct, ScrapeResult } from '../types';
import { genericSearchTerms } from './terms';

export const BONAREA_SEARCH = 'https://www.bonarea-online.com/es/shop/find';
export const BONAREA_ZONE = 'cat';
const CARD = 'class="block-product block-product-shopping none"';

export interface BonareaCard {
  code: string;
  url?: string;
  imageUrl?: string;
  name: string;
  weight?: string;
  /** Shelf price: per item ("5,34 €/u."), per dozen ("2,80 €/d.", eggs), or per kg / litre. */
  price: number | null;
  pricePer: 'u' | 'd' | 'kg' | 'l' | null;
  /** The price line as shown, for diagnostics when it can't be read. */
  priceText?: string;
  unitPrice: { value: number; unit: string } | null;
  outOfStock: boolean;
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

export function decodeHtml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? m);
}

/** "5,34" -> 5.34; "1.234,50" -> 1234.5. */
function euro(text: string): number | null {
  const clean = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Splits a search page into product cards and reads each one. */
export function parseBonareaPage(html: string): BonareaCard[] {
  const out: BonareaCard[] = [];
  for (const chunk of html.split(CARD).slice(1)) {
    // A card ends where the next one starts; cap the length so a broken page can't run away.
    const c = chunk.slice(0, 4000);
    const code = c.match(/data-identifier=["']?([0-9]{2}\*[0-9]+)/)?.[1];
    const name = c.match(/<div class=["']?text["']?><p>([^<]+)/)?.[1];
    if (!code || !name) continue;
    const price = c.match(/<div class=["']?price["']?>\s*<span>\s*([\d.,]+)\s*€\/(u|d|kg|l)\.?\s*<\/span>/);
    const priceLine = c.match(/<div class=["']?price["']?>([\s\S]*?)<\/div>/)?.[1];
    const unit = c.match(/<div class=["']?price["']?>[\s\S]*?<\/span>\s*\(\s*([\d.,]+)\s*€\/(kg|l|ml|u)\.?\s*\)/);
    const unitValue = unit ? euro(unit[1]!) : null;
    out.push({
      code,
      url: c.match(/data-friendly=["']?(https:\/\/[^\s"'>]+)/)?.[1],
      imageUrl: c.match(/data-src=["']?(https:\/\/[^\s"'>]+)/)?.[1]?.replace(/&amp;/g, '&'),
      name: decodeHtml(name).replace(/\s+/g, ' ').trim(),
      weight: c.match(/<div class=["']?weight["']?>([^<]*)<\/div>/)?.[1]?.trim() || undefined,
      price: price ? euro(price[1]!) : null,
      pricePer: price ? (price[2] as BonareaCard['pricePer']) : null,
      priceText: priceLine ? decodeHtml(priceLine.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : undefined,
      unitPrice: unit && unitValue ? { value: unitValue, unit: unit[2]! } : null,
      outOfStock: c.includes('block-no-stock'),
    });
  }
  return out;
}

/**
 * Pack size from the weight line ("6 l", "750 ml.", "aprox. 111 g", "pack 6 u.", "99 cl"),
 * falling back to the name.
 */
export function bonareaSize(card: Pick<BonareaCard, 'weight' | 'name'>): Size | null {
  const weight = card.weight?.replace(/^aprox\.?\s*/i, '').replace(/^pack\s+/i, '');
  const m = weight?.match(/^([\d.,]+)\s*([a-z]+)\.?$/i);
  if (m) {
    // "1,5 l" decimal comma; "1.250 ml" thousands dot.
    const raw = m[1]!;
    const amount = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw);
    // "40 d." on detergents means 40 doses (washes).
    const size = toSize(amount, m[2]!.toLowerCase() === 'd' ? 'dosis' : m[2]!);
    if (size) return size;
  }
  return parseSize(card.name);
}

/**
 * bonÀrea's own products have 4-digit codes ("13*0004"); other brands have 7-digit codes
 * ("13*0096567" La Lechera). Inferred from the 465 cards of the captured page.
 */
export function isBonareaOwnBrand(code: string): boolean {
  return /^\d{2}\*\d{4}$/.test(code);
}

const UNIT_BASE: Record<string, Size['unit'] | undefined> = { kg: 'kg', l: 'l', u: 'unit' };
const MAX_PRICE = 300;

export function cardToProduct(card: BonareaCard): ScrapedProduct {
  // A known brand in the name wins over the code: "Leche entera Pascual" has a 4-digit code too.
  const known = detectBrand(card.name);
  const own = !known && isBonareaOwnBrand(card.code);
  return {
    chain: 'bonarea',
    chainProductId: card.code,
    name: card.name,
    brand: known ?? (own ? 'bonÀrea' : undefined),
    isOwnBrand: own,
    categoryId: classifyProduct(card.name, known),
    // Sold by weight: the shelf price is for 1 kg (or 1 l), whatever the approximate piece weighs.
    size: card.pricePer === 'kg' || card.pricePer === 'l'
      ? { amount: 1, unit: card.pricePer }
      : card.pricePer === 'd' ? { amount: 12, unit: 'unit' } : bonareaSize(card),
    imageUrl: card.imageUrl,
  };
}

export function cardToPrice(card: BonareaCard, size: Size | null, observedAt: string): ScrapedPrice | null {
  if (card.outOfStock || !card.price || card.price > MAX_PRICE) return null;
  const base = card.unitPrice ? UNIT_BASE[card.unitPrice.unit] : undefined;
  let unitPrice: number | null = null;
  if (card.pricePer === 'kg' || card.pricePer === 'l') unitPrice = card.price;
  else if (card.pricePer === 'd') unitPrice = card.unitPrice?.unit === 'u' ? card.unitPrice.value : round(card.price / 12, 4);
  else if (card.unitPrice && base && (!size || size.unit === base)) unitPrice = card.unitPrice.value;
  else if (size) unitPrice = round(card.price / size.amount, 4);
  return {
    chain: 'bonarea',
    chainProductId: card.code,
    zone: BONAREA_ZONE,
    price: card.price,
    unitPrice,
    observedAt,
    source: 'online',
  };
}

export interface BonareaOptions {
  terms?: string[];
  now?: Date;
  log?: (msg: string) => void;
  /** Also log example names for each reason a card was dropped. */
  explain?: boolean;
}

type DropReason = 'already kept' | 'not one of our items' | 'no size' | 'out of stock' | 'price unreadable';

export async function scrapeBonarea(http: PoliteClient, opts: BonareaOptions = {}): Promise<ScrapeResult> {
  const observedAt = (opts.now ?? new Date()).toISOString();
  const log = opts.log ?? (() => {});
  const products = new Map<string, ScrapedProduct>();
  const prices = new Map<string, ScrapedPrice>();
  let emptyPages = 0;
  for (const term of opts.terms ?? genericSearchTerms('es')) {
    const res = await http.request(`${BONAREA_SEARCH}?${new URLSearchParams({ searchWords: term })}`, {
      headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'es-ES,es;q=0.9,ca;q=0.8' },
    });
    const cards = parseBonareaPage(await res.text());
    if (cards.length === 0) emptyPages++;
    const dropped = new Map<DropReason, string[]>();
    const drop = (reason: DropReason, example: string) => dropped.set(reason, [...(dropped.get(reason) ?? []), example]);
    const before = products.size;
    for (const card of cards) {
      if (products.has(card.code)) { drop('already kept', card.name); continue; }
      const product = cardToProduct(card);
      // Keep only products in one of our generic items, with a size to compare by.
      if (!product.categoryId) { drop('not one of our items', card.name); continue; }
      if (!product.size) { drop('no size', `${card.name} [${card.weight ?? 'no weight'}]`); continue; }
      const price = cardToPrice(card, product.size, observedAt);
      if (!price) {
        if (card.outOfStock) drop('out of stock', card.name);
        else drop('price unreadable', `${card.name} [${card.priceText ?? 'no price line'}]`);
        continue;
      }
      products.set(card.code, product);
      prices.set(card.code, price);
    }
    const reasons = [...dropped].map(([r, names]) => `${r} ${names.length}`).join(', ');
    log(`"${term}": ${cards.length} cards, ${products.size - before} new kept${reasons ? ` (dropped: ${reasons})` : ''}`);
    if (opts.explain) {
      for (const [reason, names] of dropped) {
        if (reason === 'already kept') continue;
        log(`    ${reason}: ${names.slice(0, 6).join(' | ')}`);
      }
    }
  }
  if (emptyPages > 0) log(`${emptyPages} searches returned no product cards`);
  return { products: [...products.values()], prices: [...prices.values()] };
}
