import { describe, expect, it } from 'vitest';
import {
  basketIndexAt,
  buildSampleData,
  CATEGORY_BY_ID,
  indexMoment,
  INDEX_BASKET,
  previousIndexMoment,
  sampleWeeklyIndex,
  weeklyBasketIndex,
  type ChainId,
  type PriceObservation,
  type Product,
} from '../src';

const DAY = 86_400_000;
/** Wednesday 4 November 2026, 11:00 in Barcelona. */
const NOW = new Date('2026-11-04T10:00:00Z');
/** Monday 2 November 2026, 07:00 in Barcelona (winter time). */
const MONDAY = new Date('2026-11-02T06:00:00Z');

/** A product of the item's reference size (or another size), priced `price`. */
function product(chain: ChainId, itemId: string, opts: { own?: boolean; sizeFactor?: number; suffix?: string } = {}): Product {
  const def = CATEGORY_BY_ID[itemId]!.defaultSize;
  return {
    id: `${chain}:${itemId}${opts.suffix ?? ''}`, chain, chainProductId: itemId, name: `${itemId}${opts.suffix ?? ''}`,
    brand: opts.own === false ? 'Brand' : 'Own', isOwnBrand: opts.own !== false, categoryId: itemId,
    size: { amount: def.amount * (opts.sizeFactor ?? 1), unit: def.unit },
  };
}
function obs(p: Product, zone: string, price: number, observedAt: Date, extra: Partial<PriceObservation> = {}): PriceObservation {
  return {
    productId: p.id, chain: p.chain, zone, price, unitPrice: price / p.size!.amount,
    observedAt: observedAt.toISOString(), source: 'online', ...extra,
  };
}

/** Every basket item at 1 € (reference size) per chain, minus some items, observed at `when`. */
function chainData(chain: ChainId, zone: string, when: Date, opts: { skip?: number; price?: number } = {}) {
  const items = INDEX_BASKET.slice(opts.skip ?? 0);
  const products = items.map((id) => product(chain, id));
  return { products, prices: products.map((p) => obs(p, zone, opts.price ?? 1, when)) };
}

