import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SharedListSnapshot } from '@pricing/core';
import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState as DeviceAppState } from 'react-native';

import { configuredSharedListApi, shareLink } from '@/data/sharedListApi';
import { useApp } from '@/state/AppState';
import { POLL_MS, SharedListSync, type SyncView } from '@/state/sharedListSync';

const STORAGE_KEY = 'quinsuper:shared:v1';

interface SharedListContext extends SyncView {
  /** False in sample mode (no API configured): sharing is hidden. */
  available: boolean;
  /** Invite link while shared. */
  link: string | null;
  /** Creates the shared list from the current one; returns the invite link. Throws ShareError. */
  share(): Promise<string>;
  fetchList(id: string): Promise<SharedListSnapshot>;
  join(list: SharedListSnapshot): Promise<void>;
  leave(): Promise<void>;
  sync(): Promise<void>;
  dismissNotice(): void;
}

const OFF: SyncView = { hydrated: true, id: null, status: 'synced', syncedAt: null, pendingCount: 0, notice: null };
const noSubscribe = () => () => {};
const offView = () => OFF;

const Ctx = createContext<SharedListContext | null>(null);

/** Shared lists (F10): link-only sharing with polling sync. Mount inside AppStateProvider. */
export function SharedListProvider({ children }: { children: ReactNode }) {
  const { ready, itemsBridge } = useApp();
  const [engine] = useState(() => {
    const api = configuredSharedListApi();
    return api ? new SharedListSync(api, itemsBridge, {
      load: () => AsyncStorage.getItem(STORAGE_KEY),
      save: (value) => (value === null ? AsyncStorage.removeItem(STORAGE_KEY) : AsyncStorage.setItem(STORAGE_KEY, value)),
    }) : null;
  });
  useEffect(() => engine?.attach(), [engine]);
  useEffect(() => { if (ready) void engine?.hydrate(); }, [ready, engine]);
  const view = useSyncExternalStore(engine?.subscribe ?? noSubscribe, engine?.getView ?? offView, engine?.getView ?? offView);

  // Stable functions, so effects that depend on them (polling) don't restart on every sync.
  const actions = useMemo(() => {
    const missing = () => Promise.reject(new Error('Shared lists need EXPO_PUBLIC_API_URL'));
    return {
      available: engine !== null,
      share: async () => {
        if (!engine) return missing();
        const id = await engine.share();
        return shareLink(id) ?? id;
      },
      fetchList: (id: string) => engine?.fetchList(id) ?? missing(),
      join: (list: SharedListSnapshot) => engine?.join(list) ?? missing(),
      leave: () => engine?.leave() ?? Promise.resolve(),
      sync: () => engine?.sync() ?? Promise.resolve(),
      dismissNotice: () => engine?.dismissNotice(),
    };
  }, [engine]);
  const value = useMemo<SharedListContext>(() => ({ ...view, ...actions, link: view.id ? shareLink(view.id) : null }), [view, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSharedList(): SharedListContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSharedList must be used inside SharedListProvider');
  return ctx;
}

/** While the calling screen is focused and the app is in front: sync now, then every few seconds. */
export function useSharedListPolling() {
  const { id, sync } = useSharedList();
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      void sync();
      const timer = setInterval(() => { if (DeviceAppState.currentState === 'active') void sync(); }, POLL_MS);
      const sub = DeviceAppState.addEventListener('change', (state) => { if (state === 'active') void sync(); });
      return () => { clearInterval(timer); sub.remove(); };
    }, [id, sync]),
  );
}

/** Current time, updated every `ms` (for "synced 5 s ago"). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}
