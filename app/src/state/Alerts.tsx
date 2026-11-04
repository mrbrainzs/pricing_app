import { checkAlerts, isAlertCheckDue, type AlertFiring, type AlertStatus, type PriceAlert } from '@pricing/core';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState as AppLifecycle } from 'react-native';

import { syncBackgroundCheck } from '@/alerts/background';
import { runAlertCheck } from '@/alerts/check';
import { notifier } from '@/alerts/notify';
import type { NotificationPermission } from '@/alerts/notify.types';
import { readAlerts, updateAlerts, type StoredAlerts } from '@/alerts/store';
import type { Catalog } from '@/data/source';
import { useApp } from '@/state/AppState';

interface AlertsState {
  ready: boolean;
  alerts: PriceAlert[];
  /** Status per alert id against the newest catalogue the app has. */
  status: Record<string, AlertStatus>;
  /** Alerts that fired since the app opened and haven't been seen yet (in-app banner). */
  recent: AlertFiring[];
  lastCheckedAt: string | null;
  permission: NotificationPermission;
  /** Explain and ask for notification permission after this alert is created (first time only). */
  shouldAskPermission: boolean;
  alertFor: (productId: string) => PriceAlert | undefined;
  /** Adds an alert, replacing any existing alert for the same product. */
  saveAlert: (alert: PriceAlert) => Promise<void>;
  removeAlert: (id: string) => Promise<void>;
  dismissRecent: () => void;
  requestPermission: () => Promise<NotificationPermission>;
  skipPermission: () => void;
}

const Ctx = createContext<AlertsState | null>(null);

/**
 * Price alerts (F7) on the device. Checks run when the catalogue loads and when the app comes
 * back to the front after a daily price update; phones also try a background check.
 */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const { catalog, source, settings, t } = useApp();
  const [stored, setStored] = useState<StoredAlerts | null>(null);
  const [checked, setChecked] = useState<Catalog | null>(null);
  const [recent, setRecent] = useState<AlertFiring[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>(notifier.supported ? 'undetermined' : 'unsupported');
  const appCatalog = useRef(catalog);
  useEffect(() => {
    appCatalog.current = catalog;
  }, [catalog]);

  useEffect(() => {
    readAlerts().then(setStored);
    notifier.getPermission().then(setPermission);
  }, []);

  const check = useCallback((latest: Catalog) => runAlertCheck(latest).then(({ stored: next, fired }) => {
    setStored(next);
    setChecked(latest);
    if (fired.length) {
      const ids = new Set(fired.map((f) => f.alertId));
      setRecent((r) => [...fired, ...r.filter((f) => !ids.has(f.alertId))]);
    }
  }), []);

  useEffect(() => {
    if (catalog) check(catalog).catch(() => {});
  }, [catalog, check]);

  // Back in front: pick up what a background check saved, and fetch prices again once the daily update is in.
  useEffect(() => {
    const sub = AppLifecycle.addEventListener('change', (next) => {
      if (next !== 'active') return;
      notifier.getPermission().then(setPermission);
      readAlerts().then((s) => {
        setStored(s);
        if (!s.alerts.length || !isAlertCheckDue(s.lastCheckedAt, new Date())) return;
        source.load().then((latest) => {
          // Don't judge real alerts against the sample fallback when the API is briefly unreachable.
          if (latest.isSample && appCatalog.current && !appCatalog.current.isSample) return;
          return check(latest);
        }).catch(() => {});
      });
    });
    return () => sub.remove();
  }, [source, check]);

  // Keep the language with the alerts so background notifications use it.
  useEffect(() => {
    if (stored && stored.lang !== settings.lang) updateAlerts((s) => ({ ...s, lang: settings.lang })).then(setStored);
  }, [stored, settings.lang]);

  const loaded = stored !== null;
  const hasAlerts = (stored?.alerts.length ?? 0) > 0;
  useEffect(() => {
    if (loaded) syncBackgroundCheck(hasAlerts);
  }, [loaded, hasAlerts]);

  const openProduct = useCallback((id: string) => router.push(`/product/${encodeURIComponent(id)}`), []);
  notifier.useTaps(openProduct);

  const prices = (checked ?? catalog)?.prices;
  const status = useMemo(() => (stored && prices ? checkAlerts(stored.alerts, prices, new Date()).status : {}), [stored, prices]);

  const saveAlert = useCallback(async (alert: PriceAlert) => {
    setStored(await updateAlerts((s) => ({ ...s, alerts: [alert, ...s.alerts.filter((a) => a.productId !== alert.productId)] })));
  }, []);

  const removeAlert = useCallback(async (id: string) => {
    setStored(await updateAlerts((s) => ({ ...s, alerts: s.alerts.filter((a) => a.id !== id) })));
    setRecent((r) => r.filter((f) => f.alertId !== id));
  }, []);

  const dismissRecent = useCallback(() => setRecent((r) => (r.length ? [] : r)), []);

  const requestPermission = useCallback(async () => {
    const result = await notifier.requestPermission(t('alertsTitle'));
    setPermission(result);
    setStored(await updateAlerts((s) => ({ ...s, permissionAsked: true })));
    return result;
  }, [t]);

  const skipPermission = useCallback(() => {
    updateAlerts((s) => ({ ...s, permissionAsked: true })).then(setStored);
  }, []);

  const alerts = useMemo(() => stored?.alerts ?? [], [stored]);
  const alertFor = useCallback((productId: string) => alerts.find((a) => a.productId === productId), [alerts]);

  const value: AlertsState = {
    ready: loaded,
    alerts,
    status,
    recent,
    lastCheckedAt: stored?.lastCheckedAt ?? null,
    permission,
    shouldAskPermission: notifier.supported && permission === 'undetermined' && !stored?.permissionAsked,
    alertFor,
    saveAlert,
    removeAlert,
    dismissRecent,
    requestPermission,
    skipPermission,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAlerts(): AlertsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAlerts must be used inside AlertsProvider');
  return ctx;
}
