import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SharedItem, SharedListSnapshot, SharedOpsResult } from '@pricing/core';
import { createApiHandler, type ApiHandler, type WriteLimits } from '../src/api';
import { openDatabase } from '../src/database';
import { addressKey, RateLimiter } from '../src/rateLimit';

const DAY = 86_400_000;
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn(); });

interface Fixture { base: string; db: DatabaseSync; handler: ApiHandler; clock: { now: number } }

async function start(limits: Partial<WriteLimits> = {}): Promise<Fixture> {
  const dir = mkdtempSync(join(tmpdir(), 'quinsuper-lists-'));
  const db = openDatabase(join(dir, 'prices.sqlite'));
  const clock = { now: Date.parse('2026-11-04T10:00:00Z') };
  const handler = createApiHandler(db, { release: 'test', now: () => new Date(clock.now), limits });
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => { rmSync(dir, { recursive: true, force: true }); });
  cleanups.push(() => db.close());
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, db, handler, clock };
}

const item = (id: string, patch: Partial<SharedItem> = {}): SharedItem => ({
  id, text: 'llet', categoryId: 'milk', level: { kind: 'any' }, quantity: 1, checked: false, ...patch,
});

const JSON_HEADERS = { 'content-type': 'application/json' };

async function call(base: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? headers : { ...JSON_HEADERS, ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}

async function create(base: string, items: SharedItem[] = [item('a')], headers: Record<string, string> = {}) {
  const res = await call(base, 'POST', '/api/lists', { items }, headers);
  expect(res.status).toBe(201);
  return res.body as SharedListSnapshot;
}

/** Sends a body in chunks without Content-Length (chunked transfer encoding). */
function chunked(base: string, path: string, chunks: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(base + path, { method: 'POST', headers: JSON_HEADERS }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
    req.on('error', reject);
    for (const c of chunks) req.write(c);
    req.end();
  });
}

