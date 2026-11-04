import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import {
  isSharedItemId,
  isSharedListId,
  parseCreateBody,
  parseOpsBody,
  parseSharedItem,
  parseSharedPatch,
  SHARED_LIST_LIMITS,
  type Parsed,
  type SharedOp,
} from '@pricing/core';
import { catalog, history } from './database';
import { clientKey, RateLimiter } from './rateLimit';
import { applySharedListOps, countSharedLists, createSharedList, deleteExpiredSharedLists, getSharedList } from './sharedLists';

/** Write limits for shared lists. Every item operation (or created item) costs one "op". */
export interface WriteLimits {
  /** Lists stored at once; creating more answers 503 (bounds disk use). */
  maxLists: number;
  /** New lists per client address: burst, then this many per hour. */
  createBurst: number;
  createPerHour: number;
  /** New lists from everyone together. */
  globalCreateBurst: number;
  globalCreatePerHour: number;
  /** Item operations per client address: burst, then this many per minute. */
  opsBurst: number;
  opsPerMinute: number;
  /** Item operations from everyone together. */
  globalOpsBurst: number;
  globalOpsPerMinute: number;
}

export const DEFAULT_WRITE_LIMITS: WriteLimits = {
  maxLists: 20_000,
  createBurst: 10,
  createPerHour: 20,
  globalCreateBurst: 100,
  globalCreatePerHour: 600,
  opsBurst: 600,
  opsPerMinute: 300,
  globalOpsBurst: 3000,
  globalOpsPerMinute: 3000,
};

export interface ApiOptions {
  /** Release id reported by /api/health. */
  release?: string;
  now?: () => Date;
  limits?: Partial<WriteLimits>;
}

export interface ApiHandler {
  (req: IncomingMessage, res: ServerResponse): void;
  /** Deletes expired shared lists and forgets idle rate-limit buckets. Call on start and periodically. */
  maintenance(): { expiredLists: number };
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, readonly detail?: string, readonly extra: Record<string, unknown> = {}, readonly headers: Record<string, string> = {}) {
    super(code);
  }
}

function send(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

function isBusy(err: unknown): boolean {
  const e = err as { errcode?: number; message?: string };
  return e?.errcode === 5 || e?.errcode === 6 || /database is locked|SQLITE_BUSY/i.test(e?.message ?? '');
}

const JSON_TYPE = /^application\/json\s*(?:;\s*charset\s*=\s*"?utf-8"?\s*)?$/i;

/** The body as text, enforcing JSON content type, size and valid UTF-8. */
async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  if (!JSON_TYPE.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > maxBytes) { req.resume(); throw new HttpError(413, 'body_too_large', `at most ${maxBytes} bytes`); }
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  await new Promise<void>((resolve, reject) => {
    let ended = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) tooLarge = true; // Keep draining so the response can be read.
      else chunks.push(chunk);
    });
    req.on('end', () => { ended = true; resolve(); });
    req.on('error', reject);
    req.on('close', () => { if (!ended) reject(new HttpError(400, 'incomplete_body')); });
  });
  if (tooLarge) throw new HttpError(413, 'body_too_large', `at most ${maxBytes} bytes`);
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new HttpError(400, 'invalid_json', 'body is not valid UTF-8'); }
  try { return JSON.parse(text); }
  catch { throw new HttpError(400, 'invalid_json', 'body is not valid JSON'); }
}

function valid<T>(parsed: Parsed<T>): T {
  if (parsed.ok) return parsed.value;
  throw new HttpError(400, 'invalid_request', parsed.error, parsed.index === undefined ? {} : { index: parsed.index });
}

/**
 * The HTTP API: read-only catalogue endpoints, plus shared lists under /api/lists
 * (the only write endpoints). Shared lists have no accounts; the 128-bit random list id
 * is the key, and every request is validated against @pricing/core's sharedList rules.
 */
