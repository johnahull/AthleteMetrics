/**
 * Integration tests — site admins assign users who belong to no organization.
 *
 * GET  /api/users/unaffiliated
 * POST /api/organizations/:orgId/users/:userId/assign
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
import crypto from 'crypto';
import { db } from '../../packages/api/db';
import { users, organizations, auditLogs } from '@shared/schema';
import { userOrganizations } from '@shared/schema/tables/membership';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { and, eq, inArray, like } from 'drizzle-orm';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));
vi.mock('../../packages/api/services/email-service', () => ({
  emailService: new Proxy({}, { get: () => vi.fn().mockResolvedValue(true) }),
  EmailService: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PREFIX = 'assignorg_test_';
const PASSWORD = 'TestPassword1!';
const uid = () => crypto.randomBytes(4).toString('hex');

async function createUser(suffix: string, extra: Record<string, unknown> = {}) {
  const id = uid();
  const [user] = await db
    .insert(users)
    .values({
      birthDate: '1990-01-01', // the profile gate requires a birthdate
      username: `${PREFIX}${suffix}_${id}`,
      firstName: 'Assign',
      lastName: suffix,
      fullName: `Assign ${suffix}`,
      emails: [`${PREFIX}${suffix}_${id}@example.com`],
      password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
      isEmailVerified: true,
      isSiteAdmin: false,
      coppaStatus: 'not_applicable',
      ...extra,
    })
    .returning();
  createdUserIds.push(user.id);
  return user;
}

async function createOrg(suffix: string, extra: Record<string, unknown> = {}) {
  const [org] = await db
    .insert(organizations)
    .values({ name: `${PREFIX}org_${suffix}_${uid()}`, orgType: 'club', ...extra })
    .returning();
  createdOrgIds.push(org.id);
  return org;
}

async function loginAs(username: string) {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  const cookies = res.headers['set-cookie'];
  return Array.isArray(cookies) ? cookies[0] : cookies;
}

const membership = (userId: string, orgId: string) =>
  db
    .select()
    .from(userOrganizations)
    .where(and(eq(userOrganizations.userId, userId), eq(userOrganizations.organizationId, orgId)));

let app: Express;
let siteAdmin: any;
let orgAdmin: any;
let org: any;
let siteCookie: string;
let orgAdminCookie: string;
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  org = await createOrg('main');
  siteAdmin = await createUser('siteadmin', { isSiteAdmin: true });
  orgAdmin = await createUser('orgadmin');
  await db.insert(userOrganizations).values({ userId: orgAdmin.id, organizationId: org.id, role: 'org_admin' });
  siteCookie = await loginAs(siteAdmin.username);
  orgAdminCookie = await loginAs(orgAdmin.username);
});

afterAll(async () => {
  await db.delete(parentAthleteLinks).where(like(parentAthleteLinks.parentEmail, `${PREFIX}%`));
  await db.delete(auditLogs).where(and(eq(auditLogs.action, 'user_assigned_to_organization'), inArray(auditLogs.resourceId, createdUserIds)));
  await purgeTestRows({
    userIds: createdUserIds,
    orgIds: createdOrgIds,
    usernameLike: [`${PREFIX}%`],
    orgNameLike: [`${PREFIX}org_%`],
  });
});

describe('GET /api/users/unaffiliated', () => {
  it('401 without a session', async () => {
    expect((await request(app).get('/api/users/unaffiliated')).status).toBe(401);
  });

  it('403 for an org admin', async () => {
    const res = await request(app).get('/api/users/unaffiliated').set('Cookie', orgAdminCookie);
    expect(res.status).toBe(403);
  });

  it('lists users with no org, flags parents, and excludes members, site admins and deleted users', async () => {
    const loose = await createUser('loose');
    const parent = await createUser('parent');
    await db.insert(parentAthleteLinks).values({
      parentEmail: `${PREFIX}parent_${uid()}@example.com`,
      parentUserId: parent.id,
      athleteUserId: loose.id,
    });
    const member = await createUser('member');
    await db.insert(userOrganizations).values({ userId: member.id, organizationId: org.id, role: 'athlete' });
    const deleted = await createUser('deleted', { deletedAt: new Date() });

    const res = await request(app).get('/api/users/unaffiliated').set('Cookie', siteCookie);
    expect(res.status).toBe(200);
    const byId = new Map<string, any>(res.body.map((u: any) => [u.id, u]));

    expect(byId.get(loose.id)).toMatchObject({
      id: loose.id,
      firstName: 'Assign',
      lastName: 'loose',
      username: loose.username,
      emails: loose.emails,
      isActive: true,
      isParent: false,
    });
    expect(byId.get(loose.id).createdAt).toBeDefined();
    expect(byId.get(parent.id)?.isParent).toBe(true);
    expect(byId.has(member.id)).toBe(false);
    expect(byId.has(siteAdmin.id)).toBe(false);
    expect(byId.has(deleted.id)).toBe(false);
    expect(byId.get(loose.id)).not.toHaveProperty('password');
  });
});

describe('parents with only deactivated links', () => {
  // auth-service treats such a user as an athlete (consent denied/revoked), so they stay assignable
  it('are listed with isParent false and can be assigned', async () => {
    const exParent = await createUser('exparent');
    const kid = await createUser('exkid');
    await db.insert(parentAthleteLinks).values({
      parentEmail: `${PREFIX}ex_${uid()}@example.com`,
      parentUserId: exParent.id,
      athleteUserId: kid.id,
      isActive: false,
    });

    const list = await request(app).get('/api/users/unaffiliated').set('Cookie', siteCookie);
    expect(list.body.find((u: any) => u.id === exParent.id)?.isParent).toBe(false);

    const res = await request(app)
      .post(`/api/organizations/${org.id}/users/${exParent.id}/assign`)
      .set('Cookie', siteCookie)
      .send({});
    expect(res.status).toBe(201);
  });
});

describe('POST /api/organizations/:orgId/users/:userId/assign', () => {
  const assign = (orgId: string, userId: string, cookie: string, body: object = {}) =>
    request(app).post(`/api/organizations/${orgId}/users/${userId}/assign`).set('Cookie', cookie).send(body);

  it('403 for an org admin, even in their own org', async () => {
    const target = await createUser('t403');
    const res = await assign(org.id, target.id, orgAdminCookie);
    expect(res.status).toBe(403);
    expect(await membership(target.id, org.id)).toHaveLength(0);
  });

  it('assigns as athlete by default and writes an audit log', async () => {
    const target = await createUser('tdefault');
    const res = await assign(org.id, target.id, siteCookie);
    expect(res.status).toBe(201);
    const rows = await membership(target.id, org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('athlete');

    const [log] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'user_assigned_to_organization'), eq(auditLogs.resourceId, target.id)));
    expect(log.userId).toBe(siteAdmin.id);
    expect(JSON.parse(log.details as string)).toMatchObject({ organizationId: org.id, role: 'athlete' });
  });

  it.each(['coach', 'org_admin'])('assigns with role %s', async (role) => {
    const target = await createUser(`t_${role}`);
    expect((await assign(org.id, target.id, siteCookie, { role })).status).toBe(201);
    expect((await membership(target.id, org.id))[0].role).toBe(role);
  });

  it.each(['site_admin', 'parent', 'guest', 'bogus'])('400 for invalid role %s', async (role) => {
    const target = await createUser(`tbad_${role}`);
    expect((await assign(org.id, target.id, siteCookie, { role })).status).toBe(400);
    expect(await membership(target.id, org.id)).toHaveLength(0);
  });

  it('409 and leaves the role alone when the user already belongs to an org', async () => {
    const target = await createUser('tmember');
    const other = await createOrg('other');
    await db.insert(userOrganizations).values({ userId: target.id, organizationId: other.id, role: 'coach' });

    const res = await assign(org.id, target.id, siteCookie, { role: 'org_admin' });
    expect(res.status).toBe(409);
    expect(await membership(target.id, org.id)).toHaveLength(0);
    expect((await membership(target.id, other.id))[0].role).toBe('coach');
  });

  it('409 when already a member of the same org (no role clobber)', async () => {
    const target = await createUser('tsame');
    await db.insert(userOrganizations).values({ userId: target.id, organizationId: org.id, role: 'coach' });
    const res = await assign(org.id, target.id, siteCookie, { role: 'athlete' });
    expect(res.status).toBe(409);
    expect((await membership(target.id, org.id))[0].role).toBe('coach');
  });

  it('400 for a parent account', async () => {
    const parent = await createUser('tparent');
    const kid = await createUser('tkid');
    await db.insert(parentAthleteLinks).values({
      parentEmail: `${PREFIX}p_${uid()}@example.com`,
      parentUserId: parent.id,
      athleteUserId: kid.id,
    });
    expect((await assign(org.id, parent.id, siteCookie)).status).toBe(400);
    expect(await membership(parent.id, org.id)).toHaveLength(0);
  });

  it('400 for a site admin target', async () => {
    const otherAdmin = await createUser('tadmin', { isSiteAdmin: true });
    expect((await assign(org.id, otherAdmin.id, siteCookie)).status).toBe(400);
  });

  it('404 for an unknown or deleted user', async () => {
    const gone = await createUser('tgone', { deletedAt: new Date() });
    expect((await assign(org.id, gone.id, siteCookie)).status).toBe(404);
    expect((await assign(org.id, crypto.randomUUID(), siteCookie)).status).toBe(404);
  });

  it('404 for an unknown org and 400 for an inactive org', async () => {
    const target = await createUser('torg');
    expect((await assign(crypto.randomUUID(), target.id, siteCookie)).status).toBe(404);
    const inactive = await createOrg('inactive', { isActive: false });
    expect((await assign(inactive.id, target.id, siteCookie)).status).toBe(400);
    expect(await membership(target.id, inactive.id)).toHaveLength(0);
  });

  it('400 for malformed ids', async () => {
    expect((await assign('not-a-uuid', crypto.randomUUID(), siteCookie)).status).toBe(400);
    expect((await assign(org.id, 'not-a-uuid', siteCookie)).status).toBe(400);
  });

  it('concurrent assigns of one user to different orgs: exactly one 201, the rest 409, one membership', async () => {
    const target = await createUser('trace');
    const orgs = await Promise.all(['raceA', 'raceB', 'raceC', 'raceD', 'raceE'].map((n) => createOrg(n)));

    const results = await Promise.all(orgs.map((o) => assign(o.id, target.id, siteCookie)));

    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    const rows = await db.select().from(userOrganizations).where(eq(userOrganizations.userId, target.id));
    expect(rows).toHaveLength(1);
  });
});
