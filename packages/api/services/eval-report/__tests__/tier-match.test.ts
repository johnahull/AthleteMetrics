import { describe, it, expect } from 'vitest';
import {
  matchTierGroup,
  matchCollegeStandard,
  hasLsiTierSet,
  ageAtDate,
  type AgeGroupMatch,
  type TierCandidateRow,
} from '../tier-match';

// Row shapes copied from migration 0129: a single "Average" threshold per age band, no tier group or order.
const avgRow = (over: Partial<TierCandidateRow> = {}): TierCandidateRow => ({
  _source: 'site',
  metricCode: 'DASH_10YD',
  tierName: 'MS Average',
  tierGroupId: null,
  tierOrder: null,
  benchmarkValue: 2.15,
  comparisonOperator: 'lte',
  gender: 'Female',
  sport: 'SOCCER',
  level: 'HS',
  ageMin: 11,
  ageMax: 13,
  ...over,
});
const d1Row = (over: Partial<TierCandidateRow> = {}) =>
  avgRow({ tierName: 'D1 Average', benchmarkValue: 2.0, level: 'D1', ageMin: null, ageMax: null, ...over });

// Genuine multi-tier group (lower is better, 1 = best)
const tiers = (over: Partial<TierCandidateRow> = {}): TierCandidateRow[] =>
  [
    { tierOrder: 1, tierName: 'Elite', minValue: 1.0, maxValue: 1.9 },
    { tierOrder: 2, tierName: 'Good', minValue: 1.9, maxValue: 2.1 },
    { tierOrder: 3, tierName: 'Developing', minValue: 2.1, maxValue: 3.0 },
  ].map((t) => ({ ...avgRow(), benchmarkValue: null, comparisonOperator: null, tierGroupId: 'g1', displayOrder: 1, ...t, ...over }));

const girl = { gender: 'Female', birthDate: '2012-06-15', sport: 'SOCCER' }; // 12 at the event
const EVENT = '2025-03-01';

const match = (over: Record<string, unknown> = {}): AgeGroupMatch | null =>
  matchTierGroup({
    metricCode: 'DASH_10YD',
    value: 2.0,
    lowerIsBetter: true,
    athlete: girl,
    eventDate: EVENT,
    candidates: [avgRow()],
    ...over,
  } as Parameters<typeof matchTierGroup>[0]);

const tierName = (m: AgeGroupMatch | null) => (m?.kind === 'tiers' ? m.comparison.tierName : undefined);

const MALFORMED_DATES = ['2012', '2012-06', '2012-13-45', '', '2012-06-15T00:00:00.000Z', '2012-00-10', 'not-a-date'];

describe('ageAtDate', () => {
  it.each(MALFORMED_DATES)('is NaN for malformed birth date %j', (bad) => {
    expect(ageAtDate(bad, '2025-03-01')).toBeNaN();
  });
  it.each(MALFORMED_DATES)('is NaN for malformed event date %j', (bad) => {
    expect(ageAtDate('2012-06-15', bad)).toBeNaN();
  });

  it('counts completed years at the given date', () => {
    expect(ageAtDate('2012-06-15', '2025-06-14')).toBe(12);
    expect(ageAtDate('2012-06-15', '2025-06-15')).toBe(13);
  });
});

