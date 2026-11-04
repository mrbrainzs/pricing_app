import { describe, expect, it } from 'vitest';
import {
  buildSampleData,
  checkAlerts,
  createAlert,
  isAlertCheckDue,
  parsePrice,
  suggestedTarget,
  type AlertTarget,
  type PriceAlert,
  type PriceObservation,
} from '../src';

const DAY = 86_400_000;
const T0 = new Date('2026-11-04T07:00:00Z');
const day = (n: number) => new Date(T0.getTime() + n * DAY);

/** The daily import's price for product "m1" on day n (observed at 05:30 Madrid that day). */
function obs(price: number, n: number, extra: Partial<PriceObservation> = {}): PriceObservation {
  return {
    productId: 'm1',
    chain: 'mercadona',
    zone: 'bcn1',
    price,
    unitPrice: price,
    observedAt: new Date(day(n).getTime() - 2.5 * 3_600_000).toISOString(),
    source: 'online',
    ...extra,
  };
}

function alert(target: AlertTarget, price = 2): PriceAlert {
  return createAlert({ productId: 'm1', chain: 'mercadona', productName: 'Llet sencera 1 L', zone: 'bcn1', target, price, now: T0 });
}

/** Runs the daily check over a sequence of prices and returns what fired each day. */
function simulate(start: PriceAlert, dailyPrices: (number | null)[]) {
  let alerts = [start];
  return dailyPrices.map((price, n) => {
    const result = checkAlerts(alerts, price === null ? [] : [obs(price, n + 1)], day(n + 1));
    alerts = result.alerts;
    return { fired: result.fired, status: result.status[start.id]!, alert: alerts[0]! };
  });
}

describe('price alerts', () => {
  it('fires when the price drops to or below the target, with product, chain, new and previous price', () => {
    const a = alert({ kind: 'below', price: 1.8 });
    const [d1, d2] = simulate(a, [1.95, 1.8]);
    expect(d1!.fired).toEqual([]);
    expect(d1!.status).toMatchObject({ state: 'waiting', price: 1.95 });
    expect(d2!.fired).toEqual([
      expect.objectContaining({ productId: 'm1', productName: 'Llet sencera 1 L', chain: 'mercadona', price: 1.8, previousPrice: 1.95 }),
    ]);
    expect(d2!.status).toMatchObject({ state: 'triggered', price: 1.8 });
    expect(d2!.alert.lastNotifiedPrice).toBe(1.8);
  });

  it('fires once per new lower price, never twice for the same price', () => {
    const a = alert({ kind: 'below', price: 1.8 });
    const days = simulate(a, [1.75, 1.75, 1.75, 1.7, 1.75, 1.7]);
    expect(days.map((d) => d.fired.map((f) => f.price))).toEqual([[1.75], [], [], [1.7], [], []]);
    expect(days.every((d) => d.status.state === 'triggered')).toBe(true);
  });

  it('is idempotent: checking twice on the same data fires nothing the second time', () => {
    const a = alert({ kind: 'below', price: 1.8 });
    const first = checkAlerts([a], [obs(1.5, 1)], day(1));
    expect(first.fired).toHaveLength(1);
    expect(first.changed).toBe(true);
    const second = checkAlerts(first.alerts, [obs(1.5, 1)], new Date(day(1).getTime() + 3_600_000));
    expect(second.fired).toEqual([]);
    expect(second.changed).toBe(false);
    expect(second.alerts[0]).toBe(first.alerts[0]);
  });

  it('re-arms a target alert when the price goes back above the target', () => {
    const a = alert({ kind: 'below', price: 1.8 });
    const days = simulate(a, [1.7, 2.1, 1.7]);
    expect(days.map((d) => d.fired.map((f) => [f.price, f.previousPrice]))).toEqual([[[1.7, 2]], [], [[1.7, 2.1]]]);
    expect(days[1]!.status.state).toBe('waiting');
    expect(days[1]!.alert.lastNotifiedPrice).toBeNull();
  });

  it('does not fire for a target the price already met when the alert was set', () => {
    const a = alert({ kind: 'below', price: 2.5 }, 2);
    expect(a.lastNotifiedPrice).toBe(2);
    const days = simulate(a, [2, 1.9]);
    expect(days[0]!.fired).toEqual([]);
    expect(days[0]!.status.state).toBe('triggered');
    expect(days[1]!.fired.map((f) => f.price)).toEqual([1.9]);
  });

  it('"any drop" compares with the price when last notified, or when set', () => {
    const a = alert({ kind: 'anyDrop' }, 2);
    const days = simulate(a, [2, 2.2, 1.9, 1.9, 2.1, 1.9, 1.85]);
    expect(days.map((d) => d.fired.map((f) => [f.price, f.previousPrice]))).toEqual([
      [], [], [[1.9, 2.2]], [], [], [], [[1.85, 1.9]],
    ]);
    expect(days.map((d) => d.status.state)).toEqual(['waiting', 'waiting', 'triggered', 'triggered', 'waiting', 'triggered', 'triggered']);
  });

  it('only uses fresh prices: stale or expired prices never fire', () => {
    const a = alert({ kind: 'below', price: 1.8 });
    const stale = obs(1.5, -3); // 4 days old on day 1
    const result = checkAlerts([a], [stale], day(1));
    expect(result.fired).toEqual([]);
    expect(result.status[a.id]).toEqual({ state: 'noCurrentPrice', lastPrice: 1.5, observedAt: stale.observedAt });
    expect(result.changed).toBe(false);
  });

  it('keeps alerts for products that disappeared, marked "no current price", and fires when they come back cheaper', () => {
    const a = alert({ kind: 'below', price: 1.8 });
    const days = simulate(a, [null, null, 1.6]);
    expect(days[0]!.status).toEqual({ state: 'noCurrentPrice', lastPrice: null, observedAt: null });
    expect(days[1]!.alert).toEqual(a);
    expect(days[2]!.fired.map((f) => f.price)).toEqual([1.6]);
  });

  it('prefers the zone the alert was set in, and ignores single-store receipt prices', () => {
    const a = alert({ kind: 'below', price: 1.8 });
    const otherZone = obs(1.5, 1, { zone: 'bcn2', observedAt: new Date(day(1).getTime() - 3_600_000).toISOString() });
    const receipt = obs(1.4, 1, { storeId: 's9', source: 'receipt' });
    const sameZone = checkAlerts([a], [obs(1.95, 1), otherZone, receipt], day(1));
    expect(sameZone.fired).toEqual([]);
    expect(sameZone.status[a.id]).toMatchObject({ state: 'waiting', price: 1.95 });
    // If the zone no longer exists, the newest price in another zone is used.
    const moved = checkAlerts([a], [otherZone], day(1));
    expect(moved.fired.map((f) => f.price)).toEqual([1.5]);
  });

  it('ignores float noise below one cent', () => {
    const a = alert({ kind: 'anyDrop' }, 0.3);
    const result = checkAlerts([a], [obs(0.1 + 0.2, 1)], day(1));
    expect(result.fired).toEqual([]);
    expect(result.status[a.id]!.state).toBe('waiting');
  });

  it('checks several alerts at once and only reports the ones that fire', () => {
    const milk = alert({ kind: 'below', price: 1.8 });
    const oil = createAlert({ productId: 'o1', chain: 'consum', productName: 'Oli', zone: 'cat', target: { kind: 'anyDrop' }, price: 8.5, now: T0 });
    const prices = [obs(1.9, 1), obs(7.99, 1, { productId: 'o1', chain: 'consum', zone: 'cat' })];
    const result = checkAlerts([milk, oil], prices, day(1));
    expect(result.fired).toEqual([expect.objectContaining({ alertId: oil.id, chain: 'consum', price: 7.99, previousPrice: 8.5 })]);
    expect(result.alerts.map((x) => x.id)).toEqual([milk.id, oil.id]);
  });

  it('works on the sample catalogue (simulated overnight drop)', () => {
    const data = buildSampleData(T0);
    const p = data.prices[0]!;
    const a = createAlert({ productId: p.productId, chain: p.chain, productName: 'x', zone: p.zone, target: { kind: 'anyDrop' }, price: p.price, now: T0 });
    const unchanged = checkAlerts([a], data.prices, T0);
    expect(unchanged.fired).toEqual([]);
    const cheaper = data.prices.map((x) => (x === p ? { ...x, price: x.price - 0.1, observedAt: day(1).toISOString() } : x));
    const result = checkAlerts([a], cheaper, day(1));
    expect(result.fired).toHaveLength(1);
    expect(result.fired[0]!.previousPrice).toBe(p.price);
  });
});

