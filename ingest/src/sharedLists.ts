import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  SHARED_LIST_LIMITS,
  type BrandLevel,
  type SharedItem,
  type SharedItemPatch,
  type SharedListSnapshot,
  type SharedListUnchanged,
  type SharedOp,
  type SharedOpsResult,
} from '@pricing/core';

/**
 * Shared lists in SQLite (tables in database.ts). Inputs must already be validated with
 * the parsers in @pricing/core (sharedList.ts); the table CHECKs are a second line.
 * Nothing here logs or stores anything about who uses a list.
 */

const DAY_MS = 86_400_000;
/** Opening a list refreshes its expiry at most this often (avoids a write per poll). */
const TOUCH_INTERVAL_MS = DAY_MS;

export class ListFullError extends Error {
  constructor() { super('list_full'); }
}

/** 128 random bits, base64url: 22 characters, never sequential. */
export function newSharedListId(): string {
  return randomBytes(16).toString('base64url');
}

function expiryCutoff(now: Date): string {
  return new Date(now.getTime() - SHARED_LIST_LIMITS.ttlDays * DAY_MS).toISOString();
}

function rowToItem(r: Record<string, unknown>): SharedItem {
  const level: BrandLevel = r.level_kind === 'specific'
    ? { kind: 'specific', brand: (r.brand as string | null) ?? '' }
    : { kind: r.level_kind as 'own' | 'any' };
  return {
    id: r.item_id as string,
    text: r.text as string,
    categoryId: (r.category_id as string | null) ?? null,
    level,
    quantity: Number(r.quantity),
    checked: Number(r.checked) === 1,
  };
}

function readItems(db: DatabaseSync, listId: string): SharedItem[] {
  return db.prepare('SELECT * FROM shared_list_items WHERE list_id=? ORDER BY position, item_id').all(listId).map(rowToItem);
}

