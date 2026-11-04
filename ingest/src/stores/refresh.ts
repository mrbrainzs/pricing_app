import type { DatabaseSync } from 'node:sqlite';
import { mercadonaWarehouse } from '../chains/mercadona';
import { lastRun, recordRun, replaceStores } from '../database';
import type { PoliteClient } from '../http';
import { assignZones, checkStoreResult, defaultZoneResolver, fetchOsmStores, type StoreCandidate } from './osm';

export const STORES_RUN = 'stores:openstreetmap';
/** Store locations change slowly; refresh them once a week. */
export const STORES_MAX_AGE_DAYS = 7;

export function storesDue(db: DatabaseSync, now = new Date()): boolean {
  const last = lastRun(db, STORES_RUN);
  return !last || now.getTime() - Date.parse(last) > STORES_MAX_AGE_DAYS * 86_400_000;
}

export interface RefreshDeps {
  fetchStores?: (http: PoliteClient) => Promise<StoreCandidate[]>;
  warehouse?: (postalCode: string) => Promise<string>;
  now?: Date;
}

/** Downloads store locations, verifies price zones, and replaces the stored list. */
export async function refreshStores(db: DatabaseSync, http: PoliteClient, log: (m: string) => void, deps: RefreshDeps = {}) {
  const candidates = await (deps.fetchStores ?? fetchOsmStores)(http);
  const resolver = defaultZoneResolver(deps.warehouse ?? ((pc) => mercadonaWarehouse(http, pc)));
  const { stores, skipped } = await assignZones(candidates, resolver);
  checkStoreResult(stores);
  replaceStores(db, 'openstreetmap', stores);
  const byChain: Record<string, number> = {};
  for (const s of stores) byChain[s.chain] = (byChain[s.chain] ?? 0) + 1;
  recordRun(db, STORES_RUN, deps.now ?? new Date(), { stores: stores.length, skipped: skipped.length, byChain });
  log(`stores: ${stores.length} saved (${Object.entries(byChain).map(([c, n]) => `${c} ${n}`).join(', ')})` +
    (skipped.length ? `; ${skipped.length} skipped without a verified price zone` : ''));
  return { stores, skipped };
}
