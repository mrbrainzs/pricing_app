import { decodeShareCard } from '@pricing/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Linking, Platform, Share, Text, View } from 'react-native';

import { ShareCardView } from '@/components/ShareCardView';
import { canShareImage, shareCardImage } from '@/components/shareImage';
import { shareCardMessage, shareCardUrl } from '@/components/shareLink';
import { Banner, Button, Card, Screen, T } from '@/components/ui';
import { APP_NAME } from '@/i18n';
import { useApp } from '@/state/AppState';
import { space, useColors } from '@/theme';

const whatsApp = (text: string) => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() => {});

/** UC1 "Share (result card)": preview the card, then share its link (and, on native, an image). */
export default function ShareCardScreen() {
  const { d } = useLocalSearchParams<{ d: string }>();
  const { t } = useApp();
  const c = useColors();
  const cardRef = useRef<ComponentRef<typeof View>>(null);
  const [fallback, setFallback] = useState<{ copied: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const encoded = typeof d === 'string' ? d : '';
  const result = useMemo(() => decodeShareCard(encoded), [encoded]);

  if (!result.ok) {
    return <Screen edges={['bottom']}><Banner text={t('shareCardInvalid')} /></Screen>;
  }
  const card = result.card;
  const url = shareCardUrl(encoded);
  const text = shareCardMessage(card, card.lang);
  const full = `${text} ${url}`;

  const shareLink = async () => {
    if (Platform.OS === 'web') {
      const nav = typeof navigator === 'undefined' ? undefined : navigator;
      if (nav?.share) {
        try {
          await nav.share({ title: APP_NAME, text, url });
          return;
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') return; // closed by the user
        }
      }
      let copied = false;
      try {
        await nav?.clipboard?.writeText(full);
        copied = !!nav?.clipboard;
      } catch {
        // No clipboard access: the link is shown below to copy by hand.
      }
      setFallback({ copied });
      return;
    }
    try {
      await Share.share({ message: full });
    } catch {
      whatsApp(full);
    }
  };

  const shareImage = async () => {
    setBusy(true);
    try {
      await shareCardImage(cardRef.current, full, t('shareCardTitle'));
    } catch {
      await shareLink();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <ShareCardView ref={cardRef} card={card} lang={card.lang} />
      <T variant="small" style={{ textAlign: 'center' }}>{t('shareCardHint')}</T>
      <View style={{ gap: space.sm }}>
        <Button label={t('shareLink')} onPress={shareLink} />
        {canShareImage ? <Button label={t('shareImage')} onPress={shareImage} variant="secondary" loading={busy} /> : null}
      </View>
      {fallback ? (
        <Card>
          {fallback.copied ? <T variant="small">{t('shareCopied')}</T> : null}
          <Text selectable style={{ color: c.primary, fontSize: 13 }} numberOfLines={3} testID="share-url">{url}</Text>
          <Button label="WhatsApp" onPress={() => whatsApp(full)} variant="secondary" compact />
        </Card>
      ) : null}
    </Screen>
  );
}
