import type { SharedItem, SharedListSnapshot, SharedListUnchanged, SharedOp, SharedOpsResult } from '@pricing/core';
import { Platform } from 'react-native';

/** An HTTP error from the shared-list API; status 0 means the server couldn't be reached. */
export class SharedListApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    /** Index of the refused operation, for 400 answers to a batch. */
    readonly index?: number,
    /** Seconds the server asked us to wait (429/503). */
    readonly retryAfter?: number,
  ) {
    super(`Shared list API ${status}${code ? ` ${code}` : ''}`);
  }
}

export interface SharedListApi {
  create(items: SharedItem[]): Promise<SharedListSnapshot>;
  get(id: string, since?: number): Promise<SharedListSnapshot | SharedListUnchanged>;
  ops(id: string, ops: SharedOp[]): Promise<SharedOpsResult>;
}

export function sharedListApi(baseUrl: string): SharedListApi {
  const base = baseUrl.replace(/\/$/, '');
  const request = async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new SharedListApiError(0, 'network');
    }
    let data: { error?: string; index?: number } | null = null;
    try { data = await response.json(); } catch { /* not JSON */ }
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new SharedListApiError(response.status, data?.error, typeof data?.index === 'number' ? data.index : undefined,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
    }
    if (!data) throw new SharedListApiError(0, 'invalid_response');
    return data as T;
  };
  return {
    create: (items) => request('POST', '/lists', { items }),
    get: (id, since) => request('GET', `/lists/${id}${since === undefined ? '' : `?since=${since}`}`),
    ops: (id, ops) => request('POST', `/lists/${id}/ops`, { ops }),
  };
}

/** Null in sample mode (no EXPO_PUBLIC_API_URL): sharing needs the server. */
export function configuredSharedListApi(): SharedListApi | null {
  const url = process.env.EXPO_PUBLIC_API_URL;
  return url ? sharedListApi(url) : null;
}

/**
 * Invite link https://<origin>/l/<id>. On the web it uses the site's own origin; in the
 * native app, the origin of EXPO_PUBLIC_API_URL, which must then be absolute
 * (e.g. https://quinsuper.trottedmedia.com/api). Null when neither is known.
 */
export function shareLink(id: string): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) return `${window.location.origin}/l/${id}`;
  const origin = /^(https?:\/\/[^/?#]+)/i.exec(process.env.EXPO_PUBLIC_API_URL ?? '')?.[1];
  return origin ? `${origin}/l/${id}` : null;
}
