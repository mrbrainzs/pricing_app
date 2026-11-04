import { CATEGORIES, CATEGORY_BY_ID } from './categories';
import { normalize, tokenMatches, tokens } from './text';
import type { BrandLevel, ListItem, Size } from './types';
import { toSize } from './units';

interface ResolveResult {
  categoryId: string;
  score: number;
}

/** Index of every name and synonym, normalised, for list-item resolution. */
let index: { categoryId: string; text: string; words: string[] }[] | null = null;
function nameIndex() {
  index ??= CATEGORIES.flatMap((c) =>
    [c.names.ca, c.names.es, c.names.en, ...c.synonyms].map((s) => {
      const text = normalize(s);
      return { categoryId: c.id, text, words: tokens(s) };
    }),
  );
  return index;
}

const STOP_WORDS = new Set(['de', 'del', 'la', 'el', 'les', 'los', 'las', 'a', 'en', 'per', 'para', 'of', 'the', 'd', 'l']);

/**
 * Maps what the user typed ("llet", "leche entera", "eggs", "tomaquets") to a generic
 * category. Tolerates typos and missing accents. Returns null when nothing is close.
 */
export function resolveItemText(text: string): ResolveResult | null {
  const query = normalize(text);
  if (!query) return null;
  const qWords = tokens(text).filter((w) => !STOP_WORDS.has(w));
  if (qWords.length === 0) return null;
  let best: ResolveResult | null = null;
  for (const entry of nameIndex()) {
    let score = 0;
    if (entry.text === query) score = 1;
    else {
      const entryWords = entry.words.filter((w) => !STOP_WORDS.has(w));
      const matched = qWords.filter((q) => entryWords.some((w) => tokenMatches(q, w))).length;
      const covered = entryWords.filter((w) => qWords.some((q) => tokenMatches(q, w))).length;
      if (matched === qWords.length) {
        // All typed words found; prefer entries whose words are also all covered.
        score = 0.6 + 0.3 * (covered / entryWords.length);
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { categoryId: entry.categoryId, score };
  }
  return best;
}

let idCounter = 0;
export function newItemId(): string {
  idCounter += 1;
  return `i${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function makeListItem(text: string, quantity = 1, level: BrandLevel = { kind: 'any' }): ListItem {
  const clean = text.trim();
  return {
    id: newItemId(),
    text: clean,
    categoryId: resolveItemText(clean)?.categoryId ?? null,
    level,
    quantity: Math.max(1, Math.round(quantity)),
  };
}

// WhatsApp export prefix: "[10/11/26, 18:02] Anna: " or "10/11/26 18:02 - Anna: "
const WHATSAPP_PREFIX = /^\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\]?\s*(?:-\s*)?[^:]{1,40}:\s*/;
const BULLET = /^\s*(?:[-*•·–—>]+|\d+[.)]|\[\s?[xX ]?\s?\]|[☐☑✅✔️✓]+)\s*/u;
const AMOUNT_PREFIX = /^(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilos?|g|gr|grams|gramos|l|litres?|litros?|ml|cl)\.?\s+(?:de\s+|d['’]\s*)?/i;
const QTY_PREFIX = /^(\d{1,2})\s*(?:x\s*)?(?=\D)/i;
const QTY_SUFFIX = /\s*(?:x\s*(\d{1,2})|\((\d{1,2})\))\s*$/i;

/**
 * Turns pasted text (a WhatsApp message, notes, a comma-separated line) into list items.
 * Handles bullets, numbering, checkboxes, WhatsApp timestamps, "2 llet" / "llet x2", and
 * merges duplicates.
 */
export function parseListText(raw: string): ListItem[] {
  const parts = raw
    .split(/\r?\n/)
    .map((line) => line.replace(WHATSAPP_PREFIX, ''))
    .flatMap((line) => line.split(/[,;]|\s+\+\s+|\s+(?:i|y|and|&)\s+/i));

  const merged = new Map<string, ListItem>();
  for (let part of parts) {
    part = part.replace(BULLET, '').replace(/\p{Extended_Pictographic}/gu, '').trim();
    if (!part) continue;
    let quantity = 1;
    let amount: Size | null = null;
    const amt = part.match(AMOUNT_PREFIX);
    const pre = amt ? null : part.match(QTY_PREFIX);
    if (amt) {
      amount = toSize(Number(amt[1]!.replace(',', '.')), amt[2]!.replace(/s$/, '').replace(/^(kilo|litre|litro|gram|gramo)$/, (w) => ({ kilo: 'kg', litre: 'l', litro: 'l', gram: 'g', gramo: 'g' })[w]!));
      part = part.slice(amt[0].length).trim();
    } else if (pre) {
      quantity = Number(pre[1]);
      part = part.slice(pre[0].length).trim();
    } else {
      const suf = part.match(QTY_SUFFIX);
      if (suf) {
        quantity = Number(suf[1] ?? suf[2]);
        part = part.slice(0, suf.index).trim();
      }
    }
    part = part.replace(/[.!?:]+$/, '').trim();
    if (part.length < 2) continue;
    const item = makeListItem(part, quantity);
    adjustQuantity(item, amount);
    const key = item.categoryId ?? normalize(item.text);
    const existing = merged.get(key);
    if (existing) existing.quantity += item.quantity;
    else merged.set(key, item);
  }
  return [...merged.values()];
}

/**
 * Converts what was typed into "number of reference sizes": "2 kg patates" -> 2 × 1 kg,
 * "6 ous" -> 1 × dozen (not six dozen), "24 ous" -> 2 × dozen.
 */
function adjustQuantity(item: ListItem, amount: Size | null): void {
  const def = item.categoryId ? CATEGORY_BY_ID[item.categoryId]?.defaultSize : undefined;
  if (!def) return;
  if (amount && amount.unit === def.unit) {
    item.quantity = Math.max(1, Math.round(amount.amount / def.amount));
  } else if (!amount && def.unit === 'unit' && def.amount > 1 && item.quantity > 4) {
    item.quantity = Math.max(1, Math.round(item.quantity / def.amount));
  }
}
