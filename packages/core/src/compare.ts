import { CATEGORY_BY_ID } from './categories';
import { freshness, type Freshness, isUsable } from './freshness';
import { distanceKm, type LatLng } from './geo';
import { searchProducts } from './search';
import { normalize } from './text';
import type { BrandLevel, ChainId, ListItem, PriceObservation, Product, Store } from './types';
import { round, sizeRatio } from './units';

export interface CompareOptions {
  /** Stores further than this are ignored. Default 3 km. */
  maxDistanceKm?: number;
  /** Only these chains (the user's usual ones). Default: all. */
  chains?: ChainId[];
  /** A two-store split is suggested only when it saves at least this much. Default €3. */
  minSavingForSplit?: number;
  /** Baskets missing more than this share of items are flagged and ranked lower. Default 0.2. */
  maxMissingShare?: number;
}

export interface CompareInput extends CompareOptions {
  items: ListItem[];
  stores: Store[];
  products: Product[];
  prices: PriceObservation[];
  origin: LatLng;
  now: Date;
}

export interface BasketLine {
  itemId: string;
  product: Product;
  /** Shelf price of the pack picked. */
  price: number;
  unitPrice: number | null;
  /** Cost of the quantity the user asked for, normalised to the item's reference size. */
  cost: number;
  matchType: 'category' | 'search';
  observedAt: string;
  source: PriceObservation['source'];
  freshness: Freshness;
  promotion?: string;
}

export interface StoreBasket {
  store: Store;
  distanceKm: number;
  lines: BasketLine[];
  /** Item ids this store has no match for (they count as missing, never as €0). */
  missing: string[];
  /** What the found items cost here. */
  total: number;
  /** Total plus missing items estimated at their median price elsewhere; used for ranking. */
  comparableTotal: number;
  found: number;
  /** Items that at least one store has (items no store has are left out). */
  requested: number;
  /** True when more than 20% of items are missing; ranked after complete baskets. */
  flagged: boolean;
  staleCount: number;
  /** How much more the next store in the ranking costs (comparable totals). */
  diffToNext: number | null;
}

export interface SplitResult {
  stores: [StoreBasket, StoreBasket];
  /** Lines bought at each of the two stores. */
  lines: [BasketLine[], BasketLine[]];
  total: number;
  comparableTotal: number;
  found: number;
  missing: string[];
  /** Saving vs the best single store. */
  saving: number;
  /** True when the saving reaches the user's minimum. */
  worthIt: boolean;
}

export interface CompareResult {
  ranking: StoreBasket[];
  split: SplitResult | null;
  /** Items no store in range could match. */
  unavailable: string[];
}

type PriceIndex = Map<string, PriceObservation>;

function indexPrices(prices: PriceObservation[], now: Date): PriceIndex {
  const idx: PriceIndex = new Map();
  for (const p of prices) {
    if (!isUsable(p, now)) continue;
    const key = p.storeId ? `${p.productId}|store:${p.storeId}` : `${p.productId}|zone:${p.zone}`;
    const prev = idx.get(key);
    if (!prev || p.observedAt > prev.observedAt) idx.set(key, p);
  }
  return idx;
}

/** Latest usable price for a product at a store: an in-store (receipt) price wins over the zone's online price. */
function priceAt(idx: PriceIndex, product: Product, store: Store): PriceObservation | undefined {
  return idx.get(`${product.id}|store:${store.id}`) ?? idx.get(`${product.id}|zone:${store.zone}`);
}

function fitsLevel(p: Product, level: BrandLevel): boolean {
  if (level.kind === 'any') return true;
  if (level.kind === 'own') return p.isOwnBrand;
  const want = normalize(level.brand);
  if (!want) return true;
  return normalize(p.brand ?? '') === want || normalize(p.name).includes(want);
}

/** Pack sizes accepted for a generic item, relative to its reference size. */
const MIN_SIZE_RATIO = 0.4;
const MAX_SIZE_RATIO = 3;

function lineFor(item: ListItem, product: Product, obs: PriceObservation, now: Date, matchType: BasketLine['matchType']): BasketLine | null {
  let cost: number;
  const unitPrice = obs.unitPrice ?? (product.size ? obs.price / product.size.amount : null);
  const category = item.categoryId ? CATEGORY_BY_ID[item.categoryId] : undefined;
  const def = category?.defaultSize;
  if (matchType === 'category' && def) {
    const ratio = sizeRatio(product.size, def);
    const maxRatio = category?.maxPackRatio ?? MAX_SIZE_RATIO;
    if (ratio === null || ratio < MIN_SIZE_RATIO || ratio > maxRatio || unitPrice === null) return null;
    cost = unitPrice * def.amount * item.quantity;
  } else {
    cost = obs.price * item.quantity;
  }
  return {
    itemId: item.id,
    product,
    price: obs.price,
    unitPrice: unitPrice === null ? null : round(unitPrice, 2),
    cost: round(cost),
    matchType,
    observedAt: obs.observedAt,
    source: obs.source,
    freshness: freshness(obs, now),
    promotion: obs.promotion,
  };
}

