/**
 * Org-metric write endpoints are org-admin only. The UI already hides the controls from coaches and
 * athletes, but the routes accepted any org member.
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
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations, siteMetrics, organizationMetrics } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';

const stamp = Date.now();
const PASSWORD = 'RoleTest123!x';
const CODE = `ROLEWRITE_${stamp}`;
const ROLES = ['org_admin', 'coach', 'athlete', 'outsider'] as const;
type Who = (typeof ROLES)[number] | 'site_admin';

let app: Express;
let orgId: string;
let otherOrgId: string;
const cookies: Partial<Record<Who, string>> = {};
const userIds: string[] = [];

async function login(username: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login ${username} failed (${res.status})`);
  return res.headers['set-cookie'][0];
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const [admin] = await db.select().from(users).where(eq(users.username, process.env.ADMIN_USER!)).limit(1);
  await db.insert(siteMetrics).values({
    code: CODE, label: 'Role write', unit: 's', metricType: 'lower_is_better',
    isActive: true, isSystemDefault: false, availableOrgTypes: null, createdBy: admin.id,
  });
  const [org] = await db.insert(organizations).values({ name: `Role Org ${stamp}`, organizationType: 'club' } as any).returning();
  const [other] = await db.insert(organizations).values({ name: `Role Other Org ${stamp}`, organizationType: 'club' } as any).returning();
  orgId = org.id;
  otherOrgId = other.id;

  const hash = await bcrypt.hash(PASSWORD, 4);
  for (const role of ROLES) {
    const [u] = await db.insert(users).values({
      username: `rolewrite-${role}-${stamp}`, emails: [`rolewrite-${role}-${stamp}@test.com`], password: hash,
      firstName: 'Role', lastName: role, fullName: `Role ${role}`, isActive: true,
    } as any).returning();
    userIds.push(u.id);
    // the outsider belongs only to the other org
    await db.insert(userOrganizations).values({
      userId: u.id, organizationId: role === 'outsider' ? otherOrgId : orgId, role: role === 'outsider' ? 'org_admin' : role,
    } as any);
    cookies[role] = await login(`rolewrite-${role}-${stamp}`, PASSWORD);
  }
  cookies.site_admin = await login(process.env.ADMIN_USER!, process.env.ADMIN_PASSWORD!);
});

afterAll(async () => {
  await db.delete(organizationMetrics).where(eq(organizationMetrics.organizationId, orgId));
  await db.delete(userOrganizations).where(inArray(userOrganizations.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(organizations).where(inArray(organizations.id, [orgId, otherOrgId]));
  await db.delete(siteMetrics).where(eq(siteMetrics.code, CODE));
});

const routes = [
  { name: 'enable', method: 'post', path: () => `/metrics/${CODE}/enable`, body: {} },
  { name: 'disable', method: 'post', path: () => `/metrics/${CODE}/disable`, body: {} },
  { name: 'update', method: 'patch', path: () => `/metrics/${CODE}`, body: { customLabel: 'x' } },
  { name: 'bulk-enable', method: 'post', path: () => `/metrics/bulk-enable`, body: { metricCodes: [CODE] } },
  { name: 'bulk-update', method: 'post', path: () => `/metrics/bulk-update`, body: { enable: [CODE] } },
] as const;

const call = (r: (typeof routes)[number], who: Who) =>
  (request(app) as any)[r.method](`/api/organizations/${orgId}${r.path()}`).set('Cookie', cookies[who]!).send(r.body);

describe.each(routes)('org metric write: $name', (r) => {
  it.each(['coach', 'athlete', 'outsider'] as const)('rejects %s with 403', async (who) => {
    expect((await call(r, who)).status).toBe(403);
  });

  it('allows an org admin of that org', async () => {
    // disable/update need an existing row, so enable first through the admin path
    await db.insert(organizationMetrics).values({ organizationId: orgId, metricCode: CODE, isEnabled: true }).onConflictDoNothing();
    expect((await call(r, 'org_admin')).status).toBe(200);
  });

  it('allows a site admin', async () => {
    await db.insert(organizationMetrics).values({ organizationId: orgId, metricCode: CODE, isEnabled: true }).onConflictDoNothing();
    expect((await call(r, 'site_admin')).status).toBe(200);
  });
});