function insertItem(db: DatabaseSync, listId: string, item: SharedItem, position: number, at: string) {
  db.prepare(`INSERT INTO shared_list_items
    (list_id,item_id,position,text,category_id,level_kind,brand,quantity,checked,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(listId, item.id, position, item.text, item.categoryId, item.level.kind,
      item.level.kind === 'specific' ? item.level.brand : null, item.quantity, item.checked ? 1 : 0, at);
}

function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function countSharedLists(db: DatabaseSync): number {
  return Number(db.prepare('SELECT COUNT(*) AS n FROM shared_lists').get()?.n ?? 0);
}

export function createSharedList(db: DatabaseSync, items: SharedItem[], now = new Date()): SharedListSnapshot {
  if (items.length > SHARED_LIST_LIMITS.maxItems) throw new ListFullError();
  const at = now.toISOString();
  const id = newSharedListId();
  transaction(db, () => {
    db.prepare('INSERT INTO shared_lists (id,version,created_at,updated_at,accessed_at) VALUES(?,1,?,?,?)').run(id, at, at, at);
    items.forEach((item, i) => insertItem(db, id, item, i + 1, at));
  });
  return { id, version: 1, updatedAt: at, items: readItems(db, id) };
}

interface ListRow { version: number; updatedAt: string; accessedAt: string }

function listRow(db: DatabaseSync, id: string, now: Date): ListRow | null {
  const row = db.prepare('SELECT version, updated_at, accessed_at FROM shared_lists WHERE id=?').get(id);
  if (!row) return null;
  // Expired but not cleaned up yet: behave as if it was already deleted.
  if ((row.accessed_at as string) < expiryCutoff(now)) return null;
  return { version: Number(row.version), updatedAt: row.updated_at as string, accessedAt: row.accessed_at as string };
}

/**
 * The list, or only its version when it hasn't changed since `since`. Null when the list
 * doesn't exist or has expired. Opening a list keeps it alive (written at most once a day).
 */
export function getSharedList(db: DatabaseSync, id: string, now = new Date(), since?: number): SharedListSnapshot | SharedListUnchanged | null {
  const row = listRow(db, id, now);
  if (!row) return null;
  if (Date.parse(row.accessedAt) < now.getTime() - TOUCH_INTERVAL_MS) {
    // Best effort: a busy database (the daily import) must not fail a read.
    try { db.prepare('UPDATE shared_lists SET accessed_at=? WHERE id=?').run(now.toISOString(), id); } catch { /* next time */ }
  }
  if (since === row.version) return { id, version: row.version, updatedAt: row.updatedAt, unchanged: true };
  return { id, version: row.version, updatedAt: row.updatedAt, items: readItems(db, id) };
}

const COLUMNS: Record<keyof SharedItemPatch, (patch: SharedItemPatch) => [string, unknown][]> = {
  text: (p) => [['text', p.text]],
  categoryId: (p) => [['category_id', p.categoryId]],
  level: (p) => [['level_kind', p.level!.kind], ['brand', p.level!.kind === 'specific' ? p.level!.brand : null]],
  quantity: (p) => [['quantity', p.quantity]],
  checked: (p) => [['checked', p.checked ? 1 : 0]],
};

/**
 * Applies validated operations in one transaction, in order (rules on SharedOp in
 * @pricing/core). Adds beyond the item limit are skipped and reported in `rejected`.
 * The version goes up by one if anything changed. Null when the list doesn't exist.
 */
export function applySharedListOps(db: DatabaseSync, id: string, ops: SharedOp[], now = new Date()): SharedOpsResult | null {
  const at = now.toISOString();
  return transaction(db, () => {
    const row = listRow(db, id, now);
    if (!row) return null;
    const rejected: SharedOpsResult['rejected'] = [];
    let changed = false;
    let count = Number(db.prepare('SELECT COUNT(*) AS n FROM shared_list_items WHERE list_id=?').get(id)?.n ?? 0);
    let position = Number(db.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM shared_list_items WHERE list_id=?').get(id)?.p ?? 0);
    const exists = db.prepare('SELECT 1 AS x FROM shared_list_items WHERE list_id=? AND item_id=?');
    ops.forEach((op, index) => {
      if (op.op === 'add') {
        if (exists.get(id, op.item.id)) return; // Retried request: already added.
        if (count >= SHARED_LIST_LIMITS.maxItems) { rejected.push({ index, error: 'list_full' }); return; }
        position += 1;
        count += 1;
        insertItem(db, id, op.item, position, at);
        changed = true;
      } else if (op.op === 'update') {
        const pairs = (Object.keys(op.set) as (keyof SharedItemPatch)[])
          .filter((k) => Object.prototype.hasOwnProperty.call(COLUMNS, k)).flatMap((k) => COLUMNS[k](op.set));
        if (!pairs.length) return;
        const result = db.prepare(`UPDATE shared_list_items SET ${pairs.map(([c]) => `${c}=?`).join(',')}, updated_at=?
          WHERE list_id=? AND item_id=?`).run(...pairs.map(([, v]) => v as string | number | null), at, id, op.id);
        if (Number(result.changes) > 0) changed = true; // An item removed by someone else stays removed.
      } else {
        const result = db.prepare('DELETE FROM shared_list_items WHERE list_id=? AND item_id=?').run(id, op.id);
        if (Number(result.changes) > 0) { changed = true; count -= 1; }
      }
    });
    const version = changed ? row.version + 1 : row.version;
    const updatedAt = changed ? at : row.updatedAt;
    db.prepare('UPDATE shared_lists SET version=?, updated_at=?, accessed_at=? WHERE id=?').run(version, updatedAt, at, id);
    return { id, version, updatedAt, items: readItems(db, id), rejected };
  });
}

/** Deletes lists not opened or edited for `ttlDays` (items go with them). Returns how many. */
export function deleteExpiredSharedLists(db: DatabaseSync, now = new Date()): number {
  return Number(db.prepare('DELETE FROM shared_lists WHERE accessed_at < ?').run(expiryCutoff(now)).changes);
}
