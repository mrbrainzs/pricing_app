import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { catalog, lastRun, openDatabase, replaceStores, storeZones } from '../src/database';
import { PoliteClient } from '../src/http';
import { assignZones, chainFromTags, checkStoreResult, defaultZoneResolver, overpassQuery, parseOsmElements, type OsmElement } from '../src/stores/osm';
import { refreshStores, storesDue } from '../src/stores/refresh';

// Hand-written elements in the shape the Overpass API returns for "out center tags".
const elements: OsmElement[] = [
  { type: 'node', id: 1, lat: 41.40361, lon: 2.15652, tags: { shop: 'supermarket', brand: 'Mercadona', name: 'Mercadona', 'addr:street': 'Carrer de Verdi', 'addr:housenumber': '12', 'addr:postcode': '08012', opening_hours: 'Mo-Sa 09:00-21:30' } },
  { type: 'way', id: 2, center: { lat: 41.3917, lon: 2.1649 }, tags: { shop: 'supermarket', name: 'bonÀrea' } },
  { type: 'node', id: 3, lat: 41.3755, lon: 2.1385, tags: { shop: 'supermarket', brand: 'Dia', name: 'Dia' } },
  { type: 'node', id: 4, lat: 41.38, lon: 2.169, tags: { shop: 'convenience', name: 'La Plaza de DIA' } },
  { type: 'node', id: 5, lat: 41.4005, lon: 2.201, tags: { shop: 'supermarket', name: 'Esclat' } },
  { type: 'node', id: 6, lat: 41.4, lon: 2.18, tags: { shop: 'supermarket', name: 'Supermercat Diagonal' } },
  { type: 'node', id: 7, lat: 41.41, lon: 2.18, tags: { shop: 'convenience', name: 'Super Dia y Noche' } },
  { type: 'node', id: 8, lat: 41.41, lon: 2.19, tags: { shop: 'supermarket', name: 'Lidl' } },
  { type: 'node', id: 9, tags: { shop: 'supermarket', name: 'Caprabo' } }, // no position
  // A Mercadona just outside the city with no postal code tag: its zone can't be verified.
  { type: 'node', id: 10, lat: 41.36, lon: 2.06, tags: { shop: 'supermarket', name: 'Mercadona' } },
  { type: 'node', id: 11, lat: 41.4365, lon: 2.1905, tags: { shop: 'supermarket', brand: 'Alcampo', name: 'Alcampo Sant Andreu' } },
];

describe('OpenStreetMap stores', () => {
  it('recognises chains from brand, name or operator, without false matches', () => {
    expect(chainFromTags({ brand: 'Mercadona' })).toBe('mercadona');
    expect(chainFromTags({ name: 'bonÀrea Agrupa' })).toBe('bonarea');
    expect(chainFromTags({ name: 'Bon Preu' })).toBe('bonpreu');
    expect(chainFromTags({ name: 'Caprabo' })).toBe('caprabo');
    expect(chainFromTags({ operator: 'Auchan Retail España' })).toBe('alcampo');
    expect(chainFromTags({ name: 'Dia Market' })).toBe('dia');
    expect(chainFromTags({ name: 'Diagonal Market' })).toBeNull();
    expect(chainFromTags({ name: 'Super Dia y Noche' })).toBeNull();
    expect(chainFromTags({ name: 'Lidl' })).toBeNull();
  });

  it('parses positions, addresses, postal codes and opening hours', () => {
    const stores = parseOsmElements(elements);
    expect(stores.map((s) => s.id)).toEqual(['osm:node/1', 'osm:way/2', 'osm:node/3', 'osm:node/4', 'osm:node/5', 'osm:node/10', 'osm:node/11']);
    expect(stores[0]).toMatchObject({
      chain: 'mercadona', name: 'Mercadona · Carrer de Verdi', address: 'Carrer de Verdi, 12', postalCode: '08012',
      openingHours: 'Mo-Sa 09:00-21:30', source: 'openstreetmap', lat: 41.40361, lng: 2.15652,
    });
    // Way: centre point; postal code from the nearest city postal code.
    expect(stores[1]).toMatchObject({ chain: 'bonarea', lat: 41.3917, postalCode: '08007' });
    // Near the city edge without a tag: no guessed postal code.
    expect(stores.find((s) => s.id === 'osm:node/10')?.postalCode).toBeUndefined();
  });

  it('verifies a price zone for each store and drops stores it cannot verify', async () => {
    const lookups: string[] = [];
    const resolver = defaultZoneResolver(async (pc) => {
      lookups.push(pc);
      if (pc === '08014') throw new Error('Mercadona did not answer');
      return pc === '08012' ? 'bcn1' : 'bcn2';
    });
    const candidates = parseOsmElements([...elements, { type: 'node', id: 12, lat: 41.4031, lon: 2.157, tags: { name: 'Mercadona', 'addr:postcode': '08012' } }, { type: 'node', id: 13, lat: 41.3755, lon: 2.1385, tags: { name: 'Mercadona', 'addr:postcode': '08014' } }]);
    const { stores, skipped } = await assignZones(candidates, resolver);
    expect(lookups).toEqual(['08012', '08014']); // one lookup per postal code
    expect(stores.find((s) => s.id === 'osm:node/1')?.zone).toBe('bcn1');
    expect(stores.find((s) => s.chain === 'bonarea')?.zone).toBe('cat');
    expect(stores.find((s) => s.chain === 'dia')?.zone).toBe('bcn');
    expect(skipped.map((s) => s.id).sort()).toEqual(['osm:node/10', 'osm:node/13']);
  });

  it('builds a query for supermarkets and convenience shops in the area', () => {
    expect(overpassQuery()).toContain('nwr["shop"~"^(supermarket|convenience)$"](41.317,2.052,41.468,2.229)');
  });
});

