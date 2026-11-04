import { CHAINS, checkAlerts, type AlertFiring, type Lang } from '@pricing/core';

import type { Catalog } from '@/data/source';
import { deviceLanguage, money, translate } from '@/i18n';

import { notifier } from './notify';
import { updateAlerts, type StoredAlerts } from './store';

/** "Price drop: <product>" / "Now €0.89 at Mercadona (was €0.99)." */
export function alertMessage(f: AlertFiring, lang: Lang): { title: string; body: string } {
  return {
    title: translate(lang, 'alertNotifTitle', { product: f.productName }),
    body: translate(lang, 'alertNotifBody', { price: money(f.price, lang), chain: CHAINS[f.chain].name, previous: money(f.previousPrice, lang) }),
  };
}

/**
 * Checks the stored alerts against a catalogue, saves the result and shows a local notification
 * for each alert that fired. Used when the app opens or returns to the front, and by the
 * background task on phones. Sample prices never send notifications.
 */
export async function runAlertCheck(catalog: Catalog, now = new Date()): Promise<{ stored: StoredAlerts; fired: AlertFiring[] }> {
  let fired: AlertFiring[] = [];
  const stored = await updateAlerts((current) => {
    const result = checkAlerts(current.alerts, catalog.prices, now);
    fired = result.fired;
    // Only real prices count as a check, so a sample fallback (API down) is retried later.
    return { ...current, alerts: result.alerts, lastCheckedAt: catalog.isSample ? current.lastCheckedAt : now.toISOString() };
  });
  if (fired.length && !catalog.isSample) {
    const lang = stored.lang ?? deviceLanguage();
    const items = fired.map((f) => ({ id: f.alertId, productId: f.productId, ...alertMessage(f, lang) }));
    await notifier.show(items, translate(lang, 'alertsTitle')).catch(() => {});
  }
  return { stored, fired };
}
