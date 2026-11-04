import { CHAINS, compareBasket, encodeShareCard, shareCardFromRanking, type BasketLine, type ListItem, type StoreBasket } from '@pricing/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';

import { itemNames } from '@/components/ListItemRow';
import { OpenNowBadge } from '@/components/OpenNowBadge';
import { sourceLabel, unitPriceLabel } from '@/components/format';
import { todayLocal } from '@/components/shareLink';
import { Badge, Banner, Button, Card, Chip, Divider, Row, Screen, T } from '@/components/ui';
import { km, money } from '@/i18n';
import { useApp } from '@/state/AppState';
import { space, useColors } from '@/theme';

function openDirections(basket: StoreBasket) {
  const { lat, lng } = basket.store;
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {});
}

function Lines({ lines, items }: { lines: BasketLine[]; items: ListItem[] }) {
  const { settings } = useApp();
  const lang = settings.lang;
  return (
    <View style={{ gap: space.sm }}>
      {lines.map((line) => {
        const item = items.find((i) => i.id === line.itemId);
        const unit = unitPriceLabel(line.unitPrice, line.product.size?.unit, lang);
        return (
          <Row key={line.itemId} style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 1 }}>
              <T>{item ? itemNames(item, lang).main : line.product.name}{item && item.quantity > 1 ? ` × ${item.quantity}` : ''}</T>
              <T variant="small" numberOfLines={2}>{line.product.name}{unit ? ` · ${unit}` : ''}</T>
              <T variant="small" style={line.freshness === 'stale' ? { fontWeight: '600' } : undefined}>{sourceLabel(line, lang)}</T>
            </View>
            <T variant="price">{money(line.cost, lang)}</T>
          </Row>
        );
      })}
    </View>
  );
}

function StoreCard({ ranking, rank, items }: { ranking: StoreBasket[]; rank: number; items: ListItem[] }) {
  const { settings, catalog, t } = useApp();
  const basket = ranking[rank]!;
  const c = useColors();
  const lang = settings.lang;
  const [open, setOpen] = useState(rank === 0);
  const chain = CHAINS[basket.store.chain];
  const isBest = rank === 0 && !basket.flagged;
  const missingNames = basket.missing.map((id) => items.find((i) => i.id === id)).filter(Boolean).map((i) => itemNames(i!, lang).main);

  // F11: preview the result card, then share its link (and an image on native).
  const share = () => {
    const card = shareCardFromRanking({ ranking, index: rank, items, lang, date: todayLocal(), sample: !!catalog?.isSample });
    router.push({ pathname: '/share-card', params: { d: encodeShareCard(card) } });
  };

  return (
    <Card highlight={isBest}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Row gap={space.xs}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: chain.color }} />
            <T variant="heading">{basket.store.name}</T>
          </Row>
          {basket.store.address ? <T variant="small">{basket.store.address}</T> : null}
          <T variant="small">{km(basket.distanceKm, lang)} · {t('itemsFound', { found: basket.found, total: basket.requested })}</T>
        </View>
        <T variant="bigPrice">{money(basket.total, lang)}</T>
      </Row>
      <Row style={{ flexWrap: 'wrap' }} gap={space.xs}>
        {isBest ? <Badge label={t('best')} tone="primary" /> : null}
        <OpenNowBadge hours={basket.store.openingHours} />
        {basket.flagged ? <Badge label={t('missingFlag')} tone="warn" /> : null}
        {basket.diffToNext !== null && basket.diffToNext > 0 ? <Badge label={t('cheaperThanNext', { amount: money(basket.diffToNext, lang) })} tone="good" /> : null}
        {basket.staleCount > 0 ? <Badge label={t('staleWarning', { n: basket.staleCount })} tone="warn" /> : null}
      </Row>
      {missingNames.length > 0 ? <T variant="small" style={{ color: c.warn }}>− {missingNames.join(', ')}</T> : null}
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button">
        <T variant="small" style={{ color: c.primary, fontWeight: '600' }}>{open ? t('hideItems') : t('showItems')}</T>
      </Pressable>
      {open ? (
        <>
          <Divider />
          <Lines lines={basket.lines} items={items} />
        </>
      ) : null}
      <Row style={{ marginTop: space.xs }}>
        <Button label={t('go')} onPress={() => openDirections(basket)} compact style={{ flex: 1 }} />
        <Button label={t('share')} onPress={share} variant="secondary" compact style={{ flex: 1 }} />
      </Row>
    </Card>
  );
}

