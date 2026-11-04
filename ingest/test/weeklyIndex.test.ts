import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CATEGORY_BY_ID, INDEX_BASKET, type ChainId, type Store } from '@pricing/core';
import { afterEach, describe, expect, it } from 'vitest';
import { mainMercadonaZone, replaceStores, weeklyIndex } from '../src/database';
import { SqliteSink } from '../src/sqliteSink';
import type { ScrapedPrice, ScrapedProduct } from '../src/types';

/** Wednesday 4 November 2026; the index moment is Monday 2 November 07:00 (06:00 UTC). */
const NOW = new Date('2026-11-04T10:00:00Z');
/** Import times: 05:30 Barcelona time on the two Mondays, the Tuesday after, and long ago. */
const THIS_MONDAY = '2026-11-02T04:30:00.000Z';
const LAST_MONDAY = '2026-10-26T04:30:00.000Z';
const TUESDAY = '2026-11-03T04:30:00.000Z';
const OLD = '2026-10-10T04:30:00.000Z';

const dirs: string[] = [];
const sinks: SqliteSink[] = [];
afterEach(() => {
  for (const sink of sinks.splice(0)) sink.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'quinsuper-index-')); dirs.push(dir);
  const sink = new SqliteSink(join(dir, 'prices.sqlite')); sinks.push(sink);
  return sink;
}

function products(chain: ChainId, items: readonly string[]): ScrapedProduct[] {
  return items.map((id) => ({
    chain, chainProductId: id, name: id, isOwnBrand: true, categoryId: id, size: CATEGORY_BY_ID[id]!.defaultSize,
  }));
}
function prices(chain: ChainId, items: readonly string[], zone: string, price: number, observedAt: string): ScrapedPrice[] {
  return items.map((id) => ({
    chain, chainProductId: id, zone, price, unitPrice: price / CATEGORY_BY_ID[id]!.defaultSize.amount, observedAt, source: 'online',
  }));
}
const store = (id: string, chain: ChainId, zone: string): Store => ({ id, chain, name: id, zone, lat: 41.4, lng: 2.16, source: 'openstreetmap' });

describe('weekly basket index from SQLite', () => {
  it('has no previous week until there is data for it', async () => {
    const sink = fixture();
    await sink.save('consum', products('consum', INDEX_BASKET), prices('consum', INDEX_BASKET, 'cat', 1, THIS_MONDAY));
    const index = weeklyIndex(sink.db, NOW);
    expect(index).toMatchObject({ previous: null, changes: {}, isSample: false, zones: { consum: 'cat' } });
    expect(index.current.at).toBe('2026-11-02T06:00:00.000Z');
    expect(index.current.chains).toMatchObject([{ chain: 'consum', rank: 1, found: 20, total: 20 }]);
    expect(JSON.parse(JSON.stringify(index))).toEqual(index);
  });

  it('ranks chains as of Monday 07:00 with the week-on-week change', async () => {
    const sink = fixture();
    const most = INDEX_BASKET.slice(2);
    await sink.save('consum', products('consum', INDEX_BASKET), [
      ...prices('consum', INDEX_BASKET, 'cat', 1, LAST_MONDAY),
      ...prices('consum', INDEX_BASKET, 'cat', 1.1, THIS_MONDAY),
      ...prices('consum', INDEX_BASKET, 'cat', 5, TUESDAY), // after the index moment
    ]);
    await sink.save('mercadona', products('mercadona', INDEX_BASKET), [
      ...prices('mercadona', most, 'bcn1', 0.9, LAST_MONDAY),
      ...prices('mercadona', INDEX_BASKET, 'bcn1', 0.95, THIS_MONDAY),
    ]);
    await sink.save('bonarea', products('bonarea', INDEX_BASKET.slice(0, 15)), [
      ...prices('bonarea', INDEX_BASKET.slice(0, 10), 'cat', 0.5, THIS_MONDAY),
      ...prices('bonarea', INDEX_BASKET.slice(10, 15), 'cat', 0.5, OLD), // more than 7 days old: missing
    ]);

    const index = weeklyIndex(sink.db, NOW);
    expect(index.zones).toEqual({ consum: 'cat', mercadona: 'bcn1', bonarea: 'cat' });
    expect(index.current.chains.map((c) => [c.chain, c.rank, c.found, c.total])).toEqual([
      ['mercadona', 1, 20, 19],
      ['consum', 2, 20, 22],
      ['bonarea', null, 10, 5],
    ]);
    expect(index.previous?.at).toBe('2026-10-26T06:00:00.000Z');
    expect(index.previous?.chains.map((c) => [c.chain, c.found, c.total])).toEqual([['mercadona', 18, 16.2], ['consum', 20, 20]]);
    // Mercadona: like for like on the 18 items priced both weeks (18 × 0.95 − 18 × 0.90).
    expect(index.changes).toEqual({
      consum: { amount: 2, percent: 10, items: 20 },
      mercadona: { amount: 0.9, percent: 5.6, items: 18 },
    });
  });

  it('uses the Mercadona warehouse with the most stores, and says which', async () => {
    const sink = fixture();
    expect(mainMercadonaZone(sink.db)).toBe('bcn1');
    replaceStores(sink.db, 'openstreetmap', [
      store('a', 'mercadona', 'bcn1'), store('b', 'mercadona', 'bcn2'), store('c', 'mercadona', 'bcn2'), store('d', 'consum', 'cat'),
    ]);
    expect(mainMercadonaZone(sink.db)).toBe('bcn2');
    await sink.save('mercadona', products('mercadona', INDEX_BASKET), [
      ...prices('mercadona', INDEX_BASKET, 'bcn1', 1, THIS_MONDAY),
      ...prices('mercadona', INDEX_BASKET, 'bcn2', 1.2, THIS_MONDAY),
    ]);
    const index = weeklyIndex(sink.db, NOW);
    expect(index.zones).toEqual({ mercadona: 'bcn2' });
    expect(index.current.chains).toMatchObject([{ chain: 'mercadona', zone: 'bcn2', total: 24 }]);
  });

  it('is empty, not an error, before the first import', () => {
    const index = weeklyIndex(fixture().db, NOW);
    expect(index).toMatchObject({ current: { chains: [] }, previous: null, changes: {} });
  });
});
