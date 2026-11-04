/**
 * Wall-clock time in Barcelona (Europe/Madrid), whatever the device's own time zone is.
 * Uses the runtime's time-zone data when it has it, and otherwise the EU summer-time rule,
 * which is what Spain has followed since 1996.
 */

/** EU rule: summer time (UTC+2) from the last Sunday of March to the last Sunday of October, at 01:00 UTC. */
export function madridOffsetByRule(at: Date): number {
  const year = at.getUTCFullYear();
  const lastSunday = (month: number) => {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1);
  };
  const t = at.getTime();
  return t >= lastSunday(2) && t < lastSunday(9) ? 120 : 60;
}

let formatter: Intl.DateTimeFormat | null | undefined;

function offsetFromIntl(at: Date): number | null {
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Madrid', hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
      });
    } catch {
      formatter = null;
    }
  }
  if (!formatter) return null;
  try {
    const parts: Record<string, number> = {};
    for (const p of formatter.formatToParts(at)) if (p.type !== 'literal') parts[p.type] = Number(p.value);
    const local = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour! % 24, parts.minute!);
    const offset = Math.round((local - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
    // Anything else means the runtime ignored the time zone (some engines fall back to UTC).
    return offset === 60 || offset === 120 ? offset : null;
  } catch {
    return null;
  }
}

/** Minutes Madrid is ahead of UTC at a moment (60 in winter, 120 in summer). */
export function madridOffsetMinutes(at: Date): number {
  return offsetFromIntl(at) ?? madridOffsetByRule(at);
}

export interface MadridTime {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  /** 0 = Monday … 6 = Sunday (the order OpenStreetMap uses). */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
}

export function madridTime(at: Date): MadridTime {
  const local = new Date(at.getTime() + madridOffsetMinutes(at) * 60_000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: (local.getUTCDay() + 6) % 7,
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/**
 * The moment of a Madrid wall-clock time. Days and minutes may overflow (day 0 is the last
 * day of the previous month). Not meant for the hour skipped or repeated on a clock-change night.
 */
export function fromMadridTime(year: number, month: number, day: number, minutes: number): Date {
  const wall = Date.UTC(year, month - 1, day, 0, minutes);
  let t = wall - madridOffsetMinutes(new Date(wall)) * 60_000;
  t = wall - madridOffsetMinutes(new Date(t)) * 60_000;
  return new Date(t);
}

/** "09:00" from minutes since midnight (wraps past 24 h). */
export function clockTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
