import type { PriceObservation } from '@pricing/core';

/** Latest price per product (newest across zones). */
export function latestByProduct(prices: PriceObservation[]): Map<string, PriceObservation> {
  const out = new Map<string, PriceObservation>();
  for (const p of prices) {
    const prev = out.get(p.productId);
    if (!prev || p.observedAt > prev.observedAt) out.set(p.productId, p);
  }
  return out;
}
