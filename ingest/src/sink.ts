import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CATEGORIES, type ChainId } from '@pricing/core';
import type { ScrapedPrice, ScrapedProduct } from './types';

export interface StoredProduct {
  id: string;
  chainProductId: string;
  sizeAmount: number | null;
  ean: string | null;
}

/** Where scraped data goes: a Supabase database, or JSON files for dry runs. */
export interface Sink {
  existingProducts(chain: ChainId): Promise<Map<string, StoredProduct>>;
  save(chain: ChainId, products: ScrapedProduct[], prices: ScrapedPrice[]): Promise<{ products: number; prices: number; shrunk: string[] }>;
}

export class JsonSink implements Sink {
  constructor(private readonly dir: string) {}

  async existingProducts(): Promise<Map<string, StoredProduct>> {
    return new Map();
  }

  async save(chain: ChainId, products: ScrapedProduct[], prices: ScrapedPrice[]) {
    await mkdir(this.dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const file = join(this.dir, `${chain}-${stamp}.json`);
    await writeFile(file, JSON.stringify({ chain, products, prices }, null, 2));
    return { products: products.length, prices: prices.length, shrunk: [] };
  }
}

/** Writes to Supabase through its REST API with the service-role key (server side only). */
export class SupabaseSink implements Sink {
  constructor(private readonly url: string, private readonly serviceKey: string) {}

  private async rest(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.serviceKey,
        authorization: `Bearer ${this.serviceKey}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    });
    if (!res.ok) throw new Error(`Supabase ${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
    return res;
  }

  async upsertCategories(): Promise<void> {
    const rows = CATEGORIES.map((c) => ({
      id: c.id,
      group_id: c.group,
      name_ca: c.names.ca,
      name_es: c.names.es,
      name_en: c.names.en,
      default_size: c.defaultSize.amount,
      default_unit: c.defaultSize.unit,
    }));
    await this.rest('categories', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) });
  }

  async existingProducts(chain: ChainId): Promise<Map<string, StoredProduct>> {
    const out = new Map<string, StoredProduct>();
    const page = 1000;
    for (let from = 0; ; from += page) {
      const res = await this.rest(`products?chain=eq.${chain}&select=id,chain_product_id,size_amount,ean&order=chain_product_id`, {
        headers: { range: `${from}-${from + page - 1}` },
      });
      const rows = (await res.json()) as { id: string; chain_product_id: string; size_amount: number | null; ean: string | null }[];
      for (const r of rows) out.set(r.chain_product_id, { id: r.id, chainProductId: r.chain_product_id, sizeAmount: r.size_amount, ean: r.ean });
      if (rows.length < page) break;
    }
    return out;
  }

  async save(chain: ChainId, products: ScrapedProduct[], prices: ScrapedPrice[]) {
    await this.upsertCategories();
    const existing = await this.existingProducts(chain);
    const now = new Date().toISOString();

    const rows = products.map((p) => {
      const old = existing.get(p.chainProductId);
      const row: Record<string, unknown> = {
        chain,
        chain_product_id: p.chainProductId,
        name: p.name,
        brand: p.brand ?? null,
        is_own_brand: p.isOwnBrand,
        category_id: p.categoryId,
        size_amount: p.size?.amount ?? null,
        size_unit: p.size?.unit ?? null,
        image_url: p.imageUrl ?? null,
        last_seen: now,
        // Never overwrite a known EAN with "unknown".
        ean: p.ean ?? old?.ean ?? null,
      };
      if (old?.sizeAmount && p.size && Math.abs(old.sizeAmount - p.size.amount) > 1e-6) {
        row.previous_size_amount = old.sizeAmount;
        row.size_changed_at = now;
      }
      return row;
    });

    // PostgREST needs the same columns in every row of a batch, so group by column set.
    const idByChainId = new Map<string, string>();
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) {
      const key = Object.keys(r).sort().join(',');
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    for (const group of groups.values()) {
      for (let i = 0; i < group.length; i += 500) {
        const res = await this.rest('products?on_conflict=chain,chain_product_id&select=id,chain_product_id', {
          method: 'POST',
          headers: { prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(group.slice(i, i + 500)),
        });
        for (const r of (await res.json()) as { id: string; chain_product_id: string }[]) idByChainId.set(r.chain_product_id, r.id);
      }
    }

    const priceRows = prices.flatMap((p) => {
      const productId = idByChainId.get(p.chainProductId);
      if (!productId) return [];
      return [{
        product_id: productId,
        chain,
        zone: p.zone,
        price: p.price,
        unit_price: p.unitPrice,
        promotion: p.promotion ?? null,
        observed_at: p.observedAt,
        source: p.source,
      }];
    });
    for (let i = 0; i < priceRows.length; i += 1000) {
      await this.rest('price_observations', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(priceRows.slice(i, i + 1000)) });
    }
    const shrunk = rows.filter((r) => r.size_changed_at && (r.size_amount as number) < (r.previous_size_amount as number)).map((r) => r.chain_product_id as string);
    return { products: rows.length, prices: priceRows.length, shrunk };
  }
}
