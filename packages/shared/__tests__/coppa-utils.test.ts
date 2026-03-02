/**
 * Unit tests for COPPA utility functions.
 *
 * LEGAL EXPOSURE: Several of these tests verify legally critical boundary
 * conditions. Failures here are ship blockers — incorrect age-gating has
 * direct regulatory consequences under 16 CFR Part 312 (COPPA Rule).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateAge,
  isUnder13,
  wasUnder13At,
  getConsentTokenExpiry,
  getAuditRetentionDate,
  COPPA_AGE_THRESHOLD,
  CONSENT_TOKEN_EXPIRY_DAYS,
  COPPA_AUDIT_RETENTION_YEARS,
  COPPA_ACTIONS,
} from '../coppa-utils';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a YYYY-MM-DD date string relative to today.
 *
 * yearsAgo=13, offsetDays=0  → the person's birthday is exactly 13 years ago today
 * yearsAgo=13, offsetDays=-1 → birthday was yesterday = 13y 1d ago (still under 13? no — already turned 13)
 * yearsAgo=13, offsetDays=+1 → birthday is tomorrow = 12y 364d ago (still under 13)
 */
function birthdayRelativeToToday(yearsAgo: number, offsetDays = 0): string {
  const today = new Date();
  const birth = new Date(today);
  birth.setFullYear(birth.getFullYear() - yearsAgo);
  birth.setDate(birth.getDate() + offsetDays);
  // Use LOCAL date parts — toISOString() converts to UTC which shifts the
  // date in UTC+ timezones, breaking age boundary tests.
  const y = birth.getFullYear();
  const m = String(birth.getMonth() + 1).padStart(2, '0');
  const d = String(birth.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ============================================================================
// calculateAge()
// ============================================================================

describe('calculateAge()', () => {
  it('returns 13 when someone turns 13 today', () => {
    const birthDate = birthdayRelativeToToday(13, 0);
    expect(calculateAge(birthDate)).toBe(13);
  });

  it('returns 12 when the 13th birthday is tomorrow', () => {
    const birthDate = birthdayRelativeToToday(13, 1); // birthday is 1 day in the future relative to 13y ago
    expect(calculateAge(birthDate)).toBe(12);
  });

  it('returns 12 for someone who is 12 years and 364 days old', () => {
    const birthDate = birthdayRelativeToToday(13, 1);
    expect(calculateAge(birthDate)).toBe(12);
  });

  it('returns 13 when birthday was yesterday (day after turning 13)', () => {
    const birthDate = birthdayRelativeToToday(13, -1);
    expect(calculateAge(birthDate)).toBe(13);
  });

  it('returns correct age for a 25-year-old', () => {
    const birthDate = birthdayRelativeToToday(25, 0);
    expect(calculateAge(birthDate)).toBe(25);
  });

  it('returns 0 for someone born today', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(calculateAge(today)).toBe(0);
  });

  it('accepts Date objects as well as strings', () => {
    const birth = new Date();
    birth.setFullYear(birth.getFullYear() - 20);
    expect(calculateAge(birth)).toBe(20);
  });

  it('throws for a future date', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const futureDateStr = tomorrow.toISOString().split('T')[0];
    expect(() => calculateAge(futureDateStr)).toThrow();
  });

  it('throws for null input', () => {
    // @ts-expect-error — intentionally testing JS runtime path
    expect(() => calculateAge(null)).toThrow('birthDate is required');
  });

  it('throws for undefined input', () => {
    // @ts-expect-error — intentionally testing JS runtime path
    expect(() => calculateAge(undefined)).toThrow('birthDate is required');
  });

  it('throws for an invalid date string', () => {
    expect(() => calculateAge('not-a-date')).toThrow();
  });

  it('handles the leap-year edge case (Feb 29 birthday) without throwing', () => {
    // 2000-02-29 is a valid leap-year birthday. calculateAge should not throw even
    // in non-leap years because JS Date normalisation handles the month boundary.
    // We just verify it returns a non-negative integer.
    const age = calculateAge('2000-02-29');
    expect(typeof age).toBe('number');
    expect(age).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// isUnder13() — LEGAL EXPOSURE: boundary conditions are ship blockers
// ============================================================================

describe('isUnder13() — LEGAL EXPOSURE', () => {
  /**
   * SHIP BLOCKER: A child who turns 13 TODAY is NOT under 13.
   * Returning true here would block a 13-year-old from logging in — a legal mistake
   * in the opposite direction (over-restricting adults who have turned 13).
   * Returning false incorrectly for a 12-year-old is the critical COPPA violation.
   */
  it('[LEGAL] returns false when someone turns 13 today — birthday is today', () => {
    const birthDate = birthdayRelativeToToday(13, 0);
    expect(isUnder13(birthDate)).toBe(false);
  });

  /**
   * SHIP BLOCKER: Someone whose 13th birthday is TOMORROW is still under 13.
   * This is 12 years + 364 days. Must return true.
   */
  it('[LEGAL] returns true when the 13th birthday is tomorrow — still 12 years old', () => {
    const birthDate = birthdayRelativeToToday(13, 1);
    expect(isUnder13(birthDate)).toBe(true);
  });

  it('[LEGAL] returns true for someone who is 12 years and 364 days old', () => {
    // Identical to the "birthday tomorrow" case — explicit for clarity
    const birthDate = birthdayRelativeToToday(13, 1);
    expect(isUnder13(birthDate)).toBe(true);
  });

  it('[LEGAL] returns false for someone who turned 13 yesterday', () => {
    const birthDate = birthdayRelativeToToday(13, -1);
    expect(isUnder13(birthDate)).toBe(false);
  });

  it('returns false for a 25-year-old', () => {
    const birthDate = birthdayRelativeToToday(25, 0);
    expect(isUnder13(birthDate)).toBe(false);
  });

  it('returns true for a 10-year-old', () => {
    const birthDate = birthdayRelativeToToday(10, 0);
    expect(isUnder13(birthDate)).toBe(true);
  });

  it('returns false when age equals COPPA_AGE_THRESHOLD (13)', () => {
    const birthDate = birthdayRelativeToToday(COPPA_AGE_THRESHOLD, 0);
    // Exactly at threshold — should NOT be considered under 13
    expect(isUnder13(birthDate)).toBe(false);
  });

  it('returns true when age is one day below COPPA_AGE_THRESHOLD', () => {
    const birthDate = birthdayRelativeToToday(COPPA_AGE_THRESHOLD, 1);
    expect(isUnder13(birthDate)).toBe(true);
  });

  it('throws for a future date', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(() => isUnder13(tomorrow.toISOString().split('T')[0])).toThrow();
  });

  it('throws for null', () => {
    // @ts-expect-error — testing runtime path
    expect(() => isUnder13(null)).toThrow();
  });

  it('throws for undefined', () => {
    // @ts-expect-error — testing runtime path
    expect(() => isUnder13(undefined)).toThrow();
  });
});

// ============================================================================
// wasUnder13At() — LEGAL EXPOSURE: retroactive age-at-collection check
// ============================================================================

describe('wasUnder13At() — LEGAL EXPOSURE', () => {
  /**
   * Build a referenceDate that is exactly `yearsAfterBirth` years and
   * `offsetDays` days after a birth date expressed as local-midnight.
   *
   * Returns { birthDate, referenceDate } where birthDate is a YYYY-MM-DD string
   * and referenceDate is a Date object.
   */
  function buildScenario(ageAtReference: number, offsetDays = 0) {
    // Pick a fixed anchor so tests are deterministic regardless of today's date.
    // Use 2010-06-15 as the birth date to avoid Feb-29 leap-year edge cases.
    const birth = new Date(2010, 5, 15); // June 15 2010, local midnight
    const birthDate = '2010-06-15';

    const ref = new Date(birth);
    ref.setFullYear(ref.getFullYear() + ageAtReference);
    ref.setDate(ref.getDate() + offsetDays);

    return { birthDate, referenceDate: ref };
  }

  /**
   * SHIP BLOCKER: User was 12 years 364 days at referenceDate — must return true.
   * One day before the 13th birthday the person is still under 13.
   */
  it('[LEGAL] returns true when user was 12y 364d at referenceDate (day before 13th birthday)', () => {
    // ageAtReference=13 then offsetDays=-1 means ref is one day before the 13th birthday
    // i.e. the user is exactly 12 years 364 days old at referenceDate
    const { birthDate, referenceDate } = buildScenario(13, -1);
    expect(wasUnder13At(birthDate, referenceDate)).toBe(true);
  });

  /**
   * SHIP BLOCKER: User turned exactly 13 on referenceDate — must return false.
   * "A child who turns 13 today is NOT under 13."
   */
  it('[LEGAL] returns false when user turned exactly 13 on referenceDate (birthday)', () => {
    const { birthDate, referenceDate } = buildScenario(13, 0);
    expect(wasUnder13At(birthDate, referenceDate)).toBe(false);
  });

  it('returns false when user was 15 at referenceDate', () => {
    const { birthDate, referenceDate } = buildScenario(15, 0);
    expect(wasUnder13At(birthDate, referenceDate)).toBe(false);
  });

  it('returns true when user was 5 at referenceDate', () => {
    const { birthDate, referenceDate } = buildScenario(5, 0);
    expect(wasUnder13At(birthDate, referenceDate)).toBe(true);
  });

  it('throws when birthDate is null', () => {
    const ref = new Date(2020, 0, 1);
    // @ts-expect-error — intentionally testing JS runtime path
    expect(() => wasUnder13At(null, ref)).toThrow('birthDate is required');
  });

  it('throws when birthDate is undefined', () => {
    const ref = new Date(2020, 0, 1);
    // @ts-expect-error — intentionally testing JS runtime path
    expect(() => wasUnder13At(undefined, ref)).toThrow('birthDate is required');
  });

  /**
   * Edge case: reference date is the day before the 13th birthday → true.
   * Identical intent to the 12y364d test above but stated explicitly as an
   * edge case for clarity in legal review.
   */
  it('[LEGAL] edge case: reference date is the day before 13th birthday → true', () => {
    const { birthDate, referenceDate } = buildScenario(13, -1);
    expect(wasUnder13At(birthDate, referenceDate)).toBe(true);
  });

  /**
   * Edge case: reference date IS the 13th birthday → false.
   * The person has completed 13 years; they are no longer under 13.
   */
  it('[LEGAL] edge case: reference date is the day of 13th birthday → false', () => {
    const { birthDate, referenceDate } = buildScenario(13, 0);
    expect(wasUnder13At(birthDate, referenceDate)).toBe(false);
  });

  it('accepts Date objects as birthDate', () => {
    const birth = new Date(2010, 5, 15); // June 15 2010
    const ref = new Date(2022, 5, 14);  // June 14 2022 — 11y 364d → under 13
    expect(wasUnder13At(birth, ref)).toBe(true);
  });

  it('throws when birthDate is after referenceDate', () => {
    const birth = new Date(2020, 0, 1);
    const ref = new Date(2019, 0, 1); // ref is before birth
    expect(() => wasUnder13At(birth, ref)).toThrow();
  });
});

// ============================================================================
// getConsentTokenExpiry()
// ============================================================================

describe('getConsentTokenExpiry()', () => {
  it('returns a date approximately 30 days in the future', () => {
    const expiry = getConsentTokenExpiry();
    const now = new Date();

    // setDate() operates on calendar days, so we compare calendar-day offsets
    // rather than exact milliseconds (DST transitions can cause ±1 hour differences).
    const expiryDayOfYear = Math.floor(expiry.getTime() / (24 * 60 * 60 * 1000));
    const nowDayOfYear = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
    const daysDiff = expiryDayOfYear - nowDayOfYear;

    // Allow ±1 day tolerance for DST and timezone offsets
    expect(daysDiff).toBeGreaterThanOrEqual(CONSENT_TOKEN_EXPIRY_DAYS - 1);
    expect(daysDiff).toBeLessThanOrEqual(CONSENT_TOKEN_EXPIRY_DAYS + 1);
  });

  it('returns a Date object', () => {
    expect(getConsentTokenExpiry()).toBeInstanceOf(Date);
  });

  it('expiry is in the future', () => {
    expect(getConsentTokenExpiry().getTime()).toBeGreaterThan(Date.now());
  });
});

// ============================================================================
// getAuditRetentionDate()
// ============================================================================

describe('getAuditRetentionDate()', () => {
  it('returns a date approximately 5 years in the future', () => {
    const now = new Date();
    const retention = getAuditRetentionDate();

    // Should be within 1 year of 5 years from now (generous tolerance)
    const expectedYear = now.getFullYear() + COPPA_AUDIT_RETENTION_YEARS;
    expect(retention.getFullYear()).toBe(expectedYear);
  });

  it('returns a Date object', () => {
    expect(getAuditRetentionDate()).toBeInstanceOf(Date);
  });

  it('retention date is in the future', () => {
    expect(getAuditRetentionDate().getTime()).toBeGreaterThan(Date.now());
  });
});

// ============================================================================
// COPPA_ACTIONS constants
// ============================================================================

describe('COPPA_ACTIONS constants', () => {
  it('has all required action keys', () => {
    const requiredKeys = [
      'CONSENT_INITIATED',
      'CONSENT_CONFIRMED',
      'CONSENT_DENIED',
      'CONSENT_REVOKED',
      'AI_CONSENT_GRANTED',
      'AI_CONSENT_DENIED',
      'TOKEN_EXPIRED',
      'CONSENT_EMAIL_RESENT',
      'RETROACTIVE_SCAN',
      'LOGIN_BLOCKED_PENDING',
      'LOGIN_BLOCKED_REVOKED',
      'TOKEN_REPLAY_ATTEMPT',
    ] as const;

    for (const key of requiredKeys) {
      expect(COPPA_ACTIONS).toHaveProperty(key);
      expect(typeof COPPA_ACTIONS[key]).toBe('string');
    }
  });

  it('all values are non-empty strings', () => {
    for (const value of Object.values(COPPA_ACTIONS)) {
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it('all values are unique (no duplicate action strings)', () => {
    const values = Object.values(COPPA_ACTIONS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ============================================================================
// Constants sanity checks
// ============================================================================

describe('COPPA constants', () => {
  it('COPPA_AGE_THRESHOLD is 13', () => {
    expect(COPPA_AGE_THRESHOLD).toBe(13);
  });

  it('CONSENT_TOKEN_EXPIRY_DAYS is 30', () => {
    expect(CONSENT_TOKEN_EXPIRY_DAYS).toBe(30);
  });

  it('COPPA_AUDIT_RETENTION_YEARS is 5', () => {
    expect(COPPA_AUDIT_RETENTION_YEARS).toBe(5);
  });
});
