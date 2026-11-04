import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CHAINS,
  makeListItem,
  ONLINE_CHAINS,
  postalCodeLocation,
  type BrandLevel,
  type ChainId,
  type Lang,
  type LatLng,
  type ListItem,
} from '@pricing/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { sampleSource, type Catalog, type DataSource } from '@/data/source';
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

const defaultSettings = (): Settings => ({
  lang: deviceLanguage(),
  postalCode: null,
  location: null,
  chains: [...ONLINE_CHAINS],
  minSaving: 3,
  maxDistanceKm: 3,
  onboarded: false,
});

interface AppState {
  ready: boolean;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  items: ListItem[];
  addItem: (text: string, quantity?: number) => void;
  addItems: (items: ListItem[]) => void;
  updateItem: (id: string, patch: Partial<Pick<ListItem, 'quantity' | 'level'>>) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
  catalog: Catalog | null;
  source: DataSource;
  origin: LatLng | null;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [items, setItems] = useState<ListItem[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const source = useMemo(() => sampleSource(), []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Persisted>;
          if (saved.settings) setSettings({ ...defaultSettings(), ...saved.settings });
          if (saved.items) setItems(saved.items);
        }
      } catch {
        // Storage unavailable (private browsing): start fresh.
      }
      setReady(true);
    })();
    source.load().then(setCatalog);
  }, [source]);

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
        if (same) same.quantity += item.quantity;
        else next.push(item);
      }
      return next;
    });
  }, []);

  const addItem = useCallback((text: string, quantity = 1) => {
    if (text.trim()) addItems([makeListItem(text, quantity)]);
  }, [addItems]);

  const updateItem = useCallback((id: string, patch: Partial<Pick<ListItem, 'quantity' | 'level'>>) => {
    setItems((current) => current.map((i) => (i.id === id ? { ...i, ...patch, quantity: Math.max(1, patch.quantity ?? i.quantity) } : i)));
  }, []);

  const removeItem = useCallback((id: string) => setItems((c) => c.filter((i) => i.id !== id)), []);
  const clearItems = useCallback(() => setItems([]), []);

  const origin = settings.location ?? (settings.postalCode ? postalCodeLocation(settings.postalCode) : null);
  const t = useCallback((key: StringKey, vars?: Record<string, string | number>) => translate(settings.lang, key, vars), [settings.lang]);

  const value: AppState = {
    ready, settings, updateSettings, items, addItem, addItems, updateItem, removeItem, clearItems,
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
