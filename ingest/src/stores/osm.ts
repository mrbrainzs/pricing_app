/**
 * Supermarket locations from OpenStreetMap, via the Overpass API.
 *
 * OpenStreetMap data is © OpenStreetMap contributors, available under the Open Database
 * License (ODbL). The app must show that credit wherever store locations are used, and
 * the store data we publish through the API stays under the ODbL.
 */
import { CHAINS, isCataloniaPostalCode, nearestPostalCode, distanceKm, postalCodeLocation, normalize, type ChainId, type Store } from '@pricing/core';
import type { PoliteClient } from '../http';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Barcelona city plus the edge of neighbouring towns. */
export const BARCELONA_BBOX = { south: 41.317, west: 2.052, north: 41.468, east: 2.229 };

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function overpassQuery(bbox = BARCELONA_BBOX): string {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:120];\nnwr["shop"~"^(supermarket|convenience)$"](${box});\nout center tags;`;
}

/** Chains we compare in v1, recognised from OSM brand/name/operator tags (accents ignored). */
const CHAIN_PATTERNS: [ChainId, RegExp][] = [
  ['mercadona', /\bmercadona\b/],
  ['alcampo', /\balcampo\b|\bauchan\b/],
  ['bonarea', /\bbon ?area\b/],
  ['caprabo', /\bcaprabo\b/],
  ['bonpreu', /\bbon ?preu\b|\besclat\b/],
  // "Dia", "DIA", "Dia Market", "La Plaza de DIA" — but not "Diagonal" or "Super Dia y Noche".
  ['dia', /^(la plaza de )?dia( market| maxi)?$/],
];

export function chainFromTags(tags: Record<string, string> = {}): ChainId | null {
  for (const key of ['brand', 'name', 'operator']) {
    const value = tags[key];
    if (!value) continue;
    const n = normalize(value);
    for (const [chain, re] of CHAIN_PATTERNS) if (re.test(n)) return chain;
  }
  return null;
}

export interface StoreCandidate extends Omit<Store, 'zone'> {
  osmType: OsmElement['type'];
}

function address(tags: Record<string, string>): string | undefined {
  const street = tags['addr:street'];
  if (!street) return undefined;
  return tags['addr:housenumber'] ? `${street}, ${tags['addr:housenumber']}` : street;
}

/**
 * Postal code from the OSM tag, or the nearest Barcelona postal code when the store is
 * clearly inside the city. Returns undefined rather than guessing near the city edge.
 */
export function storePostalCode(tags: Record<string, string>, lat: number, lng: number): string | undefined {
  const tagged = tags['addr:postcode']?.trim();
  if (tagged && /^\d{5}$/.test(tagged) && isCataloniaPostalCode(tagged)) return tagged;
  const nearest = nearestPostalCode({ lat, lng });
  const centre = nearest ? postalCodeLocation(nearest) : null;
  return nearest && centre && distanceKm(centre, { lat, lng }) <= 1.5 ? nearest : undefined;
}

export function parseOsmElements(elements: OsmElement[]): StoreCandidate[] {
  const out: StoreCandidate[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const tags = el.tags ?? {};
    const chain = chainFromTags(tags);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!chain || lat === undefined || lng === undefined) continue;
    const id = `osm:${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const addr = address(tags);
    const rawName = tags.name?.trim() || CHAINS[chain].name;
    // Many shops are tagged just "Mercadona"; add the street so people can tell them apart.
    const name = addr && normalize(rawName) === normalize(CHAINS[chain].name) ? `${rawName} · ${tags['addr:street']}` : rawName;
    out.push({
      id,
      chain,
      name,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      address: addr,
      postalCode: storePostalCode(tags, lat, lng),
      openingHours: tags.opening_hours,
      source: 'openstreetmap',
      osmType: el.type,
    });
  }
  return out;
}

export async function fetchOsmStores(http: PoliteClient, bbox = BARCELONA_BBOX): Promise<StoreCandidate[]> {
  const res = await http.request(OVERPASS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(overpassQuery(bbox))}`,
    signal: AbortSignal.timeout(180_000),
  });
  const json = (await res.json()) as { elements?: OsmElement[] };
  if (!Array.isArray(json.elements)) throw new Error('Overpass returned no elements array');
  return parseOsmElements(json.elements);
}

/** How a chain's stores map to price zones. Chain importers must use the same zone names. */
export type ZoneResolver = (chain: ChainId, postalCode: string | undefined) => Promise<string | null>;

/**
 * Gives each store its price zone. Stores whose zone can't be verified are dropped and
 * reported, never assigned a guessed zone.
 */
export async function assignZones(candidates: StoreCandidate[], resolve: ZoneResolver): Promise<{ stores: Store[]; skipped: StoreCandidate[] }> {
  const stores: Store[] = [];
  const skipped: StoreCandidate[] = [];
  for (const c of candidates) {
    let zone: string | null = null;
    try {
      zone = await resolve(c.chain, c.postalCode);
    } catch {
      zone = null;
    }
    if (!zone) {
      skipped.push(c);
      continue;
    }
    const { osmType: _osmType, ...store } = c;
    stores.push({ ...store, zone });
  }
  return { stores, skipped };
}

/**
 * Zone resolver for v1. Mercadona: the warehouse that serves the store's postal code,
 * looked up once per postal code. Chains with one price for all of Catalonia: "cat".
 * Other chains have no price importer yet; their stores use "bcn" until one exists.
 */
export function defaultZoneResolver(mercadonaWarehouse: (postalCode: string) => Promise<string>): ZoneResolver {
  const cache = new Map<string, Promise<string>>();
  return async (chain, postalCode) => {
    if (chain === 'mercadona') {
      if (!postalCode) return null;
      if (!cache.has(postalCode)) cache.set(postalCode, mercadonaWarehouse(postalCode));
      return cache.get(postalCode)!;
    }
    return CHAINS[chain].singlePriceZone ? 'cat' : 'bcn';
  };
}

/** Refuse to replace the stored list with a result that looks broken. */
export function checkStoreResult(stores: Store[], minStores = 20, minChains = 3): void {
  const chains = new Set(stores.map((s) => s.chain));
  if (stores.length < minStores || chains.size < minChains) {
    throw new Error(`Store import looks incomplete (${stores.length} stores, ${chains.size} chains); keeping the previous list.`);
  }
}
