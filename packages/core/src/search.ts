import { resolveItemText } from './list';
import { normalize, tokenMatches, tokens } from './text';
import type { Product } from './types';

export interface SearchHit {
  product: Product;
  /** 0–1, higher is more relevant. */
  score: number;
}

const STOP = new Set(['de', 'del', 'la', 'el', 'les', 'los', 'las', 'a', 'en', 'con', 'amb', 'per', 'para', 'of', 'the', 'd', 'l']);

function wordScore(q: string, words: string[]): number {
  let best = 0;
  for (const w of words) {
    if (w === q) return 1;
    if (q.length >= 3 && w.startsWith(q)) best = Math.max(best, 0.9);
    else if (tokenMatches(q, w)) best = Math.max(best, 0.7);
  }
  return best;
}

/**
 * Typo-tolerant product search in Catalan, Spanish or English. Text matches on name and
 * brand; a query that names a generic item ("milk", "llet") also finds that category's
 * products, so English queries work on Spanish product names.
 */
export function searchProducts(query: string, products: Product[], limit = 50): SearchHit[] {
  const qWords = tokens(query).filter((w) => !STOP.has(w));
  if (qWords.length === 0) return [];
  const resolved = resolveItemText(query);
  const categoryId = resolved && resolved.score >= 0.75 ? resolved.categoryId : null;

  const hits: SearchHit[] = [];
  for (const p of products) {
    const words = tokens(`${p.name} ${p.brand ?? ''}`);
    let text = 0;
    let allMatched = true;
    for (const q of qWords) {
      const s = wordScore(q, words);
      if (s === 0) {
        allMatched = false;
        break;
      }
      text += s;
    }
    let score = allMatched ? (text / qWords.length) * 0.95 : 0;
    if (categoryId && p.categoryId === categoryId) score = Math.max(score, 0.8);
    if (score > 0) {
      if (p.ean && normalize(query) === p.ean) score = 1;
      hits.push({ product: p, score });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
  return hits.slice(0, limit);
}

/** Finds a product by barcode. */
export function findByEan(ean: string, products: Product[]): Product[] {
  const code = ean.replace(/\D/g, '');
  return products.filter((p) => p.ean === code);
}

export interface ProductGroup {
  /** EAN when known, so the same product at several chains shows as one result. */
  key: string;
  products: Product[];
  score: number;
}

/** Groups hits so one national-brand product sold at several chains appears once. */
export function groupHits(hits: SearchHit[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const h of hits) {
    const key = h.product.ean ? `ean:${h.product.ean}` : `id:${h.product.id}`;
    const g = groups.get(key);
    if (g) {
      g.products.push(h.product);
      g.score = Math.max(g.score, h.score);
    } else groups.set(key, { key, products: [h.product], score: h.score });
  }
  return [...groups.values()];
}
