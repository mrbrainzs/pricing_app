import { CHAINS, type AlertStatus, type Lang, type PriceAlert } from '@pricing/core';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { notifier } from '@/alerts/notify';
import { AlertStatusBadge, alertRuleLabel } from '@/components/PriceAlerts';
import { Badge, Banner, Button, Card, Row, Screen, T } from '@/components/ui';
import { money } from '@/i18n';
import { useAlerts } from '@/state/Alerts';
import { useApp } from '@/state/AppState';
import { space } from '@/theme';

const ORDER: Record<AlertStatus['state'], number> = { triggered: 0, waiting: 1, noCurrentPrice: 2 };

function whenLabel(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : `${lang}-ES`, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function currentPrice(status: AlertStatus | undefined, lang: Lang): string {
  if (!status) return '–';
  if (status.state === 'noCurrentPrice') return status.lastPrice !== null ? money(status.lastPrice, lang) : '–';
  return money(status.price, lang);
}

export default function AlertsScreen() {
  const { catalog, settings, t } = useApp();
  const { ready, alerts, status, permission, requestPermission, removeAlert, dismissRecent, lastCheckedAt } = useAlerts();
  const lang = settings.lang;

  // Opening this screen counts as seeing the latest drops.
  useEffect(() => dismissRecent(), [dismissRecent]);

  const sorted = useMemo(
    () => [...alerts].sort((a, b) => ORDER[status[a.id]?.state ?? 'waiting'] - ORDER[status[b.id]?.state ?? 'waiting'] || b.createdAt.localeCompare(a.createdAt)),
    [alerts, status],
  );

  const row = (alert: PriceAlert) => {
    const s = status[alert.id];
    return (
      <Card key={alert.id}>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/product/${encodeURIComponent(alert.productId)}`)}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T numberOfLines={2}>{alert.productName}</T>
              <T variant="small">{alertRuleLabel(alert, lang, t)}</T>
            </View>
            <T variant="price">{currentPrice(s, lang)}</T>
          </Row>
        </Pressable>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.xs} style={{ flexWrap: 'wrap', flex: 1 }}>
            <Badge label={CHAINS[alert.chain].name} />
            <AlertStatusBadge status={s} />
          </Row>
          <Button label={t('alertDelete')} variant="ghost" compact onPress={() => removeAlert(alert.id)} />
        </Row>
      </Card>
    );
  };

  return (
    <Screen edges={['bottom']}>
      <T variant="muted">{notifier.supported ? t('alertsHowNative') : t('alertsHowWeb')}</T>
      {catalog?.isSample ? <Banner text={`${t('sampleBanner')} ${t('alertsSampleNote')}`} /> : null}

      {alerts.length > 0 && permission === 'denied' ? (
        <Card>
          <T variant="small">{t('alertPermissionDenied')}</T>
          <Button label={t('alertOpenSettings')} variant="secondary" compact onPress={notifier.openSettings} />
        </Card>
      ) : null}
      {alerts.length > 0 && permission === 'undetermined' ? (
        <Button label={t('alertPermissionAllow')} variant="secondary" onPress={requestPermission} />
      ) : null}

      {!ready ? null : sorted.length === 0 ? (
        <View style={{ gap: space.md }}>
          <T variant="muted">{t('alertsEmpty')}</T>
          <Button label={t('tabSearch')} onPress={() => router.push('/search')} />
        </View>
      ) : (
        <View style={{ gap: space.sm }}>{sorted.map(row)}</View>
      )}

      {lastCheckedAt && alerts.length > 0 ? <T variant="small">{t('alertsLastChecked', { when: whenLabel(lastCheckedAt, lang) })}</T> : null}
    </Screen>
  );
}
