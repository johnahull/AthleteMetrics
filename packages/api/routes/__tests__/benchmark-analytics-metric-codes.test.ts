/**
 * Benchmark-analytics for-metric route (issue #540). Any well-formed metric code is accepted and answered with
 * whatever benchmarks exist (an empty result when there are none), so the chart overlay degrades to "no
 * benchmarks" instead of erroring. Only a malformed code is a 400. Covers the m/yd 5-0-5 codes (AM-FEAT-016),
 * the retired AGILITY_505 code and codes that were missing from the old hard-coded list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const getBenchmarksForMetric = vi.fn();

vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../storage', () => ({ storage: { getUserOrganizations: vi.fn() } }));
vi.mock('../../middleware', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../helpers/org-access', () => ({
  hasOrganizationAccess: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../services/benchmark-analytics-service', () => ({
  BenchmarkAnalyticsService: class {
    getBenchmarksForMetric = getBenchmarksForMetric;
  },
}));

import { registerBenchmarkAnalyticsRoutes } from '../benchmark-analytics-routes';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = { user: { id: 'u1', isSiteAdmin: true, role: 'site_admin' } };
    next();
  });
  registerBenchmarkAnalyticsRoutes(app);
  return app;
}

describe('GET /api/analytics/benchmarks/for-metric/:metricCode (5-0-5 protocol codes)', () => {
  beforeEach(() => {
    getBenchmarksForMetric.mockReset();
    getBenchmarksForMetric.mockResolvedValue({ benchmarks: [] });
  });

  it.each(['AGILITY_505_M', 'AGILITY_505_YD'])('accepts %s', async (code) => {
    const res = await request(createApp())
      .get(`/api/analytics/benchmarks/for-metric/${code}`)
      .query({ organizationId: 'org-1' });
    expect(res.status).toBe(200);
    expect(getBenchmarksForMetric).toHaveBeenCalledWith('org-1', code);
  });

  it.each([
    'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI',
    'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI',
  ])('accepts per-leg/LSI code %s', async (code) => {
    const res = await request(createApp())
      .get(`/api/analytics/benchmarks/for-metric/${code}`)
      .query({ organizationId: 'org-1' });
    expect(res.status).toBe(200);
    expect(getBenchmarksForMetric).toHaveBeenCalledWith('org-1', code);
  });

  it.each(['DASH_20YD', 'DASH_10M', 'FLY10_TIME_RI10', 'AGILITY_COD_DEFICIT_YD', 'MQ_JUMP', 'MY_CUSTOM_METRIC_2'])(
    'answers a well-formed code without benchmarks (%s) with an empty result, not a 400',
    async (code) => {
      const res = await request(createApp())
        .get(`/api/analytics/benchmarks/for-metric/${code}`)
        .query({ organizationId: 'org-1' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ benchmarks: [] });
      expect(getBenchmarksForMetric).toHaveBeenCalledWith('org-1', code);
    }
  );

  it('answers the retired AGILITY_505 code with the (empty) benchmark result', async () => {
    const res = await request(createApp())
      .get('/api/analytics/benchmarks/for-metric/AGILITY_505')
      .query({ organizationId: 'org-1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ benchmarks: [] });
    expect(getBenchmarksForMetric).toHaveBeenCalledWith('org-1', 'AGILITY_505');
  });

  it.each([
    ['lower case', 'fly10_time'],
    ['punctuation', 'FLY10-TIME'],
    ['a space', 'FLY10%20TIME'],
    ['an injection attempt', "X';DROP_TABLE"],
    ['65 characters', 'A'.repeat(65)],
  ])('rejects a malformed code with 400 (%s)', async (_label, code) => {
    const res = await request(createApp())
      .get(`/api/analytics/benchmarks/for-metric/${code}`)
      .query({ organizationId: 'org-1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid metric code/);
    expect(getBenchmarksForMetric).not.toHaveBeenCalled();
  });
});
