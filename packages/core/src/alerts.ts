/**
 * Price alerts (F7, UC3). Alerts live on the device; the app runs `checkAlerts` against the
 * latest catalogue (after the daily price update) and notifies about the alerts that fire.
 * Everything here is pure so the rules can be unit-tested.
 */
import { freshness } from './freshness';
import type { ChainId, PriceObservation } from './types';
import { round } from './units';

/** "Tell me when it costs this much or less", or "tell me about any drop". */
export type AlertTarget = { kind: 'below'; price: number } | { kind: 'anyDrop' };

export interface PriceAlert {
  id: string;
  productId: string;
  chain: ChainId;
  /** Product name when the alert was set, so the alert still reads well if the product disappears. */
  productName: string;
  /** Pricing zone of the price the alert was set on (Mercadona prices differ per warehouse). */
  zone: string;
  target: AlertTarget;
  /** Price when the alert was set. */
  createdPrice: number;
  /** Price of the last notification; null until one is sent (or after a target alert re-arms). */
  lastNotifiedPrice: number | null;
  /** Last fresh price seen by a check; used as "previous price" in the message. */
  lastSeenPrice: number | null;
  /** ISO timestamps. */
  createdAt: string;
  lastNotifiedAt: string | null;
}

export type AlertStatus =
  /** A fresh price exists and the alert's condition is not met. */
  | { state: 'waiting'; price: number; observedAt: string }
  /** A fresh price meets the condition (at or below target, or below the price when set). */
  | { state: 'triggered'; price: number; observedAt: string }
  /** The product is gone from the catalogue, or its price is older than 3 days. */
  | { state: 'noCurrentPrice'; lastPrice: number | null; observedAt: string | null };

/** What a notification needs: product, new price, chain, previous price. */
export interface AlertFiring {
  alertId: string;
  productId: string;
  productName: string;
  chain: ChainId;
  price: number;
  previousPrice: number;
  target: AlertTarget;
  observedAt: string;
}

export interface AlertCheckResult {
  /** The alerts with their bookkeeping updated, in input order. Store these. */
  alerts: PriceAlert[];
  /** Status per alert id. */
  status: Record<string, AlertStatus>;
  /** Alerts that should notify now. */
  fired: AlertFiring[];
  /** True when `alerts` differs from the input and needs saving. */
  changed: boolean;
}

/** Compare in whole cents so 1.1 + 0.2 style float noise never counts as a drop. */
const cents = (n: number) => Math.round(n * 100);

export interface NewAlert {
  productId: string;
  chain: ChainId;
  productName: string;
  zone: string;
  target: AlertTarget;
  /** The current price the user is looking at. */
  price: number;
  now: Date;
}

export function createAlert({ productId, chain, productName, zone, target, price, now }: NewAlert): PriceAlert {
  const createdAt = now.toISOString();
  // A target the current price already meets would fire at once for a price the user just saw.
  // Treat that price as already notified; a later, lower price (or a re-arm) still notifies.
  const alreadyMet = target.kind === 'below' && cents(price) <= cents(target.price);
  return {
    id: `${productId}@${createdAt}`,
    productId,
    chain,
    productName,
    zone,
    target,
    createdPrice: price,
    lastNotifiedPrice: alreadyMet ? price : null,
    lastSeenPrice: price,
    createdAt,
    lastNotifiedAt: null,
  };
}

/** Prefilled target: about 10% below the current price, rounded down to 5 cents. */
export function suggestedTarget(price: number): number {
  if (price <= 0.1) return round(Math.max(0.01, price - 0.01));
  const target = Math.floor(cents(price * 0.9) / 5) * 5;
  return round(Math.min(target, cents(price) - 1) / 100);
}

