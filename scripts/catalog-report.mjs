#!/usr/bin/env node
/**
 * Read-only quality report on the live catalogue.
 *
 *   node scripts/catalog-report.mjs [https://quinsuper.trottedmedia.com/api/catalog]
 *
 * Prints Markdown (also appended to $GITHUB_STEP_SUMMARY when set): counts per chain and
 * generic item, median unit prices, products whose unit price is far from their item's
 * typical price (usually a wrong item match or pack size), and price ages.
 */
import { appendFileSync } from 'node:fs';

const url = process.argv[2] ?? 'https://quinsuper.trottedmedia.com/api/catalog';
const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
const catalog = await res.json();

const out = [];
const line = (s = '') => out.push(s);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? null : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const eur = (n) => (n == null ? '–' : n.toFixed(2));

const priceOf = new Map();
for (const p of catalog.prices) {
  const prev = priceOf.get(p.productId);
  if (!prev || p.observedAt > prev.observedAt) priceOf.set(p.productId, p);
}
const products = catalog.products.filter((p) => priceOf.has(p.id));
const chains = [...new Set(products.map((p) => p.chain))].sort();
const categories = [...new Set(products.map((p) => p.categoryId).filter(Boolean))].sort();

line(`# Catalogue report`);
line(`Source: ${url} · ${new Date().toISOString()} · sample data: ${catalog.isSample}`);
line();
line(`## Totals`);
line(`| Chain | Products with price | Matched to an item | Stores | Newest price | Oldest price |`);
line(`|---|---|---|---|---|---|`);
const storeChains = [...new Set(catalog.stores.map((s) => s.chain))];
for (const chain of [...new Set([...chains, ...storeChains])].sort()) {
  const ps = products.filter((p) => p.chain === chain);
  const times = ps.map((p) => priceOf.get(p.id).observedAt).sort();
  line(`| ${chain} | ${ps.length} | ${ps.filter((p) => p.categoryId).length} | ${catalog.stores.filter((s) => s.chain === chain).length} | ${times.at(-1)?.slice(0, 16) ?? '–'} | ${times[0]?.slice(0, 16) ?? '–'} |`);
}

line();
line(`## Products per item (count · median price per kg/l/unit)`);
line(`| Item | ${chains.join(' | ')} |`);
line(`|---|${chains.map(() => '---').join('|')}|`);
const medians = new Map();
for (const cat of categories) {
  const cells = chains.map((chain) => {
    const ups = products.filter((p) => p.chain === chain && p.categoryId === cat).map((p) => priceOf.get(p.id).unitPrice).filter((u) => u > 0);
    return ups.length ? `${ups.length} · ${eur(median(ups))}` : '**0**';
  });
  const all = products.filter((p) => p.categoryId === cat).map((p) => priceOf.get(p.id).unitPrice).filter((u) => u > 0);
  medians.set(cat, median(all));
  line(`| ${cat} | ${cells.join(' | ')} |`);
}

line();
line(`## Suspicious unit prices (below ¼ or above 4× the item's median across chains)`);
const suspicious = products
  .filter((p) => p.categoryId && medians.get(p.categoryId))
  .map((p) => {
    const pr = priceOf.get(p.id);
    const ratio = pr.unitPrice ? pr.unitPrice / medians.get(p.categoryId) : null;
    return { p, pr, ratio };
  })
  .filter((x) => x.ratio !== null && (x.ratio < 0.25 || x.ratio > 4))
  .sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));
if (suspicious.length === 0) line('None.');
else {
  line(`${suspicious.length} products. Worst 60:`);
  line(`| Chain | Item | Product | Price | Size | Unit price | × median |`);
  line(`|---|---|---|---|---|---|---|`);
  for (const { p, pr, ratio } of suspicious.slice(0, 60)) {
    line(`| ${p.chain} | ${p.categoryId} | ${p.name} | ${eur(pr.price)} | ${p.size ? `${p.size.amount} ${p.size.unit}` : '–'} | ${eur(pr.unitPrice)} | ${ratio.toFixed(2)} |`);
  }
}

line();
line(`## Examples per item (up to 4 per chain)`);
for (const cat of categories) {
  line(`**${cat}**`);
  for (const chain of chains) {
    const names = products.filter((p) => p.chain === chain && p.categoryId === cat).slice(0, 4).map((p) => p.name);
    if (names.length) line(`- ${chain}: ${names.join(' · ')}`);
  }
}

const text = out.join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
