import { decodeShareCard, type Lang } from '@pricing/core';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ShareCardView } from '@/components/ShareCardView';
import { shareCardMessage } from '@/components/shareLink';
import { Button, Card, Row, Screen, T } from '@/components/ui';
import { APP_NAME, LANG_LABEL, translate, type StringKey } from '@/i18n';
import { useApp } from '@/state/AppState';
import { radius, space, useColors } from '@/theme';

const LANGS: Lang[] = ['ca', 'es', 'en'];

function LangSwitch({ value, onChange }: { value: Lang; onChange: (lang: Lang) => void }) {
  const c = useColors();
  return (
    <View style={[styles.switch, { backgroundColor: c.chip }]} accessibilityRole="radiogroup">
      {LANGS.map((lang) => {
        const selected = lang === value;
        return (
          <Pressable
            key={lang}
            accessibilityRole="radio"
            accessibilityLabel={LANG_LABEL[lang]}
            accessibilityState={{ selected }}
            onPress={() => onChange(lang)}
            hitSlop={4}
            style={[styles.switchItem, selected && { backgroundColor: c.primary }]}>
            <Text style={[styles.switchText, { color: selected ? c.onPrimary : c.text }]}>{lang.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Public page for a shared result (F11): `/r/<data>` opens in any browser without the app.
 * All data comes from the link itself and is validated by decodeShareCard.
 */
export default function SharedResultScreen() {
  const { data } = useLocalSearchParams<{ data: string }>();
  const { ready, settings, updateSettings } = useApp();
  const c = useColors();
  const result = useMemo(() => decodeShareCard(typeof data === 'string' ? data : undefined), [data]);
  const [chosen, setChosen] = useState<Lang | null>(null);
  const lang = chosen ?? (result.ok ? result.card.lang : settings.lang);
  const t = (key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

  const start = () => {
    // A first-time visitor starts the app in the language they were reading.
    if (ready && !settings.onboarded) updateSettings({ lang });
    router.replace('/');
  };

  const title = result.ok ? `${result.card.store} · ${APP_NAME}` : APP_NAME;
  const description = result.ok ? shareCardMessage(result.card, lang) : t('tagline');

  return (
    <Screen edges={['top', 'bottom']}>
      {Platform.OS === 'web' ? (
        <Head>
          <html lang={lang} />
          <title>{title}</title>
          <meta name="description" content={description} />
          <meta name="robots" content="noindex" />
          <meta property="og:title" content={title} />
          <meta property="og:description" content={description} />
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content={APP_NAME} />
        </Head>
      ) : null}

      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={[styles.brand, { color: c.primary }]}>{APP_NAME}</Text>
        <LangSwitch value={lang} onChange={setChosen} />
      </Row>

      {result.ok ? (
        <View style={{ gap: space.sm }}>
          <ShareCardView card={result.card} lang={lang} />
          {/* Links are not signed, so the page says plainly that a person shared this. */}
          <T variant="small" style={{ textAlign: 'center' }}>{t('shareCardSharedBy', { app: APP_NAME })}</T>
        </View>
      ) : (
        <Card>
          <T variant="heading">{t('tagline')}</T>
          <T variant="muted">{t('shareCardInvalid')}</T>
        </Card>
      )}

      <View style={{ gap: space.sm }}>
        <Button label={t('shareCardCta')} onPress={start} />
        <T variant="small" style={{ textAlign: 'center' }}>{t('shareCardPitch', { app: APP_NAME })}</T>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2 },
  switch: { flexDirection: 'row', borderRadius: radius.pill, padding: 3, gap: 2 },
  switchItem: { minWidth: 40, minHeight: 32, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  switchText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
});
