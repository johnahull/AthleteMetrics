import { describe, it, expect } from 'vitest';
import { resolveChartSelection } from '../report-charts';

describe('resolveChartSelection', () => {
  it('uses explicit charts config when present (missing keys -> false)', () => {
    expect(resolveChartSelection({ charts: { radar: true, distribution: true } })).toEqual({
      radar: true, benchmarkStanding: false, trends: false, distribution: true,
    });
  });

  it('back-compat: absent charts -> radar+benchmark on, trends from showTrends, distribution off', () => {
    expect(resolveChartSelection({ showTrends: true })).toEqual({
      radar: true, benchmarkStanding: true, trends: true, distribution: false,
    });
    expect(resolveChartSelection({})).toEqual({
      radar: true, benchmarkStanding: true, trends: false, distribution: false,
    });
  });

  it('explicit charts overrides legacy showTrends', () => {
    expect(resolveChartSelection({ showTrends: true, charts: { trends: false } }).trends).toBe(false);
  });
});
