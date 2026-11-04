import {
  applySharedOps,
  diffSharedItems,
  newItemId,
  sameSharedItem,
  SHARED_LIST_LIMITS,
  toSharedItem,
  type ListItem,
  type SharedItem,
  type SharedListSnapshot,
  type SharedOp,
  type SharedOpsResult,
} from '@pricing/core';

import { SharedListApiError, type SharedListApi } from '@/data/sharedListApi';
import type { StringKey } from '@/i18n';
import type { ItemsBridge } from '@/state/AppState';

/** Poll interval while the list screen is visible. */
export const POLL_MS = 4500;
/** Edits made within this time go to the server together. */
const FLUSH_DELAY_MS = 400;
/** Well under the server's 32 KB body limit. */
const MAX_CHUNK_BYTES = 16 * 1024;
const MAX_BACKOFF_MS = 60_000;

/** What is kept on the device for a shared list. */
export interface SharedListState {
  id: string;
  /** Server version of `confirmed`. */
  version: number;
  /** The list as the server last sent it. */
  confirmed: SharedItem[];
  /** Local edits the server hasn't confirmed yet, oldest first. Kept across restarts. */
  pending: SharedOp[];
  /** When the server last answered (ms). */
  syncedAt: number | null;
}

export type SyncStatus = 'synced' | 'syncing' | 'offline';
export interface SharedNotice { key: StringKey; vars?: Record<string, string | number> }

export interface SyncView {
  hydrated: boolean;
  id: string | null;
  status: SyncStatus;
  syncedAt: number | null;
  pendingCount: number;
  notice: SharedNotice | null;
}

export interface SyncStorage {
  load(): Promise<string | null>;
  save(value: string | null): Promise<void>;
}

export class ShareError extends Error {
  constructor(readonly notice: SharedNotice) { super(notice.key); }
}

const opBytes = (op: SharedOp) => JSON.stringify(op).length * 3; // Worst case UTF-8.

function takeChunk(pending: SharedOp[]): SharedOp[] {
  const chunk: SharedOp[] = [];
  let bytes = 0;
  for (const op of pending) {
    bytes += opBytes(op) + 1;
    if (chunk.length && (bytes > MAX_CHUNK_BYTES || chunk.length >= SHARED_LIST_LIMITS.maxOpsPerRequest)) break;
    chunk.push(op);
  }
  return chunk;
}

/** True when the local items already show exactly `items` (no sanitising needed either). */
function showsItems(local: ListItem[], items: SharedItem[]): boolean {
  return local.length === items.length && local.every((item, i) => sameSharedItem({ ...item, checked: item.checked === true }, items[i]!));
}

/**
 * Keeps the device's list in step with a shared list on the server.
 *
 * Invariant: local items == applySharedOps(confirmed, pending). Every local edit is
 * turned into item operations (by diffing), queued, persisted and sent in batches;
 * every server answer replaces `confirmed`, and the still-pending edits are re-applied
 * on top, so nothing typed on this phone is lost while offline. The server is the
 * judge of conflicts (rules on SharedOp in @pricing/core).
 */
export class SharedListSync {
  private state: SharedListState | null = null;
  private hydrated = false;
  private hydrating = false;
  /** Local edits made before hydration finished. */
  private dirty = false;
  /** Number of operations at the front of `pending` currently on their way to the server. */
  private inflight = 0;
  private running: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private retryAt = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private status: SyncStatus = 'synced';
  private notice: SharedNotice | null = null;
  private view: SyncView = { hydrated: false, id: null, status: 'synced', syncedAt: null, pendingCount: 0, notice: null };
  private subscribers = new Set<() => void>();

  constructor(private readonly api: SharedListApi, private readonly bridge: ItemsBridge, private readonly storage: SyncStorage) {}

  // --- React glue ---------------------------------------------------------------

  subscribe = (fn: () => void) => { this.subscribers.add(fn); return () => { this.subscribers.delete(fn); }; };
  getView = () => this.view;

  attach(): () => void {
    this.bridge.setListener((next) => this.onLocalChange(next));
    return () => this.bridge.setListener(null);
  }

  private emit() {
    const s = this.state;
    this.view = {
      hydrated: this.hydrated, id: s?.id ?? null, status: this.status, syncedAt: s?.syncedAt ?? null,
      pendingCount: s?.pending.length ?? 0, notice: this.notice,
    };
    for (const fn of this.subscribers) fn();
  }

