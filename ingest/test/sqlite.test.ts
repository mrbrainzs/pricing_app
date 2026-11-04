import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { SqliteSink } from '../src/sqliteSink';
import { catalog, history } from '../src/database';
import type { ScrapedPrice, ScrapedProduct } from '../src/types';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const product: ScrapedProduct = {
  chain: 'mercadona', chainProductId: '1', name: 'Leche', ean: '123',
  isOwnBrand: true, categoryId: 'milk', size: { amount: 1, unit: 'l' },
};
const price = (patch: Partial<ScrapedPrice> = {}): ScrapedPrice => ({
  chain: 'mercadona', chainProductId: '1', zone: 'bcn1', price: 1.2, unitPrice: 1.2,
  observedAt: new Date().toISOString(), source: 'online', ...patch,
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'quinsuper-test-')); dirs.push(dir);
  const path = join(dir, 'prices.sqlite');
  return { path, sink: new SqliteSink(path) };
}

it('persists imports, deduplicates observations, preserves EAN and records shrinkage', async () => {
  const { sink, path } = fixture();
  const observation = price();
  try {
    await sink.save('mercadona', [product], [observation]);
    const result = await sink.save('mercadona', [{ ...product, ean: undefined, size: { amount: 0.8, unit: 'l' } }], [observation]);
    expect(result).toMatchObject({ prices: 0, shrunk: ['1'] });
    expect((await sink.existingProducts('mercadona')).get('1')?.ean).toBe('123');
    expect(catalog(sink.db)).toMatchObject({ isSample: false, stores: [] });
    expect(catalog(sink.db).prices).toHaveLength(1);
  } finally { sink.close(); }
  const reopened = new SqliteSink(path);
  try { expect(catalog(reopened.db).products).toHaveLength(1); } finally { reopened.close(); }
});

it('rolls back an invalid batch and excludes expired prices', async () => {
  const { sink } = fixture();
  try {
    await expect(sink.save('mercadona', [product], [price({ chainProductId: 'missing' })])).rejects.toThrow();
    expect((await sink.existingProducts('mercadona')).size).toBe(0);
    await sink.save('mercadona', [product], [price({ observedAt: '2020-01-01T00:00:00.000Z' })]);
    expect(catalog(sink.db).prices).toHaveLength(0);
  } finally { sink.close(); }
});

it('returns the newest price in each zone and never mixes zones in history', async () => {
  const { sink } = fixture();
  try {
    const now = new Date().toISOString();
    const before = new Date(Date.now() - 86400000).toISOString();
    await sink.save('mercadona', [product], [price({ observedAt: before }), price({ observedAt: now, price: 1.3 }), price({ zone: 'other', price: 99, observedAt: before })]);
    expect(catalog(sink.db).prices).toHaveLength(2);
    expect(history(sink.db, 'mercadona:1').map(r => r.price)).toEqual([1.2, 1.3]);
  } finally { sink.close(); }
});
