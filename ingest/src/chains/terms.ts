import { CATEGORIES, type Lang } from '@pricing/core';

/** One search term per generic item, in the shop's language (Spanish for most shops). */
export function genericSearchTerms(lang: Lang = 'es'): string[] {
  return [...new Set(CATEGORIES.map((c) => c.names[lang].toLowerCase()))];
}
