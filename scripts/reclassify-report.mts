/**
 * Re-sorts every live product with the classification rules in this checkout and reports
 * what would change at the next import, plus the extremes per item and chain (where wrong
 * matches show up). Read-only.
 *
 *   npx tsx scripts/reclassify-report.mts [https://quinsuper.trottedmedia.com/api/catalog]
 */
import { appendFileSync } from 'node:fs';
import { classifyProduct, detectBrand, plausibleUnitPrice, type PriceObservation, type Product } from '../packages/core/src/index.ts';

const url = process.argv[2] ?? 'https://quinsuper.trottedmedia.com/api/catalog';
const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
const catalog = (await res.json()) as { products: Product[]; prices: PriceObservation[] };

const price = new Map<string, PriceObservation>();
for (const p of catalog.prices) {
  const prev = price.get(p.productId);
  if (!prev || p.observedAt > prev.observedAt) price.set(p.productId, p);
}

const out: string[] = [];
const line = (s = '') => out.push(s);

type Row = { p: Product; before: string | null; after: string | null; unitPrice: number | null };
const rows: Row[] = catalog.products.map((p) => {
  const unitPrice = price.get(p.id)?.unitPrice ?? null;
  // bonÀrea passes a detected brand; the others pass the shop's brand field.
  const brand = p.chain === 'bonarea' ? detectBrand(p.name) : p.brand;
  let after = classifyProduct(p.name, brand);
  if (after && !plausibleUnitPrice(after, unitPrice, p.size?.unit)) after = null;
  return { p, before: p.categoryId, after, unitPrice };
});

line('# Re-classification report');
line(`Source: ${url} · ${new Date().toISOString()} · ${rows.length} products`);
line();
const changes = new Map<string, Row[]>();
for (const r of rows) {
  if (r.before === r.after) continue;
  const key = `${r.before ?? '—'} → ${r.after ?? '—'}`;
  changes.set(key, [...(changes.get(key) ?? []), r]);
}
line(`## Would change at the next import (${[...changes.values()].flat().length} products)`);
for (const [key, list] of [...changes].sort((a, b) => b[1].length - a[1].length)) {
  line(`- **${key}** (${list.length}): ${list.slice(0, 8).map((r) => `${r.p.chain}: ${r.p.name}`).join(' · ')}`);
}

line();
line('## After: cheapest and dearest per item and chain (unit price)');
const cats = [...new Set(rows.map((r) => r.after).filter(Boolean))].sort() as string[];
for (const cat of cats) {
  line(`### ${cat}`);
  for (const chain of [...new Set(rows.map((r) => r.p.chain))].sort()) {
    const list = rows.filter((r) => r.after === cat && r.p.chain === chain && r.unitPrice !== null).sort((a, b) => a.unitPrice! - b.unitPrice!);
    if (!list.length) continue;
    const fmt = (r: Row) => `${r.p.name} [${r.unitPrice!.toFixed(2)}/${r.p.size?.unit ?? '?'}]`;
    const ends = list.length <= 6 ? list.map(fmt) : [...list.slice(0, 3).map(fmt), '…', ...list.slice(-3).map(fmt)];
    line(`- ${chain} (${list.length}): ${ends.join(' · ')}`);
  }
}

const text = out.join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${text}\n`);
