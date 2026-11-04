import { describe, it, expect } from 'vitest';
import { cutoffTiersToBands, tierRangeLabels } from '../benchmark-utils';

type T = { tierName: string; tierOrder: number; minValue: number | null; maxValue: number | null; benchmarkValue?: number | null; comparisonOperator?: string | null };
const cut = (tierName: string, tierOrder: number, benchmarkValue: number, comparisonOperator = 'lte'): T =>
  ({ tierName, tierOrder, minValue: null, maxValue: null, benchmarkValue, comparisonOperator });
const bands = (ts: T[]) => ts.map((t) => [t.tierName, t.minValue, t.maxValue]);

// HS boys 40yd (migration 0171): single-cutoff `lte` tiers, 1 = best
const dash40 = [
  cut('Elite', 1, 4.6), cut('Excellent', 2, 4.8), cut('Above Average', 3, 5.0), cut('Average', 4, 5.2), cut('Below Average', 5, 5.5),
];

describe('cutoffTiersToBands', () => {
  it('turns lte cutoffs into contiguous bands; worst tier is open-ended', () => {
    expect(bands(cutoffTiersToBands(dash40))).toEqual([
      ['Elite', null, 4.6],
      ['Excellent', 4.6, 4.8],
      ['Above Average', 4.8, 5.0],
      ['Average', 5.0, 5.2],
      ['Below Average', 5.2, null],
    ]);
  });

  it('mirrors for gte cutoffs', () => {
    const vj = [cut('Elite', 1, 30, 'gte'), cut('Good', 2, 25, 'gte'), cut('Fair', 3, 20, 'gte')];
    expect(bands(cutoffTiersToBands(vj))).toEqual([
      ['Elite', 30, null],
      ['Good', 25, 30],
      ['Fair', null, 25],
    ]);
  });

  it('sorts by tierOrder and keeps the input order of the output', () => {
    const shuffled = [dash40[3], dash40[0], dash40[4], dash40[2], dash40[1]];
    const out = cutoffTiersToBands(shuffled);
    expect(out.map((t) => t.tierName)).toEqual(shuffled.map((t) => t.tierName));
    expect(out.find((t) => t.tierName === 'Average')).toMatchObject({ minValue: 5.0, maxValue: 5.2 });
  });

  it('does not mutate its input and keeps other fields', () => {
    const input = dash40.map((t) => ({ ...t }));
    const out = cutoffTiersToBands(input);
    expect(input[0].maxValue).toBeNull();
    expect(out[0]).toMatchObject({ benchmarkValue: 4.6, comparisonOperator: 'lte' });
  });

  it('leaves mixed operators, eq, and a single tier unchanged', () => {
    const mixed = [cut('A', 1, 4.6, 'lte'), cut('B', 2, 4.8, 'gte')];
    expect(cutoffTiersToBands(mixed)).toEqual(mixed);
    const eq = [cut('A', 1, 4.6, 'eq'), cut('B', 2, 4.8, 'eq')];
    expect(cutoffTiersToBands(eq)).toEqual(eq);
    const single = [cut('A', 1, 4.6)];
    expect(cutoffTiersToBands(single)).toEqual(single);
  });

  it('leaves cutoffs that disagree with the tier order unchanged', () => {
    const backwards = [cut('A', 1, 5.0), cut('B', 2, 4.6)];
    expect(cutoffTiersToBands(backwards)).toEqual(backwards);
  });

  it('leaves a group that mixes cutoff and range tiers unchanged', () => {
    // an open band on B would overlap R: 5.5 would chart as B while the server matches R
    const range: T = { tierName: 'R', tierOrder: 3, minValue: 5.0, maxValue: 6.0, benchmarkValue: null, comparisonOperator: null };
    const mixed = [cut('A', 1, 4.6), cut('B', 2, 4.8), range];
    expect(cutoffTiersToBands(mixed)).toEqual(mixed);
  });

  it('leaves range tiers alone', () => {
    const ranges: T[] = [
      { tierName: 'A', tierOrder: 1, minValue: 20, maxValue: null },
      { tierName: 'B', tierOrder: 2, minValue: 10, maxValue: 20 },
    ];
    expect(cutoffTiersToBands(ranges)).toEqual(ranges);
  });
});

describe('tierRangeLabels', () => {
  it('labels the 40yd bands; the shared boundary belongs to the better tier', () => {
    expect(tierRangeLabels(cutoffTiersToBands(dash40), { unit: 's' })).toEqual([
      '≤ 4.6 s', '4.6–4.8 s', '4.8–5 s', '5–5.2 s', '> 5.2 s',
    ]);
  });

  it('uses >= for an open-top best tier and < for an open-bottom worse tier', () => {
    const vj = cutoffTiersToBands([cut('Elite', 1, 30, 'gte'), cut('Good', 2, 25, 'gte'), cut('Fair', 3, 20, 'gte')]);
    expect(tierRangeLabels(vj, { unit: 'in' })).toEqual(['≥ 30 in', '25–30 in', '< 25 in']);
  });

  it('prints nothing for a tier with no bounds', () => {
    expect(tierRangeLabels(dash40)).toEqual(['', '', '', '', '']);
  });

  it('prints m:ss and no unit for duration metrics', () => {
    const mile = [
      { tierName: 'A', tierOrder: 1, minValue: null, maxValue: 300 },
      { tierName: 'B', tierOrder: 2, minValue: 300, maxValue: 330.5 },
    ];
    const format = { displayFormat: 'duration' as const, decimalPrecision: 0, unit: 's' };
    expect(tierRangeLabels(mile, { unit: 's', format })).toEqual(['≤ 5:00', '5:00–5:31']);
  });

  it('has an ASCII form for WinAnsi PDFs', () => {
    expect(tierRangeLabels(cutoffTiersToBands(dash40), { unit: 's', ascii: true })).toEqual([
      '<= 4.6 s', '4.6 - 4.8 s', '4.8 - 5 s', '5 - 5.2 s', '> 5.2 s',
    ]);
  });

  it('uses the inclusive sign for an open bound no better tier shares', () => {
    const gap = [
      { tierOrder: 1, minValue: null, maxValue: 5.2 },
      { tierOrder: 2, minValue: 5.21, maxValue: null },
    ];
    expect(tierRangeLabels(gap, { ascii: true })).toEqual(['<= 5.2', '>= 5.21']);
    expect(tierRangeLabels(gap)).toEqual(['≤ 5.2', '≥ 5.21']);
    const vjGap = [
      { tierOrder: 1, minValue: 30, maxValue: null },
      { tierOrder: 2, minValue: null, maxValue: 29.5 },
    ];
    expect(tierRangeLabels(vjGap)).toEqual(['≥ 30', '≤ 29.5']);
  });
});
