import { describe, expect, it } from 'vitest';
import { buildSampleData, isBarcelonaHoliday, madridOffsetByRule, madridOffsetMinutes, madridTime, openStatus, parseOpeningHours } from '../src';

/** A moment given as Barcelona wall-clock time with its UTC offset, e.g. at('2026-11-04T10:00', 1). */
const at = (local: string, offsetHours: number) => new Date(Date.parse(`${local}:00Z`) - offsetHours * 3_600_000);

const MERCADONA = 'Mo-Sa 09:00-21:30; Su off';

describe('Barcelona time', () => {
  it('follows summer time, whatever the device time zone', () => {
    expect(madridTime(new Date('2026-11-04T10:00:00Z'))).toEqual({ year: 2026, month: 11, day: 4, weekday: 2, minutes: 11 * 60 });
    expect(madridTime(new Date('2026-07-15T10:00:00Z')).minutes).toBe(12 * 60);
  });
  it('agrees with the EU summer-time rule fallback around every clock change', () => {
    for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2028, 0, 1); t += 30 * 60_000) {
      const d = new Date(t);
      if (madridOffsetByRule(d) !== madridOffsetMinutes(d)) throw new Error(`offset differs at ${d.toISOString()}`);
    }
    // 29 March 2026 01:00 UTC: 02:00 CET becomes 03:00 CEST.
    expect(madridOffsetByRule(new Date('2026-03-29T00:59:00Z'))).toBe(60);
    expect(madridOffsetByRule(new Date('2026-03-29T01:00:00Z'))).toBe(120);
    // 25 October 2026 01:00 UTC: 03:00 CEST becomes 02:00 CET.
    expect(madridOffsetByRule(new Date('2026-10-25T00:59:00Z'))).toBe(120);
    expect(madridOffsetByRule(new Date('2026-10-25T01:00:00Z'))).toBe(60);
  });
});

describe('opening hours parser', () => {
  it.each([
    'Mo-Sa 09:00-21:30',
    'Mo-Sa 09:00-21:30; Su off',
    'Mo-Sa 09:00-21:30; Su,PH off',
    'Mo-Fr 09:00-14:00,17:00-20:30; Sa 09:00-14:00',
    'Mo-Fr 08:30-21:30; Sa 09:00-21:30; Su 10:00-15:00; PH off',
    'Mo,We,Fr 09:00-13:00',
    'Mo-Sa 9:00-21:30',
    'Mo-Su 08:00-02:00',
    'Mo-Sa 09:00-21:30, Su 10:00-14:00',
    'Mo-Su 00:00-24:00',
    '24/7',
    '09:00-21:00',
    'Mo-Sa 09:00-21:30;',
    'mo-sa 09:00-21:30; su closed',
  ])('understands %s', (value) => {
    expect(parseOpeningHours(value)).not.toBeNull();
  });

  it.each([
    '',
    '   ',
    'sunrise-sunset',
    'Jan-Mar Mo-Fr 09:00-18:00',
    'Mo-Sa 09:00-21:30 "only in summer"',
    'Su[1] 10:00-14:00',
    'Lu-Sa 9:00-21:30',
    'Mon-Sat 09:00-21:30',
    'Mo-Sa 09:00-21:30 PH off',
    'Mo-Sa 09:00+',
    'Mo-Fr 09:00-14:00 17:00-20:00',
    'Mo-Sa 25:00-26:00',
    'Mo-Sa',
    'Dec 25 off',
    'Mo-Sa 09:00-21:30 || "by appointment"',
  ])('refuses to guess for %j', (value) => {
    expect(parseOpeningHours(value)).toBeNull();
    expect(openStatus(value, new Date('2026-11-04T10:00:00Z'))).toEqual({ state: 'unknown' });
  });

  it('is unknown without opening hours', () => {
    expect(openStatus(undefined, new Date())).toEqual({ state: 'unknown' });
  });

  it('understands every sample store', () => {
    for (const s of buildSampleData(new Date('2026-11-04T10:00:00Z')).stores) {
      if (s.openingHours) expect(parseOpeningHours(s.openingHours), s.openingHours).not.toBeNull();
    }
  });
});

