/** Chains covered by Cabàs. Only the first six have online prices in v1. */
export const ONLINE_CHAINS = ['mercadona', 'alcampo', 'bonarea', 'caprabo', 'dia', 'bonpreu'] as const;
export const OFFLINE_CHAINS = ['aldi', 'condis', 'lidl'] as const;
export type ChainId = (typeof ONLINE_CHAINS)[number] | (typeof OFFLINE_CHAINS)[number];

export type Lang = 'ca' | 'es' | 'en';

/** Base units: weight in kg, volume in litres, countable items in units. */
export type BaseUnit = 'kg' | 'l' | 'unit';

export interface Size {
  /** Amount expressed in the base unit (e.g. 0.5 for 500 g). */
  amount: number;
  unit: BaseUnit;
}

export interface Product {
  id: string;
  chain: ChainId;
  /** Chain's own product id (e.g. Mercadona "4241"). */
  chainProductId: string;
  ean?: string;
  name: string;
  brand?: string;
  isOwnBrand: boolean;
  /** Generic category ("milk", "eggs"); null when the product is not classified. */
  categoryId: string | null;
  size: Size | null;
}

export type PriceSource = 'online' | 'receipt' | 'leaflet';

export interface PriceObservation {
  productId: string;
  chain: ChainId;
  /** Pricing zone (e.g. Mercadona warehouse "bcn1", or "cat" for chain-wide prices). */
  zone: string;
  /** Set for in-store observations (receipts), which apply to one shop only. */
  storeId?: string;
  price: number;
  /** Price per base unit (€/kg, €/L, €/unit). */
  unitPrice: number | null;
  promotion?: string;
  /** ISO timestamp. */
  observedAt: string;
  source: PriceSource;
}

export interface Store {
  id: string;
  chain: ChainId;
  name: string;
  zone: string;
  lat: number;
  lng: number;
}

export type BrandLevel =
  | { kind: 'own' }
  | { kind: 'any' }
  | { kind: 'specific'; brand: string };

export interface ListItem {
  id: string;
  /** What the user typed ("milk", "llet", "huevos"). */
  text: string;
  /** Resolved generic category; null if text could not be mapped. */
  categoryId: string | null;
  level: BrandLevel;
  /** Number of "default size" units wanted (e.g. 2 × 1 L of milk). */
  quantity: number;
}

export type MatchType = 'exact' | 'same_product_other_size' | 'own_brand_equivalent' | 'category';
