import { CATEGORY_BY_ID } from './categories';
import type { BrandLevel, ListItem } from './types';

/**
 * Shared lists (F10) without accounts: the list id in the invite link is the only key.
 * This module is the wire protocol used by the API (ingest/src/api.ts) and the app:
 * limits, validation of every field, and the item operations both sides apply.
 */
export const SHARED_LIST_LIMITS = {
  /** Request body, in bytes. */
  maxBodyBytes: 32 * 1024,
  maxItems: 300,
  /** Characters (code points), after trimming. */
  maxTextLength: 120,
  maxBrandLength: 60,
  maxItemIdLength: 40,
  minQuantity: 1,
  maxQuantity: 99,
  maxOpsPerRequest: 100,
  /** Lists nobody opened or edited for this long are deleted. */
  ttlDays: 180,
} as const;

/** One list item as stored on the server. Every field is required on the wire. */
export interface SharedItem {
  id: string;
  text: string;
  categoryId: string | null;
  level: BrandLevel;
  quantity: number;
  checked: boolean;
}

export type SharedItemFields = Omit<SharedItem, 'id'>;
export type SharedItemPatch = Partial<SharedItemFields>;

/**
 * Item-level operations. Conflict rule: operations on different items never conflict;
 * an update only sets the fields it names (last write wins per field); removing wins
 * over a concurrent update; adding an id that already exists does nothing (safe retry).
 */
export type SharedOp =
  | { op: 'add'; item: SharedItem }
  | { op: 'update'; id: string; set: SharedItemPatch }
  | { op: 'remove'; id: string };

export interface SharedListSnapshot {
  id: string;
  /** Increases by one with every request that changed the list. */
  version: number;
  updatedAt: string;
  items: SharedItem[];
}

/** GET with ?since=<current version>: nothing changed, items left out. */
export interface SharedListUnchanged {
  id: string;
  version: number;
  updatedAt: string;
  unchanged: true;
}

export interface SharedOpsResult extends SharedListSnapshot {
  /** Operations not applied, by index in the request (only "list_full" today). */
  rejected: { index: number; error: 'list_full' }[];
}

/** 128 random bits, base64url without padding. */
export const SHARED_LIST_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
// C0/C1 control characters, line/paragraph separators, bidi overrides and BOM.
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/;

export function isSharedListId(value: unknown): value is string {
  return typeof value === 'string' && SHARED_LIST_ID_PATTERN.test(value);
}

export function isSharedItemId(value: unknown): value is string {
  return typeof value === 'string' && ITEM_ID_PATTERN.test(value);
}

/** Length in characters (code points), so an emoji counts once. */
export function textLength(text: string): number {
  return Array.from(text).length;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string; index?: number };

const fail = (error: string, index?: number): { ok: false; error: string; index?: number } =>
  index === undefined ? { ok: false, error } : { ok: false, error, index };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

/** Rejects any key that isn't allowed (including "__proto__" and friends). */
function unknownKey(value: Record<string, unknown>, allowed: readonly string[]): string | undefined {
  return Object.keys(value).find((k) => !allowed.includes(k));
}

function parseText(value: unknown, path: string, max: number, allowEmpty: boolean): Parsed<string> {
  if (typeof value !== 'string') return fail(`${path} must be a string`);
  if (FORBIDDEN_CHARS.test(value)) return fail(`${path} contains control characters`);
  const text = value.trim();
  if (!allowEmpty && !text) return fail(`${path} must not be empty`);
  if (textLength(text) > max) return fail(`${path} must be at most ${max} characters`);
  return { ok: true, value: text };
}

function parseLevel(value: unknown, path: string): Parsed<BrandLevel> {
  if (!isPlainObject(value)) return fail(`${path} must be an object`);
  if (value.kind === 'own' || value.kind === 'any') {
    if (unknownKey(value, ['kind'])) return fail(`${path} has an unknown field`);
    return { ok: true, value: { kind: value.kind } };
  }
  if (value.kind === 'specific') {
    if (unknownKey(value, ['kind', 'brand'])) return fail(`${path} has an unknown field`);
    const brand = parseText(value.brand, `${path}.brand`, SHARED_LIST_LIMITS.maxBrandLength, true);
    return brand.ok ? { ok: true, value: { kind: 'specific', brand: brand.value } } : brand;
  }
  return fail(`${path}.kind must be "own", "any" or "specific"`);
}

const FIELD_NAMES = ['text', 'categoryId', 'level', 'quantity', 'checked'] as const;

