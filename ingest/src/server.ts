import { createServer } from 'node:http';
import { catalog, history, openDatabase } from './database';

if (!process.env.DATABASE_PATH) throw new Error('DATABASE_PATH is required');
const db = openDatabase(process.env.DATABASE_PATH);
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET') { res.writeHead(405); res.end('{"error":"Method not allowed"}'); return; }
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let data: unknown;
    if (url.pathname === '/api/health') {
      const counts = db.prepare(`SELECT COUNT(*) AS observations,MAX(observed_at) AS lastImport FROM price_observations`).get();
      data = { status: 'ok', database: 'sqlite', release: process.env.RELEASE_SHA ?? 'local', ...counts };
    } else if (url.pathname === '/api/catalog') data = catalog(db);
    else if (url.pathname.startsWith('/api/history/')) data = history(db, decodeURIComponent(url.pathname.slice('/api/history/'.length)));
    else { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('API request failed', err);
    res.writeHead(500); res.end('{"error":"Database request failed"}');
  }
});
server.listen(Number(process.env.PORT ?? 3007), '127.0.0.1');
process.on('SIGTERM', () => server.close(() => { db.close(); process.exit(0); }));
