/**
 * F12 weekly basket index: every Monday at 07:00 (Barcelona time) the same fixed basket of
 * everyday items is priced at every chain, and chains are ranked by what it costs.
 */
import { CATEGORY_BY_ID } from './categories';
import { CHAINS } from './chains';
import { compareBasket } from './compare';
import { ONLINE_EXPIRES_AFTER_DAYS } from './freshness';
import { fromMadridTime, madridTime } from './madridTime';
import type { SampleData } from './sample';
import type { ChainId, ListItem, PriceObservation, Product, Store } from './types';
import { round } from './units';

/**
 * The index basket: 20 generic items a Barcelona household buys most weeks. PRODUCT
 * DECISION (open, Nov 2026): food staples across every aisle (dairy, bakery, pantry, fresh
 * produce, meat) plus bottled water, chosen from items all three imported chains sell in
 * comparable pack sizes. Left out: things bought monthly or less (salt, sugar, flour,
 * detergent, shampoo, toothpaste, toilet paper), alcohol, and items sold by the piece in
 * very different sizes (lettuce). Changing the list breaks week-on-week comparability for
 * one week, so change it rarely and at a Monday.
 */
export const INDEX_BASKET: readonly string[] = [
  // Dairy and eggs
  'milk', 'eggs', 'yogurt_plain', 'cheese_sliced',
  // Bakery and pantry
  'bread_sliced', 'rice', 'pasta', 'olive_oil_ev', 'tomato_crushed', 'tuna_canned', 'chickpeas', 'coffee_ground',
  // Fresh produce
  'tomatoes', 'bananas', 'apples', 'potatoes', 'onions',
  // Meat
  'chicken_breast', 'ham_cooked',
  // Drinks
  'water',
];

/** Minutes after midnight (Barcelona time) on Monday when the index is taken: 07:00, after the daily import. */
export const INDEX_TIME_MINUTES = 7 * 60;

/** Latest Monday 07:00 Barcelona time at or before `now`. */
export function indexMoment(now: Date): Date {
  const m = madridTime(now);
  const monday = fromMadridTime(m.year, m.month, m.day - m.weekday, INDEX_TIME_MINUTES);
  return monday <= now ? monday : fromMadridTime(m.year, m.month, m.day - m.weekday - 7, INDEX_TIME_MINUTES);
}

/** The same local time one week earlier (7 days ± 1 hour across a clock change). */
export function previousIndexMoment(at: Date): Date {
  const m = madridTime(at);
  return fromMadridTime(m.year, m.month, m.day - 7, m.minutes);
}

export interface IndexLine {
  itemId: string;
  productId: string;
  productName: string;
  brand?: string;
  isOwnBrand: boolean;
  /** Shelf price of the pack picked. */
  price: number;
  /** Cost of the item's reference size (1 L of milk, 12 eggs…): the amount that counts in the total. */
  cost: number;
  observedAt: string;
  promotion?: string;
}

export interface ChainIndex {
  chain: ChainId;
  /** Pricing zone used (Mercadona prices differ by warehouse). */
  zone: string;
  /** What the items found cost, at their reference sizes. */
  total: number;
  found: number;
  /** Basket items with no price at this chain; never counted as €0. */
  missing: string[];
  /** False when more than 20% of the basket is missing: listed, but not ranked. */
  ranked: boolean;
  /** 1 = cheapest; null when not ranked. */
  rank: number | null;
  lines: IndexLine[];
}

export interface IndexSnapshot {
  /** When prices were read (ISO). */
  at: string;
  /** Ranked chains, cheapest first, then the chains not ranked. */
  chains: ChainIndex[];
}

export interface IndexChange {
  /** Euros, positive when the basket got dearer. Like for like: only items priced both weeks. */
  amount: number;
  percent: number;
  /** Number of items compared. */
  items: number;
}

export interface WeeklyIndex {
  basket: string[];
  /** Pricing zone used for each chain. */
  zones: Partial<Record<ChainId, string>>;
  current: IndexSnapshot;
  /** Null until there is a previous week of data. */
  previous: IndexSnapshot | null;
  /** Week-on-week change, for chains ranked both weeks. */
  changes: Partial<Record<ChainId, IndexChange>>;
  isSample: boolean;
}

export interface IndexInput {
  products: Product[];
  prices: PriceObservation[];
  /** Pricing zone per chain. Chains not listed use their zone with the most observations. */
  zones?: Partial<Record<ChainId, string>>;
  basket?: readonly string[];
  /** Share of missing items above which a chain is not ranked. Default 0.2. */
  maxMissingShare?: number;
}

/** For each chain, its zone with the most observations (ties: alphabetical). */
export function busiestZones(prices: PriceObservation[]): Partial<Record<ChainId, string>> {
  const counts = new Map<ChainId, Map<string, number>>();
  for (const p of prices) {
    if (p.storeId) continue;
    const zones = counts.get(p.chain) ?? new Map<string, number>();
    zones.set(p.zone, (zones.get(p.zone) ?? 0) + 1);
    counts.set(p.chain, zones);
  }
  const out: Partial<Record<ChainId, string>> = {};
  for (const [chain, zones] of counts) {
    out[chain] = [...zones].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  }
  return out;
}

/**
 * Prices the basket at every chain as of a moment: for each item the cheapest product of
 * any brand (own brand included), normalised to the item's reference size, using each
 * product's latest online price at or before `at` and at most 7 days old. Same matching
 * rules as the shopping-list comparison.
 */
