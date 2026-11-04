/**
 * Barcode lookup (F9): EAN-13, EAN-8 and UPC-A codes from the camera or typed by hand.
 * A code is looked up in the catalogue first; when it isn't there the result still says
 * something useful (whose own brand it is, or that it is a shop's in-store code), so the
 * app never ends on a bare "not found".
 */
import { CATEGORY_BY_ID } from './categories';
import { CHAINS } from './chains';
import { isOwnBrandEquivalent } from './matching';
import type { ChainId, PriceObservation, Product } from './types';

export type BarcodeFormat = 'ean13' | 'ean8' | 'upc_a';

export interface ParsedBarcode {
  /** The digits as typed or scanned. */
  digits: string;
  format: BarcodeFormat;
  /** Form used for comparing codes: EAN-8 as is, UPC-A and EAN-13 as 13 digits. */
  gtin: string;
  /** Whether the last digit matches the GS1 check digit. */
  checkDigitOk: boolean;
}

/** GS1 check digit for the digits before it: weights 3, 1, 3, … from the right, mod 10. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

const LENGTH_FORMAT: Record<number, BarcodeFormat> = { 8: 'ean8', 12: 'upc_a', 13: 'ean13' };

/**
 * Reads an EAN-13, EAN-8 or UPC-A code. Spaces, dots and dashes are ignored (people copy
 * the digits as printed: "8 480000 042417"). Returns null for anything else.
 */
export function parseBarcode(input: string): ParsedBarcode | null {
  const digits = input.replace(/[\s.-]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const format = LENGTH_FORMAT[digits.length];
  if (!format) return null;
  return {
    digits,
    format,
    gtin: format === 'upc_a' ? `0${digits}` : digits,
    checkDigitOk: gtinCheckDigit(digits.slice(0, -1)) === Number(digits[digits.length - 1]),
  };
}

/** True for an EAN-13, EAN-8 or UPC-A code with a correct check digit. */
export function isValidBarcode(input: string): boolean {
  return parseBarcode(input)?.checkDigitOk ?? false;
}

/**
 * Comparable form of a code stored in the catalogue: shops sometimes store UPC-A as 12
 * digits or pad codes to 14 digits (GTIN-14 with a leading 0).
 */
export function gtinKey(code: string): string | null {
  let d = code.replace(/\D/g, '');
  if (d.length === 14 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) d = `0${d}`;
  return d.length === 13 || d.length === 8 ? d : null;
}

/** Digits grouped as printed under the bars: "8 480000 042417", "9638 5074", "0 36000 29145 2". */
export function formatBarcode(code: string): string {
  const d = code.replace(/\D/g, '');
  if (d.length === 13) return `${d.slice(0, 1)} ${d.slice(1, 7)} ${d.slice(7)}`;
  if (d.length === 12) return `${d.slice(0, 1)} ${d.slice(1, 6)} ${d.slice(6, 11)} ${d.slice(11)}`;
  if (d.length === 8) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return code;
}

export interface OwnBrandPrefix {
  /** Leading digits of the 13-digit code (the chain's GS1 company prefix). */
  prefix: string;
  chain: ChainId;
}

/**
 * Chains that put their own company prefix on own-brand packs. Keep this list to prefixes
 * checked on real packs or catalogue data: a wrong entry would call a branded product
 * "own brand". To add a chain, add a line here and a test in test/barcode.test.ts.
 */
export const OWN_BRAND_PREFIXES: readonly OwnBrandPrefix[] = [
  // Mercadona: Hacendado, Deliplus, Bosque Verde and Compy packs all start 84 80000.
  { prefix: '8480000', chain: 'mercadona' },
];

/** The chain whose own brand uses this code's company prefix, if we know it. */
export function ownBrandPrefixOf(gtin: string): OwnBrandPrefix | null {
  return gtin.length === 13 ? (OWN_BRAND_PREFIXES.find((o) => gtin.startsWith(o.prefix)) ?? null) : null;
}

/**
 * GS1 "restricted circulation" ranges: codes the shop prints itself (weighed fruit, deli
 * counter, bakery, reduced-price labels). They differ from shop to shop.
 */
function isInStoreCode(gtin: string): boolean {
  return gtin.length === 13 && (gtin.startsWith('2') || gtin.startsWith('02') || gtin.startsWith('04'));
}

export type BarcodeLookup =
  /** Products with this code, cheapest first (one per chain that sells it). */
  | { kind: 'found'; code: string; products: Product[] }
  /** Not in the catalogue, but the prefix says whose own brand it is. */
  | { kind: 'own_brand'; code: string; chain: ChainId; brands: string[] }
  /** A shop's own label (weighed products and similar), not a product code. */
  | { kind: 'in_store'; code: string }
  /** A valid code we don't have yet. */
  | { kind: 'unknown'; code: string }
  /** Wrong length or letters ('format'), or a typo ('check_digit'). */
  | { kind: 'invalid'; code: string; reason: 'format' | 'check_digit' };

/** Latest price of a product, when known. The app passes its latest-price map. */
export type PriceOf = (product: Product) => Pick<PriceObservation, 'price' | 'unitPrice'> | undefined;

function byPrice(priceOf: PriceOf | undefined) {
  return (a: Product, b: Product) => {
    const pa = priceOf?.(a);
    const pb = priceOf?.(b);
    return (pa?.price ?? Infinity) - (pb?.price ?? Infinity)
      || (pa?.unitPrice ?? Infinity) - (pb?.unitPrice ?? Infinity)
      || CHAINS[a.chain].name.localeCompare(CHAINS[b.chain].name);
  };
}

/**
 * Looks a scanned or typed code up in the catalogue. The catalogue is checked before the
 * check digit: if a shop lists a code, that code is what the pack says.
 */
export function lookupBarcode(input: string, products: Product[], priceOf?: PriceOf): BarcodeLookup {
  const parsed = parseBarcode(input);
  const code = parsed?.digits ?? input.trim();
  if (!parsed) return { kind: 'invalid', code, reason: 'format' };

  const matches = products.filter((p) => p.ean && gtinKey(p.ean) === parsed.gtin);
  if (matches.length > 0) return { kind: 'found', code, products: matches.sort(byPrice(priceOf)) };
  if (!parsed.checkDigitOk) return { kind: 'invalid', code, reason: 'check_digit' };

  const own = ownBrandPrefixOf(parsed.gtin);
  if (own) return { kind: 'own_brand', code, chain: own.chain, brands: CHAINS[own.chain].ownBrands };
  if (isInStoreCode(parsed.gtin)) return { kind: 'in_store', code };
  return { kind: 'unknown', code };
}

/**
 * Own-brand products at every chain for a generic item ("milk"), near its reference size:
 * what to show when an own-brand code isn't in the catalogue yet. Cheapest per kg / L /
 * unit first when prices are given.
 */
export function ownBrandOptions(categoryId: string, products: Product[], priceOf?: PriceOf): Product[] {
  const category = CATEGORY_BY_ID[categoryId];
  if (!category) return [];
  const unit = (p: Product) => {
    const o = priceOf?.(p);
    return o?.unitPrice ?? o?.price ?? Infinity;
  };
  return products
    .filter((p) => isOwnBrandEquivalent(p, categoryId, category.defaultSize))
    .sort((a, b) => unit(a) - unit(b) || CHAINS[a.chain].name.localeCompare(CHAINS[b.chain].name));
}
