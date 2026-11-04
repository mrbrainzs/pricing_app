import {
  CATEGORY_BY_ID,
  CHAINS,
  formatBarcode,
  lookupBarcode,
  ownBrandOptions,
  resolveItemText,
  type BarcodeLookup,
  type ChainId,
  type Lang,
  type PriceObservation,
  type Product,
} from '@pricing/core';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { unitPriceLabel } from '@/components/format';
import { Button, Card, Input, Row, Screen, T } from '@/components/ui';
import { latestByProduct } from '@/data/prices';
import { money, type StringKey } from '@/i18n';
import { useApp } from '@/state/AppState';
import { space } from '@/theme';

/** "Hacendado, Deliplus i Compy" in the app language (plain commas where Intl.ListFormat is missing). */
function andList(items: string[], lang: Lang): string {
  try {
    return new Intl.ListFormat(lang === 'en' ? 'en-GB' : `${lang}-ES`, { type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}

/** Title and explanation for codes we can't show a product for. */
const MESSAGE: Record<'in_store' | 'unknown', [StringKey, StringKey]> = {
  in_store: ['inStoreTitle', 'inStoreBody'],
  unknown: ['notFoundTitle', 'notFoundBody'],
};

/**
 * Result of a scan that didn't match a product: whose own brand it is (with the own-brand
 * version at every chain), a shop's in-store code, a code we don't have yet, or a typo.
 * Every case ends with a search box, never a dead end. A known code opens the product page.
 */
export default function BarcodeScreen() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const { catalog, settings, t } = useApp();
  const lang = settings.lang;
  const [text, setText] = useState('');
  const latest = useMemo(() => (catalog ? latestByProduct(catalog.prices) : new Map<string, PriceObservation>()), [catalog]);
  const result = useMemo<BarcodeLookup | null>(
    () => (catalog ? lookupBarcode(code, catalog.products, (p) => latest.get(p.id)) : null),
    [catalog, code, latest],
  );

  const query = text.trim();
  // "What is it?" for an own-brand code: the generic item, then its cheapest own-brand pack at each chain.
  const categoryId = useMemo(() => {
    const r = query.length >= 2 ? resolveItemText(query) : null;
    return r && r.score >= 0.6 ? r.categoryId : null;
  }, [query]);
  const options = useMemo(() => {
    if (!catalog || !categoryId) return [];
    const seen = new Set<ChainId>();
    return ownBrandOptions(categoryId, catalog.products, (p) => latest.get(p.id)).filter((p) => {
      if (!latest.has(p.id) || seen.has(p.chain)) return false;
      seen.add(p.chain);
      return true;
    });
  }, [catalog, categoryId, latest]);

  if (!result) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (result.kind === 'found') return <Redirect href={`/product/${encodeURIComponent(result.products[0]!.id)}`} />;

  const searchAll = () => {
    if (query) router.dismissTo({ pathname: '/search', params: { q: query } });
  };

  const row = (p: Product) => {
    const o = latest.get(p.id)!;
    const unit = unitPriceLabel(o.unitPrice, p.size?.unit, lang);
    return (
      <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push(`/product/${encodeURIComponent(p.id)}`)}>
        {({ pressed }) => (
          <Row style={{ alignItems: 'flex-start', paddingVertical: 2, opacity: pressed ? 0.7 : 1 }}>
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
        )}
      </Pressable>
    );
  };

  const searchInput = (placeholder: string) => (
    <Input
      value={text}
      onChangeText={setText}
      onSubmitEditing={result.kind === 'own_brand' ? undefined : searchAll}
      placeholder={placeholder}
      autoCorrect={false}
      returnKeyType="search"
      accessibilityLabel={placeholder}
    />
  );

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('barcodeTitle') }} />
      <T variant="muted" style={{ fontVariant: ['tabular-nums'], letterSpacing: 1 }}>{formatBarcode(result.code)}</T>

      {result.kind === 'own_brand' ? (
        <>
          <Card highlight>
            <Row>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: CHAINS[result.chain].color }} />
              <T variant="heading" style={{ flex: 1 }}>{t('ownBrandTitle', { chain: CHAINS[result.chain].name })}</T>
            </Row>
            <T>{t('ownBrandBody', { brands: andList(result.brands, lang), chain: CHAINS[result.chain].name })}</T>
          </Card>
          <Card>
            <T variant="heading">{t('ownBrandAsk')}</T>
            {searchInput(t('nameExamples'))}
            {categoryId ? (
              options.length > 0 ? (
                <View style={{ gap: space.xs }}>
                  <T variant="small">{t('ownBrandEquivalents')}: {CATEGORY_BY_ID[categoryId]?.names[lang]}</T>
                  {options.map(row)}
                </View>
              ) : (
                <T variant="muted">{t('ownBrandNoOptions')}</T>
              )
            ) : query.length >= 2 ? (
              <T variant="muted">{t('ownBrandNoItem')}</T>
            ) : null}
            {query.length >= 2 ? <Button variant="secondary" label={t('searchAllFor', { text: query })} onPress={searchAll} /> : null}
          </Card>
        </>
      ) : (
        <>
          <Card>
            {result.kind === 'invalid' ? (
              <>
                <T variant="heading">{t('invalidTitle')}</T>
                <T>{t(result.reason === 'format' ? 'barcodeFormatError' : 'barcodeCheckError')}</T>
              </>
            ) : (
              <>
                <T variant="heading">{t(MESSAGE[result.kind][0])}</T>
                <T>{t(MESSAGE[result.kind][1])}</T>
              </>
            )}
          </Card>
          <Card>
            <T variant="heading">{t('searchByName')}</T>
            <Row>
              <View style={{ flex: 1 }}>{searchInput(t('nameExamples'))}</View>
              <Button label={t('lookUp')} onPress={searchAll} disabled={!query} />
            </Row>
          </Card>
        </>
      )}

      <Button variant="ghost" label={t('scanAgain')} onPress={() => router.replace('/scan')} />
    </Screen>
  );
}
