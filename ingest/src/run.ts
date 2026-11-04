/**
 * Daily price import.
 *
 *   npm run ingest -w @pricing/ingest -- --chain mercadona --postal 08001,08012 --sink json
 *   DATABASE_PATH=/var/lib/quinsuper/prices.sqlite npm run ingest -w @pricing/ingest -- --sink sqlite
 *
 * Options:
 *   --chain        chain to import (v1: mercadona)
 *   --postal       comma-separated postal codes; each distinct pricing zone is imported once
 *   --sink         json (writes ./out) or sqlite (local DATABASE_PATH)
 *   --details      new (default): fetch brand/EAN only for unseen products; all; none
 *   --max-categories N   stop early, for test runs
 *   --stores       auto (default): with sqlite, refresh store locations from OpenStreetMap
 *                  when they are more than 7 days old; force; skip; only (stores, no prices)
 */
import { parseArgs } from 'node:util';
import { PoliteClient } from './http';
import { mercadonaWarehouse, scrapeMercadona } from './chains/mercadona';
import { JsonSink, type Sink } from './sink';
import { SqliteSink } from './sqliteSink';
import { storeZones } from './database';
import { refreshStores, storesDue } from './stores/refresh';

const DEFAULT_POSTAL_CODES = ['08001', '08012', '08014', '08018', '08027', '08028'];

async function main() {
  const { values } = parseArgs({
    options: {
      chain: { type: 'string', default: 'mercadona' },
      postal: { type: 'string', default: DEFAULT_POSTAL_CODES.join(',') },
      sink: { type: 'string', default: 'json' },
      details: { type: 'string', default: 'new' },
      'max-categories': { type: 'string' },
      out: { type: 'string', default: 'out' },
      stores: { type: 'string', default: 'auto' },
    },
  });

  let sink: Sink;
  if (values.sink === 'sqlite') {
    if (!process.env.DATABASE_PATH) throw new Error('Set DATABASE_PATH to the local SQLite file.');
    sink = new SqliteSink(process.env.DATABASE_PATH);
  } else if (values.sink === 'json') {
    sink = new JsonSink(values.out!);
  } else throw new Error('Unknown sink. Use json or sqlite.');

  if (values.chain !== 'mercadona') {
    throw new Error(`Chain "${values.chain}" has no importer yet. v1 importers: mercadona.`);
  }

  if (!['auto', 'force', 'skip', 'only'].includes(values.stores!)) throw new Error('--stores must be auto, force, skip or only.');
  const http = new PoliteClient({ delayMs: 400 });

  // Store locations first, so the price import below covers every zone that has a store.
  if (sink instanceof SqliteSink && values.stores !== 'skip') {
    if (values.stores !== 'auto' || storesDue(sink.db)) {
      try {
        await refreshStores(sink.db, http, (m) => console.log(`[stores] ${m}`));
      } catch (err) {
        // Prices still matter when OpenStreetMap is down; the previous store list stays.
        if (values.stores === 'only') throw err;
        console.warn(`[stores] refresh failed, keeping previous locations: ${(err as Error).message}`);
      }
    }
    if (values.stores === 'only') return;
  } else if (values.stores === 'only') {
    throw new Error('--stores only needs --sink sqlite.');
  }

  const log = (m: string) => console.log(`[mercadona] ${m}`);
  const postalCodes = values.postal!.split(',').map((s) => s.trim()).filter(Boolean);
  const zones = new Map<string, string>();
  for (const pc of postalCodes) {
    const wh = await mercadonaWarehouse(http, pc);
    log(`postal code ${pc} -> warehouse ${wh}`);
    if (!zones.has(wh)) zones.set(wh, pc);
  }
  if (sink instanceof SqliteSink) {
    for (const [zone, pc] of storeZones(sink.db, 'mercadona')) {
      if (!zones.has(zone)) {
        zones.set(zone, pc);
        log(`warehouse ${zone} added because stores use it (postal code ${pc})`);
      }
    }
  }

  const existing = await sink.existingProducts('mercadona');
  const seenDetail = new Set<string>();
  const needsDetail = (id: string) => {
    if (values.details === 'none' || seenDetail.has(id)) return false;
    seenDetail.add(id);
    return values.details === 'all' || !existing.get(id)?.ean;
  };

  for (const wh of zones.keys()) {
    const result = await scrapeMercadona(http, {
      warehouse: wh,
      needsDetail,
      maxCategories: values['max-categories'] ? Number(values['max-categories']) : undefined,
      log,
    });
    const classified = result.products.filter((p) => p.categoryId).length;
    log(`warehouse ${wh}: ${result.products.length} products (${classified} matched to generic items), ${result.prices.length} prices`);
    const saved = await sink.save('mercadona', result.products, result.prices);
    log(`saved ${saved.products} products, ${saved.prices} prices${saved.shrunk.length ? `, size went down: ${saved.shrunk.join(', ')}` : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
