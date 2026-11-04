import { UNIT_LABEL, type BaseUnit, type Lang, type PriceObservation } from '@pricing/core';

import { money, translate } from '@/i18n';

const SOURCE_KEY = { online: 'srcOnline', receipt: 'srcReceipt', leaflet: 'srcLeaflet', sample: 'srcSample' } as const;

/** Freshness label (F8): "Online price, today 07:00" / "Receipt price, 3 days ago". */
export function sourceLabel(obs: Pick<PriceObservation, 'source' | 'observedAt'>, lang: Lang, now = new Date()): string {
  const at = new Date(obs.observedAt);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.ceil((startOfToday.getTime() - at.getTime()) / 86_400_000);
  const time = at.toLocaleTimeString(lang === 'en' ? 'en-GB' : `${lang}-ES`, { hour: '2-digit', minute: '2-digit' });
  const when = at >= startOfToday
    ? translate(lang, 'today', { time })
    : days <= 1
      ? translate(lang, 'yesterday')
      : translate(lang, 'daysAgo', { n: days });
  return `${translate(lang, SOURCE_KEY[obs.source])}, ${when}`;
}

export function unitPriceLabel(unitPrice: number | null, unit: BaseUnit | undefined, lang: Lang): string | null {
  if (unitPrice === null || !unit) return null;
  return `${money(unitPrice, lang)}/${UNIT_LABEL[unit]}`;
}
