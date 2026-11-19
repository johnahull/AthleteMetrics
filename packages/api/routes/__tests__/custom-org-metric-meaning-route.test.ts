import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const service = { createCustomOrgMetric: vi.fn(async (_o: string, d: any) => ({ code: 'C', ...d })), updateCustomOrgMetric: vi.fn(async (_o: string, _c: string, d: any) => d) };
vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../services/custom-org-metric-service', () => ({ getCustomOrgMetricService: () => service }));
vi.mock('../../middleware', () => ({
  requireAuth: (_q: any, _r: any, n: any) => n(),
  requireOrganizationAccess: () => (_q: any, _r: any, n: any) => n(),
}));

import { registerCustomOrgMetricRoutes } from '../custom-org-metric-routes';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => { req.session = { user: { id: 'u1' } }; next(); });
registerCustomOrgMetricRoutes(app);

const url = '/api/organizations/o1/custom-metrics';
const body = { label: 'Agility', metricType: 'lower_is_better' };

describe('custom metric routes: meaning', () => {
  it('POST with forbidden wording returns 400 with details.meaning', async () => {
    const res = await request(app).post(url).send({ ...body, meaning: 'He is cleared to play.' });
    expect(res.status).toBe(400);
    expect(res.body.details.meaning[0]).toMatch(/must not contain/);
    expect(service.createCustomOrgMetric).not.toHaveBeenCalled();
  });

  it('PATCH with forbidden wording returns 400; clean text and null pass through', async () => {
    const bad = await request(app).patch(`${url}/C`).send({ meaning: 'Pain means trouble.' });
    expect(bad.status).toBe(400);
    expect(bad.body.details.meaning[0]).toMatch(/must not contain/);
    const ok = await request(app).patch(`${url}/C`).send({ meaning: null });
    expect(ok.status).toBe(200);
    expect(service.updateCustomOrgMetric.mock.calls.at(-1)![2].meaning).toBeNull();
  });
});
