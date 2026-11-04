import { CATEGORY_BY_ID } from './categories';
import { CHAINS } from './chains';
import type { StoreBasket } from './compare';
import type { ChainId, Lang, ListItem } from './types';

/**
 * F11 share card: a summary of one comparison result packed into a URL-safe string, so a
 * link like `/r/<data>` can show the card to anyone, without the app and without storing
 * anything on a server.
 *
 * Format v1: the character "1", then base64url (no padding) of the UTF-8 JSON array
 *   [lang, chain, store, totalCents, found, requested, savingCents|null, nextChain|null,
 *    rank, stores, yyyymmdd, flags, lines]
 * where each line is [costCents, quantity, categoryId] for a catalogue item (names are then
 * shown in the viewer's language) or [costCents, quantity, "", text] for free text.
 * flags: bit 0 = sample prices.
 *
 * Links are untrusted input: decoding checks every field, clamps numbers and lengths, strips
 * control and bidi characters, and rejects anything else. The card is only ever rendered as
 * plain text.
 */

export const SHARE_CARD_VERSION = '1';

export const SHARE_CARD_LIMITS = {
  /** Characters kept from the store name. */
  storeName: 60,
  /** Characters kept from a free-text item. */
  itemText: 40,
  /** Item lines on the card (the most expensive ones). */
  lines: 6,
  /** Encoded data longer than this drops item lines until it fits (keeps links < ~1300 chars). */
  maxEncodedLength: 1200,
  /** Input longer than this is rejected before decoding. */
  maxInputLength: 4000,
  /** Largest amount accepted, in euros. */
  maxAmount: 10_000,
  maxCount: 999,
  maxQuantity: 99,
  maxStores: 99,
} as const;

export interface ShareCardLine {
  /** Generic item from the catalogue, or null for free text. */
  categoryId: string | null;
  /** What the user typed; only used (and only encoded) when categoryId is null. */
  text: string;
  quantity: number;
  /** What this line costs at the store, in euros. */
  cost: number;
}

export interface ShareCard {
  /** Language the card was shared in (the viewer can switch). */
  lang: Lang;
  chain: ChainId;
  store: string;
  /** What the found items cost at this store, in euros. */
  total: number;
  found: number;
  requested: number;
  /** How much more the next store in the ranking costs; null when there is none. */
  saving: number | null;
  nextChain: ChainId | null;
  /** Position in the ranking (1 = cheapest). */
  rank: number;
  /** How many stores were ranked. */
  stores: number;
  /** Local date of the comparison, YYYY-MM-DD. */
  date: string;
  /** True when the comparison used made-up sample prices. */
  sample: boolean;
  /** The most expensive lines, most expensive first. */
  lines: ShareCardLine[];
}

export type ShareCardError = 'empty' | 'too_long' | 'unsupported_version' | 'malformed';

export type ShareCardDecodeResult = { ok: true; card: ShareCard } | { ok: false; error: ShareCardError };

const LANGS: readonly Lang[] = ['ca', 'es', 'en'];

const has = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const isChain = (v: unknown): v is ChainId => typeof v === 'string' && has(CHAINS, v);
const isCategory = (v: unknown): v is string => typeof v === 'string' && has(CATEGORY_BY_ID, v);

// ---------------------------------------------------------------------------
// Text and number hygiene

/** C0/C1 controls, zero-width and bidirectional formatting characters (spoofing risk). */
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;

/** Plain, single-line text of at most `max` characters (code points, never a split surrogate pair). */
export function cleanShareText(value: string, max: number): string {
  const chars: string[] = [];
  for (const ch of value.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim()) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) continue; // lone surrogate
    chars.push(ch);
    if (chars.length >= max) break;
  }
  return chars.join('').trim();
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const toCents = (euros: number) => Math.round(clamp(euros, 0, SHARE_CARD_LIMITS.maxAmount) * 100);
const fromCents = (cents: number) => clamp(Math.round(cents), 0, SHARE_CARD_LIMITS.maxAmount * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const toInt = (v: unknown, min: number, max: number): number | null => (isNum(v) ? clamp(Math.round(v), min, max) : null);

function dateToInt(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid share card date: ${date}`);
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

function intToDate(n: unknown): string | null {
  if (!isNum(n) || !Number.isInteger(n)) return null;
  const y = Math.floor(n / 10000);
  const mo = Math.floor((n % 10000) / 100);
  const d = n % 100;
  if (y < 2024 || y > 2100) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// UTF-8 + base64url (no platform APIs: works the same in Node, browsers and Hermes)

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

function utf8Encode(s: string): number[] {
  const bytes: number[] = [];
  const enc = encodeURIComponent(s);
  for (let i = 0; i < enc.length; i++) {
    if (enc[i] === '%') {
      bytes.push(parseInt(enc.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(enc.charCodeAt(i));
    }
  }
  return bytes;
}

/** Throws on invalid UTF-8. */
function utf8Decode(bytes: number[]): string {
  return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, '0')}`).join(''));
}

