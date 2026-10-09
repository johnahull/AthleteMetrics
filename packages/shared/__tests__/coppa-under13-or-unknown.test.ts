/**
 * isUnder13OrUnknownDob: non-throwing, fail-closed wrapper used by the share-to-athlete guard (AM-FEAT-019 P4).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isUnder13OrUnknownDob } from '../coppa-utils';

describe('isUnder13OrUnknownDob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); // 2026-06-15 local
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['garbage string', 'not-a-date'],
    ['future date', '2030-01-01'],
    ['invalid Date', new Date('nope')],
    ['impossible calendar date', '2013-02-30'],
    ['year 0013', '0013-05-01'],
    ['two digit year', '99-01-01'],
    ['DD-MM-YYYY order', '01-01-1990'],
    ['year before 1900', '1850-01-01'],
  ])('fails closed (true) for %s', (_label, dob) => {
    expect(isUnder13OrUnknownDob(dob as any)).toBe(true);
  });

  it('is false when the person turns 13 today', () => {
    expect(isUnder13OrUnknownDob('2013-06-15')).toBe(false);
  });

  it('is true one day short of 13', () => {
    expect(isUnder13OrUnknownDob('2013-06-16')).toBe(true);
  });

  it('is true for a 12 year old and false for a 30 year old', () => {
    expect(isUnder13OrUnknownDob('2013-12-01')).toBe(true);
    expect(isUnder13OrUnknownDob('1996-01-01')).toBe(false);
  });
});
