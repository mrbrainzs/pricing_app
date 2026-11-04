import { CATEGORY_BY_ID, CHAINS, findEquivalents, makeListItem, priceStats, type PricePoint, type Product } from '@pricing/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { sourceLabel, unitPriceLabel } from '@/components/format';
import { PriceAlertCard } from '@/components/PriceAlerts';
import { PriceHistoryChart } from '@/components/PriceHistoryChart';
import { Badge, Button, Card, Divider, Row, Screen, T } from '@/components/ui';
import { latestByProduct } from '@/data/prices';
import { money } from '@/i18n';
import { useApp } from '@/state/AppState';
import { space } from '@/theme';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, source, settings, addItems, t } = useApp();
  const lang = settings.lang;
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [added, setAdded] = useState(false);
  const latest = useMemo(() => (catalog ? latestByProduct(catalog.prices) : new Map()), [catalog]);
  const product = catalog?.products.find((p) => p.id === id);

  useEffect(() => {
    if (product) source.history(product.id).then(setHistory);
  }, [product, source]);

  const equivalents = useMemo(() => (product && catalog ? findEquivalents(product, catalog.products) : []), [product, catalog]);

  if (!product) return <Screen edges={['bottom']}><T variant="muted">…</T></Screen>;
  const obs = latest.get(product.id);
  const stats = obs ? priceStats(obs.price, history, new Date()) : null;

  const row = (p: Product) => {
    const o = latest.get(p.id);
    if (!o) return null;
    const unit = unitPriceLabel(o.unitPrice, p.size?.unit, lang);
    return (
      <Pressable key={p.id} onPress={() => p.id !== product.id && router.push(`/product/${encodeURIComponent(p.id)}`)}>
        <Row style={{ alignItems: 'flex-start', paddingVertical: 2 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: CHAINS[p.chain].color }} />
          <View style={{ flex: 1 }}>
            <T>{CHAINS[p.chain].name}</T>
            <T variant="small" numberOfLines={2}>{p.name}</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="price">{money(o.price, lang)}</T>
            {unit ? <T variant="small">{unit}</T> : null}
          </View>
        </Row>
      </Pressable>
    );
  };

  const byPrice = (a: Product, b: Product) => (latest.get(a.id)?.price ?? Infinity) - (latest.get(b.id)?.price ?? Infinity);
  const byUnit = (a: Product, b: Product) => (latest.get(a.id)?.unitPrice ?? Infinity) - (latest.get(b.id)?.unitPrice ?? Infinity);
  const exact = [product, ...equivalents.filter((e) => e.matchType === 'exact').map((e) => e.product)].sort(byPrice);
  const otherSizes = equivalents.filter((e) => e.matchType === 'same_product_other_size').map((e) => e.product).sort(byUnit);
  const ownBrand = equivalents.filter((e) => e.matchType === 'own_brand_equivalent').map((e) => e.product).sort(byUnit);

  const addToList = () => {
    const category = product.categoryId ? CATEGORY_BY_ID[product.categoryId] : undefined;
    const item = makeListItem(category ? category.names[lang] : product.name);
    item.categoryId = product.categoryId;
    item.level = product.isOwnBrand ? { kind: 'own' } : product.brand ? { kind: 'specific', brand: product.brand } : { kind: 'any' };
    addItems([item]);
    setAdded(true);
  };

  const labelTone = stats?.label === 'good' ? 'good' : stats?.label === 'high' ? 'high' : 'neutral';
  const labelText = stats?.label === 'good' ? t('labelGood') : stats?.label === 'high' ? t('labelHigh') : t('labelNormal');

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: CHAINS[product.chain].name }} />
      <View style={{ gap: space.xs }}>
        <T variant="heading">{product.name}</T>
        <Row gap={space.xs}>
          <Badge label={CHAINS[product.chain].name} />
          {product.isOwnBrand ? <Badge label={t('levelOwn')} /> : null}
        </Row>
      </View>

      {obs ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="bigPrice">{money(obs.price, lang)}</T>
            {stats?.label ? <Badge label={labelText} tone={labelTone} /> : null}
          </Row>
          {unitPriceLabel(obs.unitPrice, product.size?.unit, lang) ? <T variant="small">{unitPriceLabel(obs.unitPrice, product.size?.unit, lang)}</T> : null}
          <T variant="small">{sourceLabel(obs, lang)}</T>
          <Divider />
          <PriceHistoryChart history={history} />
          {stats?.label ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="small">{t('avg30')}: {stats.avg30 !== null ? money(stats.avg30, lang) : '–'}</T>
              <T variant="small">{t('min90')}: {stats.min90 !== null ? money(stats.min90, lang) : '–'}</T>
            </Row>
          ) : (
            <T variant="small">{t('notEnoughHistory')}</T>
          )}
        </Card>
      ) : null}

      <Button label={added ? t('addedToList') : t('addToList')} onPress={addToList} disabled={added} />
      <PriceAlertCard product={product} obs={obs} />

      <Card>
        <T variant="heading">{exact.length > 1 ? t('exactMatch') : t('pricesByChain')}</T>
        {exact.map(row)}
        {otherSizes.length > 0 ? (
          <>
            <Divider />
            <T variant="heading">{t('otherSize')}</T>
            {otherSizes.map(row)}
          </>
        ) : null}
      </Card>

      {ownBrand.length > 0 ? (
        <Card>
          <T variant="heading">{t('ownBrandEquivalents')}</T>
          {ownBrand.map(row)}
        </Card>
      ) : null}
    </Screen>
  );
}