describe('alert form helpers', () => {
  it('suggests a target about 10% below the current price, in 5-cent steps', () => {
    expect(suggestedTarget(0.95)).toBe(0.85);
    expect(suggestedTarget(2)).toBe(1.8);
    expect(suggestedTarget(8.49)).toBe(7.6);
    expect(suggestedTarget(0.3)).toBe(0.25);
    expect(suggestedTarget(0.1)).toBe(0.09);
    for (const p of [0.05, 0.11, 0.99, 1.01, 3.33, 12.5]) expect(suggestedTarget(p)).toBeLessThan(p);
  });

  it('parses prices typed with a comma or a dot', () => {
    expect(parsePrice('1,80')).toBe(1.8);
    expect(parsePrice('1.8')).toBe(1.8);
    expect(parsePrice(' 1,80 € ')).toBe(1.8);
    expect(parsePrice('€0,5')).toBe(0.5);
    expect(parsePrice(',99')).toBe(0.99);
    expect(parsePrice('2')).toBe(2);
    expect(parsePrice('0')).toBeNull();
    expect(parsePrice('1,234')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('-1')).toBeNull();
  });
});

describe('when to check', () => {
  it('is due once the daily update is in (07:00 Madrid at the latest), not again until the next one', () => {
    const at = (iso: string) => new Date(iso);
    expect(isAlertCheckDue(null, at('2026-11-04T10:00:00Z'))).toBe(true);
    // Checked last night; the morning update is in by 06:00 UTC.
    expect(isAlertCheckDue('2026-11-03T22:00:00Z', at('2026-11-04T05:59:00Z'))).toBe(false);
    expect(isAlertCheckDue('2026-11-03T22:00:00Z', at('2026-11-04T06:30:00Z'))).toBe(true);
    // Already checked after this morning's update.
    expect(isAlertCheckDue('2026-11-04T06:10:00Z', at('2026-11-04T21:00:00Z'))).toBe(false);
    expect(isAlertCheckDue('2026-11-04T06:10:00Z', at('2026-11-05T06:01:00Z'))).toBe(true);
    // Days without opening the app.
    expect(isAlertCheckDue('2026-11-01T12:00:00Z', at('2026-11-04T03:00:00Z'))).toBe(true);
  });
});
