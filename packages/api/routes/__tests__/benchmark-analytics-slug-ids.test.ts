/**
 * Seeded site benchmarks use text slug ids (e.g. d1-soc-dash40-d1-avg), not UUIDs. The benchmark analytics
 * routes must accept a well-formed slug for benchmark ids, reject junk, and keep requiring UUIDs for team ids.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const getTeamBenchmarkAggregation = vi.fn();
const getBenchmarkProgressOverTime = vi.fn();
const getAthletesByBenchmarkStatus = vi.fn();

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
    getTeamBenchmarkAggregation = getTeamBenchmarkAggregation;
    getBenchmarkProgressOverTime = getBenchmarkProgressOverTime;
    getAthletesByBenchmarkStatus = getAthletesByBenchmarkStatus;
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

const SLUG = 'd1-soc-dash40-d1-avg';
const UUID = '123e4567-e89b-12d3-a456-426614174000';
const JUNK = 'a b!';

describe('benchmark analytics routes accept slug benchmark ids', () => {
  beforeEach(() => {
    getTeamBenchmarkAggregation.mockReset().mockResolvedValue({});
    getBenchmarkProgressOverTime.mockReset().mockResolvedValue({});
    getAthletesByBenchmarkStatus.mockReset().mockResolvedValue({});
  });

  describe('GET /api/analytics/benchmarks/aggregation', () => {
    it('accepts slug and UUID benchmarkIds', async () => {
      const res = await request(createApp())
        .get('/api/analytics/benchmarks/aggregation')
        .query({ organizationId: 'org-1', benchmarkIds: `${SLUG},${UUID}` });
      expect(res.status).toBe(200);
      expect(getTeamBenchmarkAggregation).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ benchmarkIds: [SLUG, UUID] })
      );
    });

    it('rejects a malformed benchmark id with 400', async () => {
      const res = await request(createApp())
        .get('/api/analytics/benchmarks/aggregation')
        .query({ organizationId: 'org-1', benchmarkIds: JUNK });
      expect(res.status).toBe(400);
    });

    it('rejects an over-long benchmark id with 400', async () => {
      const res = await request(createApp())
        .get('/api/analytics/benchmarks/aggregation')
        .query({ organizationId: 'org-1', benchmarkIds: 'a'.repeat(101) });
      expect(res.status).toBe(400);
    });

    it('still requires UUIDs for team ids', async () => {
      const res = await request(createApp())
        .get('/api/analytics/benchmarks/aggregation')
        .query({ organizationId: 'org-1', teamIds: SLUG });
      expect(res.status).toBe(400);
    });
  });

  describe.each(['progress', 'athletes'])('GET /api/analytics/benchmarks/:benchmarkId/%s', (suffix) => {
    it('accepts a slug benchmark id', async () => {
      const res = await request(createApp())
        .get(`/api/analytics/benchmarks/${SLUG}/${suffix}`)
        .query({ organizationId: 'org-1', status: 'met' });
      expect(res.status).toBe(200);
    });

    it('rejects a malformed benchmark id with 400', async () => {
      const res = await request(createApp())
        .get(`/api/analytics/benchmarks/${encodeURIComponent(JUNK)}/${suffix}`)
        .query({ organizationId: 'org-1', status: 'met' });
      expect(res.status).toBe(400);
    });
  });
});