function parseField(name: (typeof FIELD_NAMES)[number], value: unknown, path: string): Parsed<unknown> {
  switch (name) {
    case 'text':
      return parseText(value, path, SHARED_LIST_LIMITS.maxTextLength, false);
    case 'categoryId':
      if (value === null) return { ok: true, value: null };
      return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATEGORY_BY_ID, value)
        ? { ok: true, value }
        : fail(`${path} must be null or a known category`);
    case 'level':
      return parseLevel(value, path);
    case 'quantity':
      return Number.isInteger(value) && (value as number) >= SHARED_LIST_LIMITS.minQuantity && (value as number) <= SHARED_LIST_LIMITS.maxQuantity
        ? { ok: true, value }
        : fail(`${path} must be a whole number from ${SHARED_LIST_LIMITS.minQuantity} to ${SHARED_LIST_LIMITS.maxQuantity}`);
    case 'checked':
      return typeof value === 'boolean' ? { ok: true, value } : fail(`${path} must be true or false`);
  }
}

export function parseSharedItem(value: unknown, path = 'item'): Parsed<SharedItem> {
  if (!isPlainObject(value)) return fail(`${path} must be an object`);
  if (unknownKey(value, ['id', ...FIELD_NAMES])) return fail(`${path} has an unknown field`);
  if (!isSharedItemId(value.id)) return fail(`${path}.id is not a valid item id`);
  const item: Record<string, unknown> = { id: value.id };
  for (const name of FIELD_NAMES) {
    if (!(name in value)) return fail(`${path}.${name} is required`);
    const field = parseField(name, value[name], `${path}.${name}`);
    if (!field.ok) return field;
    item[name] = field.value;
  }
  return { ok: true, value: item as unknown as SharedItem };
}

export function parseSharedPatch(value: unknown, path = 'set'): Parsed<SharedItemPatch> {
  if (!isPlainObject(value)) return fail(`${path} must be an object`);
  if (unknownKey(value, FIELD_NAMES)) return fail(`${path} has an unknown field`);
  const patch: Record<string, unknown> = {};
  for (const name of FIELD_NAMES) {
    if (!(name in value)) continue;
    const field = parseField(name, value[name], `${path}.${name}`);
    if (!field.ok) return field;
    patch[name] = field.value;
  }
  if (Object.keys(patch).length === 0) return fail(`${path} must change at least one field`);
  return { ok: true, value: patch as SharedItemPatch };
}

export function parseSharedOp(value: unknown, path = 'op'): Parsed<SharedOp> {
  if (!isPlainObject(value)) return fail(`${path} must be an object`);
  if (value.op === 'add') {
    if (unknownKey(value, ['op', 'item'])) return fail(`${path} has an unknown field`);
    const item = parseSharedItem(value.item, `${path}.item`);
    return item.ok ? { ok: true, value: { op: 'add', item: item.value } } : item;
  }
  if (value.op === 'update') {
    if (unknownKey(value, ['op', 'id', 'set'])) return fail(`${path} has an unknown field`);
    if (!isSharedItemId(value.id)) return fail(`${path}.id is not a valid item id`);
    const set = parseSharedPatch(value.set, `${path}.set`);
    return set.ok ? { ok: true, value: { op: 'update', id: value.id, set: set.value } } : set;
  }
  if (value.op === 'remove') {
    if (unknownKey(value, ['op', 'id'])) return fail(`${path} has an unknown field`);
    if (!isSharedItemId(value.id)) return fail(`${path}.id is not a valid item id`);
    return { ok: true, value: { op: 'remove', id: value.id } };
  }
  return fail(`${path}.op must be "add", "update" or "remove"`);
}

/** Body of POST /api/lists: { items: SharedItem[] } with unique ids. */
export function parseCreateBody(value: unknown): Parsed<{ items: SharedItem[] }> {
  if (!isPlainObject(value)) return fail('body must be an object');
  if (unknownKey(value, ['items'])) return fail('body has an unknown field');
  if (!Array.isArray(value.items)) return fail('items must be an array');
  if (value.items.length > SHARED_LIST_LIMITS.maxItems) return fail(`a list can have at most ${SHARED_LIST_LIMITS.maxItems} items`);
  const items: SharedItem[] = [];
  const ids = new Set<string>();
  for (const [index, raw] of value.items.entries()) {
    const item = parseSharedItem(raw, `items[${index}]`);
    if (!item.ok) return fail(item.error, index);
    if (ids.has(item.value.id)) return fail(`items[${index}].id is repeated`, index);
    ids.add(item.value.id);
    items.push(item.value);
  }
  return { ok: true, value: { items } };
}