describe('matchTierGroup: age-group average (single threshold rows)', () => {
  it('compares a 12-year-old female soccer athlete against the average: 2.0s is at or better, 2.5s is below', () => {
    const fast = match({ value: 2.0 });
    const slow = match({ value: 2.5 });
    expect(fast).toMatchObject({ kind: 'average', status: 'at_or_better', averageValue: 2.15, operator: 'lte' });
    expect(slow).toMatchObject({ kind: 'average', status: 'below' });
  });

  it('exactly at the average counts as at or better', () => {
    expect(match({ value: 2.15 })).toMatchObject({ status: 'at_or_better', distancePct: 0 });
  });

  it('gives a signed, direction-aware distance from the average (positive = better)', () => {
    const fast = match({ value: 2.0 }) as Extract<AgeGroupMatch, { kind: 'average' }>;
    const slow = match({ value: 2.5 }) as Extract<AgeGroupMatch, { kind: 'average' }>;
    expect(fast.distancePct).toBeCloseTo(((2.15 - 2.0) / 2.15) * 100, 6);
    expect(slow.distancePct).toBeLessThan(0);
  });

  it('handles gte (higher is better) rows', () => {
    const jump = avgRow({ metricCode: 'JUMP_CMJ_HOH', comparisonOperator: 'gte', benchmarkValue: 12 });
    const above = match({ metricCode: 'JUMP_CMJ_HOH', value: 15, lowerIsBetter: false, candidates: [jump] });
    const under = match({ metricCode: 'JUMP_CMJ_HOH', value: 9, lowerIsBetter: false, candidates: [jump] });
    expect(above).toMatchObject({ status: 'at_or_better' });
    expect(under).toMatchObject({ status: 'below' });
    expect((above as { distancePct: number }).distancePct).toBeCloseTo(25, 6);
  });

  it('only supports lte and gte rows: an eq row gives no comparison', () => {
    expect(match({ candidates: [avgRow({ comparisonOperator: 'eq' })] })).toBeNull();
    expect(match({ candidates: [avgRow({ comparisonOperator: null })] })).toBeNull();
  });

  it('gives no comparison when the average is 0 (no meaningless distance)', () => {
    expect(match({ candidates: [avgRow({ benchmarkValue: 0 })] })).toBeNull();
  });

  it('does not depend on input order when several rows qualify', () => {
    const site = avgRow({ benchmarkValue: 2.15, _source: 'site', displayOrder: 1, tierName: 'Site Average' });
    const custom = avgRow({ benchmarkValue: 2.3, _source: 'custom', displayOrder: 1, tierName: 'Custom Average' });
    const early = avgRow({ benchmarkValue: 2.4, _source: 'site', displayOrder: 0, tierName: 'Early Average' });
    for (const rows of [[site, custom], [custom, site]]) {
      expect(match({ candidates: rows })).toEqual(match({ candidates: [site, custom] }));
    }
    expect(match({ candidates: [site, custom, early] })).toMatchObject({ name: 'Early Average' });
    expect(match({ candidates: [early, custom, site] })).toMatchObject({ name: 'Early Average' });
  });

  it('does not match a volleyball row for a soccer athlete', () => {
    expect(match({ candidates: [avgRow({ sport: 'VOLLEYBALL' })] })).toBeNull();
    expect(match({ candidates: [avgRow({ sport: 'VOLLEYBALL' }), avgRow()] })).toMatchObject({ kind: 'average' });
  });

  it('returns null when the athlete has no sport', () => {
    expect(match({ athlete: { ...girl, sport: null } })).toBeNull();
  });

  it('never uses D1 rows (no age bounds) as the age-group average', () => {
    expect(match({ candidates: [d1Row()] })).toBeNull();
  });
});

describe('matchTierGroup: multi-tier groups', () => {
  it('uses selectTierGroup/evaluateTierBenchmark for rows with a tier group and order', () => {
    expect(tierName(match({ value: 1.95, candidates: tiers() }))).toBe('Good');
  });
});

