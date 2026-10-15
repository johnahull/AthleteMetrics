/**
 * Server-side metric direction resolver. The direction comes from the metric's own row: site_metrics first,
 * then the organization's custom metric. No cache, so an admin edit takes effect at once, and an unknown
 * code (higher_is_better) is never remembered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { customOrgMetrics, siteMetrics } from '@shared/schema';

const state = vi.hoisted(() => ({
  site: [] as Array<{ code: string; metricType: string }>,
  custom: [] as Array<{ code: string; metricType: string }>,
  queries: [] as unknown[],
}));

vi.mock('../../db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          state.queries.push(table);
          return table === siteMetrics ? state.site : state.custom;
        },
      }),
    }),
  },
}));

import { getMetricTypes, getMetricType, isLowerBetter } from '../metric-type';

describe('metric-type resolver', () => {
  beforeEach(() => {
    state.site = [];
    state.custom = [];
    state.queries = [];
    vi.restoreAllMocks();
  });

  it('takes the site metric type before a custom metric with the same code', async () => {
    state.site = [{ code: 'MILE_RUN', metricType: 'higher_is_better' }];
    state.custom = [{ code: 'MILE_RUN', metricType: 'lower_is_better' }];
    expect(await getMetricTypes(['MILE_RUN'], 'org-a')).toEqual({ MILE_RUN: 'higher_is_better' });
    // Every code was resolved by site_metrics, so the custom table is not queried
    expect(state.queries).toEqual([siteMetrics]);
  });

  it('resolves a custom org metric for its organization', async () => {
    state.custom = [{ code: 'ORG_RUN', metricType: 'lower_is_better' }];
    expect(await getMetricType('ORG_RUN', 'org-a')).toBe('lower_is_better');
    expect(await isLowerBetter('ORG_RUN', 'org-a')).toBe(true);
  });

  it('does not look at custom metrics without an organization', async () => {
    state.custom = [{ code: 'ORG_RUN_NOORG', metricType: 'lower_is_better' }];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getMetricType('ORG_RUN_NOORG')).toBe('higher_is_better');
    expect(state.queries).toEqual([siteMetrics]);
  });

  it('resolves many codes with at most 2 queries', async () => {
    state.site = [
      { code: 'FLY10_TIME', metricType: 'lower_is_better' },
      { code: 'VERTICAL_JUMP', metricType: 'higher_is_better' },
      { code: 'HEIGHT', metricType: 'tracking' },
    ];
    state.custom = [{ code: 'ORG_RUN', metricType: 'lower_is_better' }];
    const types = await getMetricTypes(['FLY10_TIME', 'VERTICAL_JUMP', 'HEIGHT', 'ORG_RUN', 'FLY10_TIME'], 'org-a');
    expect(types).toEqual({
      FLY10_TIME: 'lower_is_better',
      VERTICAL_JUMP: 'higher_is_better',
      HEIGHT: 'tracking',
      ORG_RUN: 'lower_is_better',
    });
    expect(state.queries).toEqual([siteMetrics, customOrgMetrics]);
  });

  it('issues no query for an empty list', async () => {
    expect(await getMetricTypes([], 'org-a')).toEqual({});
    expect(state.queries).toEqual([]);
  });

  it('treats an unknown code as higher_is_better and warns once per code', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getMetricType('UNKNOWN_ONCE', 'org-a')).toBe('higher_is_better');
    expect(await getMetricType('UNKNOWN_ONCE', 'org-a')).toBe('higher_is_better');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('UNKNOWN_ONCE');
  });

  it('does not remember an unknown code: a row added later is used at once', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await isLowerBetter('ORG_LATER', 'org-a')).toBe(false);
    state.custom = [{ code: 'ORG_LATER', metricType: 'lower_is_better' }];
    expect(await isLowerBetter('ORG_LATER', 'org-a')).toBe(true);
  });

  it('reads the database on every call, so an edited type takes effect at once', async () => {
    state.site = [{ code: 'MILE_RUN', metricType: 'lower_is_better' }];
    expect(await isLowerBetter('MILE_RUN')).toBe(true);
    state.site = [{ code: 'MILE_RUN', metricType: 'higher_is_better' }];
    expect(await isLowerBetter('MILE_RUN')).toBe(false);
  });
});
