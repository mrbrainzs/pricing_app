import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CATEGORIES, CHAINS, type PriceObservation, type Product, type Store } from '@pricing/core';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/** Local catalogue only. Lists/settings remain on the user's device. */
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
