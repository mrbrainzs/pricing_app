import { describe, expect, it } from 'vitest';
import {
  buildSampleData,
  compareBasket,
  decodeShareCard,
  encodeShareCard,
  makeListItem,
  parseListText,
  SHARE_CARD_LIMITS,
  shareCardFromRanking,
  shareLineName,
  type ShareCard,
} from '../src';

const NOW = new Date('2026-11-04T10:00:00Z');

const card = (patch: Partial<ShareCard> = {}): ShareCard => ({
  lang: 'ca',
  chain: 'mercadona',
  store: 'Mercadona Gràcia',
  total: 23.45,
  found: 8,
  requested: 9,
  saving: 3.12,
  nextChain: 'bonpreu',
  rank: 1,
  stores: 5,
  date: '2026-11-04',
  sample: false,
  lines: [
    { categoryId: 'olive_oil_ev', text: '', quantity: 1, cost: 8.95 },
    { categoryId: 'milk', text: '', quantity: 2, cost: 1.9 },
    { categoryId: null, text: 'Patates del bufet', quantity: 1, cost: 2.3 },
  ],
  ...patch,
});

/** Encodes arbitrary JSON the way v1 does, to build tampered links. */
function rawLink(json: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  return `1${Buffer.from(bytes).toString('base64url')}`;
}

const validTuple = (): unknown[] => ['ca', 'mercadona', 'Mercadona', 2345, 8, 9, 312, 'bonpreu', 1, 5, 20261104, 0, [[190, 2, 'milk']]];