describe('matchTierGroup: eligibility', () => {
  it('returns null when gender is missing (never defaults to Female)', () => {
    expect(match({ athlete: { ...girl, gender: null } })).toBeNull();
  });

  it('accepts only Male or Female: Not Specified never matches', () => {
    expect(match({ athlete: { ...girl, gender: 'Not Specified' }, candidates: [avgRow({ gender: 'Not Specified' })] })).toBeNull();
  });

  it('returns null when date of birth is missing', () => {
    expect(match({ athlete: { ...girl, birthDate: null } })).toBeNull();
  });

  it.each(MALFORMED_DATES)('returns null for malformed date of birth %j', (bad) => {
    expect(match({ athlete: { ...girl, birthDate: bad }, candidates: [avgRow({ ageMin: 0, ageMax: 99 })] })).toBeNull();
  });

  it('returns null for males when only female sets exist', () => {
    expect(match({ athlete: { ...girl, gender: 'Male' } })).toBeNull();
  });

  it('is value-only below 11 and above 18, sets or not', () => {
    const open = [avgRow({ ageMin: 0, ageMax: 99 })];
    const at = (birthDate: string) => match({ athlete: { ...girl, birthDate }, candidates: open });
    expect(at('2015-06-15')).toBeNull(); // 9
    expect(at('2014-12-01')).toBeNull(); // 10
    expect(at('2014-03-01')).not.toBeNull(); // 11
    expect(at('2006-03-02')).not.toBeNull(); // 18
    expect(at('2006-03-01')).toBeNull(); // 19
  });

  it('treats ageMin = 0 as a real bound, not as unset', () => {
    expect(match({ candidates: [avgRow({ ageMin: 0, ageMax: 13 })] })).not.toBeNull();
  });

  it('treats ageMax = 0 as a real bound', () => {
    expect(match({ candidates: [avgRow({ ageMin: 0, ageMax: 0 })] })).toBeNull();
  });

  it('excludes sets whose age range does not contain the athlete age', () => {
    expect(match({ candidates: [avgRow({ ageMin: 14, ageMax: 15 })] })).toBeNull();
    expect(match({ candidates: [avgRow({ ageMin: 9, ageMax: 11 })] })).toBeNull();
  });

  it('requires both age bounds', () => {
    expect(match({ candidates: [avgRow({ ageMin: null })] })).toBeNull();
    expect(match({ candidates: [avgRow({ ageMax: null })] })).toBeNull();
  });

  it('uses age at the event date, not today', () => {
    // Born 2012-06-15: 12 at the 2025-03-01 event (set 11-13), 14 at 2026-10-01
    expect(match({ eventDate: '2025-03-01' })).not.toBeNull();
    expect(match({ eventDate: '2026-10-01' })).toBeNull();
  });

  it('never matches a yard metric to a meter metric', () => {
    expect(match({ metricCode: 'AGILITY_505_YD', candidates: [avgRow({ metricCode: 'AGILITY_505_M' })] })).toBeNull();
    expect(match({ metricCode: 'AGILITY_505_YD', candidates: [avgRow({ metricCode: 'AGILITY_505_YD' })] })).not.toBeNull();
  });

  it('returns null when a candidate has no gender', () => {
    expect(match({ candidates: [avgRow({ gender: null })] })).toBeNull();
  });

  it.each([
    'POWER_EUR',
    'MOMENTUM',
    'AGILITY_COD_DEFICIT_YD',
    'RSI_105',
    'T_TEST',
    'JUMP_CMJ_SL_L',
    'JUMP_CMJ_SL_R',
    'JUMP_CMJ_SL_ASYM',
    'AGILITY_505_YD_LSI',
    'AGILITY_505_M_LSI',
  ])('has no tiers for %s even if a set exists', (code) => {
    expect(match({ metricCode: code, candidates: [avgRow({ metricCode: code })] })).toBeNull();
  });

  it('returns null with no candidates', () => {
    expect(match({ candidates: [] })).toBeNull();
  });
});

