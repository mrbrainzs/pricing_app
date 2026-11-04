import type { DatabaseSync } from 'node:sqlite';
import type { ChainId, Product } from '@pricing/core';
import { openDatabase } from './database';
import type { Sink, StoredProduct } from './sink';
import type { ScrapedPrice, ScrapedProduct } from './types';

export class SqliteSink implements Sink {
  readonly db: DatabaseSync;
  constructor(path: string) { this.db = openDatabase(path); }
  close() { this.db.close(); }
  async existingProducts(chain: ChainId): Promise<Map<string, StoredProduct>> {
    return new Map(this.db.prepare('SELECT data FROM products WHERE chain=?').all(chain).map(r => {
      const p = JSON.parse(r.data as string) as Product;
      return [p.chainProductId, { id: p.id, chainProductId: p.chainProductId, sizeAmount: p.size?.amount ?? null, ean: p.ean ?? null }];
    }));
  }
  async save(chain: ChainId, products: ScrapedProduct[], prices: ScrapedPrice[]) {
    const existing = await this.existingProducts(chain);
    const now = new Date().toISOString();
    const shrunk: string[] = [];
    const upsert = this.db.prepare(`INSERT INTO products
      (id,chain,chain_product_id,data,first_seen,last_seen,previous_size_amount,size_changed_at) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(chain,chain_product_id) DO UPDATE SET data=excluded.data,last_seen=excluded.last_seen,
      previous_size_amount=COALESCE(excluded.previous_size_amount,products.previous_size_amount),
      size_changed_at=COALESCE(excluded.size_changed_at,products.size_changed_at)`);
    const insert = this.db.prepare(`INSERT INTO price_observations
      (product_id,chain,zone,price,unit_price,promotion,observed_at,source) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(product_id,zone,observed_at) DO NOTHING`);
    let inserted = 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const p of products) {
        if (p.chain !== chain) throw new Error('Product chain mismatch');
        const old = existing.get(p.chainProductId);
        const id = old?.id ?? `${chain}:${p.chainProductId}`;
        const changed = old?.sizeAmount != null && p.size != null && Math.abs(old.sizeAmount - p.size.amount) > 1e-6;
        const stored = { ...p, id, ean: p.ean ?? old?.ean ?? undefined };
        upsert.run(id, chain, p.chainProductId, JSON.stringify(stored), now, now,
          changed ? old.sizeAmount : null, changed ? now : null);
        if (changed && p.size!.amount < old.sizeAmount!) shrunk.push(p.chainProductId);
      }
      for (const p of prices) {
        if (p.chain !== chain || !Number.isFinite(p.price) || p.price <= 0 || !Number.isFinite(Date.parse(p.observedAt))) {
          throw new Error('Invalid price observation');
        }
        inserted += Number(insert.run(`${chain}:${p.chainProductId}`, chain, p.zone, p.price, p.unitPrice,
          p.promotion ?? null, new Date(p.observedAt).toISOString(), p.source).changes);
      }
      this.db.exec('COMMIT');
    } catch (err) { this.db.exec('ROLLBACK'); throw err; }
    return { products: products.length, prices: inserted, shrunk };
  }
}