/** Reads "1,80", "1.80", "€ 1,80" or "1,80 €". Returns null for anything that isn't a positive amount. */
export function parsePrice(text: string): number | null {
  const clean = text.replace(/[€\s]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value > 0 ? round(value) : null;
}

/** Zone-wide (online) price for the alert: same zone if available, otherwise the newest in any zone. */
function priceFor(alert: PriceAlert, byProduct: Map<string, PriceObservation[]>): PriceObservation | null {
  const candidates = byProduct.get(alert.productId);
  if (!candidates?.length) return null;
  const sameZone = candidates.filter((p) => p.zone === alert.zone);
  const pool = sameZone.length ? sameZone : candidates;
  return pool.reduce((a, b) => (b.observedAt > a.observedAt ? b : a));
}

function conditionMet(alert: PriceAlert, price: number): boolean {
  return alert.target.kind === 'below'
    ? cents(price) <= cents(alert.target.price)
    : cents(price) < cents(alert.createdPrice);
}

/**
 * Checks every alert against the latest prices.
 *
 * - Only fresh prices (3 days or newer) count; a stale or missing price never fires and the
 *   alert is kept with status "no current price".
 * - Target alerts fire when the price is at or below the target and lower than the last
 *   notified price. When the price goes back above the target the alert re-arms, so the next
 *   time it drops below the target notifies again (useful for recurring promotions).
 * - "Any drop" alerts fire when the price is below the price when last notified (or when set).
 * - The same price never notifies twice: running the check again on the same data fires nothing.
 */
export function checkAlerts(alerts: PriceAlert[], prices: PriceObservation[], now: Date): AlertCheckResult {
  const byProduct = new Map<string, PriceObservation[]>();
  for (const p of prices) {
    if (p.storeId) continue; // In-store receipt prices apply to one shop only.
    const list = byProduct.get(p.productId);
    if (list) list.push(p);
    else byProduct.set(p.productId, [p]);
  }

  const status: Record<string, AlertStatus> = {};
  const fired: AlertFiring[] = [];
  let changed = false;

  const updated = alerts.map((alert): PriceAlert => {
    const obs = priceFor(alert, byProduct);
    if (!obs || freshness(obs, now) !== 'fresh') {
      status[alert.id] = { state: 'noCurrentPrice', lastPrice: obs?.price ?? null, observedAt: obs?.observedAt ?? null };
      return alert;
    }

    const price = obs.price;
    status[alert.id] = conditionMet(alert, price)
      ? { state: 'triggered', price, observedAt: obs.observedAt }
      : { state: 'waiting', price, observedAt: obs.observedAt };

    let next: PriceAlert = alert;
    const set = (patch: Partial<PriceAlert>) => {
      next = { ...next, ...patch };
      changed = true;
    };

    let fires = false;
    if (alert.target.kind === 'below') {
      if (cents(price) > cents(alert.target.price)) {
        if (alert.lastNotifiedPrice !== null) set({ lastNotifiedPrice: null }); // Re-arm.
      } else {
        fires = alert.lastNotifiedPrice === null || cents(price) < cents(alert.lastNotifiedPrice);
      }
    } else {
      fires = cents(price) < cents(alert.lastNotifiedPrice ?? alert.createdPrice);
    }

    if (fires) {
      const baseline = alert.lastNotifiedPrice ?? alert.createdPrice;
      const lastSeen = alert.lastSeenPrice;
      const previousPrice = lastSeen !== null && cents(lastSeen) > cents(price) ? lastSeen : Math.max(baseline, price);
      fired.push({
        alertId: alert.id,
        productId: alert.productId,
        productName: alert.productName,
        chain: alert.chain,
        price,
        previousPrice,
        target: alert.target,
        observedAt: obs.observedAt,
      });
      set({ lastNotifiedPrice: price, lastNotifiedAt: now.toISOString() });
    }
    if (alert.lastSeenPrice === null || cents(alert.lastSeenPrice) !== cents(price)) set({ lastSeenPrice: price });
    return next;
  });

  return { alerts: updated, status, fired, changed };
}

/**
 * Prices are imported daily at 05:30 Madrid time and are in by 07:00 Madrid, which is 06:00 UTC
 * at the latest (05:00 UTC in summer time).
 */
export const DAILY_UPDATE_DONE_UTC_HOUR = 6;

/** True when a daily price update has happened since the last check (or there was none). */
export function isAlertCheckDue(lastCheckedAt: string | null, now: Date): boolean {
  if (!lastCheckedAt) return true;
  const update = new Date(now);
  update.setUTCHours(DAILY_UPDATE_DONE_UTC_HOUR, 0, 0, 0);
  if (update > now) update.setUTCDate(update.getUTCDate() - 1);
  return new Date(lastCheckedAt) < update;
}
