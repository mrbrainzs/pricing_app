import { madridTime, openStatus } from '@pricing/core';

import { Badge } from '@/components/ui';
import { useApp } from '@/state/AppState';

/** "Open now" / "Closed · opens 09:00" / "Hours unknown", from the store's OpenStreetMap hours (Barcelona time). */
export function OpenNowBadge({ hours, now = new Date() }: { hours?: string; now?: Date }) {
  const { t } = useApp();
  const status = openStatus(hours, now);
  if (status.state === 'open') return <Badge label={t('openNow')} tone="good" />;
  if (status.state === 'unknown') return <Badge label={t('hoursUnknown')} />;
  const opens = status.opensAt;
  let label = t('closedNow');
  if (opens?.inDays === 0) label = t('closedOpensAt', { time: opens.time });
  else if (opens?.inDays === 1) label = t('closedOpensTomorrow', { time: opens.time });
  else if (opens) {
    const day = t('weekdays').split(',')[(madridTime(now).weekday + opens.inDays) % 7] ?? '';
    label = t('closedOpensDay', { day, time: opens.time });
  }
  return <Badge label={label} tone="high" />;
}
