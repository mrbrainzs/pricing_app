import { describe, expect, it } from 'vitest';
import {
  applySharedOps,
  diffSharedItems,
  isSharedListId,
  makeListItem,
  newItemId,
  parseOpsBody,
  parseSharedItem,
  SHARED_LIST_LIMITS,
  textLength,
  toSharedItem,
  type SharedItem,
} from '../src';

const item = (id: string, patch: Partial<SharedItem> = {}): SharedItem => ({
  id, text: 'llet', categoryId: 'milk', level: { kind: 'any' }, quantity: 1, checked: false, ...patch,
});

describe('shared lists', () => {
  it('makes any local item valid for sharing', () => {
    const local = { ...makeListItem('llet'), quantity: 250, text: `  ${'a'.repeat(130)}\u0007 `, level: { kind: 'specific' as const, brand: 'b'.repeat(70) } };
    const shared = toSharedItem(local);
    expect(parseSharedItem(shared).ok).toBe(true);
    expect(shared.quantity).toBe(SHARED_LIST_LIMITS.maxQuantity);
    expect(textLength(shared.text)).toBe(120);
    expect(shared.checked).toBe(false);
    expect(toSharedItem({ ...local, categoryId: 'retired-category' }).categoryId).toBeNull();
    expect(toSharedItem({ ...local, id: 'weird id/1' }).id).toBe('weirdid1');
    expect(textLength('🍅🍅')).toBe(2);
  });

  it('item ids from different phones do not collide', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newItemId()));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(parseSharedItem(item(id)).ok).toBe(true);
  });

  it('applies operations with the server rules', () => {
    const start = [item('a'), item('b')];
    const { items, rejected } = applySharedOps(start, [
      { op: 'update', id: 'a', set: { checked: true } },
      { op: 'remove', id: 'b' },
      { op: 'update', id: 'b', set: { quantity: 5 } }, // removed: ignored
      { op: 'add', item: item('a', { text: 'dup' }) }, // exists: ignored
      { op: 'add', item: item('c') },
      { op: 'add', item: item('d') },
    ], 2);
    expect(items).toEqual([item('a', { checked: true }), item('c')]);
    expect(rejected).toEqual([5]);
    expect(start[0]!.checked).toBe(false); // Input untouched.
  });

  it('diffs only the fields that changed', () => {
    expect(diffSharedItems([item('a')], [item('a', { quantity: 2 })])).toEqual([{ op: 'update', id: 'a', set: { quantity: 2 } }]);
    expect(diffSharedItems([item('a')], [item('a')])).toEqual([]);
  });

  it('validates list ids and operation batches', () => {
    expect(isSharedListId('AAAAAAAAAAAAAAAAAAAAAA')).toBe(true);
    expect(isSharedListId('AAAAAAAAAAAAAAAAAAAAA')).toBe(false);
    expect(isSharedListId('AAAAAAAAAAAAAAAAAAAAA/')).toBe(false);
    const bad = parseOpsBody({ ops: [{ op: 'remove', id: 'a' }, { op: 'add', item: { ...item('b'), quantity: 0 } }] });
    expect(bad).toMatchObject({ ok: false, index: 1 });
  });
});