describe('open now (Barcelona time)', () => {
  it('opens and closes on time on an ordinary weekday', () => {
    // Wednesday 4 November 2026 (winter time, UTC+1).
    expect(openStatus(MERCADONA, at('2026-11-04T08:59', 1))).toEqual({ state: 'closed', opensAt: { inDays: 0, time: '09:00' } });
    expect(openStatus(MERCADONA, at('2026-11-04T09:00', 1))).toEqual({ state: 'open', closesAt: '21:30' });
    expect(openStatus(MERCADONA, at('2026-11-04T21:29', 1))).toMatchObject({ state: 'open' });
    expect(openStatus(MERCADONA, at('2026-11-04T21:30', 1))).toEqual({ state: 'closed', opensAt: { inDays: 1, time: '09:00' } });
  });

  it('skips Sunday closing', () => {
    // Saturday 7 November 22:00 -> Monday 09:00.
    expect(openStatus(MERCADONA, at('2026-11-07T22:00', 1))).toEqual({ state: 'closed', opensAt: { inDays: 2, time: '09:00' } });
    expect(openStatus(MERCADONA, at('2026-11-08T12:00', 1))).toEqual({ state: 'closed', opensAt: { inDays: 1, time: '09:00' } });
  });

  it('handles a lunch break', () => {
    const hours = 'Mo-Fr 09:00-14:00,17:00-20:30; Sa 09:00-14:00';
    expect(openStatus(hours, at('2026-11-04T15:00', 1))).toEqual({ state: 'closed', opensAt: { inDays: 0, time: '17:00' } });
    expect(openStatus(hours, at('2026-11-04T18:00', 1))).toEqual({ state: 'open', closesAt: '20:30' });
    expect(openStatus(hours, at('2026-11-07T15:00', 1))).toEqual({ state: 'closed', opensAt: { inDays: 2, time: '09:00' } });
  });

  it('uses summer time after the March clock change', () => {
    // Monday 30 March 2026 07:30 UTC is 09:30 in Barcelona (UTC+2), not 08:30.
    expect(openStatus(MERCADONA, new Date('2026-03-30T07:30:00Z'))).toEqual({ state: 'open', closesAt: '21:30' });
    // Saturday 28 March, still winter time: 07:30 UTC is 08:30.
    expect(openStatus(MERCADONA, new Date('2026-03-28T07:30:00Z'))).toEqual({ state: 'closed', opensAt: { inDays: 0, time: '09:00' } });
  });

  it('uses winter time after the October clock change', () => {
    // Saturday 24 October 2026 (summer time): 07:30 UTC is 09:30.
    expect(openStatus(MERCADONA, new Date('2026-10-24T07:30:00Z'))).toMatchObject({ state: 'open' });
    // Monday 26 October (winter time): 07:30 UTC is 08:30.
    expect(openStatus(MERCADONA, new Date('2026-10-26T07:30:00Z'))).toEqual({ state: 'closed', opensAt: { inDays: 0, time: '09:00' } });
    // Sunday 25 October, the clock-change day itself.
    expect(openStatus('Mo-Su 08:00-22:00', new Date('2026-10-25T07:30:00Z'))).toEqual({ state: 'open', closesAt: '22:00' });
  });

  it('carries hours past midnight into the next day', () => {
    const late = 'Mo-Su 08:00-02:00';
    expect(openStatus(late, at('2026-11-04T01:30', 1))).toEqual({ state: 'open', closesAt: '02:00' });
    expect(openStatus(late, at('2026-11-04T03:00', 1))).toEqual({ state: 'closed', opensAt: { inDays: 0, time: '08:00' } });
    expect(openStatus(late, at('2026-11-04T23:00', 1))).toEqual({ state: 'open', closesAt: '02:00' });
  });

  it('is always open for 24/7', () => {
    expect(openStatus('24/7', at('2026-11-04T03:00', 1))).toEqual({ state: 'open', closesAt: null });
    expect(openStatus('24/7', at('2026-12-25T03:00', 1))).toEqual({ state: 'open', closesAt: null });
  });

  it('lets a later rule replace an earlier one, and ", " add to it', () => {
    expect(openStatus('Mo-Su 09:00-21:00; Su off', at('2026-11-08T12:00', 1))).toMatchObject({ state: 'closed' });
    expect(openStatus('Mo-Sa 09:00-21:30, Su 10:00-14:00', at('2026-11-08T12:00', 1))).toEqual({ state: 'open', closesAt: '14:00' });
  });

  it('follows PH rules on public holidays', () => {
    // Tuesday 8 December 2026 is a public holiday.
    const hours = 'Mo-Sa 09:00-21:30; Su,PH off';
    expect(isBarcelonaHoliday(2026, 12, 8)).toBe(true);
    expect(openStatus(hours, at('2026-12-08T12:00', 1))).toEqual({ state: 'closed', opensAt: { inDays: 1, time: '09:00' } });
    expect(openStatus(hours, at('2026-12-07T22:00', 1))).toEqual({ state: 'closed', opensAt: { inDays: 2, time: '09:00' } });
    // Christmas Eve (Thursday) evening: Christmas, Sant Esteve and Sunday are all closed.
    expect(openStatus(hours, at('2026-12-24T22:00', 1))).toEqual({ state: 'closed', opensAt: { inDays: 4, time: '09:00' } });
    expect(openStatus('Mo-Sa 09:00-21:30; PH 10:00-14:00', at('2026-12-08T12:00', 1))).toEqual({ state: 'open', closesAt: '14:00' });
  });

  it("doesn't guess on a public holiday when the hours don't mention holidays", () => {
    const hours = 'Mo-Sa 09:00-21:30';
    expect(openStatus(hours, at('2026-12-08T12:00', 1))).toEqual({ state: 'unknown' });
    // Outside the usual hours it's closed either way.
    expect(openStatus(hours, at('2026-12-08T22:00', 1))).toEqual({ state: 'closed', opensAt: { inDays: 1, time: '09:00' } });
    // The day before: it may or may not open tomorrow, so no opening time.
    expect(openStatus(hours, at('2026-12-07T22:00', 1))).toEqual({ state: 'closed', opensAt: null });
  });

  it('knows the moveable holidays', () => {
    // 2026: Good Friday 3 April, Easter Monday 6 April, Whit Monday 25 May (Barcelona).
    expect([3, 6].map((d) => isBarcelonaHoliday(2026, 4, d))).toEqual([true, true]);
    expect(isBarcelonaHoliday(2026, 5, 25)).toBe(true);
    expect(isBarcelonaHoliday(2026, 4, 5)).toBe(false);
    expect(isBarcelonaHoliday(2026, 11, 4)).toBe(false);
  });
});