export function createApiHandler(db: DatabaseSync, options: ApiOptions = {}): ApiHandler {
  const now = options.now ?? (() => new Date());
  const limits = { ...DEFAULT_WRITE_LIMITS, ...options.limits };
  const createLimiter = new RateLimiter(limits.createBurst, limits.createPerHour / 3600);
  const globalCreateLimiter = new RateLimiter(limits.globalCreateBurst, limits.globalCreatePerHour / 3600);
  const opsLimiter = new RateLimiter(limits.opsBurst, limits.opsPerMinute / 60);
  const globalOpsLimiter = new RateLimiter(limits.globalOpsBurst, limits.globalOpsPerMinute / 60);

  /** Takes tokens from the client's and the global bucket, or answers 429. */
  const limit = (client: RateLimiter, global: RateLimiter, key: string, cost: number) => {
    const wait = client.take(key, cost);
    if (wait) throw new HttpError(429, 'rate_limited', 'too many changes; try again later', {}, { 'retry-after': String(wait) });
    const globalWait = global.take('*', cost);
    if (globalWait) {
      client.refund(key, cost);
      throw new HttpError(429, 'rate_limited', 'too many changes; try again later', {}, { 'retry-after': String(globalWait) });
    }
  };

  const applyOps = (key: string, listId: string, ops: SharedOp[]) => {
    // One token was taken before reading the body; charge the rest now.
    if (ops.length > 1) limit(opsLimiter, globalOpsLimiter, key, ops.length - 1);
    const result = applySharedListOps(db, listId, ops, now());
    if (!result) throw new HttpError(404, 'not_found');
    return result;
  };

  async function lists(req: IncomingMessage, res: ServerResponse, url: URL) {
    const parts = url.pathname.split('/').slice(3); // ['', 'api', 'lists', ...]
    const [listId, sub, itemId, ...rest] = parts;
    const method = req.method ?? 'GET';
    const allow = (methods: string) => { if (!methods.split(', ').includes(method)) throw new HttpError(405, 'method_not_allowed', undefined, {}, { allow: methods }); };
    const key = clientKey(req);

    if (listId === undefined) {
      allow('POST');
      limit(createLimiter, globalCreateLimiter, key, 1);
      limit(opsLimiter, globalOpsLimiter, key, 1);
      const body = valid(parseCreateBody(await readJson(req, SHARED_LIST_LIMITS.maxBodyBytes)));
      if (body.items.length > 1) limit(opsLimiter, globalOpsLimiter, key, body.items.length - 1);
      if (countSharedLists(db) >= limits.maxLists) throw new HttpError(503, 'capacity', 'no room for new shared lists right now', {}, { 'retry-after': '3600' });
      const created = createSharedList(db, body.items, now());
      send(res, 201, created, { location: `/api/lists/${created.id}` });
      return;
    }
    if (!isSharedListId(listId) || rest.length) throw new HttpError(404, 'not_found');

    if (sub === undefined) {
      allow('GET');
      const sinceParam = url.searchParams.get('since');
      if (sinceParam !== null && !/^\d{1,15}$/.test(sinceParam)) throw new HttpError(400, 'invalid_request', 'since must be a version number');
      const list = getSharedList(db, listId, now(), sinceParam === null ? undefined : Number(sinceParam));
      if (!list) throw new HttpError(404, 'not_found');
      send(res, 200, list);
      return;
    }

    if (sub === 'ops' && itemId === undefined) {
      allow('POST');
      limit(opsLimiter, globalOpsLimiter, key, 1);
      const { ops } = valid(parseOpsBody(await readJson(req, SHARED_LIST_LIMITS.maxBodyBytes)));
      send(res, 200, applyOps(key, listId, ops));
      return;
    }

    if (sub === 'items' && itemId === undefined) {
      allow('POST');
      limit(opsLimiter, globalOpsLimiter, key, 1);
      const item = valid(parseSharedItem(await readJson(req, SHARED_LIST_LIMITS.maxBodyBytes)));
      const result = applyOps(key, listId, [{ op: 'add', item }]);
      if (result.rejected.length) throw new HttpError(409, 'list_full', `a list can have at most ${SHARED_LIST_LIMITS.maxItems} items`);
      send(res, 200, result);
      return;
    }

    if (sub === 'items' && isSharedItemId(itemId)) {
      allow('PATCH, DELETE');
      limit(opsLimiter, globalOpsLimiter, key, 1);
      const op: SharedOp = method === 'PATCH'
        ? { op: 'update', id: itemId, set: valid(parseSharedPatch(await readJson(req, SHARED_LIST_LIMITS.maxBodyBytes))) }
        : { op: 'remove', id: itemId };
      send(res, 200, applyOps(key, listId, [op]));
      return;
    }

    throw new HttpError(404, 'not_found');
  }

  const handler = ((req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'no-store');
    let url: URL;
    try { url = new URL(req.url ?? '/', 'http://localhost'); }
    catch { res.writeHead(400); res.end('{"error":"Bad request"}'); return; }

    if (url.pathname === '/api/lists' || url.pathname.startsWith('/api/lists/')) {
      res.setHeader('x-robots-tag', 'noindex, nofollow');
      lists(req, res, url).catch((err: unknown) => {
        if (res.headersSent) { res.destroy(); return; }
        if (err instanceof HttpError) {
          send(res, err.status, { error: err.code, ...(err.detail ? { detail: err.detail } : {}), ...err.extra }, err.headers);
        } else if (isBusy(err)) {
          send(res, 503, { error: 'busy' }, { 'retry-after': '5' });
        } else {
          // Never log list ids or contents: only the method and what went wrong.
          console.error(`Shared list request failed (${req.method}):`, err instanceof Error ? err.message : 'unknown error');
          send(res, 500, { error: 'server_error' });
        }
      });
      return;
    }

    // Catalogue: read-only, unchanged.
    if (req.method !== 'GET') { res.writeHead(405); res.end('{"error":"Method not allowed"}'); return; }
    try {
      let data: unknown;
      if (url.pathname === '/api/health') {
        const counts = db.prepare(`SELECT COUNT(*) AS observations,MAX(observed_at) AS lastImport FROM price_observations`).get();
        data = { status: 'ok', database: 'sqlite', release: options.release ?? 'local', ...counts };
      } else if (url.pathname === '/api/catalog') data = catalog(db);
      else if (url.pathname.startsWith('/api/history/')) data = history(db, decodeURIComponent(url.pathname.slice('/api/history/'.length)));
      else { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('API request failed', err);
      res.writeHead(500); res.end('{"error":"Database request failed"}');
    }
  }) as ApiHandler;

  handler.maintenance = () => {
    const expiredLists = deleteExpiredSharedLists(db, now());
    for (const limiter of [createLimiter, globalCreateLimiter, opsLimiter, globalOpsLimiter]) limiter.prune();
    return { expiredLists };
  };
  return handler;
}
