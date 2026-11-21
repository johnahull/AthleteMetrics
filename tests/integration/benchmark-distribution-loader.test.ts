/**
 * POST /api/benchmark-distributions (AM-FEAT-024 P1): site admin only, create-only, one transaction.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { eq, inArray, like } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { benchmarkDistributions, benchmarkDistributionVersions, organizations, siteMetrics, userOrganizations, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';
import { mountJsonParsers } from '../../packages/api/middleware/json-parsers';

const PASSWORD = 'DistLoader123!';
const PREFIX = `distload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const SUFFIX = Math.random().toString(36).slice(2, 8).toUpperCase();
const LOWER = `ZZ_DL_LOW_${SUFFIX}`;
const TRACK = `ZZ_DL_TRK_${SUFFIX}`;

type Who = 'coach' | 'orgAdmin' | 'siteAdmin';

describe('benchmark distribution loader', () => {
  let app: Express;
  let orgId: string;
  const cookies = {} as Record<Who, string>;
  const userIds: string[] = [];
  const row = (o: Record<string, unknown> = {}) => ({
    metricCode: LOWER, sex: 'male', ageMin: 10, ageMax: 12, kind: 'raw', n: 4, values: [3.3, 1.1, 2.2, 1.1], ...o,
  });
  const body = (o: Record<string, unknown> = {}) => ({ label: `${PREFIX}-v1`, source: 'test source', distributions: [row()], ...o });
  const post = (who: Who | null, b: unknown) => {
    const r = request(app).post('/api/benchmark-distributions');
    return (who ? r.set('Cookie', cookies[who]) : r).send(b as object);
  };
  const countRows = async () => (await db.select().from(benchmarkDistributions).where(eq(benchmarkDistributions.metricCode, LOWER))).length;

  beforeAll(async () => {
    app = express();
    mountJsonParsers(app); // the real parser config from packages/api/index.ts
    await registerRoutes(app);
    [{ id: orgId }] = await db.insert(organizations).values({ name: `${PREFIX}-org` } as any).returning({ id: organizations.id });
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    const spec: Record<Who, string | null> = { coach: 'coach', orgAdmin: 'org_admin', siteAdmin: null };
    for (const [who, role] of Object.entries(spec) as Array<[Who, string | null]>) {
      const [user] = await db.insert(users).values({
        birthDate: '1990-01-01', username: `${PREFIX}-${who}`, emails: [`${PREFIX}-${who}@test.com`], password: hashed,
        firstName: 'D', lastName: who, fullName: `D ${who}`, ...(who === 'siteAdmin' ? { isSiteAdmin: true } : {}),
      } as any).returning();
      userIds.push(user.id);
      if (role) await db.insert(userOrganizations).values({ userId: user.id, organizationId: orgId, role } as any);
      const login = await request(app).post('/api/auth/login').send({ username: user.username, password: PASSWORD });
      expect(login.status, `login ${who}`).toBe(200);
      cookies[who] = login.headers['set-cookie'][0];
    }
    await db.insert(siteMetrics).values([
      { code: LOWER, label: LOWER, category: 'speed', unit: 's', metricType: 'lower_is_better' },
      { code: TRACK, label: TRACK, category: 'speed', unit: 'cm', metricType: 'tracking' },
    ] as any);
  });

  afterAll(async () => {
    // On DBs with the 0179 trigger, distribution rows cannot be deleted, so the ZZ_DL_* metric rows, versions and
    // distributions stay behind there. Only that error is tolerated; anything else is a real cleanup failure.
    const tolerate = (e: any) => { if (!/immutable|violates foreign key/.test(String(e?.message) + String(e?.cause?.message))) throw e; };
    await db.delete(benchmarkDistributions).where(inArray(benchmarkDistributions.metricCode, [LOWER, TRACK])).catch(tolerate);
    await db.delete(benchmarkDistributionVersions).where(like(benchmarkDistributionVersions.label, `${PREFIX}%`)).catch(tolerate);
    await purgeTestRows({ userIds, orgIds: [orgId] });
    await db.delete(siteMetrics).where(inArray(siteMetrics.code, [LOWER, TRACK])).catch(tolerate);
  });

  it('401 unauthenticated, 403 coach and org admin', async () => {
    expect((await post(null, body())).status).toBe(401);
    expect((await post('coach', body())).status).toBe(403);
    expect((await post('orgAdmin', body())).status).toBe(403);
    expect(await countRows()).toBe(0);
  });

  it('400 for bad input, unknown metric and tracking metric; nothing stored', async () => {
    expect((await post('siteAdmin', body({ label: '' }))).status).toBe(400);
    expect((await post('siteAdmin', body({ distributions: [row({ n: 9 })] }))).status).toBe(400);
    expect((await post('siteAdmin', body({ distributions: [row(), row({ ageMin: 11, ageMax: 13 })] }))).status).toBe(400);
    expect((await post('siteAdmin', body({ distributions: [row({ metricCode: `ZZ_NOPE_${SUFFIX}` })] }))).status).toBe(400);
    expect((await post('siteAdmin', body({ distributions: [row({ metricCode: TRACK })] }))).status).toBe(400);
    expect(await countRows()).toBe(0);
  });

  it('201 for a site admin, rows stored sorted; a duplicate label is 409 and leaves rows unchanged', async () => {
    const res = await post('siteAdmin', body({ distributions: [row(), row({ sex: 'female' })] }));
    expect(res.status).toBe(201);
    expect(res.body.versionId).toHaveLength(36);
    expect(res.body.rows).toBe(2);
    const stored = await db.select().from(benchmarkDistributions).where(eq(benchmarkDistributions.versionId, res.body.versionId));
    expect(stored).toHaveLength(2);
    expect(stored[0].values).toEqual([1.1, 1.1, 2.2, 3.3]);

    const dup = await post('siteAdmin', body({ distributions: [row({ ageMin: 20, ageMax: 22 })] }));
    expect(dup.status).toBe(409);
    expect(await countRows()).toBe(2);
  });

  it('accepts a body over 100kb (global parser default) through the real parser config', async () => {
    const values = Array.from({ length: 20000 }, (_, i) => 1 + i / 7);
    const b = body({ label: `${PREFIX}-big`, distributions: [row({ n: values.length, values })] });
    expect(JSON.stringify(b).length).toBeGreaterThan(100 * 1024);
    const res = await post('siteAdmin', b);
    expect(res.status).toBe(201);
  });

  it('has no update or delete route', async () => {
    const id = 'x';
    expect((await request(app).patch(`/api/benchmark-distributions/${id}`).set('Cookie', cookies.siteAdmin).send({})).status).toBe(404);
    expect((await request(app).put(`/api/benchmark-distributions/${id}`).set('Cookie', cookies.siteAdmin).send({})).status).toBe(404);
    expect((await request(app).delete(`/api/benchmark-distributions/${id}`).set('Cookie', cookies.siteAdmin)).status).toBe(404);
  });
});
