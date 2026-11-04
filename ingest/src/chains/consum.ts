/**
 * Consum: the online shop's public catalogue search (tienda.consum.es/api/rest/V1.0).
 * The shop shows one price without asking for a location, so Consum is treated as a
 * single price zone. We search once per generic item in our catalogue and keep only
 * products that classify into one of those items.
 */
import { classifyProduct, isOwnBrand, parseSize, round, type Size } from '@pricing/core';
import type { PoliteClient } from '../http';
import type { ScrapedPrice, ScrapedProduct, ScrapeResult } from '../types';
import { genericSearchTerms } from './terms';

export const CONSUM_API = 'https://tienda.consum.es/api/rest/V1.0/catalog/product';
/** Consum's online price applies everywhere; stores use the same zone (see CHAINS.consum). */
export const CONSUM_ZONE = 'cat';
const PAGE_SIZE = 40;

// Response shapes (only the fields we use).
export interface ConsumPrice {
  id?: string;
  value?: { centAmount?: number | string | null; centUnitAmount?: number | string | null };
}

export interface ConsumProduct {
  id: number | string;
  ean?: string | null;
  productData?: { name?: string | null; description?: string | null; url?: string | null; imageURL?: string | null; brand?: { name?: string | null } | null };
  priceData?: { prices?: ConsumPrice[] | null; unitPriceUnitType?: string | null };
}

