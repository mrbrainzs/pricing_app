import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

/**
 * In-memory token buckets (one process, nothing persisted). `capacity` is the burst,
 * `perSecond` the sustained rate. Idle buckets are forgotten.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(readonly capacity: number, readonly perSecond: number, private readonly maxKeys = 50_000) {}

  /** Takes `cost` tokens; returns 0 when allowed, otherwise seconds until it would be. */
  take(key: string, cost = 1, now = Date.now()): number {
    if (cost > this.capacity) return Math.ceil((cost - this.capacity) / this.perSecond) || 1;
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    const tokens = Math.min(this.capacity, bucket.tokens + ((now - bucket.at) / 1000) * this.perSecond);
    if (tokens < cost) {
      this.buckets.set(key, { tokens, at: now });
      return Math.max(1, Math.ceil((cost - tokens) / this.perSecond));
    }
    if (!this.buckets.has(key) && this.buckets.size >= this.maxKeys) this.prune(now);
    this.buckets.set(key, { tokens: tokens - cost, at: now });
    return 0;
  }

  /** Puts back tokens taken for a request that was then refused for another reason. */
  refund(key: string, cost = 1): void {
    const bucket = this.buckets.get(key);
    if (bucket) bucket.tokens = Math.min(this.capacity, bucket.tokens + cost);
  }

  /** Drops buckets that have refilled completely (they behave like new ones). */
  prune(now = Date.now()): void {
    const fullAfterMs = (this.capacity / this.perSecond) * 1000;
    for (const [key, bucket] of this.buckets) if (now - bucket.at >= fullAfterMs) this.buckets.delete(key);
    // Still too many (a flood of new addresses): forget the oldest half rather than grow.
    if (this.buckets.size >= this.maxKeys) {
      const keys = [...this.buckets.keys()];
      for (const key of keys.slice(0, Math.ceil(keys.length / 2))) this.buckets.delete(key);
    }
  }

  get size(): number { return this.buckets.size; }
}

function isLoopback(address: string): boolean {
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.');
}

/** IPv4 as is; IPv6 by /64 (one household or phone usually gets a whole /64). */
export function addressKey(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1]!;
  if (isIP(address) !== 6) return address;
  const [head = '', tail = ''] = address.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = address.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/**
 * Who to rate-limit. Behind Nginx every request comes from 127.0.0.1, so the client
 * address is read from X-Real-IP, but only when the request comes from loopback (Nginx
 * must overwrite the header: `proxy_set_header X-Real-IP $remote_addr;`, see
 * deploy/nginx.conf). X-Forwarded-For is never used: clients can write it.
 */
export function clientKey(req: IncomingMessage): string {
  const peer = req.socket.remoteAddress ?? 'unknown';
  if (isLoopback(peer)) {
    const header = req.headers['x-real-ip'];
    const real = typeof header === 'string' ? header.trim() : '';
    if (real && isIP(real)) return addressKey(real);
  }
  return addressKey(peer);
}
