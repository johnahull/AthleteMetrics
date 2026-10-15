/**
 * Benchmark-set routes: org set writes need coach or above in the route's own organization, and the
 * site-set visibility toggle needs an org admin. Athletes and members of other organizations get 403.
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
import { organizations, users, userOrganizations } from '@shared/schema';
import { benchmarkSets } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';

const stamp = Date.now();
const PASSWORD = 'RoleTest123!x';
const ROLES = ['org_admin', 'coach', 'athlete', 'outsider'] as const;
type Who = (typeof ROLES)[number] | 'site_admin';

let app: Express;
let orgId: string;
let otherOrgId: string;
let siteSetId: string;
const cookies: Partial<Record<Who, string>> = {};
const userIds: string[] = [];
const FAKE = '00000000-0000-0000-0000-000000000000';

async function login(username: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login ${username} failed (${res.status})`);
  return res.headers['set-cookie'][0];
}

const base = () => `/api/organizations/${orgId}`;
const send = (method: 'post' | 'patch' | 'delete', path: string, who: Who, body: object = {}) =>
  (request(app) as any)[method](path).set('Cookie', cookies[who]!).send(body);

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const [org] = await db.insert(organizations).values({ name: `BSet Org ${stamp}`, organizationType: 'club' } as any).returning();
  const [other] = await db.insert(organizations).values({ name: `BSet Other Org ${stamp}`, organizationType: 'club' } as any).returning();
  orgId = org.id;
  otherOrgId = other.id;

  const hash = await bcrypt.hash(PASSWORD, 4);
  for (const role of ROLES) {
    const [u] = await db.insert(users).values({
      username: `bset-${role}-${stamp}`, emails: [`bset-${role}-${stamp}@test.com`], password: hash,
      firstName: 'BSet', lastName: role, fullName: `BSet ${role}`, isActive: true,
    } as any).returning();
    userIds.push(u.id);
    // the outsider is an org admin of the other org only
    await db.insert(userOrganizations).values({
      userId: u.id, organizationId: role === 'outsider' ? otherOrgId : orgId, role: role === 'outsider' ? 'org_admin' : role,
    } as any);
    cookies[role] = await login(`bset-${role}-${stamp}`, PASSWORD);
  }
  cookies.site_admin = await login(process.env.ADMIN_USER!, process.env.ADMIN_PASSWORD!);

  const created = await send('post', '/api/site-benchmark-sets', 'site_admin', { name: `BSet Site Set ${stamp}` });
  if (created.status !== 201) throw new Error(`site set create failed (${created.status})`);
  siteSetId = created.body.id;
});

afterAll(async () => {
  await db.delete(benchmarkSets).where(eq(benchmarkSets.organizationId, orgId));
  await db.delete(benchmarkSets).where(eq(benchmarkSets.id, siteSetId));
  await db.delete(userOrganizations).where(inArray(userOrganizations.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(organizations).where(inArray(organizations.id, [orgId, otherOrgId]));
});

// Role gates run before any lookup, so a placeholder set id is enough to prove the 403
const orgWrites = [
  { name: 'create set', method: 'post', path: () => `${base()}/benchmark-sets`, body: { name: 'x' } },
  { name: 'update set', method: 'patch', path: () => `${base()}/benchmark-sets/${FAKE}`, body: { name: 'y' } },
  { name: 'delete set', method: 'delete', path: () => `${base()}/benchmark-sets/${FAKE}`, body: {} },
  { name: 'add item', method: 'post', path: () => `${base()}/benchmark-sets/${FAKE}/items`, body: {} },
  { name: 'remove item', method: 'delete', path: () => `${base()}/benchmark-sets/${FAKE}/items/${FAKE}`, body: {} },
  { name: 'reorder items', method: 'patch', path: () => `${base()}/benchmark-sets/${FAKE}/items/reorder`, body: { items: [] } },
] as const;

describe.each(orgWrites)('benchmark set write: $name', (r) => {
  it.each(['athlete', 'outsider'] as const)('rejects %s with 403', async (who) => {
    expect((await send(r.method, r.path(), who, r.body)).status).toBe(403);
  });

  it.each(['coach', 'org_admin', 'site_admin'] as const)('lets %s past the role gate', async (who) => {
    // a placeholder set is not found (404) or the body is rejected (400); never a 403
    expect((await send(r.method, r.path(), who, r.body)).status).not.toBe(403);
  });
});

describe('benchmark set lifecycle as coach', () => {
  it('creates, updates and deletes a set in the coach\'s own organization', async () => {
    const created = await send('post', `${base()}/benchmark-sets`, 'coach', { name: `Coach Set ${stamp}` });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await send('patch', `${base()}/benchmark-sets/${id}`, 'coach', { description: 'd' })).status).toBe(200);
    expect((await send('delete', `${base()}/benchmark-sets/${id}`, 'coach')).status).toBe(204);
  });

  it('cannot touch a set through another organization', async () => {
    const created = await send('post', `${base()}/benchmark-sets`, 'org_admin', { name: `Scoped Set ${stamp}` });
    expect(created.status).toBe(201);
    // the outsider is an org admin of the other org, so the role gate passes there but the set is not theirs
    const res = await send('delete', `/api/organizations/${otherOrgId}/benchmark-sets/${created.body.id}`, 'outsider');
    expect(res.status).toBe(404);
  });
});

describe('site set visibility toggle', () => {
  const path = () => `${base()}/site-benchmark-sets/${siteSetId}/visibility`;

  it.each(['coach', 'athlete', 'outsider'] as const)('rejects %s with 403', async (who) => {
    expect((await send('patch', path(), who, { isEnabled: false })).status).toBe(403);
  });

  it.each(['org_admin', 'site_admin'] as const)('lets %s toggle it', async (who) => {
    expect([200, 201]).toContain((await send('patch', path(), who, { isEnabled: false })).status);
  });
});
