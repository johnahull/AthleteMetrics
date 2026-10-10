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

const FIXED_NOW = new Date('2026-10-09T12:34:56.000Z');

describe('offset-less strings are UTC in every consumer (Pacific/Auckland)', () => {
  const prev = process.env.TZ;
  afterEach(() => { process.env.TZ = prev; });

  it('toCalendarDate and getAllDayCalendarRange agree on "2026-10-13T00:00:00"', () => {
    process.env.TZ = 'Pacific/Auckland';
    expect(format(toCalendarDate('2026-10-13T00:00:00')!, 'yyyyMMdd')).toBe('20261013');
    expect(getAllDayCalendarRange('2026-10-13T00:00:00', null)).toEqual({ start: '20261013', endExclusive: '20261014' });
    expect(getAllDayCalendarRange('2026-10-13T00:00:00', '2026-10-15T00:00:00'))
      .toEqual({ start: '20261013', endExclusive: '20261016' });
  });

  it('accepts the space-separated raw pg form', () => {
    process.env.TZ = 'Pacific/Auckland';
    expect(format(toCalendarDate('2026-10-13 00:00:00')!, 'yyyyMMdd')).toBe('20261013');
    expect(format(toCalendarDate('2026-10-13 00:00:00.000')!, 'yyyyMMdd')).toBe('20261013');
    expect(getAllDayCalendarRange('2026-10-13 00:00:00', null)).toEqual({ start: '20261013', endExclusive: '20261014' });
    process.env.TZ = 'America/Chicago';
    expect(format(toCalendarDate('2026-10-13 00:00:00')!, 'yyyyMMdd')).toBe('20261013');
  });
});

describe('toCalendarDate on a DST-gap day (local midnight does not exist)', () => {
  const prev = process.env.TZ;
  afterEach(() => { process.env.TZ = prev; });

  it.each([
    ['America/Sao_Paulo', '2018-11-04T00:00:00.000Z', 2018, 10, 4],
    ['Asia/Beirut', '2026-03-29T00:00:00.000Z', 2026, 2, 29],
  ])('%s keeps the calendar day', (tz, iso, y, m, d) => {
    process.env.TZ = tz;
    const day = toCalendarDate(iso)!;
    expect(day.getFullYear()).toBe(y);
    expect(day.getMonth()).toBe(m);
    expect(day.getDate()).toBe(d);
  });
});

describe('buildEventICS RFC 5545 compliance', () => {
  const base = { id: 'e1', name: 'Meet', startDate: '2026-10-13T00:00:00.000Z', endDate: null as string | null, location: null, description: null };

  it('includes DTSTAMP from the injected clock in UTC basic format', () => {
    expect(buildEventICS(base, FIXED_NOW)).toContain('\r\nDTSTAMP:20261009T123456Z\r\n');
  });

  it('uses CRLF line endings only, and ends with CRLF', () => {
    const ics = buildEventICS(base, FIXED_NOW);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('keeps UID, all-day VALUE=DATE and exclusive end', () => {
    const ics = buildEventICS(base, FIXED_NOW);
    expect(ics).toContain('UID:e1@athletemetrics.app\r\n');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261013\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261014\r\n');
  });

  it('escapes backslash, semicolon, comma and newlines in text fields', () => {
    const ics = buildEventICS(
      { ...base, name: 'A, B; C\\D', location: 'Gym; Room 2, North', description: 'line1\nline2\r\nline3, ok' },
      FIXED_NOW
    );
    expect(ics).toContain('SUMMARY:A\\, B\\; C\\\\D\r\n');
    expect(ics).toContain('LOCATION:Gym\\; Room 2\\, North\r\n');
    expect(ics).toContain('DESCRIPTION:line1\\nline2\\nline3\\, ok\r\n');
  });

  it('folds lines over 75 octets without splitting multi-byte characters', () => {
    const desc = 'é'.repeat(60) + '日本語'.repeat(20) + 'x'.repeat(100);
    const ics = buildEventICS({ ...base, description: desc }, FIXED_NOW);
    const lines = ics.split('\r\n');
    for (const line of lines) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, '')).toContain('DESCRIPTION:' + desc + '\r\n');
    expect(lines.some((l) => l.startsWith(' '))).toBe(true);
    expect(ics).not.toContain('�');
  });

  it('omits LOCATION and DESCRIPTION lines when empty (optional in RFC 5545)', () => {
    const ics = buildEventICS({ ...base, location: '', description: null }, FIXED_NOW);
    expect(ics).not.toContain('LOCATION');
    expect(ics).not.toContain('DESCRIPTION');
    expect(ics).toContain('SUMMARY:');
  });
});
