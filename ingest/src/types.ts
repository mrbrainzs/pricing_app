import type { ChainId, Size } from '@pricing/core';

/** A product as read from a chain, before it is stored. */
export interface ScrapedProduct {
  chain: ChainId;
  chainProductId: string;
  name: string;
  brand?: string;
  ean?: string;
  isOwnBrand: boolean;
  categoryId: string | null;
  size: Size | null;
  imageUrl?: string;
  /** Chain's own category path, kept for debugging classification. */
  chainCategory?: string;
}

/** A price as read from a chain for one pricing zone. */
export interface ScrapedPrice {
  chain: ChainId;
  chainProductId: string;
  zone: string;
  price: number;
  unitPrice: number | null;
  promotion?: string;
  observedAt: string;
  source: 'online' | 'receipt' | 'leaflet';
}

export interface ScrapeResult {
  products: ScrapedProduct[];
  prices: ScrapedPrice[];
}