describe('LSI tier names never reach the family report', () => {
  // Names from migration 0128
  const lsiRows = ['Normal', 'Monitor', 'Elevated Risk'].map((tierName, i) =>
    avgRow({ metricCode: 'AGILITY_505_YD_LSI', tierName, tierGroupId: 'g-lsi', tierOrder: i + 1, benchmarkValue: null, comparisonOperator: null, minValue: 90 - i * 10, maxValue: 100 - i * 10 }),
  );

  it('produces no model tier for the LSI code', () => {
    const result = match({ metricCode: 'AGILITY_505_YD_LSI', value: 85, lowerIsBetter: false, candidates: lsiRows });
    expect(result).toBeNull();
    expect(JSON.stringify(result ?? {})).not.toMatch(/risk|injur/i);
  });

  it('tells the balance line whether an LSI set exists for the athlete: female, judged by the rows own age bounds', () => {
    const unbounded = lsiRows.map((r) => ({ ...r, ageMin: null, ageMax: null }));
    const args = { metricCode: 'AGILITY_505_YD_LSI', athlete: girl, eventDate: EVENT, candidates: unbounded };
    expect(hasLsiTierSet(args)).toBe(true);
    // No age gate of its own: the 0128 set has no age bounds
    expect(hasLsiTierSet({ ...args, athlete: { ...girl, birthDate: '2000-01-01' } })).toBe(true);
    expect(hasLsiTierSet({ ...args, athlete: { ...girl, birthDate: '2018-01-01' } })).toBe(true);
    expect(hasLsiTierSet({ ...args, athlete: { ...girl, birthDate: null } })).toBe(true);
    expect(hasLsiTierSet({ ...args, athlete: { ...girl, gender: 'Male' } })).toBe(false);
    expect(hasLsiTierSet({ ...args, athlete: { ...girl, gender: null } })).toBe(false);
    expect(hasLsiTierSet({ ...args, candidates: [] })).toBe(false);
  });

  it('honours age bounds when the LSI rows have them', () => {
    const bounded = lsiRows.map((r) => ({ ...r, ageMin: 11, ageMax: 18 })); // girl is 12
    const args = { metricCode: 'AGILITY_505_YD_LSI', athlete: girl, eventDate: EVENT, candidates: bounded };
    expect(hasLsiTierSet(args)).toBe(true);
    expect(hasLsiTierSet({ ...args, athlete: { ...girl, birthDate: '2000-01-01' } })).toBe(false);
    expect(hasLsiTierSet({ ...args, athlete: { ...girl, birthDate: null } })).toBe(false);
    expect(hasLsiTierSet({ ...args, athlete: { ...girl, birthDate: 'garbage' } })).toBe(false);
  });
});

describe('matchCollegeStandard', () => {
  const args = { metricCode: 'DASH_10YD', value: 2.1, athlete: girl, candidates: [avgRow(), d1Row()] };

  it('compares to the D1 Average row', () => {
    expect(matchCollegeStandard(args)).toMatchObject({ averageValue: 2.0, operator: 'lte', status: 'below' });
    expect(matchCollegeStandard({ ...args, value: 1.9 })).toMatchObject({ status: 'at_or_better' });
  });

  it('is null when there is no D1 row, for another sport, or without gender', () => {
    expect(matchCollegeStandard({ ...args, candidates: [avgRow()] })).toBeNull();
    expect(matchCollegeStandard({ ...args, candidates: [d1Row({ sport: 'VOLLEYBALL' })] })).toBeNull();
    expect(matchCollegeStandard({ ...args, athlete: { ...girl, gender: null } })).toBeNull();
  });

  it('does not depend on input order', () => {
    const a = d1Row({ benchmarkValue: 2.0, _source: 'site', tierName: 'D1 Average' });
    const b = d1Row({ benchmarkValue: 2.2, _source: 'custom', tierName: 'D1 Average' });
    expect(matchCollegeStandard({ ...args, candidates: [a, b] })).toEqual(matchCollegeStandard({ ...args, candidates: [b, a] }));
  });

  it('is null for metrics that never get a comparison', () => {
    expect(matchCollegeStandard({ ...args, metricCode: 'POWER_EUR', candidates: [d1Row({ metricCode: 'POWER_EUR' })] })).toBeNull();
  });
});
