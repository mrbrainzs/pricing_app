/**
 * "Open now" from OpenStreetMap opening_hours, evaluated in Barcelona time.
 *
 * Only the common subset is understood: weekday ranges and lists (Mo-Fr, Sa-Mo, Mo,We),
 * several time ranges (09:00-14:00,17:00-20:30, also past midnight), "off"/"closed",
 * public holidays (PH), rules separated by ";" (a later rule replaces earlier ones for its
 * days) or by ", " before a new weekday (adds to them), and "24/7". Anything else (months,
 * dates, "sunrise", comments, "Su[1]") makes the whole value unknown: we never guess.
 */
import { clockTime, madridTime } from './madridTime';

export interface OpeningRule {
  /** Weekdays the rule applies to, 0 = Monday. A rule without a day selector applies every day. */
  days: boolean[];
  /** Also applies on public holidays (a "PH" selector). */
  holidays: boolean;
  /** Minutes from midnight; the end can pass 1440 for hours past midnight. Empty = closed. */
  intervals: [number, number][];
  /** Added with ", " to the previous rule instead of replacing it. */
  additive: boolean;
}

export interface OpeningHours {
  rules: OpeningRule[];
  /** True when the value says what happens on public holidays. */
  mentionsHolidays: boolean;
  /** True for "24/7". */
  always: boolean;
}

export type OpenStatus =
  | { state: 'open'; /** "21:30"; null when open beyond the next week (24/7). */ closesAt: string | null }
  | { state: 'closed'; /** Next opening, when known: days from today and local time. */ opensAt: { inDays: number; time: string } | null }
  | { state: 'unknown' };

type Token =
  | { kind: 'day'; day: number }
  | { kind: 'ph' }
  | { kind: 'off' }
  | { kind: 'always' }
  | { kind: 'time'; minutes: number }
  | { kind: '-' }
  | { kind: ',' };

const DAY_NAMES = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const TOKEN = /^\s*(24\/7|mo|tu|we|th|fr|sa|su|ph|off|closed|\d{1,2}:\d{2}|-|,)/i;

function tokenize(text: string): Token[] | null {
  const out: Token[] = [];
  let rest = text.trim();
  while (rest.length > 0) {
    const m = TOKEN.exec(rest);
    if (!m) return null;
    const v = m[1]!.toLowerCase();
    rest = rest.slice(m[0].length);
    // A word or time must end here: "sunrise", "Mon" and "09:000" are not ours.
    if (/[a-z0-9]$/.test(v) && /^[a-z0-9]/i.test(rest)) return null;
    if (v === '24/7') out.push({ kind: 'always' });
    else if (v === 'ph') out.push({ kind: 'ph' });
    else if (v === 'off' || v === 'closed') out.push({ kind: 'off' });
    else if (v === '-' || v === ',') out.push({ kind: v });
    else if (v.includes(':')) {
      const [h, min] = v.split(':').map(Number) as [number, number];
      if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
      out.push({ kind: 'time', minutes: h * 60 + min });
    } else out.push({ kind: 'day', day: DAY_NAMES.indexOf(v) });
  }
  return out;
}

const startsSelector = (t: Token | undefined) => t?.kind === 'day' || t?.kind === 'ph';

/** Rules of one ";"-separated part, or null when it is outside the supported subset. */
function parsePart(toks: Token[]): OpeningRule[] | null {
  const rules: OpeningRule[] = [];
  let i = 0;
  let additive = false;
  while (i < toks.length) {
    const days = Array<boolean>(7).fill(false);
    let hasDays = false;
    let holidays = false;
    while (startsSelector(toks[i])) {
      const t = toks[i++]!;
      if (t.kind === 'ph') holidays = true;
      else if (t.kind === 'day') {
        let end = t.day;
        if (toks[i]?.kind === '-') {
          const to = toks[i + 1];
          if (to?.kind !== 'day') return null;
          end = to.day;
          i += 2;
        }
        // Ranges may wrap around the week ("Sa-Mo").
        for (let d = t.day; ; d = (d + 1) % 7) {
          days[d] = true;
          if (d === end) break;
        }
        hasDays = true;
      }
      if (toks[i]?.kind === ',' && startsSelector(toks[i + 1])) i++;
      else break;
    }

    const intervals: [number, number][] = [];
    const what = toks[i];
    if (what?.kind === 'off') i++;
    else if (what?.kind === 'always') {
      intervals.push([0, 1440]);
      i++;
    } else if (what?.kind === 'time') {
      for (;;) {
        const [from, dash, to] = [toks[i], toks[i + 1], toks[i + 2]];
        if (from?.kind !== 'time' || dash?.kind !== '-' || to?.kind !== 'time' || from.minutes >= 1440) return null;
        intervals.push([from.minutes, to.minutes > from.minutes ? to.minutes : to.minutes + 1440]);
        i += 3;
        if (toks[i]?.kind === ',' && toks[i + 1]?.kind === 'time') i++;
        else break;
      }
    } else return null;

    rules.push({ days: hasDays || holidays ? days : days.fill(true), holidays, intervals, additive });
    if (i === toks.length) break;
    // "Mo-Fr 09:00-20:00, Sa 09:00-14:00": a further rule that adds to this one.
    if (toks[i]?.kind === ',' && startsSelector(toks[i + 1])) {
      i++;
      additive = true;
    } else return null;
  }
  return rules;
}

