import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang, PriceAlert } from '@pricing/core';

/**
 * Price alerts stay on the device (the API is read-only). They have their own storage key, apart
 * from settings and the list, because the background check also reads and writes them.
 */
export interface StoredAlerts {
  alerts: PriceAlert[];
  /** App language, so a background check can word notifications without the rest of the state. */
  lang: Lang | null;
  /** ISO time of the last check against the catalogue. */
  lastCheckedAt: string | null;
  /** True once we've asked for notification permission (or the user chose "Not now"). */
  permissionAsked: boolean;
}

const STORAGE_KEY = 'quinsuper:alerts:v1';

const empty = (): StoredAlerts => ({ alerts: [], lang: null, lastCheckedAt: null, permissionAsked: false });

/** Last known value; used when storage is unavailable (private browsing) so alerts still work this session. */
let memory: StoredAlerts | null = null;

async function load(): Promise<StoredAlerts> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const saved = JSON.parse(raw) as Partial<StoredAlerts>;
      memory = { ...empty(), ...saved, alerts: Array.isArray(saved.alerts) ? saved.alerts : [] };
    }
  } catch {
    // Unreadable storage: keep what this session has.
  }
  return memory ?? (memory = empty());
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs storage operations one at a time, so a check and a user edit can't overwrite each other. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

export function readAlerts(): Promise<StoredAlerts> {
  return serial(load);
}

export function updateAlerts(change: (current: StoredAlerts) => StoredAlerts | Promise<StoredAlerts>): Promise<StoredAlerts> {
  return serial(async () => {
    const next = await change(await load());
    memory = next;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable: the alert lasts for this session only.
    }
    return next;
  });
}
