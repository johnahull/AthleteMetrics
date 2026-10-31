/**
 * POST /api/organizations/:organizationId/benchmarks/:id/enable with seeded text-slug site benchmark ids
 * (e.g. d1-soc-dash40-d1-avg). Runs the real route, BenchmarkService and storage.enableBenchmarkForOrg against a
 * fake db (no database required), so it fails if storage rejects non-UUID site benchmark ids.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const ORG_ID = '123e4567-e89b-12d3-a456-426614174000';
const SLUG = 'd1-soc-dash40-d1-avg';

// Rows returned by the fake db's top-level select() calls, in call order within a test:
// [0] getSiteBenchmark lookup, [1] already-enabled check (storage.enableBenchmarkForOrg)
const state = vi.hoisted(() => ({
  selectQueue: [] as any[][],
}));

vi.mock('../../db', () => {
  const chain = (result: () => any) => {
    const c: any = {
      from: () => c,
      where: () => c,
      limit: () => Promise.resolve(result()),
      then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
    };
    return c;
  };
  const tx = {
    execute: async () => undefined,
    select: () => chain(() => []),
    insert: () => ({
      values: (v: any) => ({ returning: async () => [{ id: 'ob-1', ...v }] }),
    }),
  };
  return {
    db: {
      select: () => chain(() => state.selectQueue.shift() ?? []),
      transaction: async (cb: any) => cb(tx),
    },
  };
});

vi.mock('../../middleware', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireSiteAdmin: (_req: any, _res: any, next: any) => next(),
  requireOrganizationAccess: () => (_req: any, _res: any, next: any) => next(),
  requireAthleteAccess: () => (_req: any, _res: any, next: any) => next(),
}));

import { storage } from '../../storage';
import { registerBenchmarkRoutes } from '../benchmark-routes';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = { user: { id: 'u1', isSiteAdmin: true } };
    next();
  });
  registerBenchmarkRoutes(app);
  return app;
}

const enable = (id: string, body: any) =>
  request(createApp()).post(`/api/organizations/${ORG_ID}/benchmarks/${id}/enable`).send(body);

describe('POST /api/organizations/:organizationId/benchmarks/:id/enable (slug ids)', () => {
  beforeEach(() => {
    state.selectQueue = [];
    vi.spyOn(storage, 'getUser').mockResolvedValue({ id: 'u1', isSiteAdmin: true } as any);
    vi.spyOn(storage, 'getOrganization').mockResolvedValue({ id: ORG_ID, name: 'Org', benchmarksEnabled: true } as any);
    vi.spyOn(storage, 'createAuditLog').mockResolvedValue(undefined as any);
  });

  it('returns 201 for a seeded site benchmark with a slug id', async () => {
    // getSiteBenchmark finds the row; the "already enabled" lookup finds nothing
    state.selectQueue = [[{ id: SLUG }], []];
    const res = await enable(SLUG, { benchmarkType: 'site' });
    expect(res.status).toBe(201);
    expect(res.body.benchmarkId).toBe(SLUG);
    expect(res.body.benchmarkType).toBe('site');
  });

  it('returns 404 for an unknown site benchmark slug', async () => {
    state.selectQueue = [[]];
    const res = await enable('no-such-slug', { benchmarkType: 'site' });
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Site benchmark not found');
  });

  it('returns 400 for a malformed site benchmark id', async () => {
    const res = await enable('a%20b!', { benchmarkType: 'site' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-UUID custom benchmark id', async () => {
    const res = await enable(SLUG, { benchmarkType: 'custom' });
    expect(res.status).toBe(400);
  });
});
