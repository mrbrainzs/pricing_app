import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ChainId } from '@pricing/core';
import type { ScrapedPrice, ScrapedProduct } from './types';

export interface StoredProduct {
  id: string;
  chainProductId: string;
  sizeAmount: number | null;
  ean: string | null;
}

/** Where scraped data goes: a local SQLite database, or JSON files for dry runs. */
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
