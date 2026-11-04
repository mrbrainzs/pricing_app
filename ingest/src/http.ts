/** Polite HTTP: one request at a time, a pause between requests, retries with backoff. */
export interface HttpOptions {
  delayMs?: number;
  retries?: number;
  userAgent?: string;
}

export const DEFAULT_USER_AGENT = 'QuinSuperPriceBot/0.1 (+https://github.com/mrbrainzs/pricing_app)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PoliteClient {
  private last = 0;
  constructor(private readonly opts: HttpOptions = {}) {}

  async request(url: string, init: RequestInit = {}): Promise<Response> {
    const delay = this.opts.delayMs ?? 400;
    const retries = this.opts.retries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + delay - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      try {
        const res = await fetch(url, {
          ...init,
          signal: init.signal ?? AbortSignal.timeout(30000),
          headers: { 'user-agent': this.opts.userAgent ?? DEFAULT_USER_AGENT, accept: 'application/json', ...init.headers },
        });
        if (res.ok) return res;
        if (attempt < retries && (res.status === 429 || res.status >= 500)) {
          await sleep(2 ** attempt * 2000);
          continue;
        }
        throw new Error(`${init.method ?? 'GET'} ${url} -> HTTP ${res.status}`);
      } catch (err) {
        if (attempt < retries && !(err instanceof Error && err.message.includes('-> HTTP'))) {
          await sleep(2 ** attempt * 2000);
          continue;
        }
        throw err;
      }
    }
  }

  async json<T>(url: string, init?: RequestInit): Promise<T> {
    return (await this.request(url, init)).json() as Promise<T>;
  }
}
