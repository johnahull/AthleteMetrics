/**
 * display_format ('decimal' | 'duration') on site metrics and custom org metrics.
 *
 * Verifies:
 *  - create and update with duration (unit 's')
 *  - duration with a unit other than 's' -> 400 (checked against the merged existing row + patch)
 *  - a partial update keeps duration
 *  - rows created without a format read back as 'decimal'
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { eq, like } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations, customOrgMetrics, siteMetrics } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';
import { createCustomMetricSchema, updateCustomMetricSchema } from '../../packages/api/routes/custom-org-metric-routes';
import { z } from 'zod';

const PASSWORD = 'TestAdmin123!';
const tag = randomUUID().slice(0, 8).toUpperCase();
const CODE_PREFIX = `ZZ_DUR_${tag}`;

let app: Express;
let org: any;
let siteAdmin: any;
let orgAdmin: any;
let siteCookie: string;
let orgCookie: string;

async function login(username: string) {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  return res.headers['set-cookie'][0];
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
  [org] = await db
    .insert(organizations)
    .values({ id: randomUUID(), name: `Duration Org ${tag}`, isActive: true, customMetricsEnabled: true })
    .returning();
  [siteAdmin] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      username: `dur_site_${tag}`,
      emails: [`dur_site_${tag}@test.com`],
      password: hashed,
      firstName: 'Site',
      lastName: 'Admin',
      fullName: 'Site Admin',
      isSiteAdmin: true,
    })
    .returning();
  [orgAdmin] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      username: `dur_org_${tag}`,
      emails: [`dur_org_${tag}@test.com`],
      password: hashed,
      firstName: 'Org',
      lastName: 'Admin',
      fullName: 'Org Admin',
    })
    .returning();
  await db.insert(userOrganizations).values({ userId: orgAdmin.id, organizationId: org.id, role: 'org_admin' });

  siteCookie = await login(siteAdmin.username);
  orgCookie = await login(orgAdmin.username);
});

afterAll(async () => {
  await db.delete(siteMetrics).where(like(siteMetrics.code, `${CODE_PREFIX}%`));
  if (org?.id) await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, org.id));
  if (orgAdmin?.id) await db.delete(userOrganizations).where(eq(userOrganizations.userId, orgAdmin.id));
  for (const u of [siteAdmin, orgAdmin]) if (u?.id) await db.delete(users).where(eq(users.id, u.id));
  if (org?.id) await db.delete(organizations).where(eq(organizations.id, org.id));
});

describe('site metrics: displayFormat', () => {
  const createSite = (body: object) => request(app).post('/api/metrics').set('Cookie', siteCookie).send(body);
  const patchSite = (code: string, body: object) =>
    request(app).patch(`/api/metrics/${code}`).set('Cookie', siteCookie).send(body);

  it('defaults to decimal', async () => {
    const res = await createSite({ code: `${CODE_PREFIX}_DEC`, label: 'Dec', unit: 's' });
    expect(res.status).toBe(201);
    expect(res.body.displayFormat).toBe('decimal');
  });

  it('creates a duration metric with unit s, and a partial update keeps it', async () => {
    const code = `${CODE_PREFIX}_MILE`;
    const res = await createSite({ code, label: 'Mile', unit: 's', displayFormat: 'duration', decimalPrecision: 1 });
    expect(res.status).toBe(201);
    expect(res.body.displayFormat).toBe('duration');

    const patched = await patchSite(code, { label: 'Mile Run' });
    expect(patched.status).toBe(200);
    expect(patched.body.displayFormat).toBe('duration');
  });

  it('rejects duration with a unit other than s (create)', async () => {
    const res = await createSite({ code: `${CODE_PREFIX}_BAD`, label: 'Bad', unit: 'm', displayFormat: 'duration' });
    expect(res.status).toBe(400);
  });

  it('rejects a patch that sets duration on a metric whose stored unit is not s', async () => {
    const code = `${CODE_PREFIX}_IN`;
    expect((await createSite({ code, label: 'Inches', unit: 'in' })).status).toBe(201);
    const res = await patchSite(code, { displayFormat: 'duration' });
    expect(res.status).toBe(400);
  });

  it('rejects a patch that changes the unit of a duration metric away from s', async () => {
    const code = `${CODE_PREFIX}_ROW`;
    expect((await createSite({ code, label: 'Row', unit: 's', displayFormat: 'duration' })).status).toBe(201);
    const res = await patchSite(code, { unit: 'min' });
    expect(res.status).toBe(400);
  });

  it('updates a decimal metric with unit s to duration', async () => {
    const code = `${CODE_PREFIX}_UP`;
    expect((await createSite({ code, label: 'Up', unit: 's' })).status).toBe(201);
    const res = await patchSite(code, { displayFormat: 'duration' });
    expect(res.status).toBe(200);
    expect(res.body.displayFormat).toBe('duration');
  });
});

describe('custom org metrics: displayFormat', () => {
  const base = () => `/api/organizations/${org.id}/custom-metrics`;
  const createCustom = (body: object) => request(app).post(base()).set('Cookie', orgCookie).send(body);
  const patchCustom = (code: string, body: object) =>
    request(app).patch(`${base()}/${code}`).set('Cookie', orgCookie).send(body);

  it('defaults to decimal', async () => {
    const res = await createCustom({ label: `Dec ${tag}`, unit: 's', metricType: 'lower_is_better' });
    expect(res.status).toBe(201);
    expect(res.body.displayFormat).toBe('decimal');
  });

  it('creates a duration metric with unit s, and a partial update keeps it', async () => {
    const res = await createCustom({
      label: `2k Row ${tag}`,
      unit: 's',
      metricType: 'lower_is_better',
      displayFormat: 'duration',
      decimalPrecision: 1,
    });
    expect(res.status).toBe(201);
    expect(res.body.displayFormat).toBe('duration');

    const patched = await patchCustom(res.body.code, { description: 'rowing' });
    expect(patched.status).toBe(200);
    expect(patched.body.displayFormat).toBe('duration');

    const list = await request(app).get(base()).set('Cookie', orgCookie);
    const listed = (list.body.metrics ?? list.body).find((m: any) => m.code === res.body.code);
    expect(listed.displayFormat).toBe('duration');
  });

  it('rejects duration with a unit other than s (create)', async () => {
    const res = await createCustom({ label: `Bad ${tag}`, unit: 'reps', metricType: 'higher_is_better', displayFormat: 'duration' });
    expect(res.status).toBe(400);
  });

  it('rejects a patch that sets duration on a metric whose stored unit is not s', async () => {
    const created = await createCustom({ label: `Jump ${tag}`, unit: 'in', metricType: 'higher_is_better' });
    expect(created.status).toBe(201);
    const res = await patchCustom(created.body.code, { displayFormat: 'duration' });
    expect(res.status).toBe(400);
  });

  it('rejects a patch that changes the unit of a duration metric away from s', async () => {
    const created = await createCustom({ label: `Swim ${tag}`, unit: 's', metricType: 'lower_is_better', displayFormat: 'duration' });
    expect(created.status).toBe(201);
    const res = await patchCustom(created.body.code, { unit: 'min' });
    expect(res.status).toBe(400);
  });
});

describe('custom org metric schemas: displayFormat default', () => {
  it('create defaults to decimal; update has no default, so a partial PATCH never resets the format', () => {
    expect(createCustomMetricSchema.parse({ label: 'X', metricType: 'tracking' }).displayFormat).toBe('decimal');
    expect('displayFormat' in updateCustomMetricSchema.parse({})).toBe(false);
    // A default inside the update schema would reset the format on every partial PATCH under Zod 4
    let inner: z.ZodTypeAny = updateCustomMetricSchema.shape.displayFormat;
    while (inner instanceof z.ZodOptional) inner = inner.unwrap();
    expect(inner).toBeInstanceOf(z.ZodEnum);
  });
});