function base64UrlEncode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let j = 0; j < chars; j++) out += B64[(n >> (18 - 6 * j)) & 63];
  }
  return out;
}

/** Returns null for characters outside the alphabet or an impossible length. */
function base64UrlDecode(s: string): number[] | null {
  if (s.length % 4 === 1) return null;
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const chunk = s.slice(i, i + 4);
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const v = j < chunk.length ? B64_INDEX.get(chunk[j]!) : 0;
      if (v === undefined) return null;
      n = (n << 6) | v;
    }
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Encode

function lineTuple(line: ShareCardLine): unknown[] {
  const cents = toCents(line.cost);
  const qty = clamp(Math.round(line.quantity), 1, SHARE_CARD_LIMITS.maxQuantity);
  if (line.categoryId && isCategory(line.categoryId)) return [cents, qty, line.categoryId];
  return [cents, qty, '', cleanShareText(line.text, SHARE_CARD_LIMITS.itemText)];
}

function pack(card: ShareCard, lines: ShareCardLine[]): string {
  const stores = clamp(Math.round(card.stores), 1, SHARE_CARD_LIMITS.maxStores);
  const found = clamp(Math.round(card.found), 0, SHARE_CARD_LIMITS.maxCount);
  const tuple = [
    card.lang,
    card.chain,
    cleanShareText(card.store, SHARE_CARD_LIMITS.storeName),
    toCents(card.total),
    found,
    clamp(Math.round(card.requested), found, SHARE_CARD_LIMITS.maxCount),
    card.saving === null ? null : toCents(card.saving),
    card.saving === null ? null : card.nextChain,
    clamp(Math.round(card.rank), 1, stores),
    stores,
    dateToInt(card.date),
    card.sample ? 1 : 0,
    lines.map(lineTuple),
  ];
  return SHARE_CARD_VERSION + base64UrlEncode(utf8Encode(JSON.stringify(tuple)));
}

/**
 * Packs a card into a URL-safe string. Long names are shortened, and item lines are dropped
 * (least expensive first) until the result fits `SHARE_CARD_LIMITS.maxEncodedLength`.
 */
export function encodeShareCard(card: ShareCard): string {
  if (!LANGS.includes(card.lang)) throw new Error(`Invalid share card language: ${card.lang}`);
  if (!isChain(card.chain)) throw new Error(`Invalid share card chain: ${card.chain}`);
  if (card.nextChain !== null && !isChain(card.nextChain)) throw new Error(`Invalid share card chain: ${card.nextChain}`);
  let lines = card.lines.slice(0, SHARE_CARD_LIMITS.lines);
  let encoded = pack(card, lines);
  while (encoded.length > SHARE_CARD_LIMITS.maxEncodedLength && lines.length > 0) {
    lines = lines.slice(0, -1);
    encoded = pack(card, lines);
  }
  return encoded;
}

// ---------------------------------------------------------------------------
// Decode

function readLine(raw: unknown): ShareCardLine | null {
  if (!Array.isArray(raw)) return null;
  const [cents, qty, categoryId, text] = raw as unknown[];
  if (!isNum(cents)) return null;
  const quantity = toInt(qty, 1, SHARE_CARD_LIMITS.maxQuantity);
  if (quantity === null) return null;
  const cost = fromCents(cents);
  if (isCategory(categoryId)) return { categoryId, text: '', quantity, cost };
  if (typeof text !== 'string') return null;
  const clean = cleanShareText(text, SHARE_CARD_LIMITS.itemText);
  return clean ? { categoryId: null, text: clean, quantity, cost } : null;
}