function bestLine(item: ListItem, store: Store, chainProducts: Product[], byCategory: Map<string, Product[]>, idx: PriceIndex, now: Date): BasketLine | null {
  let best: BasketLine | null = null;
  const consider = (p: Product, type: BasketLine['matchType']) => {
    if (!fitsLevel(p, item.level)) return;
    const obs = priceAt(idx, p, store);
    if (!obs) return;
    const line = lineFor(item, p, obs, now, type);
    if (!line) return;
    if (!best || line.cost < best.cost || (line.cost === best.cost && line.freshness === 'fresh' && best.freshness !== 'fresh')) best = line;
  };
  if (item.categoryId) {
    for (const p of byCategory.get(item.categoryId) ?? []) consider(p, 'category');
  } else {
    // Free text we could not map to a generic item: use the best search hits at this chain.
    const hits = searchProducts(item.text, chainProducts, 10).filter((h) => h.score >= 0.75);
    const top = hits[0]?.score ?? 0;
    for (const h of hits) if (h.score >= top - 0.05) consider(h.product, 'search');
  }
  return best;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * UC1: ranks the nearest store of each chain by what the whole list costs there, and
 * optionally finds the best two-store split.
 */
export function compareBasket(input: CompareInput): CompareResult {
  const { items, products, now, origin } = input;
  const maxDistanceKm = input.maxDistanceKm ?? 3;
  const minSaving = input.minSavingForSplit ?? 3;
  const maxMissingShare = input.maxMissingShare ?? 0.2;
  const idx = indexPrices(input.prices, now);

  // Nearest store per chain within range.
  const nearest = new Map<ChainId, { store: Store; d: number }>();
  for (const store of input.stores) {
    if (input.chains && !input.chains.includes(store.chain)) continue;
    const d = distanceKm(origin, store);
    if (d > maxDistanceKm) continue;
    const prev = nearest.get(store.chain);
    if (!prev || d < prev.d) nearest.set(store.chain, { store, d });
  }

  const productsByChain = new Map<ChainId, Product[]>();
  for (const p of products) {
    const list = productsByChain.get(p.chain) ?? [];
    list.push(p);
    productsByChain.set(p.chain, list);
  }

  const raw = [...nearest.values()].map(({ store, d }) => {
    const chainProducts = productsByChain.get(store.chain) ?? [];
    const byCategory = new Map<string, Product[]>();
    for (const p of chainProducts) {
      if (!p.categoryId) continue;
      const list = byCategory.get(p.categoryId) ?? [];
      list.push(p);
      byCategory.set(p.categoryId, list);
    }
    const lines = new Map<string, BasketLine>();
    for (const item of items) {
      const line = bestLine(item, store, chainProducts, byCategory, idx, now);
      if (line) lines.set(item.id, line);
    }
    return { store, distanceKm: round(d, 2), lines };
  });

  // Items nobody has are reported once and left out of every basket.
  const unavailable = items.filter((i) => raw.every((r) => !r.lines.has(i.id))).map((i) => i.id);
  const available = items.filter((i) => !unavailable.includes(i.id));
  const medianCost = new Map<string, number>();
  for (const item of available) {
    medianCost.set(item.id, median(raw.flatMap((r) => (r.lines.has(item.id) ? [r.lines.get(item.id)!.cost] : []))));
  }

  const baskets: StoreBasket[] = raw.map(({ store, distanceKm: dist, lines }) => {
    const found = available.filter((i) => lines.has(i.id));
    const missing = available.filter((i) => !lines.has(i.id)).map((i) => i.id);
    const total = round(found.reduce((sum, i) => sum + lines.get(i.id)!.cost, 0));
    const penalty = missing.reduce((sum, id) => sum + (medianCost.get(id) ?? 0), 0);
    return {
      store,
      distanceKm: dist,
      lines: available.flatMap((i) => (lines.has(i.id) ? [lines.get(i.id)!] : [])),
      missing,
      total,
      comparableTotal: round(total + penalty),
      found: found.length,
      requested: available.length,
      flagged: available.length > 0 && missing.length / available.length > maxMissingShare,
      staleCount: [...lines.values()].filter((l) => l.freshness === 'stale').length,
      diffToNext: null,
    };
  });

  baskets.sort(
    (a, b) => Number(a.flagged) - Number(b.flagged) || a.comparableTotal - b.comparableTotal || a.distanceKm - b.distanceKm,
  );
  baskets.forEach((b, i) => {
    const next = baskets[i + 1];
    b.diffToNext = next ? round(next.comparableTotal - b.comparableTotal) : null;
  });

  return { ranking: baskets, split: bestSplit(baskets, available, medianCost, minSaving), unavailable };
}

function bestSplit(baskets: StoreBasket[], items: ListItem[], medianCost: Map<string, number>, minSaving: number): SplitResult | null {
  const best = baskets.find((b) => !b.flagged) ?? baskets[0];
  if (!best || baskets.length < 2) return null;
  let winner: SplitResult | null = null;
  for (let i = 0; i < baskets.length; i++) {
    for (let j = i + 1; j < baskets.length; j++) {
      const a = baskets[i]!;
      const b = baskets[j]!;
      const la = new Map(a.lines.map((l) => [l.itemId, l]));
      const lb = new Map(b.lines.map((l) => [l.itemId, l]));
      const atA: BasketLine[] = [];
      const atB: BasketLine[] = [];
      const missing: string[] = [];
      for (const item of items) {
        const x = la.get(item.id);
        const y = lb.get(item.id);
        if (x && (!y || x.cost <= y.cost)) atA.push(x);
        else if (y) atB.push(y);
        else missing.push(item.id);
      }
      if (atA.length === 0 || atB.length === 0) continue;
      const found = atA.length + atB.length;
      if (found < best.found) continue;
      const total = round([...atA, ...atB].reduce((s, l) => s + l.cost, 0));
      const comparableTotal = round(total + missing.reduce((s, id) => s + (medianCost.get(id) ?? 0), 0));
      const saving = round(best.comparableTotal - comparableTotal);
      if (!winner || saving > winner.saving) {
        winner = { stores: [a, b], lines: [atA, atB], total, comparableTotal, found, missing, saving, worthIt: false };
      }
    }
  }
  if (!winner || winner.saving <= 0) return null;
  winner.worthIt = winner.saving >= minSaving;
  return winner;
}
