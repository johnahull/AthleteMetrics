/**
 * Analytics trends and "best" filtering must use each metric's own direction from the DB resolver.
 * The old code read the empty legacy METRIC_CONFIG, so every metric counted as higher-is-better and the
 * slowest point of a timed metric was flagged as the personal best.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ rows: [] as any[] }));

// Every query builder call returns the same chain; awaiting it yields the prepared rows.
vi.mock('../db', () => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) =>
      prop === 'then'
        ? (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(state.rows).then(resolve, reject)
        : () => chain,
  });
  return { db: { select: () => chain } };
});

vi.mock('../utils/metric-type', () => ({
  getMetricTypes: vi.fn(async (codes: string[]) =>
    Object.fromEntries(codes.map((c) => [c, ['FLY10_TIME', 'MILE_RUN'].includes(c) ? 'lower_is_better' : 'higher_is_better'])),
  ),
}));

import { AnalyticsService } from '../analytics-simple';
import { getMetricTypes } from '../utils/metric-type';

const row = (metric: string, value: number, date: string, athleteId = 'a1') => ({
  measurementId: `${athleteId}-${metric}-${date}-${value}`,
  athleteId,
  metric,
  value: String(value),
  date,
  teamId: 't1',
  athleteName: 'Athlete One',
  teamName: 'Team',
  gender: 'Male',
  birthYear: 2008,
});

const request = (metric: string, type: 'trends' | 'best') => ({
  analysisType: 'individual',
  filters: { organizationId: 'org-1' },
  metrics: { primary: metric, additional: [] },
  timeframe: { type, period: 'all_time' },
}) as any;

describe('AnalyticsService metric direction', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('flags the fastest FLY10_TIME points as personal bests in a trend', async () => {
    state.rows = [
      row('FLY10_TIME', 1.5, '2026-01-01'),
      row('FLY10_TIME', 1.4, '2026-02-01'),
      row('FLY10_TIME', 1.6, '2026-03-01'),
      row('FLY10_TIME', 1.3, '2026-04-01'),
    ];
    const result = await new AnalyticsService().getAnalyticsData(request('FLY10_TIME', 'trends'));
    expect(result.trends[0].data.map((p) => p.isPersonalBest)).toEqual([true, true, false, true]);
    expect(getMetricTypes).toHaveBeenCalledWith(['FLY10_TIME'], 'org-1');
  });

  it('keeps the best of several same-day times as the lowest for a lower-is-better metric', async () => {
    state.rows = [
      row('MILE_RUN', 400, '2026-01-01'),
      row('MILE_RUN', 380, '2026-01-01'),
    ];
    const result = await new AnalyticsService().getAnalyticsData(request('MILE_RUN', 'trends'));
    expect(result.data.map((p) => p.value)).toEqual([380]);
  });

  it('picks the lowest MILE_RUN time as the best for the "best" timeframe', async () => {
    state.rows = [
      row('MILE_RUN', 400, '2026-01-01'),
      row('MILE_RUN', 360, '2026-02-01'),
      row('MILE_RUN', 420, '2026-03-01'),
    ];
    const result = await new AnalyticsService().getAnalyticsData(request('MILE_RUN', 'best'));
    expect(result.data.map((p) => p.value)).toEqual([360]);
  });

  it('keeps higher-is-better metrics as before (VERTICAL_JUMP best is the maximum)', async () => {
    state.rows = [
      row('VERTICAL_JUMP', 24, '2026-01-01'),
      row('VERTICAL_JUMP', 28, '2026-02-01'),
      row('VERTICAL_JUMP', 26, '2026-03-01'),
    ];
    const best = await new AnalyticsService().getAnalyticsData(request('VERTICAL_JUMP', 'best'));
    expect(best.data.map((p) => p.value)).toEqual([28]);
    const trend = await new AnalyticsService().getAnalyticsData(request('VERTICAL_JUMP', 'trends'));
    expect(trend.trends[0].data.map((p) => p.isPersonalBest)).toEqual([true, true, false]);
  });

  it('picks the fastest MILE_RUN per athlete for the radar chart', async () => {
    state.rows = [
      row('MILE_RUN', 400, '2026-01-01'),
      row('MILE_RUN', 360, '2026-02-01'),
      row('VERTICAL_JUMP', 24, '2026-01-01'),
    ];
    const req = { ...request('MILE_RUN', 'trends'), metrics: { primary: 'MILE_RUN', additional: ['VERTICAL_JUMP'] } };
    const result = await new AnalyticsService().getAnalyticsData(req);
    expect(result.multiMetric[0].metrics.MILE_RUN).toBe(360);
  });
});