describe('shared lists API', () => {
  it('creates a list with an unguessable id and returns it with a version', async () => {
    const { base } = await start();
    const a = await create(base, [item('a'), item('b', { text: 'ous', categoryId: 'eggs', quantity: 12 })]);
    const b = await create(base);
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a.id).not.toBe(b.id);
    expect(a.version).toBe(1);
    const got = await call(base, 'GET', `/api/lists/${a.id}`);
    expect(got.status).toBe(200);
    expect(got.body.items).toEqual([item('a'), item('b', { text: 'ous', categoryId: 'eggs', quantity: 12 })]);
    expect(got.headers.get('cache-control')).toBe('no-store');
    expect((await call(base, 'GET', `/api/lists/${a.id}?since=1`)).body).toEqual({ id: a.id, version: 1, updatedAt: a.updatedAt, unchanged: true });
  });

  it('applies item operations so people editing different items or fields never overwrite each other', async () => {
    const { base } = await start();
    const list = await create(base, [item('a'), item('b', { text: 'pa', categoryId: 'bread_sliced' })]);
    // Two phones, both still on version 1: one ticks "a", the other changes its quantity and removes "b".
    const one = await call(base, 'POST', `/api/lists/${list.id}/ops`, { ops: [{ op: 'update', id: 'a', set: { checked: true } }] });
    const two = await call(base, 'POST', `/api/lists/${list.id}/ops`, {
      ops: [{ op: 'update', id: 'a', set: { quantity: 3 } }, { op: 'remove', id: 'b' }, { op: 'add', item: item('c', { text: 'Tomàquets 🍅', categoryId: 'tomatoes' }) }],
    });
    expect(one.body.version).toBe(2);
    expect(two.status).toBe(200);
    expect(two.body.version).toBe(3);
    expect(two.body.rejected).toEqual([]);
    expect(two.body.items).toEqual([item('a', { checked: true, quantity: 3 }), item('c', { text: 'Tomàquets 🍅', categoryId: 'tomatoes' })]);
    // Removal wins over a late update; a retried add doesn't duplicate; no change keeps the version.
    const late = await call(base, 'POST', `/api/lists/${list.id}/ops`, {
      ops: [{ op: 'update', id: 'b', set: { checked: true } }, { op: 'add', item: item('c') }, { op: 'remove', id: 'zzz' }],
    });
    expect(late.body.version).toBe(3);
    expect(late.body.items.map((i: SharedItem) => i.id)).toEqual(['a', 'c']);
    expect((await call(base, 'GET', `/api/lists/${list.id}?since=1`)).body.items).toHaveLength(2);
  });

  it('offers single-item endpoints with the same rules', async () => {
    const { base } = await start();
    const list = await create(base, []);
    const added = await call(base, 'POST', `/api/lists/${list.id}/items`, item('x', { level: { kind: 'specific', brand: 'Pascual' } }));
    expect(added.status).toBe(200);
    expect(added.body.items[0].level).toEqual({ kind: 'specific', brand: 'Pascual' });
    const patched = await call(base, 'PATCH', `/api/lists/${list.id}/items/x`, { level: { kind: 'own' }, text: 'llet sencera' });
    expect(patched.body.items[0]).toEqual(item('x', { level: { kind: 'own' }, text: 'llet sencera' }));
    const removed = await call(base, 'DELETE', `/api/lists/${list.id}/items/x`);
    expect(removed.body.items).toEqual([]);
    expect(removed.body.version).toBe(4);
    expect((await call(base, 'DELETE', `/api/lists/${list.id}/items/x`)).status).toBe(200);
    expect((await call(base, 'PUT', `/api/lists/${list.id}/items/x`, {})).status).toBe(405);
  });

  it('caps a list at 300 items', async () => {
    const { base } = await start();
    const full = Array.from({ length: 300 }, (_, i) => item(`i${i}`, { text: 'x' }));
    const tooMany = await call(base, 'POST', '/api/lists', { items: [...full, item('one-more', { text: 'x' })] });
    expect(tooMany.status).toBe(400);
    const list = await create(base, full);
    expect(list.items).toHaveLength(300);
    const ops = await call(base, 'POST', `/api/lists/${list.id}/ops`, { ops: [{ op: 'remove', id: 'i0' }, { op: 'add', item: item('n1') }, { op: 'add', item: item('n2') }] });
    expect(ops.body.rejected).toEqual([{ index: 2, error: 'list_full' }]);
    expect(ops.body.items).toHaveLength(300);
    expect((await call(base, 'POST', `/api/lists/${list.id}/items`, item('n3'))).status).toBe(409);
  });

  it('validates every field strictly', async () => {
    const { base } = await start({ createBurst: 100 }); // Refused attempts count towards the limit too.
    const list = await create(base);
    const bad: [string, unknown][] = [
      ['unknown field', { items: [{ ...item('a'), owner: 'Anna' }] }],
      ['unknown top-level field', { items: [], name: 'Flat' }],
      ['prototype key', JSON.parse('{"items":[],"__proto__":{"x":1}}')],
      ['missing field', { items: [{ id: 'a', text: 'llet', categoryId: null, level: { kind: 'any' }, quantity: 1 }] }],
      ['text too long', { items: [item('a', { text: 'x'.repeat(121) })] }],
      ['empty text', { items: [item('a', { text: '   ' })] }],
      ['control character', { items: [item('a', { text: 'llet\u0000' })] }],
      ['bidi override', { items: [item('a', { text: 'llet‮' })] }],
      ['quantity zero', { items: [item('a', { quantity: 0 })] }],
      ['quantity 100', { items: [item('a', { quantity: 100 })] }],
      ['fractional quantity', { items: [item('a', { quantity: 1.5 })] }],
      ['string quantity', { items: [{ ...item('a'), quantity: '2' }] }],
      ['unknown category', { items: [item('a', { categoryId: 'caviar' })] }],
      ['bad level', { items: [{ ...item('a'), level: { kind: 'cheapest' } }] }],
      ['extra level field', { items: [{ ...item('a'), level: { kind: 'own', brand: 'x' } }] }],
      ['brand too long', { items: [item('a', { level: { kind: 'specific', brand: 'b'.repeat(61) } })] }],
      ['checked not boolean', { items: [{ ...item('a'), checked: 1 }] }],
      ['bad item id', { items: [item('a/b')] }],
      ['repeated id', { items: [item('a'), item('a')] }],
      ['items not array', { items: 'llet' }],
      ['array body', [item('a')]],
    ];
    for (const [name, body] of bad) {
      const res = await call(base, 'POST', '/api/lists', body);
      expect(res.status, name).toBe(400);
      expect(res.body.error, name).toBe('invalid_request');
    }
    expect((await call(base, 'POST', '/api/lists', { items: [item('a', { text: '🍅'.repeat(120) })] })).status).toBe(201);
    const badOps: unknown[] = [
      { ops: [] },
      { ops: Array.from({ length: 101 }, (_, i) => ({ op: 'remove', id: `i${i}` })) },
      { ops: [{ op: 'update', id: 'a', set: {} }] },
      { ops: [{ op: 'update', id: 'a', set: { colour: 'red' } }] },
      { ops: [{ op: 'update', id: 'a', set: { quantity: 3 }, extra: true }] },
      { ops: [{ op: 'clear' }] },
    ];
    for (const body of badOps) expect((await call(base, 'POST', `/api/lists/${list.id}/ops`, body)).status).toBe(400);
    const indexed = await call(base, 'POST', `/api/lists/${list.id}/ops`, { ops: [{ op: 'remove', id: 'a' }, { op: 'update', id: 'a', set: { quantity: 0 } }] });
    expect(indexed.body).toMatchObject({ error: 'invalid_request', index: 1 });
    expect((await call(base, 'GET', `/api/lists/${list.id}`)).body.items).toHaveLength(1); // Nothing applied.
    expect((await call(base, 'PATCH', `/api/lists/${list.id}/items/a`, { id: 'b' })).status).toBe(400);
    expect((await call(base, 'GET', `/api/lists/${list.id}?since=abc`)).status).toBe(400);
  });

  it('checks content type, JSON and body size', async () => {
    const { base } = await start();
    expect((await call(base, 'POST', '/api/lists', JSON.stringify({ items: [] }), { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await call(base, 'POST', '/api/lists', JSON.stringify({ items: [] }), { 'content-type': 'application/json; charset=latin1' })).status).toBe(415);
    expect((await call(base, 'POST', '/api/lists', JSON.stringify({ items: [] }), { 'content-type': 'application/json; charset=UTF-8' })).status).toBe(201);
    expect((await call(base, 'POST', '/api/lists', '{"items":[', {})).body.error).toBe('invalid_json');
    const big = JSON.stringify({ items: [item('a', { text: 'x'.repeat(33 * 1024) })] });
    expect((await call(base, 'POST', '/api/lists', big)).status).toBe(413);
    expect(await chunked(base, '/api/lists', ['{"items":[', ...Array(40).fill(' '.repeat(1024)), ']}'])).toBe(413);
    expect(await chunked(base, '/api/lists', ['{"items":', '[]}'])).toBe(201);
  });

  it('answers 404 for unknown or malformed ids and 405 for wrong methods', async () => {
    const { base } = await start();
    expect((await call(base, 'GET', '/api/lists/AAAAAAAAAAAAAAAAAAAAAA')).status).toBe(404);
    expect((await call(base, 'GET', '/api/lists/short')).status).toBe(404);
    expect((await call(base, 'GET', '/api/lists/AAAAAAAAAAAAAAAAAAAAAA/extra/a/b')).status).toBe(404);
    expect((await call(base, 'POST', '/api/lists/AAAAAAAAAAAAAAAAAAAAAA/ops', { ops: [{ op: 'remove', id: 'a' }] })).status).toBe(404);
    const getAll = await call(base, 'GET', '/api/lists');
    expect(getAll.status).toBe(405);
    expect(getAll.headers.get('allow')).toBe('POST');
    expect((await call(base, 'DELETE', '/api/lists/AAAAAAAAAAAAAAAAAAAAAA')).status).toBe(405);
    expect((await call(base, 'OPTIONS', '/api/lists')).status).toBe(405);
  });

  it('keeps the catalogue endpoints read-only and unchanged', async () => {
    const { base } = await start();
    const health = await call(base, 'GET', '/api/health');
    expect(health.body).toMatchObject({ status: 'ok', database: 'sqlite', release: 'test' });
    expect((await call(base, 'GET', '/api/catalog')).body).toMatchObject({ isSample: false, products: [] });
    expect((await call(base, 'POST', '/api/catalog', {})).status).toBe(405);
    expect((await call(base, 'GET', '/api/nothing')).status).toBe(404);
  });

  it('deletes lists untouched for 180 days, and opening a list keeps it alive', async () => {
    const { base, db, handler, clock } = await start();
    const old = await create(base);
    const used = await create(base);
    clock.now += 100 * DAY;
    expect((await call(base, 'GET', `/api/lists/${used.id}?since=1`)).status).toBe(200);
    clock.now += 81 * DAY; // old: 181 days; used: opened 81 days ago.
    expect((await call(base, 'GET', `/api/lists/${old.id}`)).status).toBe(404); // Hidden before cleanup.
    expect(handler.maintenance()).toEqual({ expiredLists: 1 });
    expect((await call(base, 'GET', `/api/lists/${used.id}`)).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM shared_list_items WHERE list_id=?').get(old.id)?.n).toBe(0);
  });

  it('rate-limits writes per client address (X-Real-IP from the local proxy) and overall', async () => {
    const { base } = await start({ opsBurst: 3, opsPerMinute: 1, createBurst: 3, createPerHour: 1 });
    const anna = { 'x-real-ip': '203.0.113.7' };
    const list = await create(base, [], anna);
    const op = { ops: [{ op: 'add', item: item('a') }] };
    expect((await call(base, 'POST', `/api/lists/${list.id}/ops`, op, anna)).status).toBe(200);
    expect((await call(base, 'POST', `/api/lists/${list.id}/ops`, op, anna)).status).toBe(200);
    const limited = await call(base, 'POST', `/api/lists/${list.id}/ops`, op, anna);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    // X-Forwarded-For is ignored, so it can't be used to dodge the limit.
    expect((await call(base, 'POST', `/api/lists/${list.id}/ops`, op, { ...anna, 'x-forwarded-for': '198.51.100.1' })).status).toBe(429);
    // Someone else is not affected; reading is never limited.
    expect((await call(base, 'POST', `/api/lists/${list.id}/ops`, op, { 'x-real-ip': '198.51.100.2' })).status).toBe(200);
    expect((await call(base, 'GET', `/api/lists/${list.id}`, undefined, anna)).status).toBe(200);
    // Creating lists has its own, lower limit; many items cost as many operations.
    const bob = { 'x-real-ip': '2001:db8:1:2:aaaa::1' };
    expect((await call(base, 'POST', '/api/lists', { items: [item('a'), item('b'), item('c'), item('d')] }, bob)).status).toBe(429);
    await create(base, [], bob);
    await create(base, [], { 'x-real-ip': '2001:db8:1:2:bbbb::9' }); // Same /64.
    expect((await call(base, 'POST', '/api/lists', { items: [] }, bob)).status).toBe(429);
  });

  it('applies a global limit and a cap on stored lists', async () => {
    const { base } = await start({ globalOpsBurst: 2, globalOpsPerMinute: 1, maxLists: 2 });
    await create(base, [], { 'x-real-ip': '203.0.113.1' });
    await create(base, [], { 'x-real-ip': '203.0.113.2' });
    const capped = await call(base, 'POST', '/api/lists', { items: [] }, { 'x-real-ip': '203.0.113.3' });
    expect(capped.status).toBe(429); // Global operation budget used up first.
    const roomy = await start({ maxLists: 1 });
    await create(roomy.base);
    expect((await call(roomy.base, 'POST', '/api/lists', { items: [] })).status).toBe(503);
  });

  it('never logs list contents or ids when something fails', async () => {
    const { base, db } = await start();
    const list = await create(base, [item('a', { text: 'medicament secret' })]);
    db.exec('DROP TABLE shared_list_items');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await call(base, 'POST', `/api/lists/${list.id}/ops`, { ops: [{ op: 'add', item: item('b', { text: 'medicament secret' }) }] });
      expect(res.status).toBe(500);
      const logged = JSON.stringify(errors.mock.calls);
      expect(logged).not.toContain(list.id);
      expect(logged).not.toContain('secret');
    } finally { errors.mockRestore(); }
  });
});

describe('rate limiter', () => {
  it('refills over time and groups IPv6 addresses by /64', () => {
    const limiter = new RateLimiter(2, 1);
    expect(limiter.take('k', 1, 0)).toBe(0);
    expect(limiter.take('k', 1, 0)).toBe(0);
    expect(limiter.take('k', 1, 0)).toBe(1);
    expect(limiter.take('k', 1, 1000)).toBe(0);
    expect(limiter.take('k', 5, 1000)).toBeGreaterThan(0);
    limiter.prune(10_000);
    expect(limiter.size).toBe(0);
    expect(addressKey('2001:db8:0:1:2:3:4:5')).toBe('2001:db8:0:1::/64');
    expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressKey('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(addressKey('192.0.2.1')).toBe('192.0.2.1');
  });

  it('stays bounded when flooded with new addresses', () => {
    const limiter = new RateLimiter(5, 1, 100);
    for (let i = 0; i < 1000; i++) limiter.take(`k${i}`, 1, 0);
    expect(limiter.size).toBeLessThanOrEqual(100);
  });
});

describe('shared list operations are the same on both sides', () => {
  it('a diff applied to the old list gives the new list', async () => {
    const { applySharedOps, diffSharedItems } = await import('@pricing/core');
    const before = [item('a'), item('b'), item('c')];
    const after = [item('a', { checked: true }), item('c', { level: { kind: 'specific', brand: 'Hacendado' } }), item('d')];
    const ops = diffSharedItems(before, after);
    expect(ops).toEqual([
      { op: 'remove', id: 'b' },
      { op: 'update', id: 'a', set: { checked: true } },
      { op: 'update', id: 'c', set: { level: { kind: 'specific', brand: 'Hacendado' } } },
      { op: 'add', item: item('d') },
    ]);
    expect(applySharedOps(before, ops).items).toEqual(after);
    const { base } = await start();
    const list = await create(base, before);
    const res = await call(base, 'POST', `/api/lists/${list.id}/ops`, { ops });
    expect((res.body as SharedOpsResult).items).toEqual(after);
  });
});
