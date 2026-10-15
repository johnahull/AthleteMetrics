/**
 * POST /api/organizations/:id/metrics/bulk-update enables and disables many metrics in one request,
 * so staging many switch flips in the UI costs one call against the rate limits instead of one per switch.
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
import { db } from '../../packages/api/db';
import bcrypt from 'bcrypt';
import { organizations, users, userOrganizations, siteMetrics, organizationMetrics } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';

let app: Express;
let authCookie: string;
let adminId: string;
const memberCookies: Record<string, string> = {};
const memberIds: string[] = [];
let orgId: string;
const stamp = Date.now();
const A = `BULKUPD_${stamp}_A`;
const B = `BULKUPD_${stamp}_B`;
const C = `BULKUPD_${stamp}_C`;
const INACTIVE = `BULKUPD_${stamp}_X`;

const url = () => `/api/organizations/${orgId}/metrics/bulk-update`;
const post = (body: unknown) => request(app).post(url()).set('Cookie', authCookie).send(body as object);
const enabledMap = async () => {
  const rows = await db.select().from(organizationMetrics).where(eq(organizationMetrics.organizationId, orgId));
  return Object.fromEntries(rows.map((r) => [r.metricCode, r.isEnabled]));
};

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const [admin] = await db.select().from(users).where(eq(users.username, process.env.ADMIN_USER!)).limit(1);
  adminId = admin.id;

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD });
  if (login.status !== 200) throw new Error(`Login failed (${login.status})`);
  authCookie = login.headers['set-cookie'][0];

  const base = { unit: 's', metricType: 'lower_is_better' as const, isSystemDefault: false, availableOrgTypes: null, createdBy: adminId };
  await db.insert(siteMetrics).values([
    { ...base, code: A, label: 'A', isActive: true },
    { ...base, code: B, label: 'B', isActive: true },
    { ...base, code: C, label: 'C', isActive: true },
    { ...base, code: INACTIVE, label: 'X', isActive: false },
  ]);
  const [org] = await db.insert(organizations).values({ name: `Bulk Update Org ${stamp}`, organizationType: 'club' } as any).returning();
  orgId = org.id;
  const hash = await bcrypt.hash('RoleTest123!x', 4);
  for (const role of ['coach', 'athlete'] as const) {
    const [u] = await db.insert(users).values({
      username: `bulkupd-${role}-${stamp}`, emails: [`bulkupd-${role}-${stamp}@test.com`], password: hash,
      firstName: 'Bulk', lastName: role, fullName: `Bulk ${role}`, isActive: true,
    } as any).returning();
    memberIds.push(u.id);
    await db.insert(userOrganizations).values({ userId: u.id, organizationId: orgId, role } as any);
    const r = await request(app).post('/api/auth/login').send({ username: u.username, password: 'RoleTest123!x' });
    if (r.status !== 200) throw new Error(`login ${role} failed (${r.status}): ${JSON.stringify(r.body)}`);
    memberCookies[role] = r.headers['set-cookie'][0];
  }
  // B starts enabled so a single call can disable it while enabling A
  await db.insert(organizationMetrics).values({ organizationId: orgId, metricCode: B, isEnabled: true });
});

afterAll(async () => {
  await db.delete(userOrganizations).where(inArray(userOrganizations.userId, memberIds));
  await db.delete(users).where(inArray(users.id, memberIds));
  await db.delete(organizationMetrics).where(eq(organizationMetrics.organizationId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(siteMetrics).where(inArray(siteMetrics.code, [A, B, C, INACTIVE]));
});

describe('POST /api/organizations/:id/metrics/bulk-update', () => {
  it('rejects unauthenticated callers', async () => {
    const res = await request(app).post(url()).send({ enable: [A] });
    expect([401, 403]).toContain(res.status);
  });

  it.each(['coach', 'athlete'] as const)('rejects a %s of the organization with 403', async (role) => {
    const res = await request(app).post(url()).set('Cookie', memberCookies[role]).send({ enable: [A] });
    expect(res.status).toBe(403);
    expect(await enabledMap()).toEqual({ [B]: true });
  });

  it('rolls everything back when one code is not active', async () => {
    const res = await post({ enable: [A, INACTIVE], disable: [B] });
    expect(res.status).toBe(400);
    expect(await enabledMap()).toEqual({ [B]: true });
  });

  it('rejects a code listed in both arrays', async () => {
    expect((await post({ enable: [A], disable: [A] })).status).toBe(400);
  });

  it('rejects an empty change set and malformed codes', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ enable: [], disable: [] })).status).toBe(400);
    expect((await post({ enable: ['lower-case'] })).status).toBe(400);
  });

  it('accepts duplicate codes in one array', async () => {
    const res = await post({ enable: [A, A] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('rejects more than 200 codes in one array', async () => {
    const many = Array.from({ length: 201 }, (_, i) => `M_${i}`);
    expect((await post({ enable: many })).status).toBe(400);
  });

  it('enables and disables in one call and returns the changed rows', async () => {
    const res = await post({ enable: [A, C], disable: [B] });
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => [r.metricCode, r.isEnabled]).sort()).toEqual([[A, true], [B, false], [C, true]]);
    expect(await enabledMap()).toEqual({ [A]: true, [B]: false, [C]: true });
  });

  it('re-enables an existing row and keeps its custom label', async () => {
    await db.update(organizationMetrics).set({ customLabel: 'Keep me' })
      .where(and(eq(organizationMetrics.organizationId, orgId), eq(organizationMetrics.metricCode, B)));
    const res = await post({ enable: [B] });
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ metricCode: B, isEnabled: true, customLabel: 'Keep me' });
  });

  it('treats disabling a metric that has no row as a no-op', async () => {
    await db.delete(organizationMetrics).where(and(eq(organizationMetrics.organizationId, orgId), eq(organizationMetrics.metricCode, C)));
    const res = await post({ enable: [], disable: [C] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
