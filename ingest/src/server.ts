import { createServer } from 'node:http';
import { createApiHandler } from './api';
import { openDatabase } from './database';

if (!process.env.DATABASE_PATH) throw new Error('DATABASE_PATH is required');
const db = openDatabase(process.env.DATABASE_PATH);
// node:sqlite blocks the event loop while it waits for a lock (e.g. during the daily
// import), so the API waits less than the importer does; a shared-list write that
// can't get the lock answers 503 and the app retries.
db.exec('PRAGMA busy_timeout=1500');
const handler = createApiHandler(db, { release: process.env.RELEASE_SHA ?? 'local' });
const maintenance = () => {
  try {
    const { expiredLists } = handler.maintenance();
    if (expiredLists) console.log(`Deleted ${expiredLists} shared lists unused for 180 days`);
  } catch (err) {
    console.error('Shared-list cleanup failed:', err instanceof Error ? err.message : 'unknown error');
  }
};
maintenance();
const timer = setInterval(maintenance, 6 * 3600_000);
timer.unref();
const server = createServer(handler);
server.listen(Number(process.env.PORT ?? 3007), '127.0.0.1');
process.on('SIGTERM', () => server.close(() => { clearInterval(timer); db.close(); process.exit(0); }));
