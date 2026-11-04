import { describe, expect, it } from 'vitest';
import {
  buildSampleData,
  CATEGORIES,
  classifyProduct,
  compareBasket,
  editDistance,
  findEquivalents,
  freshness,
  makeListItem,
  normalize,
  parseListText,
  parseSize,
  priceStats,
  resolveItemText,
  searchProducts,
  type PriceObservation,
  type Product,
  type Store,
} from '../src';

const NOW = new Date('2026-11-04T10:00:00Z');

describe('text', () => {
  it('normalises accents, case and Catalan punt volat', () => {
    expect(normalize("Oli d'Oliva VERGE Extra")).toBe('oli d oliva verge extra');
    expect(normalize('Col·liflor')).toBe('colliflor');
    expect(normalize('Plàtans')).toBe('platans');
  });
  it('measures typos', () => {
    expect(editDistance('leche', 'lechee')).toBe(1);
    expect(editDistance('llet', 'lelt')).toBe(1);
  });
});

describe('units', () => {
  it.each([
    ['Leche entera 1 L', { amount: 1, unit: 'l' }],
    ['Yogur natural 4 x 125 g', { amount: 0.5, unit: 'kg' }],
    ['Cerveza pack 6 x 33 cl', { amount: 1.98, unit: 'l' }],
    ['Aceite 1,5 L', { amount: 1.5, unit: 'l' }],
    ['Huevos 12 ud', { amount: 12, unit: 'unit' }],
    ['Papel higiénico 12 rollos', { amount: 12, unit: 'unit' }],
    ['Leche 6 bricks x 1 l', { amount: 6, unit: 'l' }],
  ])('parses %s', (text, size) => {
    expect(parseSize(text)).toEqual(size);
  });
});

describe('list items in three languages', () => {
  it.each([
    ['llet', 'milk'],
    ['leche', 'milk'],
    ['milk', 'milk'],
    ['lechee', 'milk'],
    ['ous', 'eggs'],
    ['huevos', 'eggs'],
    ['eggs', 'eggs'],
    ['tomaquets', 'tomatoes'],
    ["oli d'oliva verge extra", 'olive_oil_ev'],
    ['aceite de girasol', 'sunflower_oil'],
    ['paper de vater', null],
    ['toilet paper', 'toilet_paper'],
    ['pa de motlle', 'bread_sliced'],
    ['xampu', 'shampoo'],
  ])('"%s" -> %s', (text, expected) => {
    expect(resolveItemText(text)?.categoryId ?? null).toBe(expected);
  });

  it('every category resolves from its own names', () => {
    for (const c of CATEGORIES) {
      for (const lang of ['ca', 'es', 'en'] as const) {
        expect(resolveItemText(c.names[lang])?.categoryId, `${c.id} ${lang}`).toBe(c.id);
      }
    }
  });
});

describe('pasted lists (WhatsApp)', () => {
  it('parses bullets, quantities, timestamps and conjunctions', () => {
    const items = parseListText(`[10/11/26, 18:02] Anna: llet x2
- 12 ous
• pa de motlle
2 kg patates
tomàquets, cebes i plàtans ✅
llet`);
    const byCat = Object.fromEntries(items.map((i) => [i.categoryId, i.quantity]));
    expect(byCat).toEqual({ milk: 3, eggs: 1, bread_sliced: 1, potatoes: 2, tomatoes: 1, onions: 1, bananas: 1 });
  });
  it('keeps unknown items as free text', () => {
    const [item] = parseListText('1. Hummus de remolatxa');
    expect(item).toMatchObject({ text: 'Hummus de remolatxa', categoryId: null, quantity: 1 });
  });
});

describe('product classification', () => {
  it.each([
    ['Leche semidesnatada Hacendado 6 x 1 L', 'milk'],
    ['Leche de avena Hacendado', null],
    ['Batido de cacao', null],
    ['Atún claro en aceite de oliva Calvo 3 x 80 g', 'tuna_canned'],
    ['Aceite de oliva virgen extra Carbonell 1 L', 'olive_oil_ev'],
    ['Aceite de oliva 0,4º Hacendado 1 L', 'olive_oil'],
    ['Patatas fritas onduladas', null],
    ['Salsa barbacoa', null],
    ['Sal fina de mesa 1 kg', 'salt'],
    ['Aguacate', null],
    ["Oli d'oliva verge extra Bonpreu 1 L", 'olive_oil_ev'],
    ['Detergente lavavajillas máquina', null],
    ['Huevos frescos L 12 ud', 'eggs'],
  ])('%s -> %s', (name, expected) => {
    expect(classifyProduct(name)).toBe(expected);
  });

  it('ignores words from the brand name', () => {
    expect(classifyProduct('Mantequilla Central Lechera Asturiana 250 g', 'Central Lechera Asturiana')).toBe('butter');
  });

  it('classifies every sample product into its own category', () => {
    for (const p of buildSampleData(NOW).products) expect(classifyProduct(p.name, p.brand), p.name).toBe(p.categoryId);
  });
});

