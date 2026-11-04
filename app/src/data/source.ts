import { buildSampleData, type PriceObservation, type PricePoint, type Product, type Store } from '@pricing/core';

/** Everything the app needs to compare prices in the user's area. */
export interface Catalog {
  stores: Store[];
  products: Product[];
  /** Latest price per product and zone (or store). */
  prices: PriceObservation[];
  /** True while the app runs on made-up sample data. */
  isSample: boolean;
}

export interface DataSource {
  load(): Promise<Catalog>;
  history(productId: string): Promise<PricePoint[]>;
}

/**
 * Invented prices, always labelled as sample. Never merged into the real catalogue.
 */
export function sampleSource(now = new Date()): DataSource {
  const data = buildSampleData(now);
  return {
    async load() {
      return { stores: data.stores, products: data.products, prices: data.prices, isSample: true };
    },
    async history(productId) {
      return data.history(productId);
    },
  };
}

/** The same-origin read-only API uses SQLite on the Ubuntu server. */
export function apiSource(baseUrl: string): DataSource {
  const base = baseUrl.replace(/\/$/, '');
  const sample = sampleSource();
  let usingSample = false;
  const get = async <T,>(path: string): Promise<T> => {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Catalogue API returned ${response.status}`);
    return response.json() as Promise<T>;
  };
  return {
    async load() {
      try {
        const data = await get<Catalog>('/catalog');
        if (data.products.length && data.prices.length) { usingSample = false; return data; }
      } catch { /* Keep the preview usable with explicitly labelled sample data. */ }
      usingSample = true;
      return sample.load();
    },
    async history(productId) {
      if (usingSample) return sample.history(productId);
      try { return await get<PricePoint[]>(`/history/${encodeURIComponent(productId)}`); }
      catch { return []; }
    },
  };
}

export function configuredSource(): DataSource {
  const url = process.env.EXPO_PUBLIC_API_URL;
  return url ? apiSource(url) : sampleSource();
}
