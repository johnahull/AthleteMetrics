/**
 * Freshness of an athlete's last wellness entry (AM-FEAT-027): "last entry N days ago" and the
 * "No recent data" threshold (more than 2 calendar days).
 */

import { describe, it, expect } from 'vitest';
import { getFreshness, formatLastEntry } from '../wellness-analytics';

describe('getFreshness', () => {
  it('counts calendar days between the entry date and today', () => {
    expect(getFreshness('2026-11-25', '2026-11-25')).toEqual({ daysAgo: 0, isStale: false });
    expect(getFreshness('2026-11-24', '2026-11-25')).toEqual({ daysAgo: 1, isStale: false });
    expect(getFreshness('2026-11-23', '2026-11-25')).toEqual({ daysAgo: 2, isStale: false });
  });

  it('is stale when the last entry is more than 2 days old', () => {
    expect(getFreshness('2026-11-22', '2026-11-25')).toEqual({ daysAgo: 3, isStale: true });
    expect(getFreshness('2026-10-01', '2026-11-25')).toEqual({ daysAgo: 55, isStale: true });
  });

  it('is stale when the athlete has never submitted', () => {
    expect(getFreshness(null, '2026-11-25')).toEqual({ daysAgo: null, isStale: true });
  });

  it('crosses month, year and DST boundaries by calendar day', () => {
    expect(getFreshness('2026-02-28', '2026-03-01').daysAgo).toBe(1);
    expect(getFreshness('2025-12-31', '2026-01-01').daysAgo).toBe(1);
    // US DST ends 2026-11-01: still exactly 1 calendar day
    expect(getFreshness('2026-10-31', '2026-11-01').daysAgo).toBe(1);
  });

  it('treats an entry dated after today (allowed +1 day window) as today', () => {
    expect(getFreshness('2026-11-26', '2026-11-25')).toEqual({ daysAgo: 0, isStale: false });
  });
});

describe('formatLastEntry', () => {
  it('describes how long ago the last entry was', () => {
    expect(formatLastEntry(0)).toBe('last entry today');
    expect(formatLastEntry(1)).toBe('last entry 1 day ago');
    expect(formatLastEntry(5)).toBe('last entry 5 days ago');
    expect(formatLastEntry(null)).toBe('no entries yet');
  });
});