export default function CompareScreen() {
  const { items, catalog, origin, settings, t } = useApp();
  const c = useColors();
  const lang = settings.lang;
  const [mode, setMode] = useState<'one' | 'two'>('one');

  const result = useMemo(() => {
    if (!catalog || !origin) return null;
    return compareBasket({
      items,
      stores: catalog.stores,
      products: catalog.products,
      prices: catalog.prices,
      origin,
      now: new Date(),
      chains: settings.chains,
      maxDistanceKm: settings.maxDistanceKm,
      minSavingForSplit: settings.minSaving,
    });
  }, [catalog, origin, items, settings.chains, settings.maxDistanceKm, settings.minSaving]);

  if (catalog && !catalog.isSample && catalog.stores.length === 0) {
    return <Screen edges={['bottom']}><Banner text={t('storesPending')} /></Screen>;
  }

  if (!result) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator color={c.primary} />
      </Screen>
    );
  }

  const unavailableNames = result.unavailable.map((id) => items.find((i) => i.id === id)).filter(Boolean).map((i) => itemNames(i!, lang).main);
  const split = result.split;

  return (
    <Screen edges={['bottom']}>
      {catalog?.isSample ? <Banner text={t('sampleBanner')} /> : null}

      <Row>
        <Chip label={t('oneStore')} selected={mode === 'one'} onPress={() => setMode('one')} />
        <Chip label={t('twoStores')} selected={mode === 'two'} onPress={() => setMode('two')} />
      </Row>

      {result.ranking.length === 0 ? <T variant="muted">{t('noStores', { km: settings.maxDistanceKm })}</T> : null}
      {unavailableNames.length > 0 ? <T variant="small" style={{ color: c.warn }}>{t('unavailable', { items: unavailableNames.join(', ') })}</T> : null}
      {result.noPrices.length > 0 ? <T variant="small">{t('noPricesYet', { chains: result.noPrices.map((id) => CHAINS[id].name).join(', ') })}</T> : null}

      {mode === 'two' ? (
        split && split.worthIt ? (
          <Card highlight>
            <T variant="heading">{t('splitSaves', { amount: money(split.saving, lang) })}</T>
            <T variant="bigPrice">{money(split.total, lang)}</T>
            <T variant="small">{t('itemsFound', { found: split.found, total: split.found + split.missing.length })}</T>
            {split.stores.map((store, i) => (
              <View key={store.store.id} style={{ gap: space.sm }}>
                <Divider />
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <T variant="heading">{t('buyHere')}: {store.store.name}</T>
                    <T variant="small">{km(store.distanceKm, lang)}</T>
                    <OpenNowBadge hours={store.store.openingHours} />
                  </View>
                  <Button label={t('go')} onPress={() => openDirections(store)} compact variant="secondary" />
                </Row>
                <Lines lines={split.lines[i]!} items={items} />
              </View>
            ))}
          </Card>
        ) : (
          <Card>
            <T variant="muted">
              {split ? t('splitNotWorth', { amount: money(split.saving, lang), min: money(settings.minSaving, lang) }) : t('splitNone')}
            </T>
          </Card>
        )
      ) : null}

      {result.ranking.map((basket, i) => (
        <StoreCard key={basket.store.id} ranking={result.ranking} rank={i} items={items} />
      ))}

      {result.ranking.some((b) => b.missing.length > 0) ? <T variant="small">{t('missingNote')}</T> : null}
      {result.ranking.some((b) => b.store.source === 'openstreetmap') ? <T variant="small">{t('storesAttribution')}</T> : null}
    </Screen>
  );
}
