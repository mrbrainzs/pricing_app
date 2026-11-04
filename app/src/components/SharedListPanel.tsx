import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Platform, Pressable, Share, Text, View } from 'react-native';

import { Banner, Button, Card, Row, T } from '@/components/ui';
import { APP_NAME } from '@/i18n';
import { useApp } from '@/state/AppState';
import { useNow, useSharedList } from '@/state/SharedList';
import { ShareError } from '@/state/sharedListSync';
import { space, useColors } from '@/theme';

/**
 * Opens the share sheet with the invite link. On the web without one (desktop), copies
 * the link instead; returns 'copied' then. Last resort: WhatsApp's web link.
 */
async function sendInvite(link: string, message: string, gesture: boolean): Promise<'shared' | 'copied' | 'none'> {
  try {
    await Share.share({ message });
    return 'shared';
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return 'shared'; // Closed the sheet.
  }
  if (!gesture) return 'none'; // Browsers only allow the fallbacks right after a tap.
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(link);
      return 'copied';
    } catch { /* fall through */ }
  }
  await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`).catch(() => {});
  return 'shared';
}

function NoticeBanner() {
  const { notice, dismissNotice } = useSharedList();
  const { t } = useApp();
  if (!notice) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityHint={t('dismiss')} onPress={dismissNotice}>
      <Banner text={`${t(notice.key, notice.vars)}  ✕`} />
    </Pressable>
  );
}

/** Under the list title: who-can-see status, sync state, invite and leave. Notices too. */
export function SharedListStatus() {
  const shared = useSharedList();
  const { t } = useApp();
  const c = useColors();
  const now = useNow(1000);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (!shared.id) return <NoticeBanner />;

  const seconds = shared.syncedAt ? Math.max(0, Math.round((now - shared.syncedAt) / 1000)) : null;
  const status = shared.status === 'syncing' ? t('sharedSyncing')
    : shared.status === 'offline' ? t('sharedOffline')
      : seconds === null ? t('sharedSyncing')
        : seconds < 5 ? t('sharedSyncedNow')
          : seconds < 60 ? t('sharedSyncedSec', { n: seconds })
            : t('sharedSyncedMin', { n: Math.floor(seconds / 60) });
  const offline = shared.status === 'offline';

  const invite = async () => {
    if (!shared.link) return;
    const result = await sendInvite(shared.link, t('shareMessage', { app: APP_NAME, link: shared.link }), true);
    setCopied(result === 'copied');
  };

  return (
    <View style={{ gap: space.sm }}>
      <NoticeBanner />
      <Card style={{ gap: space.sm }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Ionicons name="people" size={22} color={c.primary} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="heading">{t('sharedTitle')}</T>
            <T variant="small" style={offline ? { color: c.warn } : undefined}>
              {status}
              {offline && shared.pendingCount > 0 ? ` · ${t('sharedPending', { n: shared.pendingCount })}` : ''}
            </T>
          </View>
        </Row>
        <T variant="small">{t('shareHint')}</T>
        {shared.link ? (
          <Text selectable numberOfLines={1} style={{ color: c.primary, fontSize: 13, lineHeight: 18 }}>
            {shared.link}
          </Text>
        ) : null}
        <Row style={{ flexWrap: 'wrap' }}>
          <Button label={t('sharedInvite')} variant="secondary" compact onPress={invite} style={{ flexGrow: 1 }} />
          <Button
            label={t('sharedLeave')}
            variant="ghost"
            compact
            loading={leaving}
            onPress={async () => {
              setLeaving(true);
              await shared.leave();
              setLeaving(false);
            }}
          />
        </Row>
        {copied ? <T variant="small" style={{ color: c.good }}>{t('sharedCopied')}</T> : null}
      </Card>
    </View>
  );
}

/** Bottom of the list: "Share list" (or why it isn't available). Hidden while shared. */
export function ShareListButton() {
  const shared = useSharedList();
  const { t } = useApp();
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (shared.id || !shared.hydrated) return null;
  if (!shared.available) return <T variant="small">{t('shareUnavailable')}</T>;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await shared.share();
      // The card with "Send invite link" appears too, in case the sheet can't open here.
      await sendInvite(link, t('shareMessage', { app: APP_NAME, link }), false);
    } catch (err) {
      const notice = err instanceof ShareError ? err.notice : { key: 'shareFailed' as const };
      setError(t(notice.key, notice.vars));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.xs }}>
      <Button label={t('shareList')} variant="secondary" onPress={start} loading={busy} />
      <T variant="small">{t('shareHint')}</T>
      {error ? <T variant="small" style={{ color: c.high }}>{error}</T> : null}
    </View>
  );
}
