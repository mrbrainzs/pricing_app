import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  CATEGORIES, CHAINS, INDEX_BASKET, indexMoment, ONLINE_EXPIRES_AFTER_DAYS, previousIndexMoment, weeklyBasketIndex,
  type PriceObservation, type Product, type Store, type WeeklyIndex,
} from '@pricing/core';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/** Local catalogue, plus shared lists (ingest/src/sharedLists.ts). Personal lists/settings stay on the device. */
export function openDatabase(path: string): SqliteDatabase {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=10000;
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chains (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, chain TEXT NOT NULL REFERENCES chains(id), chain_product_id TEXT NOT NULL,
      data TEXT NOT NULL CHECK(json_valid(data)), first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
      previous_size_amount REAL, size_changed_at TEXT, UNIQUE(chain, chain_product_id)
    );
    CREATE TABLE IF NOT EXISTS price_observations (
      id INTEGER PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
      chain TEXT NOT NULL REFERENCES chains(id), zone TEXT NOT NULL,
      price REAL NOT NULL CHECK(price > 0), unit_price REAL CHECK(unit_price >= 0),
      promotion TEXT, observed_at TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('online','receipt','leaflet')),
      UNIQUE(product_id, zone, observed_at)
    );
    CREATE INDEX IF NOT EXISTS price_latest_idx ON price_observations(product_id, zone, observed_at DESC);
    CREATE INDEX IF NOT EXISTS price_time_idx ON price_observations(observed_at);
    INSERT OR IGNORE INTO schema_migrations VALUES(1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    CREATE TABLE IF NOT EXISTS import_runs (name TEXT PRIMARY KEY, finished_at TEXT NOT NULL, detail TEXT);
    INSERT OR IGNORE INTO schema_migrations VALUES(2, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    -- Shared lists (F10): no accounts or personal data; the random id is the only key.
    -- accessed_at drives expiry (180 days without being opened or edited).
    CREATE TABLE IF NOT EXISTS shared_lists (
      id TEXT PRIMARY KEY CHECK(length(id) = 22), version INTEGER NOT NULL CHECK(version >= 1),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, accessed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS shared_lists_accessed_idx ON shared_lists(accessed_at);
    CREATE TABLE IF NOT EXISTS shared_list_items (
      list_id TEXT NOT NULL REFERENCES shared_lists(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL CHECK(length(item_id) BETWEEN 1 AND 40),
      position INTEGER NOT NULL,
      text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 120),
      category_id TEXT,
      level_kind TEXT NOT NULL CHECK(level_kind IN ('own','any','specific')),
      brand TEXT CHECK(brand IS NULL OR length(brand) <= 60),
      quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99),
      checked INTEGER NOT NULL CHECK(checked IN (0,1)),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(list_id, item_id)
    ) WITHOUT ROWID;
    INSERT OR IGNORE INTO schema_migrations VALUES(3, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  `);
  const chain = db.prepare('INSERT OR IGNORE INTO chains VALUES(?, ?)');
  for (const c of Object.values(CHAINS)) chain.run(c.id, c.name);
  const category = db.prepare('INSERT INTO categories VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data');
  for (const c of CATEGORIES) category.run(c.id, JSON.stringify(c));
  return db;
}

export function catalog(db: SqliteDatabase, now = new Date()) {
  // Never use invented store positions or mix sample and imported prices.
  const stores = db.prepare('SELECT data FROM stores').all().map(r => JSON.parse(r.data as string) as Store);
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const prices: PriceObservation[] = db.prepare(`
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY product_id,zone ORDER BY observed_at DESC,id DESC) AS rank
      FROM price_observations WHERE observed_at >= ?
    ) WHERE rank=1
  `).all(cutoff).map(r => ({
    productId: r.product_id as string, chain: r.chain as PriceObservation['chain'],
    zone: r.zone as string, price: r.price as number, unitPrice: r.unit_price as number | null,
    promotion: (r.promotion as string | null) ?? undefined,
    observedAt: r.observed_at as string, source: r.source as PriceObservation['source'],
  }));
  const ids = new Set(prices.map(p => p.productId));
  const products = db.prepare('SELECT data FROM products').all()
    .map(r => JSON.parse(r.data as string) as Product).filter(p => ids.has(p.id));
  return { stores, products, prices, isSample: false };
}

/** History stays in one pricing zone; don't combine different warehouses. */
export function history(db: SqliteDatabase, productId: string) {
  const zone = db.prepare('SELECT zone FROM price_observations WHERE product_id=? ORDER BY observed_at DESC,zone LIMIT 1').get(productId)?.zone;
  if (!zone) return [];
  return db.prepare(`SELECT price, observed_at AS observedAt FROM price_observations
    WHERE product_id=? AND zone=? AND observed_at >= ? ORDER BY observed_at`)
    .all(productId, zone, new Date(Date.now() - 90 * 86_400_000).toISOString());
}

/**
 * Replaces every store from one source in a single transaction, so a failed import
 * leaves the previous list in place. Stores from other sources are kept.
 */
export function replaceStores(db: SqliteDatabase, source: NonNullable<Store['source']>, stores: Store[]): number {
  const insert = db.prepare('INSERT INTO stores VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("DELETE FROM stores WHERE json_extract(data, '$.source') = ?").run(source);
    for (const s of stores) {
      if (s.source !== source) throw new Error(`Store ${s.id} is not from ${source}`);
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng) || !s.zone) throw new Error(`Store ${s.id} has no position or zone`);
      insert.run(s.id, JSON.stringify(s));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return stores.length;
}

export function lastRun(db: SqliteDatabase, name: string): string | null {
  return (db.prepare('SELECT finished_at FROM import_runs WHERE name=?').get(name)?.finished_at as string | undefined) ?? null;
}

export function recordRun(db: SqliteDatabase, name: string, at: Date, detail?: unknown): void {
  db.prepare('INSERT INTO import_runs VALUES(?, ?, ?) ON CONFLICT(name) DO UPDATE SET finished_at=excluded.finished_at, detail=excluded.detail')
    .run(name, at.toISOString(), detail === undefined ? null : JSON.stringify(detail));
}

/** Price zones that have stores of a chain, each with one postal code that the zone serves. */
export function storeZones(db: SqliteDatabase, chain: Store['chain']): Map<string, string> {
  const rows = db.prepare(`SELECT json_extract(data, '$.zone') AS zone, MIN(json_extract(data, '$.postalCode')) AS postal
    FROM stores WHERE json_extract(data, '$.chain') = ? AND json_extract(data, '$.postalCode') IS NOT NULL GROUP BY zone`).all(chain);
  return new Map(rows.map((r) => [r.zone as string, r.postal as string]));
}

/** Mercadona prices differ by warehouse: the index uses the one with the most stores. */
export function mainMercadonaZone(db: SqliteDatabase): string {
  const row = db.prepare(`SELECT json_extract(data, '$.zone') AS zone, COUNT(*) AS n FROM stores
    WHERE json_extract(data, '$.chain') = 'mercadona' AND json_extract(data, '$.zone') IS NOT NULL
    GROUP BY zone ORDER BY n DESC, zone LIMIT 1`).get();
  return (row?.zone as string | undefined) ?? 'bcn1';
}

/**
 * F12 weekly basket index, read-only: this week's (prices as of the latest Monday 07:00
 * Barcelona time, each the latest observation at or before it and at most 7 days old) and
 * last week's, with the change per chain. `previous` is null until there is a week of data.
 */
export function weeklyIndex(db: SqliteDatabase, now = new Date()): WeeklyIndex {
  const at = indexMoment(now);
  const from = new Date(previousIndexMoment(at).getTime() - ONLINE_EXPIRES_AFTER_DAYS * 86_400_000).toISOString();
  const mercadona = mainMercadonaZone(db);
  const basket = [...INDEX_BASKET];
  const products = db.prepare(`SELECT data FROM products
    WHERE json_extract(data, '$.categoryId') IN (${basket.map(() => '?').join(',')})`).all(...basket)
    .map(r => JSON.parse(r.data as string) as Product);
  const ids = products.map(p => p.id);
  const prices: PriceObservation[] = [];
  // Chunked to stay well below SQLite's limit on query parameters.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = db.prepare(`SELECT * FROM price_observations
      WHERE product_id IN (${chunk.map(() => '?').join(',')}) AND observed_at >= ? AND observed_at <= ?
        AND (chain <> 'mercadona' OR zone = ?)`).all(...chunk, from, at.toISOString(), mercadona);
    for (const r of rows) {
      prices.push({
        productId: r.product_id as string, chain: r.chain as PriceObservation['chain'],
        zone: r.zone as string, price: r.price as number, unitPrice: r.unit_price as number | null,
        promotion: (r.promotion as string | null) ?? undefined,
        observedAt: r.observed_at as string, source: r.source as PriceObservation['source'],
      });
    }
  }
  return weeklyBasketIndex({ products, prices, now, zones: { mercadona } });
}
