/**
 * Event dates are CALENDAR dates stored as UTC midnight. toCalendarDate() must
 * return the same calendar day for every viewer timezone.
 */
process.env.TZ = 'America/Chicago';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { format } from 'date-fns';
import {
  toCalendarDate,
  isCalendarDatePast,
  isCalendarDateFuture,
  getAllDayCalendarRange,
} from '../date-utils';
import { buildEventICS } from '../event-calendar';

const ZONES = ['America/Chicago', 'UTC', 'Pacific/Auckland'] as const;

describe.each(ZONES)('calendar dates in %s', (tz) => {
  const prev = process.env.TZ;
  const setTz = () => { process.env.TZ = tz; };
  afterEach(() => { process.env.TZ = prev; vi.useRealTimers(); });

  it('runs in the requested timezone', () => {
    setTz();
    const jan = -new Date(2026, 0, 15).getTimezoneOffset();
    const expected = { 'America/Chicago': -360, UTC: 0, 'Pacific/Auckland': 780 }[tz];
    expect(jan === expected).toBe(true);
  });

  it.each([
    ['ISO string with Z', '2026-10-13T00:00:00.000Z'],
    ['ISO string without Z (API timestamp)', '2026-10-13T00:00:00'],
    ['Date object', new Date('2026-10-13T00:00:00.000Z')],
  ])('maps %s to Oct 13', (_label, input) => {
    setTz();
    // "without Z" strings are parsed as local by Date; the helper must treat them as UTC
    const d = toCalendarDate(input as any)!;
    expect(format(d, 'MMM d, yyyy')).toBe('Oct 13, 2026');
    expect(d.getHours()).toBe(0);
  });

  it('returns null for nullish and invalid input', () => {
    setTz();
    expect(toCalendarDate(null)).toBeNull();
    expect(toCalendarDate(undefined)).toBeNull();
    expect(toCalendarDate('')).toBeNull();
    expect(toCalendarDate('not-a-date')).toBeNull();
    expect(toCalendarDate(new Date('x'))).toBeNull();
  });

  it('an event dated today is not past and not future', () => {
    setTz();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 15, 0)); // 3pm local Oct 13
    const todayEvent = '2026-10-13T00:00:00.000Z';
    expect(isCalendarDatePast(todayEvent)).toBe(false);
    expect(isCalendarDateFuture(todayEvent)).toBe(false);
    expect(isCalendarDatePast('2026-10-12T00:00:00.000Z')).toBe(true);
    expect(isCalendarDateFuture('2026-10-14T00:00:00.000Z')).toBe(true);
  });

  it('all-day range uses UTC calendar days with exclusive end', () => {
    setTz();
    expect(getAllDayCalendarRange('2026-10-13T00:00:00.000Z', null)).toEqual({ start: '20261013', endExclusive: '20261014' });
    expect(getAllDayCalendarRange('2026-10-13T00:00:00.000Z', '2026-10-15T00:00:00.000Z')).toEqual({ start: '20261013', endExclusive: '20261016' });
    expect(getAllDayCalendarRange('2026-12-31T00:00:00.000Z', null)).toEqual({ start: '20261231', endExclusive: '20270101' });
  });

  it('ICS for a date-only event is all-day on the stored date', () => {
    setTz();
    const ics = buildEventICS({
      id: 'e1', name: 'Lucy Ortiz test', startDate: '2026-10-13T00:00:00.000Z', endDate: null,
      location: null, description: null,
    });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261013');
    expect(ics).toContain('DTEND;VALUE=DATE:20261014');
    expect(ics).not.toMatch(/DTSTART:/);
  });
});