describe('freshness', () => {
  it('warns after 3 days and excludes online prices after 7, receipts after 14', () => {
    const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
    expect(freshness({ observedAt: at(1), source: 'online' }, NOW)).toBe('fresh');
    expect(freshness({ observedAt: at(4), source: 'online' }, NOW)).toBe('stale');
    expect(freshness({ observedAt: at(8), source: 'online' }, NOW)).toBe('expired');
    expect(freshness({ observedAt: at(10), source: 'receipt' }, NOW)).toBe('stale');
    expect(freshness({ observedAt: at(15), source: 'receipt' }, NOW)).toBe('expired');
  });
});

describe('price label', () => {
  const history = Array.from({ length: 90 }, (_, i) => ({
    price: i % 3 === 0 ? 1.0 : i % 3 === 1 ? 1.2 : 1.4,
    observedAt: new Date(NOW.getTime() - i * 86_400_000).toISOString(),
  }));
  it('labels good / normal / high from the 90-day percentiles', () => {
    expect(priceStats(1.0, history, NOW).label).toBe('good');
    expect(priceStats(1.2, history, NOW).label).toBe('normal');
    expect(priceStats(1.45, history, NOW).label).toBe('high');
  });
  it('gives no label without 30 days of history', () => {
    expect(priceStats(1.0, history.slice(0, 10), NOW).label).toBeNull();
  });
  it('calls a flat price normal', () => {
    const flat = history.map((h) => ({ ...h, price: 2 }));
    expect(priceStats(2, flat, NOW).label).toBe('normal');
  });
});

// A tiny world: two chains near the user, one far away.
const product = (id: string, chain: Product['chain'], categoryId: string | null, own: boolean, amount: number, unit: 'l' | 'kg' | 'unit', name = id, brand?: string, ean?: string): Product => ({
  id, chain, chainProductId: id, name, brand, ean, isOwnBrand: own, categoryId, size: { amount, unit },
});
const obs = (productId: string, chain: Product['chain'], zone: string, price: number, amount: number, daysAgo = 0, extra: Partial<PriceObservation> = {}): PriceObservation => ({
  productId, chain, zone, price, unitPrice: price / amount, source: 'online',
  observedAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(), ...extra,
});
const stores: Store[] = [
  { id: 'm1', chain: 'mercadona', name: 'Mercadona A', zone: 'z', lat: 41.4, lng: 2.16 },
  { id: 'd1', chain: 'dia', name: 'DIA A', zone: 'z', lat: 41.401, lng: 2.161 },
  { id: 'b1', chain: 'bonpreu', name: 'Bonpreu far', zone: 'z', lat: 41.5, lng: 2.3 },
];
const origin = { lat: 41.4, lng: 2.16 };

