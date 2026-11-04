import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createApiHandler } from '../src/api';
import { openDatabase } from '../src/database';

// The read-only catalogue routes, served by the same handler as shared lists.
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn(); });

async function start() {
  const dir = mkdtempSync(join(tmpdir(), 'quinsuper-api-'));
  const db = openDatabase(join(dir, 'prices.sqlite'));
  const server: Server = createServer(createApiHandler(db, { release: 'test', now: () => new Date('2026-11-10T10:00:00Z') }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => { rmSync(dir, { recursive: true, force: true }); });
  cleanups.push(() => db.close());
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

it('serves health, catalogue and the weekly index; refuses writes to them', async () => {
  const base = await start();
  expect(await (await fetch(`${base}/api/health`)).json()).toMatchObject({ status: 'ok', release: 'test' });
  expect(await (await fetch(`${base}/api/catalog`)).json()).toMatchObject({ isSample: false, products: [], stores: [] });
  const index = await fetch(`${base}/api/index`);
  expect(index.status).toBe(200);
  expect(await index.json()).toHaveProperty('current');
  expect((await fetch(`${base}/api/index`, { method: 'POST' })).status).toBe(405);
  expect((await fetch(`${base}/api/nope`)).status).toBe(404);
});
