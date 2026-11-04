import { CATEGORY_BY_ID, CHAINS, round, UNIT_LABEL, type Size } from '@pricing/core';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ChangeLabel, IndexRanking, indexDate } from '@/components/WeeklyIndexCard';
import { Banner, Card, Chip, Divider, Row, Screen, T } from '@/components/ui';
import { useWeeklyIndex } from '@/data/useWeeklyIndex';
import { money } from '@/i18n';
import { useApp } from '@/state/AppState';
import { space, useColors } from '@/theme';

/** Reference size an item is priced at: "500 g", "1 L", "12 ud". */
function sizeLabel({ amount, unit }: Size): string {
  if (unit === 'kg' && amount < 1) return `${round(amount * 1000, 0)} g`;
  if (unit === 'l' && amount < 1) return `${round(amount * 1000, 0)} ml`;
  return `${amount} ${UNIT_LABEL[unit]}`;
}

/** F12: the weekly basket index, item by item for one chain, with the change since last week. */
export default function WeeklyIndexScreen() {
  const params = useLocalSearchParams<{ chain?: string }>();
  const { settings, t } = useApp();
  const c = useColors();
  const lang = settings.lang;
  const { index, loading } = useWeeklyIndex();
  const [picked, setPicked] = useState<string | undefined>(params.chain);
  const title = <Stack.Screen options={{ title: t('indexTitle') }} />;

  if (loading) {
    return <Screen edges={['bottom']}>{title}<ActivityIndicator color={c.primary} /></Screen>;
  }
  if (!index || index.current.chains.length === 0) {
    return <Screen edges={['bottom']}>{title}<T variant="muted">{index ? t('indexEmpty') : t('indexUnavailable')}</T></Screen>;
  }

  const n = index.basket.length;
  const selected = index.current.chains.find((x) => x.chain === picked) ?? index.current.chains[0]!;
  const lines = new Map(selected.lines.map((l) => [l.itemId, l]));
  const before = index.previous?.chains.find((x) => x.chain === selected.chain);
  const previousCost = new Map((before?.lines ?? []).map((l) => [l.itemId, l.cost]));
  const change = index.changes[selected.chain];

  return (
    <Screen edges={['bottom']}>
      {title}
      {index.isSample ? <Banner text={t('sampleBanner')} /> : null}
      <View style={{ gap: space.xs }}>
        <T variant="heading">{t('indexSubtitle', { n, date: indexDate(index.current.at, lang) })}</T>
        <T variant="small">{t('indexExplain', { n })}</T>
      </View>

      <Card>
        <T variant="heading">{t('indexRanking')}</T>
        <IndexRanking index={index} />
      </Card>

      <Row style={{ flexWrap: 'wrap' }}>
        {index.current.chains.map((x) => (
          <Chip key={x.chain} label={CHAINS[x.chain].name} color={CHAINS[x.chain].color} selected={x.chain === selected.chain} onPress={() => setPicked(x.chain)} />
        ))}
      </Row>

      <Card>
        <Row style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="heading">{t('indexItems', { chain: CHAINS[selected.chain].name })}</T>
            <T variant="small">{t('itemsFound', { found: selected.found, total: n })}</T>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <T variant="bigPrice">{money(selected.total, lang)}</T>
            {change ? <ChangeLabel amount={change.amount} percent={change.percent} /> : null}
          </View>
        </Row>
        <Divider />
        <View style={{ gap: space.md }}>
          {index.basket.map((itemId) => {
            const category = CATEGORY_BY_ID[itemId];
            const line = lines.get(itemId);
            const was = previousCost.get(itemId);
            return (
              <Row key={itemId} style={{ alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 1 }}>
                  <T>
                    {category?.names[lang] ?? itemId}
                    {category ? <T variant="small"> · {sizeLabel(category.defaultSize)}</T> : null}
                  </T>
                  {line ? <T variant="small" numberOfLines={2}>{line.productName}</T> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 1 }}>
                  {line ? <T variant="price">{money(line.cost, lang)}</T> : <T variant="small" style={{ color: c.warn }}>{t('indexMissing')}</T>}
                  {line && was !== undefined ? <ChangeLabel amount={round(line.cost - was)} /> : null}
                </View>
              </Row>
            );
          })}
        </View>
      </Card>

      {index.previous ? <T variant="small">{t('indexChangeNote')}</T> : null}
      {index.zones.mercadona ? <T variant="small">{t('indexZone', { zone: index.zones.mercadona })}</T> : null}
    </Screen>
  );
}