describe('basket comparison', () => {
  const products = [
    product('m-milk', 'mercadona', 'milk', true, 1, 'l'),
    product('m-milk6', 'mercadona', 'milk', true, 6, 'l'),
    product('m-eggs', 'mercadona', 'eggs', true, 12, 'unit'),
    product('d-milk', 'dia', 'milk', true, 1, 'l'),
    product('d-eggs', 'dia', 'eggs', true, 12, 'unit'),
    product('d-coffee', 'dia', 'coffee_ground', false, 0.25, 'kg', 'Café molido Marcilla', 'Marcilla'),
    product('b-milk', 'bonpreu', 'milk', true, 1, 'l'),
  ];
  const prices = [
    obs('m-milk', 'mercadona', 'z', 1.0, 1),
    obs('m-milk6', 'mercadona', 'z', 4.8, 6), // cheaper per litre but too big a pack
    obs('m-eggs', 'mercadona', 'z', 2.0, 12),
    obs('d-milk', 'dia', 'z', 0.9, 1),
    obs('d-eggs', 'dia', 'z', 2.6, 12),
    obs('d-coffee', 'dia', 'z', 3.0, 0.25),
    obs('b-milk', 'bonpreu', 'z', 0.5, 1),
  ];
  const items = [makeListItem('llet', 2), makeListItem('ous'), makeListItem('cafè molt')];

  it('ranks nearby stores, counts missing items instead of €0, ignores far stores', () => {
    const r = compareBasket({ items, stores, products, prices, origin, now: NOW });
    expect(r.ranking.map((b) => b.store.id)).toEqual(['d1', 'm1']);
    const [dia, merc] = r.ranking;
    expect(dia).toMatchObject({ total: 7.4, found: 3, requested: 3, flagged: false });
    // Mercadona has no coffee: real total 4.0, but ranked with coffee at its median price elsewhere.
    expect(merc).toMatchObject({ total: 4, found: 2, missing: [items[2]!.id], comparableTotal: 7, flagged: true });
    expect(merc!.lines.find((l) => l.itemId === items[0]!.id)?.product.id).toBe('m-milk');
  });

  it('suggests a two-store split only when it saves enough', () => {
    const r = compareBasket({ items, stores, products, prices, origin, now: NOW, minSavingForSplit: 0.5 });
    expect(r.split).toMatchObject({ found: 3, total: 6.8, saving: 0.6, worthIt: true });
    const strict = compareBasket({ items, stores, products, prices, origin, now: NOW });
    expect(strict.split?.worthIt).toBe(false);
  });

  it('respects own-brand and specific-brand levels', () => {
    const own = makeListItem('cafè', 1, { kind: 'own' });
    const r = compareBasket({ items: [own], stores, products, prices, origin, now: NOW });
    expect(r.unavailable).toEqual([own.id]);
    const brand = makeListItem('cafè', 1, { kind: 'specific', brand: 'marcilla' });
    expect(compareBasket({ items: [brand], stores, products, prices, origin, now: NOW }).ranking[0]?.found).toBe(1);
  });

  it('drops prices older than 7 days', () => {
    const old = prices.map((p) => (p.productId === 'd-milk' ? { ...p, observedAt: new Date(NOW.getTime() - 8 * 86_400_000).toISOString() } : p));
    const r = compareBasket({ items: [makeListItem('llet')], stores, products, prices: old, origin, now: NOW });
    expect(r.ranking.find((b) => b.store.id === 'd1')?.found).toBe(0);
  });

  it('prefers an in-store receipt price over the online price', () => {
    const withReceipt = [...prices, obs('d-milk', 'dia', 'z', 0.7, 1, 2, { storeId: 'd1', source: 'receipt' })];
    const r = compareBasket({ items: [makeListItem('llet')], stores, products, prices: withReceipt, origin, now: NOW });
    expect(r.ranking[0]?.lines[0]).toMatchObject({ price: 0.7, source: 'receipt' });
  });

  it('runs on the sample data', () => {
    const sample = buildSampleData(NOW);
    const list = parseListText('llet x2, ous, arròs, oli verge extra, tomàquets, pit de pollastre, paper higiènic, cafè');
    const r = compareBasket({ items: list, stores: sample.stores, products: sample.products, prices: sample.prices, origin: { lat: 41.4036, lng: 2.1565 }, now: NOW });
    expect(r.ranking.length).toBeGreaterThanOrEqual(4);
    expect(r.ranking[0]!.found).toBeGreaterThanOrEqual(7);
    expect(r.ranking[0]!.total).toBeGreaterThan(10);
  });
});

describe('search and equivalents', () => {
  const sample = buildSampleData(NOW);
  it('finds Spanish product names from an English or Catalan query, with typos', () => {
    for (const q of ['milk', 'llet', 'lechee entera']) {
      const hits = searchProducts(q, sample.products);
      expect(hits[0]?.product.categoryId, q).toBe('milk');
    }
  });
  it('finds a national brand by name', () => {
    expect(searchProducts('carbonel', sample.products)[0]?.product.brand).toBe('Carbonell');
  });
  it('lists exact matches and own-brand equivalents', () => {
    const target = sample.products.find((p) => p.brand === 'Carbonell' && p.categoryId === 'olive_oil_ev')!;
    const eq = findEquivalents(target, sample.products);
    expect(eq.some((e) => e.matchType === 'exact' && e.product.chain !== target.chain)).toBe(true);
    expect(eq.filter((e) => e.matchType === 'own_brand_equivalent').length).toBeGreaterThanOrEqual(4);
  });
});
