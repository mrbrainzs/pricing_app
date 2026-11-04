/**
 * Daily price import.
 *
 *   npm run ingest -w @pricing/ingest -- --chain mercadona --postal 08001,08012 --sink json
 *   npm run ingest -w @pricing/ingest -- --chain mercadona --sink supabase   (needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 *
 * Options:
 *   --chain        chain to import (v1: mercadona)
 *   --postal       comma-separated postal codes; each distinct pricing zone is imported once
 *   --sink         json (writes ./out) or supabase
 *   --details      new (default): fetch brand/EAN only for unseen products; all; none
 *   --max-categories N   stop early, for test runs
 */
import { parseArgs } from 'node:util';
import { PoliteClient } from './http';
import { mercadonaWarehouse, scrapeMercadona } from './chains/mercadona';
import { JsonSink, SupabaseSink, type Sink } from './sink';

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
    },
  });

  let sink: Sink;
  if (values.sink === 'supabase') {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to write to Supabase.');
    sink = new SupabaseSink(url, key);
  } else {
    sink = new JsonSink(values.out!);
  }

  if (values.chain !== 'mercadona') {
    throw new Error(`Chain "${values.chain}" has no importer yet. v1 importers: mercadona.`);
  }

  const http = new PoliteClient({ delayMs: 400 });
  const log = (m: string) => console.log(`[mercadona] ${m}`);
  const postalCodes = values.postal!.split(',').map((s) => s.trim()).filter(Boolean);
  const zones = new Map<string, string>();
  for (const pc of postalCodes) {
    const wh = await mercadonaWarehouse(http, pc);
    log(`postal code ${pc} -> warehouse ${wh}`);
    if (!zones.has(wh)) zones.set(wh, pc);
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
