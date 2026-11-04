import { type Lang, type ShareCard } from '@pricing/core';
import { Platform } from 'react-native';

import { money, translate } from '@/i18n';

/** Where share links point from native builds. Override with EXPO_PUBLIC_SITE_URL. */
export const DEFAULT_SITE_URL = 'https://quinsuper.trottedmedia.com';

/** The web build links to its own origin; native builds use EXPO_PUBLIC_SITE_URL. */
export function siteOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
    return window.location.origin;
  }
  return (process.env.EXPO_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

/** "quinsuper.trottedmedia.com", printed on the card so a shared image still says where to go. */
export function siteHost(): string {
  return siteOrigin().replace(/^https?:\/\//, '');
}

/** Public page for a share card (works in any browser, no app needed). */
export function shareCardUrl(encoded: string): string {
  return `${siteOrigin()}/r/${encoded}`;
}

/** Short message sent with the link. */
export function shareCardMessage(card: ShareCard, lang: Lang): string {
  const best = card.rank === 1 && card.stores > 1;
  return translate(lang, best ? 'shareCardTextBest' : 'shareCardText', {
    store: card.store,
    total: money(card.total, lang),
    found: card.found,
    total_items: card.requested,
  });
}

/** Today's date on this device, YYYY-MM-DD. */
export function todayLocal(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
