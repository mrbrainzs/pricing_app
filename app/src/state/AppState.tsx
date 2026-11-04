import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CHAINS,
  makeListItem,
  ONLINE_CHAINS,
  postalCodeLocation,
  SHARED_LIST_LIMITS,
  type BrandLevel,
  type ChainId,
  type Lang,
  type LatLng,
  type ListItem,
} from '@pricing/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { configuredSource, type Catalog, type DataSource } from '@/data/source';
import { deviceLanguage, translate, type StringKey } from '@/i18n';

export interface Settings {
  lang: Lang;
  postalCode: string | null;
  /** Precise position when the user allowed GPS; otherwise the postal code's centre. */
  location: LatLng | null;
  chains: ChainId[];
  minSaving: number;
  maxDistanceKm: number;
  onboarded: boolean;
}

interface Persisted {
  settings: Settings;
  items: ListItem[];
}

const STORAGE_KEY = 'quinsuper:state:v1';

/** Chains offered before Consum was added (Nov 2026). */
const ORIGINAL_CHAINS: ChainId[] = ['mercadona', 'alcampo', 'bonarea', 'caprabo', 'dia', 'bonpreu'];

/** People who had every chain selected also get chains added later; a narrower choice is kept as is. */
function withNewChains(saved: ChainId[] | undefined): ChainId[] {
  if (!saved?.length) return [...ONLINE_CHAINS];
  const hadAll = ORIGINAL_CHAINS.every((c) => saved.includes(c));
  return hadAll ? [...new Set<ChainId>([...saved, ...ONLINE_CHAINS])] : saved;
}

const defaultSettings = (): Settings => ({
  lang: deviceLanguage(),
  postalCode: null,
  location: null,
  chains: [...ONLINE_CHAINS],
  minSaving: 3,
  maxDistanceKm: 3,
  onboarded: false,
});

/**
 * Lets the shared-list sync (state/SharedList.tsx) see local edits and apply remote ones
 * without being part of this file.
 */
export interface ItemsBridge {
  /** The latest items, including edits React hasn't rendered yet. */
  current(): ListItem[];
  /** Replaces the items without reporting it as a local edit (a change from the server). */
  replace(items: ListItem[]): void;
  /** Called after every local edit with the items after and before it. */
  setListener(listener: ((next: ListItem[], prev: ListItem[]) => void) | null): void;
}

const MAX_QUANTITY = SHARED_LIST_LIMITS.maxQuantity;
const clampQuantity = (n: number) => Math.min(MAX_QUANTITY, Math.max(1, n));

interface AppState {
  ready: boolean;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  items: ListItem[];
  addItem: (text: string, quantity?: number) => void;
  addItems: (items: ListItem[]) => void;
  updateItem: (id: string, patch: Partial<Pick<ListItem, 'quantity' | 'level' | 'checked'>>) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
  itemsBridge: ItemsBridge;
  catalog: Catalog | null;
  source: DataSource;
  origin: LatLng | null;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [items, setItemsState] = useState<ListItem[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const source = useMemo(() => configuredSource(), []);

  // Item edits go through a ref so the shared-list sync sees each one, in order.
  const itemsRef = useRef<ListItem[]>([]);
  const listenerRef = useRef<((next: ListItem[], prev: ListItem[]) => void) | null>(null);
  const itemsBridge = useMemo<ItemsBridge>(() => ({
    current: () => itemsRef.current,
    replace: (next) => { itemsRef.current = next; setItemsState(next); },
    setListener: (listener) => { listenerRef.current = listener; },
  }), []);
  const setItems = useCallback((update: (current: ListItem[]) => ListItem[]) => {
    const prev = itemsRef.current;
    const next = update(prev);
    if (next === prev) return;
    itemsRef.current = next;
    setItemsState(next);
    listenerRef.current?.(next, prev);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Persisted>;
          if (saved.settings) setSettings({ ...defaultSettings(), ...saved.settings, chains: withNewChains(saved.settings.chains) });
          if (saved.items) itemsBridge.replace(saved.items);
        }
      } catch {
        // Storage unavailable (private browsing): start fresh.
      }
      setReady(true);
    })();
    source.load().then(setCatalog);
  }, [source, itemsBridge]);

  useEffect(() => {
    if (!ready) return;
    const data: Persisted = { settings, items };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [ready, settings, items]);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const addItems = useCallback((newItems: ListItem[]) => {
    setItems((current) => {
      const next = current.map((i) => ({ ...i }));
      for (const item of newItems) {
        const same = next.find((i) => (item.categoryId ? i.categoryId === item.categoryId : i.text.toLowerCase() === item.text.toLowerCase()));
        // Adding something already ticked off means it's needed again.
        if (same) Object.assign(same, same.checked ? { quantity: item.quantity, checked: false } : { quantity: clampQuantity(same.quantity + item.quantity) });
        else next.push({ ...item, quantity: clampQuantity(item.quantity) });
      }
      return next;
    });
  }, [setItems]);

  const addItem = useCallback((text: string, quantity = 1) => {
    if (text.trim()) addItems([makeListItem(text, quantity)]);
  }, [addItems]);

  const updateItem = useCallback((id: string, patch: Partial<Pick<ListItem, 'quantity' | 'level' | 'checked'>>) => {
    setItems((current) => current.map((i) => (i.id === id ? { ...i, ...patch, quantity: clampQuantity(patch.quantity ?? i.quantity) } : i)));
  }, [setItems]);

  const removeItem = useCallback((id: string) => setItems((c) => c.filter((i) => i.id !== id)), [setItems]);
  const clearItems = useCallback(() => setItems(() => []), [setItems]);

  const origin = settings.location ?? (settings.postalCode ? postalCodeLocation(settings.postalCode) : null);
  const t = useCallback((key: StringKey, vars?: Record<string, string | number>) => translate(settings.lang, key, vars), [settings.lang]);

  const value: AppState = {
    ready, settings, updateSettings, items, addItem, addItems, updateItem, removeItem, clearItems, itemsBridge,
    catalog, source, origin, t,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider');
  return ctx;
}

export function levelLabel(level: BrandLevel, t: AppState['t']): string {
  if (level.kind === 'own') return t('levelOwn');
  if (level.kind === 'any') return t('levelAny');
  return level.brand || t('levelBrand');
}

export function chainName(id: ChainId): string {
  return CHAINS[id].name;
}
