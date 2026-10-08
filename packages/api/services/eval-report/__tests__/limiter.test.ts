import { describe, it, expect } from 'vitest';
import { strengthsAndLimiter, positionOf } from '../limiter';
import type { AgeGroupMatch } from '../tier-match';
import type { EvalMetricKey } from '../metric-key-map';

// A match whose ranking position is `position` (a fraction; 0.2 = 20% better than the average)
const avg = (position: number): AgeGroupMatch => ({
  kind: 'average', name: null, averageValue: 1, operator: 'lte', status: position >= 0 ? 'at_or_better' : 'below', distancePct: position * 100,
});
const m = (key: EvalMetricKey, position: number | null) => ({ key, match: position === null ? null : avg(position) });

describe('strengthsAndLimiter', () => {
  const metrics = [m('DASH_10', 0.2), m('FLY_10', 0.9), m('CMJ_HOH', 0.6), m('505', 0.1), m('DASH_20', 0.8), m('SQUAT_JUMP', 0.4)];

  it('picks the top two as strengths and the bottom two as development areas', () => {
    const r = strengthsAndLimiter(metrics);
    expect(r.strengths).toEqual(['FLY_10', 'DASH_20']);
    expect(r.developmentAreas).toEqual(['505', 'DASH_10']);
  });

  it('suggests the single lowest speed, power or change-of-direction metric as the limiter', () => {
    expect(strengthsAndLimiter(metrics).limiter).toBe('505');
  });

  it('ignores movement metrics for the limiter', () => {
    const r = strengthsAndLimiter([m('MQI', 0.0), m('DASH_10', 0.5), m('CMJ_HOH', 0.7)]);
    expect(r.limiter).toBe('DASH_10');
  });

  it('does not list a metric as both a strength and a development area', () => {
    const r = strengthsAndLimiter([m('DASH_10', 0.9), m('FLY_10', 0.5), m('CMJ_HOH', 0.1)]);
    expect(r.strengths).toEqual(['DASH_10', 'FLY_10']);
    expect(r.developmentAreas).toEqual(['CMJ_HOH']);
  });

  it('excludes metrics whose position is unknown', () => {
    const r = strengthsAndLimiter([m('DASH_10', null), m('FLY_10', 0.5), m('CMJ_HOH', 0.1), m('505', null)]);
    expect(r.strengths).toEqual(['FLY_10', 'CMJ_HOH']);
    expect(r.developmentAreas).toEqual([]);
    expect(r.limiter).toBe('CMJ_HOH');
  });

  it('breaks ties by input (report) order, whatever the input order', () => {
    const r = strengthsAndLimiter([m('DASH_10', 0.5), m('FLY_10', 0.5), m('CMJ_HOH', 0.5), m('505', 0.5)]);
    expect(r.strengths).toEqual(['DASH_10', 'FLY_10']);
    expect(r.developmentAreas).toEqual(['505', 'CMJ_HOH']);
    expect(r.limiter).toBe('DASH_10');
  });

  it('returns empty results with no benchmarked metrics', () => {
    expect(strengthsAndLimiter([])).toEqual({ strengths: [], developmentAreas: [], limiter: null });
  });
});

const tiersMatch = (tierOrder: number | undefined, orders = [1, 2, 3, 4]) =>
  ({ kind: 'tiers', comparison: { tierOrder, allTiers: orders.map((o) => ({ tierOrder: o })) } }) as unknown as AgeGroupMatch;

describe('positionOf', () => {
  it('is the signed distance from the average, as a fraction, for an average comparison', () => {
    expect(positionOf(avg(0.07))).toBeCloseTo(0.07, 6);
    expect(positionOf(avg(-0.12))).toBeCloseTo(-0.12, 6);
  });
  it('is 1 for the best tier and 0 for the worst in a multi-tier set', () => {
    expect(positionOf(tiersMatch(1))).toBe(1);
    expect(positionOf(tiersMatch(4))).toBe(0);
    expect(positionOf(tiersMatch(2))).toBeCloseTo(2 / 3, 6);
  });
  it('is null when there is no match or the tier position is unknown', () => {
    expect(positionOf(null)).toBeNull();
    expect(positionOf(tiersMatch(1, [1]))).toBeNull();
    expect(positionOf(tiersMatch(9))).toBeNull();
    expect(positionOf(tiersMatch(undefined))).toBeNull();
  });
});

describe('ranking with average comparisons', () => {
  it('ranks by distance from the average', () => {
    const r = strengthsAndLimiter([m('DASH_10', 0.07), m('CMJ_HOH', -0.12), m('FLY_10', 0.01)]);
    expect(r.strengths).toEqual(['DASH_10', 'FLY_10']);
    expect(r.limiter).toBe('CMJ_HOH');
  });
});