  private persist() {
    this.storage.save(this.state ? JSON.stringify(this.state) : null).catch(() => {});
  }

  /** Call once the device's own list has loaded. */
  async hydrate(): Promise<void> {
    if (this.hydrated || this.hydrating) return;
    this.hydrating = true;
    try {
      const raw = await this.storage.load();
      const saved = raw ? (JSON.parse(raw) as SharedListState) : null;
      if (saved?.id && Array.isArray(saved.confirmed) && Array.isArray(saved.pending)) this.state = saved;
    } catch { /* Unreadable: carry on as a local list. */ }
    this.hydrated = true;
    this.hydrating = false;
    if (this.state) {
      if (this.dirty) this.onLocalChange(this.bridge.current()); // Keep edits made meanwhile.
      else this.rebase();
    }
    this.emit();
  }

  dismissNotice() { this.notice = null; this.emit(); }

  // --- Local edits ----------------------------------------------------------------

  private expected(): { items: SharedItem[]; rejected: number[] } {
    return applySharedOps(this.state!.confirmed, this.state!.pending);
  }

  private onLocalChange(next: ListItem[]) {
    if (!this.hydrated) { this.dirty = true; return; }
    const s = this.state;
    if (!s) return;
    const ops = diffSharedItems(this.expected().items, next.map(toSharedItem));
    if (!ops.length) { this.rebase(); return; }
    for (const op of ops) this.enqueue(s, op);
    this.rebase();
    this.persist();
    this.emit();
    this.scheduleFlush(FLUSH_DELAY_MS);
  }

  /** Queues an operation, merging it into the last queued one when that's not being sent yet. */
  private enqueue(s: SharedListState, op: SharedOp) {
    const q = s.pending;
    const last = q.length > this.inflight ? q[q.length - 1] : undefined;
    if (last && op.op === 'update') {
      if (last.op === 'update' && last.id === op.id) { q[q.length - 1] = { ...last, set: { ...last.set, ...op.set } }; return; }
      if (last.op === 'add' && last.item.id === op.id) { q[q.length - 1] = { op: 'add', item: { ...last.item, ...op.set } }; return; }
    }
    if (last && op.op === 'remove' && last.op === 'add' && last.item.id === op.id) { q.pop(); return; }
    q.push(op);
  }

  /**
   * Shows confirmed + pending on screen. Queued adds that can't fit (300 items) are
   * dropped here, with a notice, instead of failing later.
   */
  private rebase() {
    const s = this.state;
    if (!s) return;
    let { items, rejected } = this.expected();
    const droppable = rejected.filter((i) => i >= this.inflight);
    if (droppable.length) {
      for (const i of [...droppable].reverse()) s.pending.splice(i, 1);
      this.notice = { key: 'sharedListFull', vars: { n: SHARED_LIST_LIMITS.maxItems } };
      ({ items } = this.expected());
      this.persist();
    }
    if (!showsItems(this.bridge.current(), items)) this.bridge.replace(items);
  }

  // --- Network --------------------------------------------------------------------

