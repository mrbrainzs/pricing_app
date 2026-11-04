/**
 * Daily price import.
 *
 *   npm run ingest -w @pricing/ingest -- --chain mercadona --postal 08001,08012 --sink json
 *   DATABASE_PATH=/var/lib/quinsuper/prices.sqlite npm run ingest -w @pricing/ingest -- --chain all --sink sqlite
 *
 * Options:
 *   --chain        mercadona, consum, a comma-separated list, or all
 *   --postal       Mercadona: comma-separated postal codes; each distinct pricing zone is imported once
 *   --sink         json (writes ./out) or sqlite (local DATABASE_PATH)
 *   --details      Mercadona: new (default) fetches brand/EAN only for unseen products; all; none
 *   --max-categories N   stop early, for test runs (Mercadona categories / Consum search terms)
 *   --stores       auto (default): with sqlite, refresh store locations from OpenStreetMap
 *                  when they are more than 7 days old; force; skip; only (stores, no prices)
 *
 * Each chain is imported on its own: if one fails, the others still run, and the
 * command exits with an error at the end so the failure shows in systemd.
 */
import { parseArgs } from 'node:util';
import { consumSearchTerms, scrapeConsum } from './chains/consum';
import { mercadonaWarehouse, scrapeMercadona } from './chains/mercadona';
import { storeZones } from './database';
import { PoliteClient } from './http';
import { JsonSink, type Sink } from './sink';
import { SqliteSink } from './sqliteSink';
import { refreshStores, storesDue } from './stores/refresh';
import type { ScrapeResult } from './types';

const DEFAULT_POSTAL_CODES = ['08001', '08012', '08014', '08018', '08027', '08028'];

interface ImportContext {
  sink: Sink;
  http: PoliteClient;
  postalCodes: string[];
  details: string;
  maxCategories?: number;
}

type Importer = (ctx: ImportContext, log: (m: string) => void) => Promise<void>;

async function save(ctx: ImportContext, chain: 'mercadona' | 'consum', result: ScrapeResult, log: (m: string) => void, label: string) {
  const classified = result.products.filter((p) => p.categoryId).length;
  log(`${label}: ${result.products.length} products (${classified} matched to generic items), ${result.prices.length} prices`);
  const saved = await ctx.sink.save(chain, result.products, result.prices);
  log(`saved ${saved.products} products, ${saved.prices} prices${saved.shrunk.length ? `, size went down: ${saved.shrunk.join(', ')}` : ''}`);
}

const importMercadona: Importer = async (ctx, log) => {
  const zones = new Map<string, string>();
  for (const pc of ctx.postalCodes) {
    const wh = await mercadonaWarehouse(ctx.http, pc);
    log(`postal code ${pc} -> warehouse ${wh}`);
    if (!zones.has(wh)) zones.set(wh, pc);
  }
  if (ctx.sink instanceof SqliteSink) {
    for (const [zone, pc] of storeZones(ctx.sink.db, 'mercadona')) {
      if (!zones.has(zone)) {
        zones.set(zone, pc);
        log(`warehouse ${zone} added because stores use it (postal code ${pc})`);
      }
    }
  }
  const existing = await ctx.sink.existingProducts('mercadona');
  const seenDetail = new Set<string>();
  const needsDetail = (id: string) => {
    if (ctx.details === 'none' || seenDetail.has(id)) return false;
    seenDetail.add(id);
    return ctx.details === 'all' || !existing.get(id)?.ean;
  };
  for (const wh of zones.keys()) {
    const result = await scrapeMercadona(ctx.http, { warehouse: wh, needsDetail, maxCategories: ctx.maxCategories, log });
    await save(ctx, 'mercadona', result, log, `warehouse ${wh}`);
  }
};

const importConsum: Importer = async (ctx, log) => {
  const terms = consumSearchTerms().slice(0, ctx.maxCategories);
  const result = await scrapeConsum(ctx.http, { terms, log });
  // A search that suddenly finds almost nothing means the shop changed; don't record it as real.
  if (result.products.length < Math.min(20, terms.length)) {
    throw new Error(`only ${result.products.length} products found for ${terms.length} searches; the shop may have changed`);
  }
  await save(ctx, 'consum', result, log, 'online shop');
};

const IMPORTERS: Record<string, Importer> = { mercadona: importMercadona, consum: importConsum };

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

  const chains = values.chain === 'all' ? Object.keys(IMPORTERS) : values.chain!.split(',').map((c) => c.trim()).filter(Boolean);
  const unknown = chains.filter((c) => !IMPORTERS[c]);
  if (unknown.length || chains.length === 0) {
    throw new Error(`No importer for "${unknown.join(', ')}". Importers: ${Object.keys(IMPORTERS).join(', ')} (or all).`);
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

  const ctx: ImportContext = {
    sink,
    http,
    postalCodes: values.postal!.split(',').map((s) => s.trim()).filter(Boolean),
    details: values.details!,
    maxCategories: values['max-categories'] ? Number(values['max-categories']) : undefined,
  };
  const failed: string[] = [];
  for (const chain of chains) {
    const log = (m: string) => console.log(`[${chain}] ${m}`);
    try {
      await IMPORTERS[chain]!(ctx, log);
    } catch (err) {
      failed.push(chain);
      console.error(`[${chain}] import failed: ${(err as Error).message}`);
    }
  }
  if (failed.length) throw new Error(`Import failed for: ${failed.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
