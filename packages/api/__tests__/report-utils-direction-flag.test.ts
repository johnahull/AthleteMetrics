/**
 * getBenchmarkLabel takes a precomputed direction so a report resolves it once per metric, not once per athlete
 * (the PDF labels up to 50 athletes per metric in a Promise.all on a small connection pool).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const isLowerBetter = vi.hoisted(() => vi.fn(async () => false));
vi.mock('../utils/metric-type', () => ({ isLowerBetter }));

import { getBenchmarkLabel } from '../utils/report-utils';

const athlete = {
  benchmarkComparisons: {
    ORG_RUN: [
      { benchmarkName: 'Good', benchmarkValue: 5.0, meetsOrExceeds: true },
      { benchmarkName: 'Elite', benchmarkValue: 4.5, meetsOrExceeds: true },
    ],
  },
};

describe('getBenchmarkLabel direction flag', () => {
  beforeEach(() => isLowerBetter.mockClear());

  it('uses a passed direction and does not look it up', async () => {
    const athletes = Array.from({ length: 50 }, () => athlete);
    const labels = await Promise.all(athletes.map((a) => getBenchmarkLabel(a, 'ORG_RUN', 'org-a', true)));
    expect(isLowerBetter).not.toHaveBeenCalled();
    // lower is better: the smaller benchmark value is the higher tier
    expect(new Set(labels)).toEqual(new Set(['Elite']));
  });

  it('looks the direction up when none is passed', async () => {
    expect(await getBenchmarkLabel(athlete, 'ORG_RUN', 'org-a')).toBe('Good');
    expect(isLowerBetter).toHaveBeenCalledWith('ORG_RUN', 'org-a');
  });
});