  private scheduleFlush(delay: number) {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => { this.flushTimer = null; void this.sync(); }, delay);
  }

  /** Sends queued edits, or asks for changes when there are none. Calls never overlap. */
  sync(): Promise<void> {
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.step();
        } while (this.again && this.state && Date.now() >= this.retryAt);
      } finally { this.running = null; }
    })();
    return this.running;
  }

  private async step() {
    const s = this.state;
    if (!s || !this.hydrated || Date.now() < this.retryAt) return;
    if (s.pending.length) { this.status = 'syncing'; this.emit(); }
    try {
      if (s.pending.length) await this.push(s);
      else await this.pull(s);
      if (this.state !== s) return;
      this.failures = 0;
      this.retryAt = 0;
      this.status = 'synced';
    } catch (err) {
      if (this.state !== s) return;
      if (err instanceof SharedListApiError && err.status === 404) {
        // Expired or removed on the server: what's on screen stays, as a local list.
        this.state = null;
        this.status = 'synced';
        this.notice = { key: 'sharedGone' };
        this.persist();
      } else {
        this.failures += 1;
        const backoff = this.failures > 1 ? Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** (this.failures - 2)) : 0;
        const asked = err instanceof SharedListApiError && err.retryAfter ? err.retryAfter * 1000 : 0;
        this.retryAt = Date.now() + Math.max(backoff, asked);
        this.status = 'offline';
      }
    }
    this.emit();
  }

  private async push(s: SharedListState) {
    while (this.state === s && s.pending.length) {
      const chunk = takeChunk(s.pending);
      this.inflight = chunk.length;
      let result: SharedOpsResult;
      try {
        result = await this.api.ops(s.id, chunk);
      } catch (err) {
        this.inflight = 0;
        if (err instanceof SharedListApiError && err.status === 400 && this.state === s) {
          // Refused as invalid, so it would never succeed: drop that one edit, say so, go on.
          s.pending.splice(err.index !== undefined && err.index < chunk.length ? err.index : 0, 1);
          this.notice = { key: 'sharedDropped' };
          this.rebase();
          this.persist();
          continue;
        }
        throw err;
      }
      this.inflight = 0;
      if (this.state !== s) return;
      s.pending.splice(0, chunk.length);
      if (result.rejected.length) this.notice = { key: 'sharedListFull', vars: { n: SHARED_LIST_LIMITS.maxItems } };
      this.applyServer(s, result);
    }
  }

  private async pull(s: SharedListState) {
    const result = await this.api.get(s.id, s.version);
    if (this.state !== s) return;
    if ('unchanged' in result) { s.syncedAt = Date.now(); return; }
    this.applyServer(s, result);
  }

  /** Requests never overlap, so the latest answer is always the newest state (even if a
   * restored server database went back to a lower version). */
  private applyServer(s: SharedListState, list: SharedListSnapshot) {
    s.syncedAt = Date.now();
    s.confirmed = list.items;
    s.version = list.version;
    this.rebase();
    this.persist();
  }

  // --- Share, join, leave ---------------------------------------------------------

  /** Puts the current list on the server. Returns its id. */
  async share(): Promise<string> {
    if (this.state) return this.state.id;
    const seen = new Set<string>();
    const start = this.bridge.current().map(toSharedItem).map((item) => {
      const unique = seen.has(item.id) ? { ...item, id: newItemId() } : item;
      seen.add(unique.id);
      return unique;
    });
    if (start.length > SHARED_LIST_LIMITS.maxItems) throw new ShareError({ key: 'shareTooMany', vars: { n: SHARED_LIST_LIMITS.maxItems } });
    // A long list goes in several requests: the first creates it, the rest are queued adds.
    const adds: SharedOp[] = start.map((item) => ({ op: 'add', item }));
    const first = takeChunk(adds).map((op) => (op as { item: SharedItem }).item);
    let created: SharedListSnapshot;
    try { created = await this.api.create(first); }
    catch { throw new ShareError({ key: 'shareFailed' }); }
    const s: SharedListState = { id: created.id, version: created.version, confirmed: created.items, pending: adds.slice(first.length), syncedAt: Date.now() };
    this.state = s;
    this.inflight = 0;
    this.failures = 0;
    this.retryAt = 0;
    this.notice = null;
    // Edits made while the request was on its way.
    const ops = diffSharedItems(applySharedOps(start, []).items, this.bridge.current().map(toSharedItem));
    for (const op of ops) this.enqueue(s, op);
    this.rebase();
    this.persist();
    this.emit();
    if (s.pending.length) this.scheduleFlush(0);
    return s.id;
  }

  fetchList(id: string): Promise<SharedListSnapshot> {
    return this.api.get(id) as Promise<SharedListSnapshot>;
  }

  /** Makes `list` this device's list. The previous list is replaced (the screen asks first). */
  async join(list: SharedListSnapshot): Promise<void> {
    if (this.state?.id === list.id) return;
    if (this.state?.pending.length) await this.sync().catch(() => {}); // Last try to send edits to the old list.
    this.state = { id: list.id, version: list.version, confirmed: list.items, pending: [], syncedAt: Date.now() };
    this.inflight = 0;
    this.failures = 0;
    this.retryAt = 0;
    this.status = 'synced';
    this.notice = null;
    this.bridge.replace(list.items);
    this.persist();
    this.emit();
  }

  /** Stops sharing on this device; the items stay here as a normal list. */
  async leave(): Promise<void> {
    if (!this.state) return;
    if (this.state.pending.length) {
      this.retryAt = 0;
      await Promise.race([this.sync(), new Promise((resolve) => setTimeout(resolve, 4000))]).catch(() => {});
    }
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.state = null;
    this.status = 'synced';
    this.persist();
    this.emit();
  }
}