/** Body of POST /api/lists/<id>/ops: { ops: SharedOp[] }, 1 to maxOpsPerRequest operations. */
export function parseOpsBody(value: unknown): Parsed<{ ops: SharedOp[] }> {
  if (!isPlainObject(value)) return fail('body must be an object');
  if (unknownKey(value, ['ops'])) return fail('body has an unknown field');
  if (!Array.isArray(value.ops) || value.ops.length === 0) return fail('ops must be a non-empty array');
  if (value.ops.length > SHARED_LIST_LIMITS.maxOpsPerRequest) return fail(`at most ${SHARED_LIST_LIMITS.maxOpsPerRequest} operations per request`);
  const ops: SharedOp[] = [];
  for (const [index, raw] of value.ops.entries()) {
    const op = parseSharedOp(raw, `ops[${index}]`);
    if (!op.ok) return fail(op.error, index);
    ops.push(op.value);
  }
  return { ok: true, value: { ops } };
}

function clampText(text: string, max: number): string {
  const clean = text.replace(new RegExp(FORBIDDEN_CHARS.source, 'g'), ' ').trim();
  return textLength(clean) > max ? Array.from(clean).slice(0, max).join('').trim() : clean;
}

/**
 * A local list item made valid for sharing: text and brand shortened, quantity kept in
 * 1-99, unknown categories dropped, item ids that aren't URL-safe replaced.
 */
export function toSharedItem(item: ListItem): SharedItem {
  const text = clampText(item.text, SHARED_LIST_LIMITS.maxTextLength);
  const categoryId = item.categoryId && Object.prototype.hasOwnProperty.call(CATEGORY_BY_ID, item.categoryId) ? item.categoryId : null;
  const level: BrandLevel = item.level.kind === 'specific'
    ? { kind: 'specific', brand: clampText(item.level.brand, SHARED_LIST_LIMITS.maxBrandLength) }
    : { kind: item.level.kind };
  const quantity = Math.min(SHARED_LIST_LIMITS.maxQuantity, Math.max(SHARED_LIST_LIMITS.minQuantity, Math.round(item.quantity) || 1));
  return {
    id: ITEM_ID_PATTERN.test(item.id) ? item.id : item.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, SHARED_LIST_LIMITS.maxItemIdLength) || 'item',
    text: text || (categoryId ?? '?'),
    categoryId,
    level,
    quantity,
    checked: item.checked === true,
  };
}

function sameLevel(a: BrandLevel, b: BrandLevel): boolean {
  return a.kind === b.kind && (a.kind !== 'specific' || a.brand === (b as { brand: string }).brand);
}

export function sameSharedItem(a: SharedItem, b: SharedItem): boolean {
  return a.id === b.id && a.text === b.text && a.categoryId === b.categoryId && sameLevel(a.level, b.level)
    && a.quantity === b.quantity && a.checked === b.checked;
}

export function sameSharedItems(a: readonly SharedItem[], b: readonly SharedItem[]): boolean {
  return a.length === b.length && a.every((item, i) => sameSharedItem(item, b[i]!));
}

/**
 * Applies operations in order, with the server's rules (see SharedOp). Returns the new
 * items and the indexes of adds rejected because the list was full.
 */
export function applySharedOps(
  items: readonly SharedItem[],
  ops: readonly SharedOp[],
  maxItems: number = SHARED_LIST_LIMITS.maxItems,
): { items: SharedItem[]; rejected: number[] } {
  const next = items.map((i) => ({ ...i }));
  const rejected: number[] = [];
  ops.forEach((op, index) => {
    if (op.op === 'add') {
      if (next.some((i) => i.id === op.item.id)) return;
      if (next.length >= maxItems) { rejected.push(index); return; }
      next.push({ ...op.item });
    } else if (op.op === 'update') {
      const at = next.findIndex((i) => i.id === op.id);
      if (at >= 0) next[at] = { ...next[at]!, ...op.set };
    } else {
      const at = next.findIndex((i) => i.id === op.id);
      if (at >= 0) next.splice(at, 1);
    }
  });
  return { items: next, rejected };
}

/** Operations that turn `before` into `after` (removes, then updates of changed fields only, then adds). */
export function diffSharedItems(before: readonly SharedItem[], after: readonly SharedItem[]): SharedOp[] {
  const ops: SharedOp[] = [];
  const afterById = new Map(after.map((i) => [i.id, i]));
  const beforeById = new Map(before.map((i) => [i.id, i]));
  for (const old of before) if (!afterById.has(old.id)) ops.push({ op: 'remove', id: old.id });
  for (const item of after) {
    const old = beforeById.get(item.id);
    if (!old) continue;
    const set: SharedItemPatch = {};
    if (old.text !== item.text) set.text = item.text;
    if (old.categoryId !== item.categoryId) set.categoryId = item.categoryId;
    if (!sameLevel(old.level, item.level)) set.level = item.level;
    if (old.quantity !== item.quantity) set.quantity = item.quantity;
    if (old.checked !== item.checked) set.checked = item.checked;
    if (Object.keys(set).length) ops.push({ op: 'update', id: item.id, set });
  }
  for (const item of after) if (!beforeById.has(item.id)) ops.push({ op: 'add', item });
  return ops;
}
