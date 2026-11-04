import type { PriceObservation } from './types';

export type Freshness = 'fresh' | 'stale' | 'expired';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Prices older than this get a warning. */
export const STALE_AFTER_DAYS = 3;
/** Online prices older than this are excluded from comparisons. */
export const ONLINE_EXPIRES_AFTER_DAYS = 7;
/** Receipt prices are in-store prices for one shop and stay valid longer. */
export const RECEIPT_EXPIRES_AFTER_DAYS = 14;

export function ageInDays(observedAt: string, now: Date): number {
  return (now.getTime() - new Date(observedAt).getTime()) / DAY_MS;
}

export function freshness(obs: Pick<PriceObservation, 'observedAt' | 'source'>, now: Date): Freshness {
  const age = ageInDays(obs.observedAt, now);
  const maxAge = obs.source === 'receipt' ? RECEIPT_EXPIRES_AFTER_DAYS : ONLINE_EXPIRES_AFTER_DAYS;
  if (age > maxAge) return 'expired';
  if (age > STALE_AFTER_DAYS) return 'stale';
  return 'fresh';
}

export function isUsable(obs: Pick<PriceObservation, 'observedAt' | 'source'>, now: Date): boolean {
  return freshness(obs, now) !== 'expired';
}