describe('weekly basket index', () => {
  it('has 20 distinct everyday items from the catalogue', () => {
    expect(INDEX_BASKET).toHaveLength(20);
    expect(new Set(INDEX_BASKET).size).toBe(20);
    for (const id of INDEX_BASKET) expect(CATEGORY_BY_ID[id], id).toBeDefined();
  });

  it('is taken on Monday at 07:00 Barcelona time, also across clock changes', () => {
    expect(indexMoment(NOW).toISOString()).toBe('2026-11-02T06:00:00.000Z');
    // Monday morning before 07:00 still shows last week's index.
    expect(indexMoment(new Date('2026-11-02T05:59:00Z')).toISOString()).toBe('2026-10-26T06:00:00.000Z');
    expect(indexMoment(new Date('2026-11-02T06:00:00Z')).toISOString()).toBe('2026-11-02T06:00:00.000Z');
    // Sunday evening.
    expect(indexMoment(new Date('2026-11-08T22:00:00Z')).toISOString()).toBe('2026-11-02T06:00:00.000Z');
    // The week of the October change is 7 days and 1 hour long; the March one 7 days less 1 hour.
    expect(previousIndexMoment(new Date('2026-10-26T06:00:00Z')).toISOString()).toBe('2026-10-19T05:00:00.000Z');
    expect(indexMoment(new Date('2026-03-30T10:00:00Z')).toISOString()).toBe('2026-03-30T05:00:00.000Z');
    expect(previousIndexMoment(new Date('2026-03-30T05:00:00Z')).toISOString()).toBe('2026-03-23T06:00:00.000Z');
  });

  it('prices the cheapest product of any brand per item, normalised to the reference size', () => {
    const milk = product('mercadona', 'milk');
    const brandMilk = product('mercadona', 'milk', { own: false, suffix: '-brand' });
    const bigMilk = product('mercadona', 'milk', { sizeFactor: 6, suffix: '-6pack' }); // too big a pack
    const smallBread = product('mercadona', 'bread_sliced', { sizeFactor: 0.9, suffix: '-450g' });
    const eggs = product('mercadona', 'eggs', { own: false });
    const before = new Date(MONDAY.getTime() - 3_600_000);
    const snap = basketIndexAt({
      products: [milk, brandMilk, bigMilk, smallBread, eggs],
      prices: [
        obs(milk, 'bcn1', 1.0, before),
        obs(brandMilk, 'bcn1', 0.95, before),
        obs(bigMilk, 'bcn1', 4.2, before),
        obs(smallBread, 'bcn1', 1.08, before), // 1.20 per 0.5 kg
        obs(eggs, 'bcn1', 2.5, before),
      ],
      at: MONDAY,
    });
    const merc = snap.chains[0]!;
    expect(merc).toMatchObject({ chain: 'mercadona', zone: 'bcn1', found: 3, total: 4.65, ranked: false, rank: null });
    expect(merc.lines.find((l) => l.itemId === 'milk')).toMatchObject({ productId: 'mercadona:milk-brand', cost: 0.95, isOwnBrand: false });
    expect(merc.lines.find((l) => l.itemId === 'bread_sliced')).toMatchObject({ price: 1.08, cost: 1.2 });
    expect(merc.missing).toHaveLength(17);
  });

  it('uses the latest price at or before the moment, at most 7 days old, online only', () => {
    const milk = product('consum', 'milk');
    const at = (ms: number) => new Date(MONDAY.getTime() + ms);
    const priced = (prices: PriceObservation[]) =>
      basketIndexAt({ products: [milk], prices, at: MONDAY }).chains[0]?.lines[0]?.price ?? null;
    expect(priced([obs(milk, 'cat', 1.1, at(-2 * DAY)), obs(milk, 'cat', 1.2, at(-DAY)), obs(milk, 'cat', 9, at(3_600_000))])).toBe(1.2);
    expect(priced([obs(milk, 'cat', 1.1, at(-6.9 * DAY))])).toBe(1.1);
    expect(priced([obs(milk, 'cat', 1.1, at(-7.1 * DAY))])).toBeNull();
    expect(priced([obs(milk, 'cat', 0.5, at(-DAY), { storeId: 's1', source: 'receipt' })])).toBeNull();
  });

  it('ranks chains missing at most 20% of items and lists the others unranked', () => {
    const before = new Date(MONDAY.getTime() - DAY);
    const a = chainData('mercadona', 'bcn1', before, { price: 1.1 });
    const b = chainData('consum', 'cat', before, { skip: 4 }); // 16 of 20: ranked
    const c = chainData('bonarea', 'cat', before, { skip: 5, price: 0.5 }); // 15 of 20: not ranked, though cheapest
    const snap = basketIndexAt({ products: [...a.products, ...b.products, ...c.products], prices: [...a.prices, ...b.prices, ...c.prices], at: MONDAY });
    expect(snap.chains.map((x) => [x.chain, x.rank, x.found, x.total])).toEqual([
      ['consum', 1, 16, 16],
      ['mercadona', 2, 20, 22],
      ['bonarea', null, 15, 7.5],
    ]);
    expect(snap.chains[2]!.missing).toEqual(INDEX_BASKET.slice(0, 5));
  });

  it('uses one Mercadona zone: the busiest by default, or the one asked for', () => {
    const before = new Date(MONDAY.getTime() - DAY);
    const bcn1 = chainData('mercadona', 'bcn1', before, { price: 1 });
    const extra = chainData('mercadona', 'bcn1', new Date(before.getTime() - DAY), { price: 1 });
    const bcn2 = { prices: bcn1.products.map((p) => obs(p, 'bcn2', 2, before)) };
    const input = { products: bcn1.products, prices: [...bcn1.prices, ...extra.prices, ...bcn2.prices], at: MONDAY };
    expect(basketIndexAt(input).chains[0]).toMatchObject({ zone: 'bcn1', total: 20 });
    expect(basketIndexAt({ ...input, zones: { mercadona: 'bcn2' } }).chains[0]).toMatchObject({ zone: 'bcn2', total: 40 });
  });

  it('compares with last week like for like, and has no previous week without data', () => {
    const lastWeek = new Date(MONDAY.getTime() - 7 * DAY - 3_600_000);
    const thisWeek = new Date(MONDAY.getTime() - 3_600_000);
    const now = chainData('mercadona', 'bcn1', thisWeek, { price: 1.05 });
    const then = chainData('mercadona', 'bcn1', lastWeek, { skip: 2, price: 1 }); // 18 items last week
    const first = weeklyBasketIndex({ products: now.products, prices: now.prices, now: NOW });
    expect(first.previous).toBeNull();
    expect(first.changes).toEqual({});
    expect(first.current.chains[0]).toMatchObject({ chain: 'mercadona', total: 21, rank: 1 });
    expect(first.zones).toEqual({ mercadona: 'bcn1' });

    const second = weeklyBasketIndex({ products: now.products, prices: [...now.prices, ...then.prices], now: NOW });
    expect(second.current.at).toBe(MONDAY.toISOString());
    expect(second.previous?.at).toBe('2026-10-26T06:00:00.000Z');
    expect(second.previous?.chains[0]).toMatchObject({ total: 18, found: 18 });
    // Only the 18 items priced both weeks: 18 × 1.05 − 18 × 1.
    expect(second.changes.mercadona).toEqual({ amount: 0.9, percent: 5, items: 18 });
  });

  it('runs on the sample data, labelled as sample', () => {
    const index = sampleWeeklyIndex(buildSampleData(NOW), NOW);
    expect(index.isSample).toBe(true);
    expect(index.current.chains.filter((c) => c.ranked).length).toBeGreaterThanOrEqual(4);
    expect(index.previous).not.toBeNull();
    expect(Object.keys(index.changes).length).toBeGreaterThanOrEqual(4);
    const best = index.current.chains[0]!;
    expect(best.rank).toBe(1);
    expect(best.total).toBeGreaterThan(20);
    expect(best.total).toBeLessThan(80);
  });
});
