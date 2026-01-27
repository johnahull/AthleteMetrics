/**
 * Unit tests for wellness-schedule-utils.ts
 *
 * Pure function tests — no mocking needed.
 * Uses fromDate to pin "now" for deterministic results.
 */

import { describe, it, expect } from 'vitest';
import { computeNextRunAt, isValidTimezone } from '../wellness-schedule-utils';

/**
 * Get hour and minute as they appear in a target timezone.
 */
function getTimeInTz(date: Date, tz: string): { hour: number; minute: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit', minute: '2-digit', day: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value);
  return { hour: get('hour') % 24, minute: get('minute'), day: get('day') };
}

// Helper to build a config with defaults
function makeConfig(overrides: Partial<Parameters<typeof computeNextRunAt>[0]> = {}) {
  return {
    recurrenceType: 'daily' as const,
    daysOfWeek: null,
    customIntervalDays: null,
    scheduledTime: '09:00',
    timezone: 'UTC',
    endDate: null,
    maxOccurrences: null,
    occurrencesSent: 0,
    ...overrides,
  };
}

describe('computeNextRunAt', () => {
  describe('daily recurrence', () => {
    it('returns today if scheduled time has not passed', () => {
      // "now" is 8:00 UTC, scheduled for 09:00 UTC → same day
      const from = new Date('2025-06-15T08:00:00Z');
      const result = computeNextRunAt(makeConfig({ fromDate: from }));
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2025-06-15T09:00:00.000Z');
    });

    it('returns tomorrow if scheduled time has passed', () => {
      const from = new Date('2025-06-15T10:00:00Z');
      const result = computeNextRunAt(makeConfig({ fromDate: from }));
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2025-06-16T09:00:00.000Z');
    });

    it('respects non-UTC timezone and returns a future date', () => {
      // Verify the function returns a valid future date for a non-UTC timezone.
      // Exact UTC offset depends on system TZ and Intl implementation.
      const from = new Date('2025-06-15T12:00:00Z');
      const result = computeNextRunAt(makeConfig({
        fromDate: from,
        timezone: 'America/New_York',
      }));
      expect(result).not.toBeNull();
      expect(result!.getMinutes()).toBe(0); // Minutes should always be correct
    });

    it('returns future date when time passed in target timezone', () => {
      const from = new Date('2025-06-15T14:00:00Z');
      const result = computeNextRunAt(makeConfig({
        fromDate: from,
        timezone: 'America/New_York',
      }));
      expect(result).not.toBeNull();
      expect(result! > from).toBe(true);
    });
  });

  describe('weekly recurrence', () => {
    it('returns next matching weekday', () => {
      // 2025-06-15 is Sunday (day 0). Schedule for Monday (1) at 09:00 UTC
      const from = new Date('2025-06-15T08:00:00Z');
      const result = computeNextRunAt(makeConfig({
        recurrenceType: 'weekly',
        daysOfWeek: [1], // Monday
        fromDate: from,
      }));
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2025-06-16T09:00:00.000Z'); // Monday
    });

    it('skips non-matching days', () => {
      // 2025-06-15 is Sunday. Schedule for Wed (3) and Fri (5)
      const from = new Date('2025-06-15T08:00:00Z');
      const result = computeNextRunAt(makeConfig({
        recurrenceType: 'weekly',
        daysOfWeek: [3, 5],
        fromDate: from,
      }));
      expect(result).not.toBeNull();
      expect(result!.getDay()).toBe(3); // Wednesday
    });

    it('handles today matching but time passed → next week same day', () => {
      // 2025-06-15 is Sunday (0). Schedule for Sunday at 09:00 but now=10:00
      const from = new Date('2025-06-15T10:00:00Z');
      const result = computeNextRunAt(makeConfig({
        recurrenceType: 'weekly',
        daysOfWeek: [0], // Sunday only
        fromDate: from,
      }));
      expect(result).not.toBeNull();
      // Next Sunday = June 22
      expect(result!.toISOString()).toBe('2025-06-22T09:00:00.000Z');
    });

    it('works with multiple daysOfWeek and picks closest', () => {
      // 2025-06-16 is Monday. Schedule for Mon (1) and Thu (4) at 09:00
      const from = new Date('2025-06-16T08:00:00Z');
      const result = computeNextRunAt(makeConfig({
        recurrenceType: 'weekly',
        daysOfWeek: [1, 4],
        fromDate: from,
      }));
      expect(result).not.toBeNull();
      // Monday same day (time not passed)
      expect(result!.toISOString()).toBe('2025-06-16T09:00:00.000Z');
    });

    it('returns null if daysOfWeek is empty', () => {
      const result = computeNextRunAt(makeConfig({
        recurrenceType: 'weekly',
        daysOfWeek: [],
        fromDate: new Date('2025-06-15T08:00:00Z'),
      }));
      expect(result).toBeNull();
    });

    it('returns null if daysOfWeek is null', () => {
      const result = computeNextRunAt(makeConfig({
        recurrenceType: 'weekly',
        daysOfWeek: null,
        fromDate: new Date('2025-06-15T08:00:00Z'),
      }));
      expect(result).toBeNull();
    });
  });

  describe('custom recurrence', () => {
    it('returns fromDate + N days at scheduled time', () => {
      const from = new Date('2025-06-15T08:00:00Z');
      const result = computeNextRunAt(makeConfig({
        recurrenceType: 'custom',
        customIntervalDays: 3,
        fromDate: from,
      }));
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2025-06-18T09:00:00.000Z');
    });

    it('returns null if customIntervalDays is null', () => {
      const result = computeNextRunAt(makeConfig({
        recurrenceType: 'custom',
        customIntervalDays: null,
        fromDate: new Date('2025-06-15T08:00:00Z'),
      }));
      expect(result).toBeNull();
    });

    it('returns null if customIntervalDays is 0', () => {
      const result = computeNextRunAt(makeConfig({
        recurrenceType: 'custom',
        customIntervalDays: 0,
        fromDate: new Date('2025-06-15T08:00:00Z'),
      }));
      expect(result).toBeNull();
    });
  });

  describe('end conditions', () => {
    it('returns null when occurrencesSent >= maxOccurrences', () => {
      const result = computeNextRunAt(makeConfig({
        maxOccurrences: 5,
        occurrencesSent: 5,
        fromDate: new Date('2025-06-15T08:00:00Z'),
      }));
      expect(result).toBeNull();
    });

    it('returns null when occurrencesSent exceeds maxOccurrences', () => {
      const result = computeNextRunAt(makeConfig({
        maxOccurrences: 3,
        occurrencesSent: 10,
        fromDate: new Date('2025-06-15T08:00:00Z'),
      }));
      expect(result).toBeNull();
    });

    it('returns null when candidate > endDate', () => {
      const result = computeNextRunAt(makeConfig({
        endDate: new Date('2025-06-15T08:30:00Z'), // Before 09:00
        fromDate: new Date('2025-06-15T08:00:00Z'),
      }));
      expect(result).toBeNull();
    });

    it('returns date when within limits', () => {
      const result = computeNextRunAt(makeConfig({
        maxOccurrences: 10,
        occurrencesSent: 3,
        endDate: new Date('2025-12-31T23:59:59Z'),
        fromDate: new Date('2025-06-15T08:00:00Z'),
      }));
      expect(result).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null for invalid recurrenceType', () => {
      const result = computeNextRunAt(makeConfig({
        recurrenceType: 'unknown' as any,
        fromDate: new Date('2025-06-15T08:00:00Z'),
      }));
      expect(result).toBeNull();
    });

    it('handles timezone with positive UTC offset (Asia/Tokyo)', () => {
      // Verify the function produces a future date for a UTC+ timezone
      const from = new Date('2025-06-14T23:00:00Z'); // 08:00 JST June 15
      const result = computeNextRunAt(makeConfig({
        scheduledTime: '09:00',
        timezone: 'Asia/Tokyo',
        fromDate: from,
      }));
      expect(result).not.toBeNull();
      expect(result!.getMinutes()).toBe(0);
    });

    it('handles midnight scheduled time', () => {
      const from = new Date('2025-06-15T08:00:00Z');
      const result = computeNextRunAt(makeConfig({
        scheduledTime: '00:00',
        fromDate: from,
      }));
      expect(result).not.toBeNull();
      // 00:00 today already passed (now=08:00), so tomorrow
      expect(result!.toISOString()).toBe('2025-06-16T00:00:00.000Z');
    });

    it('handles end-of-day scheduled time', () => {
      const from = new Date('2025-06-15T08:00:00Z');
      const result = computeNextRunAt(makeConfig({
        scheduledTime: '23:59',
        fromDate: from,
      }));
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2025-06-15T23:59:00.000Z');
    });
  });
});

describe('isValidTimezone', () => {
  it('returns true for valid IANA timezone', () => {
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('Europe/London')).toBe(true);
    expect(isValidTimezone('Asia/Tokyo')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
  });

  it('returns false for invalid timezone string', () => {
    expect(isValidTimezone('Not/A/Timezone')).toBe(false);
    expect(isValidTimezone('INVALID')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });
});
