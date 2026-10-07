/**
 * AM-FEAT-016: benchmark-analytics for-metric route accepts the m/yd 5-0-5 codes
 * and rejects the retired AGILITY_505 code with 400.
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

  it('still rejects an unknown 5-0-5-like code', async () => {
    const res = await request(createApp())
      .get('/api/analytics/benchmarks/for-metric/AGILITY_505_XX')
      .query({ organizationId: 'org-1' });
    expect(res.status).toBe(400);
    expect(getBenchmarksForMetric).not.toHaveBeenCalled();
  });

  it('rejects the retired AGILITY_505 code with 400', async () => {
    const res = await request(createApp())
      .get('/api/analytics/benchmarks/for-metric/AGILITY_505')
      .query({ organizationId: 'org-1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid metric code/);
    expect(res.body.message).toMatch(/AGILITY_505_M/);
    expect(getBenchmarksForMetric).not.toHaveBeenCalled();
  });
});
