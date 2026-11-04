import { CHAINS, normalize, shareLineName, type Lang, type ShareCard } from '@pricing/core';
import type { ComponentRef, Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { siteHost } from '@/components/shareLink';
import { Badge, Divider, Row, T } from '@/components/ui';
import { APP_NAME, money, translate, type StringKey } from '@/i18n';
import { radius, space, useColors } from '@/theme';

const LOCALES: Record<Lang, string> = { ca: 'ca-ES', es: 'es-ES', en: 'en-GB' };

/** "4 de novembre de 2026" / "4 November 2026". */
function longDate(date: string, lang: Lang): string {
  const [y, m, d] = date.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y!, m! - 1, d!)));
  } catch {
    return date;
  }
}

/**
 * The share card (F11): one store's total for a list, shown on the public /r/… page and
 * captured as an image on native. Everything is plain text; nothing from the link is
 * rendered as markup.
 */
export function ShareCardView({ card, lang, ref }: { card: ShareCard; lang: Lang; ref?: Ref<ComponentRef<typeof View>> }) {
  const c = useColors();
  const t = (key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const chain = CHAINS[card.chain];
  const best = card.rank === 1 && card.stores > 1;
  const showChain = !normalize(card.store).includes(normalize(chain.name.split(' ')[0]!));
  const more = Math.max(0, card.found - card.lines.length);

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={[styles.band, { backgroundColor: chain.color }]} />
      <View style={styles.body}>
        <View style={{ gap: 2 }}>
          <T variant="small" style={{ color: c.primary, fontWeight: '700' }}>{APP_NAME}</T>
          <T variant="heading">{t(best ? 'shareCardHeadlineBest' : 'shareCardHeadline')}</T>
          {card.stores > 1 ? <T variant="small">{t('shareCardCompared', { n: card.stores })}</T> : null}
        </View>
        {card.sample ? <Badge label={t('shareCardSample')} tone="warn" /> : null}

        <View style={{ gap: 2 }}>
          <Row gap={space.xs} style={{ alignItems: 'flex-start' }}>
            <View style={[styles.dot, { backgroundColor: chain.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.store, { color: c.text }]} numberOfLines={2}>{card.store}</Text>
              {showChain ? <T variant="small">{chain.name}</T> : null}
            </View>
          </Row>
          <Text style={[styles.total, { color: c.text }]}>{money(card.total, lang)}</Text>
          <T variant="small" style={card.found < card.requested ? { color: c.warn, fontWeight: '600' } : undefined}>
            {t('itemsFound', { found: card.found, total: card.requested })}
          </T>
        </View>
        {card.saving !== null && card.saving > 0 ? (
          <Badge
            tone="good"
            label={card.nextChain
              ? t('shareCardCheaperThan', { amount: money(card.saving, lang), chain: CHAINS[card.nextChain].name })
              : t('cheaperThanNext', { amount: money(card.saving, lang) })}
          />
        ) : null}

        {card.lines.length > 0 ? (
          <View style={{ gap: space.xs }}>
            <Divider />
            {card.lines.map((line, i) => (
              <Row key={i} style={{ justifyContent: 'space-between' }}>
                <T style={{ flex: 1 }} numberOfLines={1}>
                  {shareLineName(line, lang)}{line.quantity > 1 ? ` × ${line.quantity}` : ''}
                </T>
                <T variant="price">{money(line.cost, lang)}</T>
              </Row>
            ))}
            {more > 0 ? <T variant="small">{more === 1 ? t('shareCardMoreOne') : t('shareCardMore', { n: more })}</T> : null}
          </View>
        ) : null}

        <Divider />
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }} gap={space.xs}>
          <T variant="small">{t('shareCardPrices', { date: longDate(card.date, lang) })}</T>
          <T variant="small" style={{ color: c.primary, fontWeight: '600' }}>{siteHost()}</T>
        </Row>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', width: '100%' },
  band: { height: 8 },
  body: { padding: space.lg, gap: space.md },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  store: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  total: { fontSize: 40, fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums'], marginTop: space.xs },
});
