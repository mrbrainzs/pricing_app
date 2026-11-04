import type { WeeklyIndex } from '@pricing/core';
import { useEffect, useState } from 'react';

import type { DataSource } from '@/data/source';
import { useApp } from '@/state/AppState';

/** One request per data source and app session, shared by the List card and the index screen. */
const requests = new WeakMap<DataSource, Promise<WeeklyIndex | null>>();

/**
 * F12 weekly basket index. Waits for the catalogue, because loading it decides whether the
 * app runs on real or (labelled) sample data.
 */
export function useWeeklyIndex(): { index: WeeklyIndex | null; loading: boolean } {
  const { source, catalog } = useApp();
  const [index, setIndex] = useState<WeeklyIndex | null | undefined>(undefined);

  useEffect(() => {
    if (!catalog) return;
    let alive = true;
    let request = requests.get(source);
    if (!request) {
      request = source.index().catch(() => null);
      requests.set(source, request);
    }
    request.then((value) => {
      if (alive) setIndex(value);
    });
    return () => {
      alive = false;
    };
  }, [source, catalog]);

  return { index: index ?? null, loading: index === undefined };
}