/** Parses an OSM opening_hours value; null when empty or outside the supported subset. */
export function parseOpeningHours(text: string | null | undefined): OpeningHours | null {
  const value = text?.trim();
  if (!value) return null;
  const rules: OpeningRule[] = [];
  for (const part of value.split(';')) {
    if (!part.trim()) continue;
    const toks = tokenize(part);
    const parsed = toks && toks.length ? parsePart(toks) : null;
    if (!parsed) return null;
    rules.push(...parsed);
  }
  if (rules.length === 0) return null;
  return { rules, mentionsHolidays: rules.some((r) => r.holidays), always: value === '24/7' };
}

function dayIntervals(rules: OpeningRule[], weekday: number, holiday: boolean): [number, number][] {
  let current: [number, number][] = [];
  for (const r of rules) {
    if (!r.days[weekday] && !(r.holidays && holiday)) continue;
    if (r.intervals.length === 0) current = [];
    else current = r.additive ? [...current, ...r.intervals] : [...r.intervals];
  }
  return current;
}

const DAY_MS = 86_400_000;

function easterSunday(year: number): number {
  // Anonymous Gregorian algorithm.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return Date.UTC(year, Math.floor(n / 31) - 1, (n % 31) + 1);
}

/** Spain-wide and Catalan public holidays, plus 24 September (La Mercè). */
const FIXED_HOLIDAYS = new Set(['1-1', '1-6', '5-1', '6-24', '8-15', '9-11', '9-24', '10-12', '11-1', '12-6', '12-8', '12-25', '12-26']);

/**
 * Public holidays in Barcelona city: the fixed ones, Good Friday, Easter Monday and Whit
 * Monday (the city's other local holiday). Approximate: the official calendar sometimes
 * moves a holiday, so this is only used to avoid saying "open" when we can't know.
 */
export function isBarcelonaHoliday(year: number, month: number, day: number): boolean {
  if (FIXED_HOLIDAYS.has(`${month}-${day}`)) return true;
  const fromEaster = Math.round((Date.UTC(year, month - 1, day) - easterSunday(year)) / DAY_MS);
  return fromEaster === -2 || fromEaster === 1 || fromEaster === 50;
}

interface Span {
  start: number;
  end: number;
  /** False on a public holiday when the hours don't say what happens on holidays. */
  sure: boolean;
}

/**
 * Whether a shop is open at a moment, in Barcelona time. On a public holiday, hours that
 * don't mention holidays ("PH") can't tell us whether the shop opens, so the answer is
 * "unknown" during its usual opening times (and "closed" outside them).
 */
export function openStatus(hours: string | OpeningHours | null | undefined, at: Date): OpenStatus {
  const parsed = typeof hours === 'string' || hours == null ? parseOpeningHours(hours) : hours;
  if (!parsed) return { state: 'unknown' };
  const now = madridTime(at);
  const spans: Span[] = [];
  // Yesterday (hours past midnight) to a week ahead, in minutes from today's midnight.
  for (let k = -1; k <= 7; k++) {
    const date = new Date(Date.UTC(now.year, now.month - 1, now.day + k));
    const holiday = isBarcelonaHoliday(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    const sure = !holiday || parsed.mentionsHolidays || parsed.always;
    for (const [s, e] of dayIntervals(parsed.rules, (now.weekday + k + 7) % 7, holiday && parsed.mentionsHolidays)) {
      spans.push({ start: s + k * 1440, end: e + k * 1440, sure });
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const t = now.minutes;
  const covering = spans.filter((s) => s.start <= t && t < s.end);
  if (covering.some((s) => s.sure)) {
    let end = Math.max(...covering.filter((s) => s.sure).map((s) => s.end));
    for (const s of spans) if (s.sure && s.start <= end && s.end > end) end = s.end;
    return { state: 'open', closesAt: end >= 7 * 1440 ? null : clockTime(end) };
  }
  if (covering.length > 0) return { state: 'unknown' };
  const next = spans.find((s) => s.start > t);
  if (!next || !next.sure) return { state: 'closed', opensAt: null };
  return { state: 'closed', opensAt: { inDays: Math.floor(next.start / 1440), time: clockTime(next.start) } };
}
