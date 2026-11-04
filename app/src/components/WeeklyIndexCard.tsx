import { Ionicons } from '@expo/vector-icons';
import { CHAINS, madridTime, type ChainIndex, type IndexChange, type Lang, type WeeklyIndex } from '@pricing/core';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Badge, Card, Row, T } from '@/components/ui';
import { useWeeklyIndex } from '@/data/useWeeklyIndex';
import { money } from '@/i18n';
import { useApp } from '@/state/AppState';
import { space, useColors } from '@/theme';

/** "2 de novembre" / "2 November", in Barcelona time. */
export function indexDate(iso: string, lang: Lang): string {
  try {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : `${lang}-ES`, { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  } catch {
    const { day, month } = madridTime(new Date(iso));
    return `${day}/${month}`;
  }
}

function signedPercent(percent: number, lang: Lang): string {
  const n = Math.abs(percent).toFixed(1);
  return `${percent > 0 ? '+' : '−'}${lang === 'en' ? n : n.replace('.', ',')}%`;
}

/** Week-on-week change: red and up when dearer, green and down when cheaper. */
export function ChangeLabel({ amount, percent }: { amount: number; percent?: number }) {
  const { settings, t } = useApp();
  const c = useColors();
  const lang = settings.lang;
  const color = amount > 0 ? c.high : amount < 0 ? c.good : c.muted;
  const text = amount === 0
    ? t('indexSame')
    : `${amount > 0 ? '+' : '−'}${money(Math.abs(amount), lang)}${percent !== undefined ? ` (${signedPercent(percent, lang)})` : ''}`;
  return (
    <Row gap={2}>
      {amount !== 0 ? <Ionicons name={amount > 0 ? 'caret-up' : 'caret-down'} size={12} color={color} /> : null}
      <Text style={{ color, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{text}</Text>
    </Row>
  );
}

/** One ranked chain: position, name, basket total and change since last week. */
export function IndexRankRow({ chain, change, showChange }: { chain: ChainIndex; change?: IndexChange; showChange: boolean }) {
  const { settings } = useApp();
  const info = CHAINS[chain.chain];
  return (
    <Row>
      <T variant="small" style={{ width: 14, fontWeight: '700' }}>{chain.rank}</T>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: info.color }} />
      <T style={{ flex: 1 }} numberOfLines={1}>{info.name}</T>
      <T variant="price">{money(chain.total, settings.lang)}</T>
      {showChange ? (
        <View style={{ minWidth: 76, alignItems: 'flex-end' }}>
          {change ? <ChangeLabel amount={change.amount} /> : <T variant="small">–</T>}
        </View>
      ) : null}
    </Row>
  );
}

/** Ranking, chains not ranked, and the "no comparison yet" note. */
export function IndexRanking({ index }: { index: WeeklyIndex }) {
  const { t } = useApp();
  const unranked = index.current.chains.filter((x) => !x.ranked);
  return (
    <View style={{ gap: space.sm }}>
      {index.current.chains.filter((x) => x.ranked).map((x) => (
        <IndexRankRow key={x.chain} chain={x} change={index.changes[x.chain]} showChange={index.previous !== null} />
      ))}
      {unranked.length > 0 ? (
        <T variant="small">
          {t('indexNotRanked', { chains: unranked.map((x) => `${CHAINS[x.chain].name} (${x.found}/${index.basket.length})`).join(', ') })}
        </T>
      ) : null}
      {index.previous === null ? <T variant="small">{t('indexNoPrevious')}</T> : null}
    </View>
  );
}

/** F12: compact weekly index at the top of the List tab; opens the item breakdown. */
export function WeeklyIndexCard() {
  const { settings, t } = useApp();
  const c = useColors();
  const { index } = useWeeklyIndex();
  if (!index) return null;
  const empty = index.current.chains.length === 0;

  return (
    <Pressable accessibilityRole="button" disabled={empty} onPress={() => router.push('/weekly-index')}>
      {({ pressed }) => (
        <Card style={{ opacity: pressed ? 0.85 : 1 }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="heading">{t('indexTitle')}</T>
              {!empty ? <T variant="small">{t('indexSubtitle', { n: index.basket.length, date: indexDate(index.current.at, settings.lang) })}</T> : null}
            </View>
            {index.isSample ? <Badge label={t('indexSample')} tone="warn" /> : null}
          </Row>
          {empty ? <T variant="muted">{t('indexEmpty')}</T> : <IndexRanking index={index} />}
          {!empty ? (
            <Row gap={2}>
              <T variant="small" style={{ color: c.primary, fontWeight: '600' }}>{t('indexSeeItems')}</T>
              <Ionicons name="chevron-forward" size={14} color={c.primary} />
            </Row>
          ) : null}
        </Card>
      )}
    </Pressable>
  );
}
