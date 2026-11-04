import { ageInDays } from './freshness';
import { round } from './units';

export type PriceLabel = 'good' | 'normal' | 'high';

export interface PricePoint {
  price: number;
  observedAt: string;
}

export interface PriceStats {
  /** Null until there is enough history to judge (at least 30 days). */
  label: PriceLabel | null;
  avg30: number | null;
  min90: number | null;
  p25: number | null;
  p75: number | null;
  /** Days of history available in the 90-day window. */
  historyDays: number;
}

/** Minimum span of history before a good/normal/high label is shown. */
export const MIN_HISTORY_DAYS = 30;

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/** One price per calendar day (the last seen that day), so frequent scrapes don't skew stats. */
function dailyPrices(history: PricePoint[]): Map<string, number> {
  const byDay = new Map<string, PricePoint>();
  for (const p of history) {
    const day = p.observedAt.slice(0, 10);
    const prev = byDay.get(day);
    if (!prev || p.observedAt > prev.observedAt) byDay.set(day, p);
  }
  return new Map([...byDay].map(([d, p]) => [d, p.price]));
}

/**
 * Price label from the spec: good = at or below the 90-day 25th percentile,
 * high = above the 75th, otherwise normal. A flat price is always "normal".
 */
export function priceStats(current: number, history: PricePoint[], now: Date): PriceStats {
  const in90 = history.filter((p) => ageInDays(p.observedAt, now) <= 90);
  const daily = dailyPrices(in90);
  const days = [...daily.keys()].sort();
  const values = [...daily.values()].sort((a, b) => a - b);
  const historyDays = days.length === 0 ? 0 : Math.round(ageInDays(days[0]!, now));

  const last30 = [...daily].filter(([d]) => ageInDays(d, now) <= 30).map(([, v]) => v);
  const avg30 = last30.length ? round(last30.reduce((a, b) => a + b, 0) / last30.length) : null;
  const min90 = values.length ? values[0]! : null;

  if (values.length === 0 || historyDays < MIN_HISTORY_DAYS) {
    return { label: null, avg30, min90, p25: null, p75: null, historyDays };
  }
  const p25 = round(percentile(values, 0.25));
  const p75 = round(percentile(values, 0.75));
  let label: PriceLabel = 'normal';
  if (p25 !== p75) {
    if (current <= p25) label = 'good';
    else if (current > p75) label = 'high';
  }
  return { label, avg30, min90, p25, p75, historyDays };
}
