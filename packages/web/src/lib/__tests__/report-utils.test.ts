import { describe, it, expect } from 'vitest';
import { isLowerBetter, sortAthletesByMetric, getBenchmarkLabel } from '../report-utils';

// MILE_RUN is not in the hard-coded lower-is-better list: only its type says lower is better
describe('report-utils: direction from the metric list', () => {
  const athletes = [
    { userId: 'slow', measurements: { MILE_RUN: 400 } },
    { userId: 'fast', measurements: { MILE_RUN: 360 } },
  ];

  it('isLowerBetter takes the metric type over the built-in list', () => {
    expect(isLowerBetter('MILE_RUN')).toBe(false);
    expect(isLowerBetter('MILE_RUN', 'lower_is_better')).toBe(true);
    expect(isLowerBetter('FLY10_TIME', 'higher_is_better')).toBe(false);
  });

  it('sortAthletesByMetric ranks the fastest time first for a lower-is-better metric', () => {
    expect(sortAthletesByMetric(athletes, 'MILE_RUN', 'lower_is_better').map((a) => a.userId)).toEqual(['fast', 'slow']);
  });

  it('sortAthletesByMetric keeps the built-in behaviour without a type', () => {
    expect(sortAthletesByMetric(athletes, 'MILE_RUN').map((a) => a.userId)).toEqual(['slow', 'fast']);
  });

  it('getBenchmarkLabel picks the fastest tier met for a lower-is-better metric', () => {
    const athlete = {
      benchmarkComparisons: {
        MILE_RUN: [
          { benchmarkName: 'Good', benchmarkValue: 420, meetsOrExceeds: true },
          { benchmarkName: 'Elite', benchmarkValue: 380, meetsOrExceeds: true },
        ],
      },
    };
    expect(getBenchmarkLabel(athlete, 'MILE_RUN', 'lower_is_better')).toBe('Elite');
  });
});
