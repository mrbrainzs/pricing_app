import { CHAINS, groupHits, parseBarcode, searchProducts } from '@pricing/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { unitPriceLabel } from '@/components/format';
import { ScanButton } from '@/components/ScanButton';
import { Badge, Button, Card, Input, Row, Screen, T } from '@/components/ui';
import { latestByProduct } from '@/data/prices';
import { money } from '@/i18n';
import { useApp } from '@/state/AppState';
import { space } from '@/theme';

export default function SearchScreen() {
  const { catalog, settings, t } = useApp();
  const lang = settings.lang;
  // Prefilled from the barcode screen ("search by name").
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? '');
  const [prefill, setPrefill] = useState(q);
  if (q !== prefill) {
    setPrefill(q);
    if (q) setQuery(q);
  }
  const typedCode = parseBarcode(query);
  const latest = useMemo(() => (catalog ? latestByProduct(catalog.prices) : new Map()), [catalog]);

  const groups = useMemo(() => {
    if (!catalog || query.trim().length < 2) return [];
    const hits = searchProducts(query, catalog.products.filter((p) => settings.chains.includes(p.chain)), 80);
    return groupHits(hits)
      .map((g) => {
        const priced = g.products
          .map((p) => ({ p, obs: latest.get(p.id) }))
          .filter((x) => x.obs)
          .sort((a, b) => a.obs!.price - b.obs!.price);
        return { ...g, priced };
      })
      .filter((g) => g.priced.length > 0)
      // Relevance first (in steps), then cheapest first.
      .sort((a, b) => Math.round(b.score * 10) - Math.round(a.score * 10) || (a.priced[0]!.obs!.unitPrice ?? a.priced[0]!.obs!.price) - (b.priced[0]!.obs!.unitPrice ?? b.priced[0]!.obs!.price))
      .slice(0, 40);
  }, [catalog, query, latest, settings.chains]);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="title" style={{ flexShrink: 1 }}>{t('searchTitle')}</T>
        <ScanButton />
      </Row>
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder={t('searchPlaceholder')}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={t('searchPlaceholder')}
      />
      {typedCode ? (
        <Button variant="secondary" label={t('lookUpBarcode', { code: typedCode.digits })} onPress={() => router.push(`/barcode/${typedCode.digits}`)} />
      ) : query.trim().length < 2 ? (
        <T variant="muted">{t('searchEmpty')}</T>
      ) : groups.length === 0 ? (
        <T variant="muted">{t('noResults')}</T>
      ) : null}
      <View style={{ gap: space.sm }}>
        {groups.map((g) => {
          const best = g.priced[0]!;
          const unit = unitPriceLabel(best.obs!.unitPrice, best.p.size?.unit, lang);
          return (
            <Pressable key={g.key} onPress={() => router.push(`/product/${encodeURIComponent(best.p.id)}`)} accessibilityRole="button">
              {({ pressed }) => (
                <Card style={{ opacity: pressed ? 0.85 : 1 }}>
                  <Row style={{ alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T numberOfLines={2}>{best.p.name}</T>
                      <Row gap={space.xs} style={{ flexWrap: 'wrap' }}>
                        <Badge label={CHAINS[best.p.chain].name} />
                        {g.priced.length > 1 ? <Badge label={t('chains', { n: g.priced.length })} tone="primary" /> : null}
                        {best.p.isOwnBrand ? <Badge label={t('levelOwn')} /> : null}
                      </Row>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {g.priced.length > 1 ? <T variant="small">{t('from')}</T> : null}
                      <T variant="price">{money(best.obs!.price, lang)}</T>
                      {unit ? <T variant="small">{unit}</T> : null}
                    </View>
                  </Row>
                </Card>
              )}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