/** Reads a link's data. Never throws: bad input gives `{ ok: false, error }`. */
export function decodeShareCard(input: string | null | undefined): ShareCardDecodeResult {
  if (typeof input !== 'string') return { ok: false, error: 'empty' };
  const trimmed = input.trim();
  if (trimmed.length > SHARE_CARD_LIMITS.maxInputLength) return { ok: false, error: 'too_long' };
  // Chat apps sometimes glue punctuation to the end of a link (a linear scan, no regex backtracking).
  let end = trimmed.length;
  while (end > 0 && !B64_INDEX.has(trimmed[end - 1]!)) end--;
  const data = trimmed.slice(0, end);
  if (!data) return { ok: false, error: 'empty' };
  // Versions are one digit; a different digit is a link from a newer (or older) app.
  if (data[0] !== SHARE_CARD_VERSION) return { ok: false, error: /^[0-9]/.test(data) ? 'unsupported_version' : 'malformed' };

  const bytes = base64UrlDecode(data.slice(1));
  if (!bytes) return { ok: false, error: 'malformed' };
  let raw: unknown;
  try {
    raw = JSON.parse(utf8Decode(bytes));
  } catch {
    return { ok: false, error: 'malformed' };
  }
  if (!Array.isArray(raw) || raw.length < 13) return { ok: false, error: 'malformed' };
  const [lang, chain, store, totalCents, foundRaw, requestedRaw, savingCents, nextChain, rankRaw, storesRaw, dateRaw, flags, lines] = raw as unknown[];

  if (typeof lang !== 'string' || !LANGS.includes(lang as Lang)) return { ok: false, error: 'malformed' };
  if (!isChain(chain)) return { ok: false, error: 'malformed' };
  if (typeof store !== 'string') return { ok: false, error: 'malformed' };
  const storeName = cleanShareText(store, SHARE_CARD_LIMITS.storeName) || CHAINS[chain].name;
  if (!isNum(totalCents)) return { ok: false, error: 'malformed' };
  const found = toInt(foundRaw, 0, SHARE_CARD_LIMITS.maxCount);
  const requested = toInt(requestedRaw, 0, SHARE_CARD_LIMITS.maxCount);
  const stores = toInt(storesRaw, 1, SHARE_CARD_LIMITS.maxStores);
  const rank = toInt(rankRaw, 1, SHARE_CARD_LIMITS.maxStores);
  const date = intToDate(dateRaw);
  if (found === null || requested === null || stores === null || rank === null || date === null) return { ok: false, error: 'malformed' };
  if (savingCents !== null && !isNum(savingCents)) return { ok: false, error: 'malformed' };
  if (!Array.isArray(lines)) return { ok: false, error: 'malformed' };

  const saving = savingCents === null ? null : fromCents(savingCents);
  return {
    ok: true,
    card: {
      lang: lang as Lang,
      chain,
      store: storeName,
      total: fromCents(totalCents),
      found,
      requested: Math.max(found, requested),
      saving,
      nextChain: saving !== null && isChain(nextChain) ? nextChain : null,
      rank: Math.min(rank, stores),
      stores,
      date,
      sample: isNum(flags) && (flags & 1) === 1,
      lines: lines
        .slice(0, SHARE_CARD_LIMITS.lines)
        .map(readLine)
        .filter((l): l is ShareCardLine => l !== null),
    },
  };
}

// ---------------------------------------------------------------------------
// From a comparison result

export interface ShareCardInput {
  /** `compareBasket(...).ranking`. */
  ranking: StoreBasket[];
  /** Which basket in the ranking to share. */
  index: number;
  items: ListItem[];
  lang: Lang;
  /** Local date, YYYY-MM-DD. */
  date: string;
  sample: boolean;
}

/** Builds the card for one store of a comparison: its total, gap to the next store and priciest lines. */
export function shareCardFromRanking({ ranking, index, items, lang, date, sample }: ShareCardInput): ShareCard {
  const basket = ranking[index];
  if (!basket) throw new Error(`No basket at index ${index}`);
  const next = ranking[index + 1];
  const byId = new Map(items.map((i) => [i.id, i]));
  const lines = [...basket.lines]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, SHARE_CARD_LIMITS.lines)
    .map((line): ShareCardLine => {
      const item = byId.get(line.itemId);
      const categoryId = item?.categoryId ?? null;
      return {
        categoryId,
        text: categoryId ? '' : item?.text ?? line.product.name,
        quantity: item?.quantity ?? 1,
        cost: line.cost,
      };
    });
  return {
    lang,
    chain: basket.store.chain,
    store: basket.store.name,
    total: basket.total,
    found: basket.found,
    requested: basket.requested,
    saving: next && basket.diffToNext !== null && basket.diffToNext > 0 ? basket.diffToNext : null,
    nextChain: next && basket.diffToNext !== null && basket.diffToNext > 0 ? next.store.chain : null,
    rank: index + 1,
    stores: ranking.length,
    date,
    sample,
    lines,
  };
}

/** Item name to show for a card line, in the viewer's language. */
export function shareLineName(line: ShareCardLine, lang: Lang): string {
  return isCategory(line.categoryId) ? CATEGORY_BY_ID[line.categoryId]!.names[lang] : line.text;
}
