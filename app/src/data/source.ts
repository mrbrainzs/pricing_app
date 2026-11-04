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
 * Sample data: invented prices for six chains in Barcelona, used until the Supabase source
 * is configured (EXPO_PUBLIC_SUPABASE_URL). Everything it returns is labelled as sample.
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
