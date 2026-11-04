import { normalize, tokens } from './text';
import type { MatchType, Product } from './types';
import { sizeRatio } from './units';

export interface Equivalent {
  product: Product;
  matchType: MatchType;
}

const SIZE_WORD = /^(\d+([.,]\d+)?|x|kg|g|gr|grs|l|ml|cl|ud|uds|pack|brik|bricks?|botella|lata|bote|paquete)$/;

/** Name words that identify the product, without sizes and pack words. */
function identityWords(p: Product): Set<string> {
  const brand = new Set(tokens(p.brand ?? ''));
  return new Set(tokens(p.name).filter((w) => !SIZE_WORD.test(w) && !brand.has(w)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Same brand and near-identical name, but a different pack size. */
export function isSameProductOtherSize(a: Product, b: Product): boolean {
  if (!a.brand || !b.brand || normalize(a.brand) !== normalize(b.brand)) return false;
  const ratio = sizeRatio(a.size, b.size);
  if (ratio === null || Math.abs(ratio - 1) < 0.01) return false;
  return jaccard(identityWords(a), identityWords(b)) >= 0.6;
}

/**
 * Matching rules from the spec: exact EAN match first; then the same product in another
 * size; then own-brand equivalents in the same category at a similar size.
 */
export function findEquivalents(target: Product, products: Product[]): Equivalent[] {
  const out: Equivalent[] = [];
  const seen = new Set<string>([target.id]);
  const add = (product: Product, matchType: MatchType) => {
    if (seen.has(product.id)) return;
    seen.add(product.id);
    out.push({ product, matchType });
  };

  if (target.ean) {
    for (const p of products) if (p.ean === target.ean) add(p, 'exact');
  }
  for (const p of products) if (isSameProductOtherSize(target, p)) add(p, 'same_product_other_size');
  if (target.categoryId) {
    for (const p of products) {
      if (!p.isOwnBrand || p.categoryId !== target.categoryId) continue;
      const ratio = sizeRatio(p.size, target.size);
      if (ratio === null || ratio < 0.4 || ratio > 2.5) continue;
      add(p, 'own_brand_equivalent');
    }
  }
  return out;
}