describe('share card encoding', () => {
  it('round-trips a card', () => {
    const encoded = encodeShareCard(card());
    expect(encoded).toMatch(/^1[A-Za-z0-9_-]+$/);
    expect(decodeShareCard(encoded)).toEqual({ ok: true, card: card() });
  });

  it('round-trips accents, emoji and every language', () => {
    for (const lang of ['ca', 'es', 'en'] as const) {
      const c = card({ lang, store: 'bonÀrea Sant Andreu 🛒', lines: [{ categoryId: null, text: 'Botifarra d’ou ç·l', quantity: 3, cost: 4.5 }], saving: null, nextChain: null, sample: true });
      expect(decodeShareCard(encodeShareCard(c))).toEqual({ ok: true, card: c });
    }
  });

  it('keeps links short', () => {
    expect(encodeShareCard(card()).length).toBeLessThan(250);
    // Worst case: longest names, all in 4-byte characters.
    const huge = card({
      store: '🍅'.repeat(500),
      lines: Array.from({ length: 20 }, (_, i) => ({ categoryId: null, text: `${i}${'🥖'.repeat(100)}`, quantity: 5, cost: 99.99 })),
    });
    const encoded = encodeShareCard(huge);
    expect(encoded.length).toBeLessThanOrEqual(SHARE_CARD_LIMITS.maxEncodedLength);
    const decoded = decodeShareCard(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect([...decoded.card.store]).toHaveLength(SHARE_CARD_LIMITS.storeName);
    expect(decoded.card.lines.length).toBeGreaterThan(0);
    expect(decoded.card.lines.length).toBeLessThanOrEqual(SHARE_CARD_LIMITS.lines);
    for (const line of decoded.card.lines) expect([...line.text].length).toBeLessThanOrEqual(SHARE_CARD_LIMITS.itemText);
  });

  it('clamps numbers and cleans text on the way in', () => {
    const decoded = decodeShareCard(
      encodeShareCard(card({ store: '  Caprabo\n‮gnirps\u0000  ', total: -4, found: 9, requested: 3, rank: 9, stores: 2, lines: [{ categoryId: null, text: '<b>pa</b>', quantity: 500, cost: 1e9 }] })),
    );
    expect(decoded.ok && decoded.card).toMatchObject({
      store: 'Caprabo gnirps',
      total: 0,
      found: 9,
      requested: 9,
      rank: 2,
      stores: 2,
      // Markup stays literal text: the card never renders HTML.
      lines: [{ categoryId: null, text: '<b>pa</b>', quantity: SHARE_CARD_LIMITS.maxQuantity, cost: SHARE_CARD_LIMITS.maxAmount }],
    });
  });

  it('refuses to encode an unknown chain or language', () => {
    expect(() => encodeShareCard(card({ chain: 'nope' as never }))).toThrow();
    expect(() => encodeShareCard(card({ lang: 'fr' as never }))).toThrow();
  });

  it('tolerates punctuation glued to the end of a link', () => {
    const encoded = encodeShareCard(card());
    expect(decodeShareCard(`${encoded}.`).ok).toBe(true);
    expect(decodeShareCard(` ${encoded})! `).ok).toBe(true);
  });
});

describe('share card decoding of untrusted links', () => {
  it.each([
    [undefined, 'empty'],
    ['', 'empty'],
    ['   ', 'empty'],
    ['2eyJhIjoxfQ', 'unsupported_version'],
    ['9abc', 'unsupported_version'],
    ['hello-world', 'malformed'],
    ['1', 'malformed'],
    ['1a', 'malformed'],
    ['1$$$$', 'malformed'],
    ['1aGVsbG8', 'malformed'], // "hello", not JSON
  ])('%s -> %s', (input, error) => {
    expect(decodeShareCard(input)).toEqual({ ok: false, error });
  });

  it('rejects very long input quickly', () => {
    const started = Date.now();
    expect(decodeShareCard(`1${'A'.repeat(SHARE_CARD_LIMITS.maxInputLength)}`)).toEqual({ ok: false, error: 'too_long' });
    expect(decodeShareCard(`${'!'.repeat(200_000)}a`)).toEqual({ ok: false, error: 'too_long' });
    expect(decodeShareCard(`1${'.'.repeat(3000)}`)).toEqual({ ok: false, error: 'malformed' });
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('rejects invalid UTF-8', () => {
    expect(decodeShareCard(`1${Buffer.from([0x5b, 0xff, 0xfe, 0x5d]).toString('base64url')}`)).toEqual({ ok: false, error: 'malformed' });
  });

  it('accepts a hand-built valid tuple', () => {
    expect(decodeShareCard(rawLink(validTuple())).ok).toBe(true);
  });

  it.each([
    ['not an array', { a: 1 }],
    ['too short', validTuple().slice(0, 5)],
    ['unknown language', Object.assign(validTuple(), { 0: 'fr' })],
    ['unknown chain', Object.assign(validTuple(), { 1: 'tesco' })],
    ['prototype chain name', Object.assign(validTuple(), { 1: '__proto__' })],
    ['prototype chain name 2', Object.assign(validTuple(), { 1: 'constructor' })],
    ['store not text', Object.assign(validTuple(), { 2: { html: '<script>' } })],
    ['total not a number', Object.assign(validTuple(), { 3: '23' })],
    ['impossible date', Object.assign(validTuple(), { 10: 20261332 })],
    ['date too old', Object.assign(validTuple(), { 10: 19991231 })],
    ['lines not a list', Object.assign(validTuple(), { 12: 'milk' })],
  ])('rejects %s', (_, tuple) => {
    expect(decodeShareCard(rawLink(tuple))).toEqual({ ok: false, error: 'malformed' });
  });

  it('drops bad lines and unknown items but keeps the card', () => {
    const tuple = validTuple();
    tuple[12] = [[190, 2, 'milk'], [100, 1, 'constructor'], [100, 1, '__proto__', ''], 'x', [null, 1, 'milk'], [300, 1, 'nope', 'Formatge de Maó'], ...Array.from({ length: 10 }, () => [1, 1, 'eggs'])];
    const decoded = decodeShareCard(rawLink(tuple));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.card.lines).toEqual([
      { categoryId: 'milk', text: '', quantity: 2, cost: 1.9 },
      { categoryId: null, text: 'Formatge de Maó', quantity: 1, cost: 3 },
    ]);
  });

  it('keeps nextChain only with a saving, and never fails on a bad one', () => {
    const t1 = Object.assign(validTuple(), { 7: 'toString' });
    expect(decodeShareCard(rawLink(t1))).toMatchObject({ ok: true, card: { saving: 3.12, nextChain: null } });
    const t2 = Object.assign(validTuple(), { 6: null });
    expect(decodeShareCard(rawLink(t2))).toMatchObject({ ok: true, card: { saving: null, nextChain: null } });
  });

  it('never throws on random tampering', () => {
    const encoded = encodeShareCard(card());
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_%.~/<>"\'é🛒';
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let i = 0; i < 3000; i++) {
      const chars = [...encoded];
      const edits = 1 + rand(4);
      for (let e = 0; e < edits; e++) {
        const pos = rand(chars.length);
        const op = rand(3);
        const ch = [...alphabet][rand([...alphabet].length)]!;
        if (op === 0) chars[pos] = ch;
        else if (op === 1) chars.splice(pos, 1);
        else chars.splice(pos, 0, ch);
      }
      const result = decodeShareCard(chars.join(''));
      if (result.ok) {
        expect(result.card.store.length).toBeLessThanOrEqual(SHARE_CARD_LIMITS.storeName * 2);
        expect(result.card.total).toBeGreaterThanOrEqual(0);
        expect(result.card.lines.length).toBeLessThanOrEqual(SHARE_CARD_LIMITS.lines);
      }
    }
  });
});

describe('share card from a comparison', () => {
  const sample = buildSampleData(NOW);
  const items = parseListText('llet x2\n12 ous\noli d’oliva verge extra\npa de motlle\ntomàquets\nplàtans\narròs\ncafè\nsabó de rentaplats');
  const result = compareBasket({ items, stores: sample.stores, products: sample.products, prices: sample.prices, origin: { lat: 41.4036, lng: 2.1565 }, now: NOW });

  it('summarises the cheapest store', () => {
    expect(result.ranking.length).toBeGreaterThan(2);
    const best = result.ranking[0]!;
    const c = shareCardFromRanking({ ranking: result.ranking, index: 0, items, lang: 'es', date: '2026-11-04', sample: true });
    expect(c).toMatchObject({
      lang: 'es',
      chain: best.store.chain,
      store: best.store.name,
      total: best.total,
      found: best.found,
      requested: best.requested,
      rank: 1,
      stores: result.ranking.length,
      sample: true,
    });
    if (best.diffToNext && best.diffToNext > 0) {
      expect(c.saving).toBe(best.diffToNext);
      expect(c.nextChain).toBe(result.ranking[1]!.store.chain);
    }
    expect(c.lines.length).toBe(Math.min(SHARE_CARD_LIMITS.lines, best.lines.length));
    const costs = c.lines.map((l) => l.cost);
    expect(costs).toEqual([...costs].sort((a, b) => b - a));
    expect(Math.max(...best.lines.map((l) => l.cost))).toBe(costs[0]);
    expect(c.lines.find((l) => l.categoryId === 'milk')?.quantity).toBe(2);
    // The link round-trips the whole summary.
    expect(decodeShareCard(encodeShareCard(c))).toEqual({ ok: true, card: c });
  });

  it('has no saving for the last store', () => {
    const last = result.ranking.length - 1;
    const c = shareCardFromRanking({ ranking: result.ranking, index: last, items, lang: 'ca', date: '2026-11-04', sample: false });
    expect(c).toMatchObject({ rank: last + 1, saving: null, nextChain: null });
  });

  it('names catalogue items in the viewer language, free text as typed', () => {
    const line = { categoryId: 'milk', text: '', quantity: 1, cost: 1 };
    expect(shareLineName(line, 'ca')).toBe('Llet');
    expect(shareLineName(line, 'es')).toBe('Leche');
    expect(shareLineName(line, 'en')).toBe('Milk');
    expect(shareLineName({ ...line, categoryId: null, text: 'Fuet' }, 'en')).toBe('Fuet');
    expect(shareLineName({ ...line, categoryId: 'constructor', text: 'x' }, 'en')).toBe('x');
    expect(makeListItem('llet').categoryId).toBe('milk');
  });
});
