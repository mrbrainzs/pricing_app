import { buildSampleData, sampleWeeklyIndex, type PriceObservation, type PricePoint, type Product, type Store, type WeeklyIndex } from '@pricing/core';

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
  /** F12 weekly basket index; null when it can't be loaded. Call after load(), which decides real vs sample data. */
  index(): Promise<WeeklyIndex | null>;
}

/**
 * Invented prices, always labelled as sample. Never merged into the real catalogue.
 */
export function sampleSource(now = new Date()): DataSource {
  const data = buildSampleData(now);
  let index: WeeklyIndex | null = null;
  return {
    async load() {
      return { stores: data.stores, products: data.products, prices: data.prices, isSample: true };
    },
    async history(productId) {
      return data.history(productId);
    },
    async index() {
      index ??= sampleWeeklyIndex(data, now);
      return index;
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
    async index() {
      // Sample index only alongside the sample catalogue; real data never falls back to samples.
      if (usingSample) return sample.index();
      try {
        const data = await get<WeeklyIndex>('/index');
        return Array.isArray(data?.current?.chains) ? data : null;
      } catch { return null; }
    },
  };
}

export function configuredSource(): DataSource {
  const url = process.env.EXPO_PUBLIC_API_URL;
  return url ? apiSource(url) : sampleSource();
}
