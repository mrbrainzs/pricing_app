import { isSharedListId, type SharedListSnapshot } from '@pricing/core';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { itemNames } from '@/components/ListItemRow';
import { Badge, Button, Card, Row, Screen, T } from '@/components/ui';
import { SharedListApiError } from '@/data/sharedListApi';
import { useApp } from '@/state/AppState';
import { useSharedList } from '@/state/SharedList';
import { space, useColors } from '@/theme';

type Load = { state: 'loading' } | { state: 'ready'; list: SharedListSnapshot } | { state: 'error'; message: 'joinInvalid' | 'joinNotFound' | 'joinOffline' | 'shareUnavailable' };
const LOADING: Load = { state: 'loading' };

const PREVIEW = 6;

/** Invite link https://<origin>/l/<id>: shows the shared list and lets this device join it. */
export default function JoinSharedListRoute() {
  return (
    <>
      {/* If an invite link is ever posted publicly, keep the list out of search engines. */}
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <JoinSharedList />
    </>
  );
}

function JoinSharedList() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { ready, items, settings, t } = useApp();
  const shared = useSharedList();
  const c = useColors();
  const { available, fetchList } = shared;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; load: Load } | null>(null);
  const [joining, setJoining] = useState(false);
  const alreadyJoined = shared.hydrated && shared.id === id;
  const blocked: Load | null = !available ? { state: 'error', message: 'shareUnavailable' }
    : !isSharedListId(id) ? { state: 'error', message: 'joinInvalid' } : null;
  const load = blocked ?? (result?.attempt === attempt ? result.load : LOADING);

  useEffect(() => {
    // Already a member: go straight to the list (and drop the key from the address bar).
    if (alreadyJoined) { router.replace('/'); return; }
    if (!available || !isSharedListId(id)) return;
    let current = true;
    fetchList(id).then(
      (list) => { if (current) setResult({ attempt, load: { state: 'ready', list } }); },
      (err: unknown) => {
        const message = err instanceof SharedListApiError && err.status === 404 ? 'joinNotFound' : 'joinOffline';
        if (current) setResult({ attempt, load: { state: 'error', message } });
      },
    );
    return () => { current = false; };
  }, [alreadyJoined, available, id, attempt, fetchList]);

  const join = async () => {
    if (load.state !== 'ready') return;
    setJoining(true);
    await shared.join(load.list);
    router.replace('/');
  };

  if (!ready || !shared.hydrated || alreadyJoined || load.state === 'loading') {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator color={c.primary} style={{ marginTop: space.xl }} />
      </Screen>
    );
  }

  if (load.state === 'error') {
    return (
      <Screen edges={['bottom']}>
        <Card>
          <T>{t(load.message)}</T>
          {load.message === 'joinOffline' ? <Button label={t('tryAgain')} onPress={() => setAttempt((a) => a + 1)} /> : null}
          <Button label={t('goToList')} variant="ghost" onPress={() => router.replace('/')} />
        </Card>
      </Screen>
    );
  }

  const list = load.list;
  // Joining replaces whatever is on this device now (a local list or another shared one).
  const replaces = items.length > 0 || (shared.id !== null && shared.id !== list.id);
  return (
    <Screen edges={['bottom']}>
      <T variant="muted">{t('joinBody')}</T>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="heading">{t('sharedTitle')}</T>
          <Badge label={t('joinCount', { n: list.items.length })} tone="primary" />
        </Row>
        {list.items.length === 0 ? <T variant="small">{t('joinEmpty')}</T> : null}
        <View style={{ gap: space.xs }}>
          {list.items.slice(0, PREVIEW).map((item) => (
            <Row key={item.id} style={{ justifyContent: 'space-between' }}>
              <T style={item.checked ? { textDecorationLine: 'line-through', color: c.muted } : undefined} numberOfLines={1}>
                {itemNames(item, settings.lang).main}
              </T>
              <T variant="small">× {item.quantity}</T>
            </Row>
          ))}
          {list.items.length > PREVIEW ? <T variant="small">…</T> : null}
        </View>
      </Card>
      {replaces ? <T variant="small" style={{ color: c.warn }}>{t('joinReplaces')}</T> : null}
      <Button label={t('joinButton')} onPress={join} loading={joining} />
      <Button label={t('cancel')} variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}