describe('store storage', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const db = () => {
    const dir = mkdtempSync(join(tmpdir(), 'quinsuper-stores-')); dirs.push(dir);
    return openDatabase(join(dir, 'prices.sqlite'));
  };
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: `osm:node/${100 + i}`, chain: (['mercadona', 'dia', 'bonarea'] as const)[i % 3]!, name: `Store ${i}`,
    zone: i % 3 === 0 ? (i % 2 ? 'bcn1' : 'bcn2') : 'bcn', lat: 41.4, lng: 2.17, postalCode: `080${String(10 + (i % 20))}`, source: 'openstreetmap' as const,
  }));

  it('replaces the store list in one go and serves it in the catalogue', () => {
    const d = db();
    try {
      replaceStores(d, 'openstreetmap', many(30));
      replaceStores(d, 'openstreetmap', many(24));
      expect(catalog(d).stores).toHaveLength(24);
      expect([...storeZones(d, 'mercadona').keys()].sort()).toEqual(['bcn1', 'bcn2']);
    } finally { d.close(); }
  });

  it('keeps the previous list when a refresh fails', async () => {
    const d = db();
    try {
      replaceStores(d, 'openstreetmap', many(30));
      expect(() => replaceStores(d, 'openstreetmap', [...many(25), { ...many(1)[0]!, id: 'bad', lat: NaN }])).toThrow();
      expect(catalog(d).stores).toHaveLength(30);
      expect(() => checkStoreResult(many(5))).toThrow(/incomplete/);
      const http = new PoliteClient({ delayMs: 0 });
      await expect(refreshStores(d, http, () => {}, { fetchStores: async () => parseOsmElements(elements), warehouse: async () => 'bcn1' })).rejects.toThrow(/incomplete/);
      expect(catalog(d).stores).toHaveLength(30);
      expect(lastRun(d, 'stores:openstreetmap')).toBeNull();
    } finally { d.close(); }
  });

  it('refreshes weekly and records the run', async () => {
    const d = db();
    try {
      expect(storesDue(d)).toBe(true);
      const now = new Date('2026-11-04T05:30:00Z');
      const candidates = parseOsmElements(elements).concat(many(25).map((s) => ({ ...s, osmType: 'node' as const })));
      const logs: string[] = [];
      await refreshStores(d, new PoliteClient({ delayMs: 0 }), (m) => logs.push(m), { fetchStores: async () => candidates, warehouse: async () => 'bcn1', now });
      expect(storesDue(d, new Date('2026-11-08T05:30:00Z'))).toBe(false);
      expect(storesDue(d, new Date('2026-11-12T05:30:00Z'))).toBe(true);
      expect(logs[0]).toMatch(/stores: \d+ saved .*mercadona/);
      expect(logs[0]).toMatch(/1 skipped/);
    } finally { d.close(); }
  });
});