export interface ConsumSearchPage {
  products?: ConsumProduct[];
  hasMore?: boolean;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** "1 Kg", "1 L", "100 ml", "100 g", "1 Ud" -> the base unit and how much of it the unit price covers. */
const UNIT_TYPES: Record<string, { unit: Size['unit']; per: number }> = {
  '1 kg': { unit: 'kg', per: 1 },
  '1 l': { unit: 'l', per: 1 },
  '100 ml': { unit: 'l', per: 0.1 },
  '100 g': { unit: 'kg', per: 0.1 },
  '100 gr': { unit: 'kg', per: 0.1 },
  '1 ud': { unit: 'unit', per: 1 },
  '1 u': { unit: 'unit', per: 1 },
  '1 dc': { unit: 'unit', per: 12 },
  '1 docena': { unit: 'unit', per: 12 },
};

/** The regular shelf price (id "PRICE"), and an offer price when one is listed. */
function prices(item: ConsumProduct): { price: number | null; unitAmount: number | null; offer: number | null } {
  const list = item.priceData?.prices ?? [];
  const regular = list.find((p) => p.id === 'PRICE') ?? list[0];
  const offer = list.find((p) => p !== regular && p.id !== 'PRICE');
  return {
    price: num(regular?.value?.centAmount),
    unitAmount: num(regular?.value?.centUnitAmount),
    offer: num(offer?.value?.centAmount),
  };
}

function displayName(item: ConsumProduct): string {
  return (item.productData?.description || item.productData?.name || '').replace(/\s+/g, ' ').trim();
}

/** Pack size from price ÷ unit price when the unit type is known, else from the name. */
export function consumSize(item: ConsumProduct): Size | null {
  const { price, unitAmount } = prices(item);
  const type = UNIT_TYPES[(item.priceData?.unitPriceUnitType ?? '').trim().toLowerCase()];
  if (price && unitAmount && type) return { amount: round((price / unitAmount) * type.per, 4), unit: type.unit };
  return parseSize(displayName(item));
}

/**
 * Eggs and detergent are counted in Consum's names, not by weight: "Huevo Campero M Decena
 * 0,83 Dc", "1/2 Docena", "24 Unidades"; "Detergente Líquido 30 Lv" (30 washes; "80 L" on
 * detergents is washes too, not litres).
 */
export function countFromName(name: string, categoryId: string | null): Size | null {
  const n = name.toLowerCase();
  if (categoryId === 'eggs') {
    const units = n.match(/(\d+)\s*(?:unidades|uds?\.?|u\.)(?:\s|$)/);
    if (units) return { amount: Number(units[1]), unit: 'unit' };
    if (/1\/2\s*docena|media docena/.test(n)) return { amount: 6, unit: 'unit' };
    if (/\bdecena\b/.test(n)) return { amount: 10, unit: 'unit' };
    const dozens = n.match(/(\d+(?:[.,]\d+)?)\s*(?:dc|docenas?)\b/);
    if (dozens) return { amount: Math.round(Number(dozens[1]!.replace(',', '.')) * 12), unit: 'unit' };
    if (/\bdocena\b/.test(n)) return { amount: 12, unit: 'unit' };
  }
  if (categoryId === 'laundry_detergent') {
    const washes = n.match(/(\d+)\s*(?:lv|lavados|dosis|l)\b/);
    if (washes && Number(washes[1]) >= 10) return { amount: Number(washes[1]), unit: 'unit' };
  }
  return null;
}

export function parseConsumProduct(item: ConsumProduct): ScrapedProduct | null {
  const name = displayName(item);
  if (!name || item.id === undefined || item.id === null) return null;
  const brand = item.productData?.brand?.name?.trim() || undefined;
  const ean = item.ean && /^\d{8,14}$/.test(item.ean.trim()) ? item.ean.trim() : undefined;
  const categoryId = classifyProduct(name, brand);
  return {
    chain: 'consum',
    chainProductId: String(item.id),
    name,
    brand,
    ean,
    isOwnBrand: isOwnBrand('consum', brand),
    categoryId,
    size: countFromName(name, categoryId) ?? consumSize(item),
    imageUrl: item.productData?.imageURL ?? undefined,
  };
}

/** Prices above this are treated as a parsing error, not a real grocery price. */
const MAX_PRICE = 300;

export function parseConsumPrice(item: ConsumProduct, size: Size | null, observedAt: string): ScrapedPrice | null {
  const { price, unitAmount, offer } = prices(item);
  if (!price || price > MAX_PRICE) return null;
  const type = UNIT_TYPES[(item.priceData?.unitPriceUnitType ?? '').trim().toLowerCase()];
  let unitPrice: number | null = null;
  if (unitAmount && type && (!size || size.unit === type.unit)) unitPrice = round(unitAmount / type.per, 4);
  else if (size) unitPrice = round(price / size.amount, 4);
  return {
    chain: 'consum',
    chainProductId: String(item.id),
    zone: CONSUM_ZONE,
    price,
    unitPrice,
    promotion: offer && offer < price ? `offer ${offer.toFixed(2)}` : undefined,
    observedAt,
    source: 'online',
  };
}

/** One search term per generic item, in Spanish (the shop's language). */
export function consumSearchTerms(): string[] {
  return genericSearchTerms('es');
}

export interface ConsumOptions {
  terms?: string[];
  maxPages?: number;
  now?: Date;
  log?: (msg: string) => void;
}

export async function scrapeConsum(http: PoliteClient, opts: ConsumOptions = {}): Promise<ScrapeResult> {
  const observedAt = (opts.now ?? new Date()).toISOString();
  const log = opts.log ?? (() => {});
  const maxPages = opts.maxPages ?? 3;
  const products = new Map<string, ScrapedProduct>();
  const priceById = new Map<string, ScrapedPrice>();
  for (const term of opts.terms ?? consumSearchTerms()) {
    for (let page = 0; page < maxPages; page++) {
      const url = `${CONSUM_API}?${new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), q: term })}`;
      const data = await http.json<ConsumSearchPage>(url);
      for (const item of data.products ?? []) {
        const product = parseConsumProduct(item);
        // Keep only products that belong to one of our generic items.
        if (!product?.categoryId || products.has(product.chainProductId)) continue;
        const price = parseConsumPrice(item, product.size, observedAt);
        if (!price) continue;
        products.set(product.chainProductId, product);
        priceById.set(product.chainProductId, price);
      }
      if (!data.hasMore) break;
    }
    log(`"${term}": ${products.size} products so far`);
  }
  return { products: [...products.values()], prices: [...priceById.values()] };
}
