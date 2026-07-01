import { describe, it, expect } from 'vitest';
import { buildCohortLabel } from '../cohort-label';

describe('buildCohortLabel', () => {
  it('combines team names with a parenthesized demographic qualifier', () => {
    expect(buildCohortLabel(['Varsity'], 'Male', ['WR'])).toBe('Varsity (Male, WR)');
  });

  it('joins multiple teams and multiple positions', () => {
    expect(buildCohortLabel(['Varsity', 'JV'], undefined, ['WR', 'CB'])).toBe(
      'Varsity, JV (WR, CB)',
    );
  });

  it('returns just the teams when there is no demographic filter', () => {
    expect(buildCohortLabel(['Varsity', 'JV'], undefined, [])).toBe('Varsity, JV');
  });

  it('returns just the demographic qualifier when there are no teams', () => {
    expect(buildCohortLabel([], 'Female', ['GK'])).toBe('Female, GK');
  });

  it('returns undefined when there is no filter at all (org-wide)', () => {
    expect(buildCohortLabel([], undefined, [])).toBeUndefined();
    expect(buildCohortLabel([], undefined, undefined)).toBeUndefined();
  });
});
