/**
 * Changing a report (PUT, DELETE, archive/unarchive) needs a writer role (coach / org_admin / site admin) in the
 * report's OWN organization, or being the report's creator. Pin/unpin change org-wide state (max 10 pinned per
 * organization) and need a writer role. Org access alone, e.g. a plain athlete member, is not enough.
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
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations, reports } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const stamp = Date.now();
const PASSWORD = 'TestRoles123!';
const CONFIG = { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'] };
let app: Express;
let orgA: string; // sorts first: the session (primary) organization of "mixed"
let orgB: string; // the report organization
const u: Record<string, any> = {};
const cookies: Record<string, string> = {};
const userIds: string[] = [];
const reportIds: string[] = [];

const mkUser = async (tag: string, extra: Record<string, unknown> = {}) => {
  const [row] = await db.insert(users).values({
    username: `rolegate_${tag}_${stamp}`, emails: [`rolegate_${tag}_${stamp}@test.com`],
    password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS), firstName: 'Role', lastName: tag, fullName: `Role ${tag}`,
    birthDate: '1990-01-01', isActive: true, isEmailVerified: true, ...extra,
  } as any).returning();
  userIds.push(row.id);
  const login = await request(app).post('/api/auth/login').send({ username: row.username, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login ${tag} ${login.status}`);
  cookies[tag] = login.headers['set-cookie'][0];
  return row;
};
const join = (userId: string, organizationId: string, role: string) =>
  db.insert(userOrganizations).values({ userId, organizationId, role } as any);
const mkReport = async (createdBy: string, name = 'Orig') => {
  const [r] = await db.insert(reports).values({
    name: `rolegate_${stamp}_${name}`, organizationId: orgB, createdBy, reportType: 'team', config: CONFIG,
  } as any).returning();
  reportIds.push(r.id);
  return r;
};
const row = async (id: string) => (await db.select().from(reports).where(eq(reports.id, id)))[0];

beforeAll(async () => {
  app = express();
  app.use(express.json());
  await registerRoutes(app);
  const mkOrg = async (label: string) =>
    (await db.insert(organizations).values({ name: `rolegate_${label}_${stamp}`, isActive: true } as any).returning())[0].id;
  orgA = await mkOrg('a');
  orgB = await mkOrg('b');
  for (const tag of ['coach', 'orgadmin', 'athlete', 'otherAthlete', 'mixed', 'outsider']) u[tag] = await mkUser(tag);
  u.site = await mkUser('site', { isSiteAdmin: true });
  await join(u.coach.id, orgB, 'coach');
  await join(u.orgadmin.id, orgB, 'org_admin');
  await join(u.athlete.id, orgB, 'athlete');
  await join(u.otherAthlete.id, orgB, 'athlete');
  await join(u.mixed.id, orgA, 'coach'); // coach in the primary org ...
  await join(u.mixed.id, orgB, 'athlete'); // ... but an athlete in the report org
  await join(u.outsider.id, orgA, 'coach');
});

afterAll(async () => {
  await db.delete(reports).where(inArray(reports.id, reportIds));
  await db.delete(userOrganizations).where(inArray(userOrganizations.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
});

const act = {
  put: (id: string, who: string) => request(app).put(`/api/reports/${id}`).set('Cookie', cookies[who]).send({ name: `rolegate_${stamp}_renamed` }),
  del: (id: string, who: string) => request(app).delete(`/api/reports/${id}`).set('Cookie', cookies[who]),
  pin: (id: string, who: string) => request(app).patch(`/api/reports/${id}/pin`).set('Cookie', cookies[who]),
  unpin: (id: string, who: string) => request(app).patch(`/api/reports/${id}/unpin`).set('Cookie', cookies[who]),
  archive: (id: string, who: string) => request(app).patch(`/api/reports/${id}/archive`).set('Cookie', cookies[who]),
  unarchive: (id: string, who: string) => request(app).patch(`/api/reports/${id}/unarchive`).set('Cookie', cookies[who]),
};

describe('a member who is not a writer of the report organization (and not its creator)', () => {
  it.each(['athlete', 'mixed', 'outsider'])('%s gets 403 on every change and nothing changes', async (who) => {
    const r = await mkReport(u.coach.id);
    for (const name of ['put', 'del', 'pin', 'unpin', 'archive', 'unarchive'] as const) {
      expect((await act[name](r.id, who)).status, `${name} as ${who}`).toBe(403);
    }
    const after = await row(r.id);
    expect(after).toMatchObject({ name: r.name, isPinned: false, archivedAt: null });
  });
});

describe('writers of the report organization', () => {
  it.each(['coach', 'orgadmin', 'site'])('%s can update, pin, unpin, archive, unarchive and delete', async (who) => {
    const r = await mkReport(u.otherAthlete.id);
    const ok = async (name: keyof typeof act) => {
      const res = await act[name](r.id, who);
      expect(res.status, `${name} as ${who}: ${JSON.stringify(res.body)}`).toBe(200);
    };
    await ok('put');
    expect((await row(r.id)).name).toBe(`rolegate_${stamp}_renamed`);
    await ok('pin');
    expect((await row(r.id)).isPinned).toBe(true);
    await ok('unpin');
    await ok('archive');
    expect((await row(r.id)).archivedAt).not.toBeNull();
    await ok('unarchive');
    await ok('del');
    expect(await row(r.id)).toBeUndefined();
  });
});

describe('the creator of a report', () => {
  it('an athlete can still update and delete their own report', async () => {
    const r = await mkReport(u.athlete.id);
    expect((await act.put(r.id, 'athlete')).status).toBe(200);
    expect((await row(r.id)).name).toBe(`rolegate_${stamp}_renamed`);
    expect((await act.del(r.id, 'athlete')).status).toBe(200);
    expect(await row(r.id)).toBeUndefined();
  });

  it('but cannot pin, unpin, archive or unarchive it (shared org-wide state, as before)', async () => {
    const r = await mkReport(u.athlete.id);
    for (const name of ['pin', 'unpin', 'archive', 'unarchive'] as const) {
      expect((await act[name](r.id, 'athlete')).status, name).toBe(403);
    }
    expect(await row(r.id)).toMatchObject({ isPinned: false, archivedAt: null });
  });
});
