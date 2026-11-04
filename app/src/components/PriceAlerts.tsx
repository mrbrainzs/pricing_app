import { createAlert, parsePrice, suggestedTarget, type AlertStatus, type AlertTarget, type Lang, type PriceAlert, type PriceObservation, type Product } from '@pricing/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { alertMessage } from '@/alerts/check';
import { notifier } from '@/alerts/notify';
import { Badge, Button, Card, Chip, Input, Row, T } from '@/components/ui';
import { money } from '@/i18n';
import { useAlerts } from '@/state/Alerts';
import { useApp } from '@/state/AppState';
import { space, useColors } from '@/theme';

type Translate = ReturnType<typeof useApp>['t'];

/** "1,80" in Catalan and Spanish, "1.80" in English: what people type back into the field. */
function amountText(amount: number, lang: Lang): string {
  const text = amount.toFixed(2);
  return lang === 'en' ? text : text.replace('.', ',');
}

export function alertRuleLabel(alert: PriceAlert, lang: Lang, t: Translate): string {
  return alert.target.kind === 'below'
    ? t('alertBelow', { price: money(alert.target.price, lang) })
    : t('alertAnyDropFrom', { price: money(alert.createdPrice, lang) });
}

export function AlertStatusBadge({ status }: { status: AlertStatus | undefined }) {
  const { settings, t } = useApp();
  if (!status) return null;
  if (status.state === 'triggered') return <Badge tone="good" label={t('alertStatusTriggered', { price: money(status.price, settings.lang) })} />;
  if (status.state === 'waiting') return <Badge label={t('alertStatusWaiting')} />;
  return <Badge tone="warn" label={t('alertStatusNoPrice')} />;
}

const openAlerts = () => router.push('/alerts');

/** "Alert me" on the product page: target price or any drop (UC3). */
export function PriceAlertCard({ product, obs }: { product: Product; obs: PriceObservation | undefined }) {
  const { settings, t } = useApp();
  const { ready, alertFor, status, saveAlert, removeAlert, permission, shouldAskPermission, requestPermission, skipPermission } = useAlerts();
  const c = useColors();
  const lang = settings.lang;
  const existing = alertFor(product.id);
  const [mode, setMode] = useState<'closed' | 'form' | 'ask'>('closed');
  const [kind, setKind] = useState<AlertTarget['kind']>('below');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!ready || (!obs && !existing)) return null;

  const openForm = () => {
    if (!obs) return;
    setKind(existing?.target.kind ?? 'below');
    setText(amountText(existing?.target.kind === 'below' ? existing.target.price : suggestedTarget(obs.price), lang));
    setError(null);
    setMode('form');
  };

  const submit = async () => {
    if (!obs) return;
    let target: AlertTarget = { kind: 'anyDrop' };
    if (kind === 'below') {
      const price = parsePrice(text);
      if (price === null || price >= obs.price) {
        setError(t('alertTargetInvalid', { price: money(obs.price, lang) }));
        return;
      }
      target = { kind: 'below', price };
    }
    await saveAlert(createAlert({
      productId: product.id, chain: product.chain, productName: product.name, zone: obs.zone, target, price: obs.price, now: new Date(),
    }));
    setMode(shouldAskPermission ? 'ask' : 'closed');
  };

  if (mode === 'ask') {
    return (
      <Card highlight>
        <T variant="heading">{t('alertCreated')}</T>
        <T variant="muted">{t('alertPermissionAsk')}</T>
        <Button label={t('alertPermissionAllow')} onPress={() => requestPermission().finally(() => setMode('closed'))} />
        <Button label={t('alertPermissionLater')} variant="ghost" onPress={() => { skipPermission(); setMode('closed'); }} />
      </Card>
    );
  }

  if (mode === 'form' && obs) {
    return (
      <Card>
        <T variant="heading">{t('alertHeading')}</T>
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip label={t('alertTargetPrice')} selected={kind === 'below'} onPress={() => setKind('below')} />
          <Chip label={t('alertAnyDrop')} selected={kind === 'anyDrop'} onPress={() => { setKind('anyDrop'); setError(null); }} />
        </Row>
        {kind === 'below' ? (
          <>
            <Row>
              <Input
                value={text}
                onChangeText={(v) => { setText(v); setError(null); }}
                onSubmitEditing={submit}
                keyboardType="decimal-pad"
                returnKeyType="done"
                accessibilityLabel={t('alertTargetPrice')}
                style={{ flex: 1 }}
              />
              <T variant="price">€</T>
            </Row>
            <T variant="small">{t('alertTargetHint', { price: money(obs.price, lang) })}</T>
          </>
        ) : (
          <T variant="small">{t('alertAnyDropHint', { price: money(obs.price, lang) })}</T>
        )}
        {error ? <T variant="small" style={{ color: c.high }}>{error}</T> : null}
        <T variant="small">{notifier.supported ? t('alertsHowNative') : t('alertsHowWeb')}</T>
        <Row style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button label={t('cancel')} variant="ghost" compact onPress={() => setMode('closed')} />
          <Button label={existing ? t('save') : t('alertCreate')} compact onPress={submit} />
        </Row>
      </Card>
    );
  }

  if (!existing) return <Button label={t('alertMe')} variant="secondary" onPress={openForm} />;

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <T variant="heading">{t('alertHeading')}</T>
        <AlertStatusBadge status={status[existing.id]} />
      </Row>
      <T>{alertRuleLabel(existing, lang, t)}</T>
      {permission === 'denied' ? <T variant="small" style={{ color: c.warn }}>{t('alertPermissionDenied')}</T> : null}
      <Row style={{ flexWrap: 'wrap' }} gap={space.xs}>
        {obs ? <Button label={t('alertEdit')} variant="secondary" compact onPress={openForm} /> : null}
        <Button label={t('alertDelete')} variant="ghost" compact onPress={() => removeAlert(existing.id)} />
        <Button label={t('alertSeeAll')} variant="ghost" compact onPress={openAlerts} />
      </Row>
    </Card>
  );
}

/** In-app notice of alerts that fired since the app opened (the only notice on the web). */
export function PriceDropBanner() {
  const { settings, t } = useApp();
  const { recent, dismissRecent } = useAlerts();
  if (!recent.length) return null;
  return (
    <Card highlight>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="heading">{t('alertsBannerTitle')}</T>
        <Button label={t('alertDismiss')} variant="ghost" compact onPress={dismissRecent} />
      </Row>
      {recent.slice(0, 3).map((f) => (
        <Pressable key={f.alertId} accessibilityRole="button" onPress={() => router.push(`/product/${encodeURIComponent(f.productId)}`)}>
          <View style={{ gap: 2 }}>
            <T numberOfLines={2}>{f.productName}</T>
            <T variant="small">{alertMessage(f, settings.lang).body}</T>
          </View>
        </Pressable>
      ))}
      <Button label={t('alertSeeAll')} variant="secondary" compact onPress={openAlerts} />
    </Card>
  );
}