export function basketIndexAt(input: IndexInput & { at: Date }): IndexSnapshot {
  const basket = input.basket ?? INDEX_BASKET;
  const maxMissingShare = input.maxMissingShare ?? 0.2;
  const at = input.at.getTime();
  const oldest = at - ONLINE_EXPIRES_AFTER_DAYS * 86_400_000;
  const prices = input.prices.filter((p) => {
    const t = Date.parse(p.observedAt);
    return !p.storeId && t <= at && t >= oldest;
  });
  const zones = { ...busiestZones(prices), ...input.zones };
  const wanted = new Set(basket);
  const products = input.products.filter((p) => p.categoryId && wanted.has(p.categoryId));

  // One virtual shop per chain, in the zone whose prices we use.
  const chains = new Set(prices.map((p) => p.chain));
  const stores: Store[] = [...chains].flatMap((chain) => {
    const zone = zones[chain];
    return zone ? [{ id: `index:${chain}`, chain, name: CHAINS[chain].name, zone, lat: 0, lng: 0 }] : [];
  });
  const items: ListItem[] = basket
    .filter((id) => CATEGORY_BY_ID[id])
    .map((id) => ({ id, text: id, categoryId: id, level: { kind: 'any' }, quantity: 1 }));
  const result = compareBasket({ items, stores, products, prices, origin: { lat: 0, lng: 0 }, now: input.at, maxDistanceKm: 1 });

  const rows: ChainIndex[] = result.ranking.flatMap((b) => {
    if (b.found === 0) return [];
    const priced = new Set(b.lines.map((l) => l.itemId));
    const missing = basket.filter((id) => !priced.has(id));
    const lines: IndexLine[] = b.lines.map((l) => ({
      itemId: l.itemId,
      productId: l.product.id,
      productName: l.product.name,
      brand: l.product.brand,
      isOwnBrand: l.product.isOwnBrand,
      price: l.price,
      cost: l.cost,
      observedAt: l.observedAt,
      promotion: l.promotion,
    }));
    return [{
      chain: b.store.chain,
      zone: b.store.zone,
      total: round(lines.reduce((sum, l) => sum + l.cost, 0)),
      found: lines.length,
      missing,
      ranked: missing.length / basket.length <= maxMissingShare,
      rank: null,
      lines,
    }];
  });

  rows.sort((a, b) => Number(b.ranked) - Number(a.ranked)
    || (a.ranked ? a.total - b.total : b.found - a.found || a.total - b.total)
    || a.chain.localeCompare(b.chain));
  rows.filter((r) => r.ranked).forEach((r, i) => { r.rank = i + 1; });
  return { at: input.at.toISOString(), chains: rows };
}

/** Week-on-week change per chain, like for like (only items priced in both weeks). */
export function indexChanges(current: IndexSnapshot, previous: IndexSnapshot): Partial<Record<ChainId, IndexChange>> {
  const out: Partial<Record<ChainId, IndexChange>> = {};
  for (const now of current.chains) {
    const before = previous.chains.find((c) => c.chain === now.chain);
    if (!now.ranked || !before?.ranked) continue;
    const old = new Map(before.lines.map((l) => [l.itemId, l.cost]));
    const common = now.lines.filter((l) => old.has(l.itemId));
    const was = common.reduce((sum, l) => sum + old.get(l.itemId)!, 0);
    const is = common.reduce((sum, l) => sum + l.cost, 0);
    if (common.length === 0 || was <= 0) continue;
    out[now.chain] = { amount: round(is - was), percent: round(((is - was) / was) * 100, 1), items: common.length };
  }
  return out;
}

/**
 * This week's index (prices as of the latest Monday 07:00) and last week's, with the change.
 * `previous` is null while there is no earlier week of data with at least one ranked chain.
 */
export function weeklyBasketIndex(input: IndexInput & { now: Date; isSample?: boolean }): WeeklyIndex {
  const at = indexMoment(input.now);
  const zones = { ...busiestZones(input.prices), ...input.zones };
  const current = basketIndexAt({ ...input, zones, at });
  const before = basketIndexAt({ ...input, zones, at: previousIndexMoment(at) });
  const previous = before.chains.some((c) => c.ranked) ? before : null;
  const used: Partial<Record<ChainId, string>> = {};
  for (const c of [...current.chains, ...(previous?.chains ?? [])]) used[c.chain] = c.zone;
  return {
    basket: [...(input.basket ?? INDEX_BASKET)],
    zones: used,
    current,
    previous,
    changes: previous ? indexChanges(current, previous) : {},
    isSample: input.isSample ?? false,
  };
}

/** The index from sample data, using its daily price history (always labelled as sample). */
export function sampleWeeklyIndex(data: SampleData, now: Date): WeeklyIndex {
  const wanted = new Set(INDEX_BASKET);
  const products = data.products.filter((p) => p.categoryId && wanted.has(p.categoryId));
  const zoneOf = new Map(data.prices.map((p) => [p.productId, p.zone]));
  const from = previousIndexMoment(indexMoment(now)).getTime() - ONLINE_EXPIRES_AFTER_DAYS * 86_400_000;
  const prices: PriceObservation[] = products.flatMap((p) => data.history(p.id)
    .filter((h) => Date.parse(h.observedAt) >= from)
    .map((h) => ({
      productId: p.id,
      chain: p.chain,
      zone: zoneOf.get(p.id) ?? 'sample',
      price: h.price,
      unitPrice: p.size ? round(h.price / p.size.amount, 4) : null,
      observedAt: h.observedAt,
      source: 'sample' as const,
    })));
  return weeklyBasketIndex({ products, prices, now, isSample: true });
}
