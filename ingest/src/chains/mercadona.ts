/**
 * Mercadona: the online shop's JSON API (tienda.mercadona.es/api). Prices depend on the
 * warehouse ("wh") that serves a postal code. The category tree lists every product with
 * its price; brand and EAN come from the product detail endpoint, fetched only for
 * products we have not seen before.
 */
import { classifyProduct, isOwnBrand, parseSize, round, toSize, type Size } from '@pricing/core';
import type { PoliteClient } from '../http';
import type { ScrapedPrice, ScrapedProduct, ScrapeResult } from '../types';

export const MERCADONA_API = 'https://tienda.mercadona.es/api';
export const DEFAULT_WAREHOUSE = 'bcn1';

// Response shapes (only the fields we use).
export interface MercadonaPriceInstructions {
  unit_price: string | number | null;
  bulk_price?: string | number | null;
  reference_price?: string | number | null;
  reference_format?: string | null;
  unit_size?: number | null;
  size_format?: string | null;
  is_pack?: boolean;
  pack_size?: number | null;
  total_units?: number | null;
  previous_unit_price?: string | number | null;
  price_decreased?: boolean;
  approx_size?: boolean;
}

export interface MercadonaProductSummary {
  id: string;
  display_name: string;
  packaging?: string | null;
  thumbnail?: string | null;
  published?: boolean;
  price_instructions: MercadonaPriceInstructions;
}

export interface MercadonaCategoryTree {
  results: { id: number; name: string; categories: { id: number; name: string }[] }[];
}

export interface MercadonaCategoryDetail {
  id: number;
  name: string;
  categories: { id: number; name: string; products: MercadonaProductSummary[] }[];
}

export interface MercadonaProductDetail {
  id: string;
  ean?: string | null;
  brand?: string | null;
  display_name: string;
}

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const REFERENCE_UNIT: Record<string, Size['unit']> = { kg: 'kg', l: 'l', ud: 'unit', u: 'unit', unidad: 'unit' };

/** Pack size from price instructions, falling back to the name and packaging text. */
export function mercadonaSize(p: MercadonaProductSummary): Size | null {
  const pi = p.price_instructions;
  const amount = num(pi.unit_size);
  if (amount && pi.size_format) {
    const size = toSize(amount, pi.size_format);
    if (size) return size;
  }
  return parseSize(`${p.display_name} ${p.packaging ?? ''}`);
}

/** Brand guess from the display name, used until the product detail gives the real one. */
export function guessBrand(displayName: string): string | undefined {
  const own = ['Hacendado', 'Deliplus', 'Bosque Verde', 'Compy', 'Solcare'];
  return own.find((b) => displayName.toLowerCase().includes(b.toLowerCase()));
}

export function parseMercadonaProduct(p: MercadonaProductSummary, chainCategory: string, detail?: MercadonaProductDetail): ScrapedProduct {
  const brand = detail?.brand?.trim() || guessBrand(p.display_name);
  return {
    chain: 'mercadona',
    chainProductId: String(p.id),
    name: p.display_name.trim(),
    brand,
    ean: detail?.ean?.trim() || undefined,
    isOwnBrand: isOwnBrand('mercadona', brand),
    categoryId: classifyProduct(p.display_name, brand),
    size: mercadonaSize(p),
    imageUrl: p.thumbnail ?? undefined,
    chainCategory,
  };
}

export function parseMercadonaPrice(p: MercadonaProductSummary, zone: string, observedAt: string): ScrapedPrice | null {
  const pi = p.price_instructions;
  const price = num(pi.unit_price);
  if (!price) return null;
  const refUnit = pi.reference_format ? REFERENCE_UNIT[pi.reference_format.trim().toLowerCase()] : undefined;
  const size = mercadonaSize(p);
  // The app labels unit prices with the product's size unit. Some retailers quote
  // per capsule while describing the pack in kg; those bases cannot be interchanged.
  let unitPrice = refUnit && (!size || refUnit === size.unit) ? num(pi.reference_price) ?? num(pi.bulk_price) : null;
  if (unitPrice === null) {
    unitPrice = size ? round(price / size.amount, 4) : null;
  }
  const previous = num(pi.previous_unit_price);
  return {
    chain: 'mercadona',
    chainProductId: String(p.id),
    zone,
    price,
    unitPrice,
    promotion: pi.price_decreased && previous && previous > price ? `was ${previous.toFixed(2)}` : undefined,
    observedAt,
    source: 'online',
  };
}

/** Warehouse serving a postal code, from the header Mercadona sets when the postal code changes. */
export async function mercadonaWarehouse(http: PoliteClient, postalCode: string): Promise<string> {
  const res = await http.request(`${MERCADONA_API}/postal-codes/actions/change-pc/`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ new_postal_code: postalCode }),
  });
  const warehouse = res.headers.get('x-customer-wh');
  if (!warehouse || !/^[a-z0-9_-]+$/i.test(warehouse)) throw new Error(`No verified pricing zone for ${postalCode}`);
  return warehouse;
}

export interface MercadonaOptions {
  warehouse: string;
  /** Fetch brand + EAN for these product ids (usually: ones not stored yet). */
  needsDetail?: (chainProductId: string) => boolean;
  /** Stop after this many leaf categories (for quick test runs). */
  maxCategories?: number;
  now?: Date;
  log?: (msg: string) => void;
}

export async function scrapeMercadona(http: PoliteClient, opts: MercadonaOptions): Promise<ScrapeResult> {
  const wh = opts.warehouse;
  const observedAt = (opts.now ?? new Date()).toISOString();
  const log = opts.log ?? (() => {});
  const tree = await http.json<MercadonaCategoryTree>(`${MERCADONA_API}/categories/?lang=es&wh=${wh}`);
  const leafIds = tree.results.flatMap((top) => top.categories.map((c) => ({ id: c.id, path: `${top.name} > ${c.name}` })));
  const limit = opts.maxCategories ?? leafIds.length;

  const products = new Map<string, ScrapedProduct>();
  const prices = new Map<string, ScrapedPrice>();
  for (const leaf of leafIds.slice(0, limit)) {
    const detail = await http.json<MercadonaCategoryDetail>(`${MERCADONA_API}/categories/${leaf.id}/?lang=es&wh=${wh}`);
    for (const sub of detail.categories) {
      for (const p of sub.products) {
        if (p.published === false || products.has(String(p.id))) continue;
        let productDetail: MercadonaProductDetail | undefined;
        if (opts.needsDetail?.(String(p.id))) {
          try {
            productDetail = await http.json<MercadonaProductDetail>(`${MERCADONA_API}/products/${p.id}/?lang=es&wh=${wh}`);
          } catch (err) {
            log(`detail failed for ${p.id}: ${(err as Error).message}`);
          }
        }
        products.set(String(p.id), parseMercadonaProduct(p, `${leaf.path} > ${sub.name}`, productDetail));
        const price = parseMercadonaPrice(p, wh, observedAt);
        if (price) prices.set(String(p.id), price);
      }
    }
    log(`${leaf.path}: ${products.size} products so far`);
  }
  return { products: [...products.values()], prices: [...prices.values()] };
}
