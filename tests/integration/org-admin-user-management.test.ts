/**
 * Integration tests — org-admin access to User Management
 *
 * 1. POST /api/invitations must refuse role "site_admin" from anyone who is not
 *    a site admin (defense in depth: site admins are created through
 *    POST /api/site-admins only).
 * 2. GET /api/organizations-with-users (the roster + pending invitations the
 *    User Management page loads) is for org admins and above; coaches and
 *    athletes get no roster.
 *
 * Run:
 *   export $(cat .env | xargs) && npx vitest run --config vitest.integration.config.ts tests/integration/org-admin-user-management.test.ts
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../../packages/api/db';
import { users, organizations } from '@shared/schema/tables/core';
import { userOrganizations, invitations } from '@shared/schema/tables/membership';
import { eq, like } from 'drizzle-orm';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
  sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
  sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
  sendParentNotification: vi.fn().mockResolvedValue(true),
  sendEmailVerification: vi.fn().mockResolvedValue(true),
  sendInvitation: vi.fn().mockResolvedValue(true),
  sendParentInvitation: vi.fn().mockResolvedValue(true),
  sendWelcome: vi.fn().mockResolvedValue(true),
  sendPasswordReset: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../packages/api/services/email-service', () => ({
  emailService: emailMocks,
  EmailService: vi.fn().mockImplementation(() => emailMocks),
}));

import { registerRoutes } from '../../packages/api/routes';

const TEST_PREFIX = 'orgadmumgmt_';
const VALID_PASSWORD = 'TestPassword1!';

const uniqueId = () => crypto.randomBytes(4).toString('hex');

let app: Express;
let testOrg: { id: string };
const cookies: Record<'orgAdmin' | 'coach' | 'athlete' | 'siteAdmin', string> = {
  orgAdmin: '',
  coach: '',
  athlete: '',
  siteAdmin: '',
};

async function createUser(
  suffix: string,
  role: 'org_admin' | 'coach' | 'athlete',
  opts: { siteAdmin?: boolean; member?: boolean } = {},
) {
  const username = `${TEST_PREFIX}${suffix}`;
  const [user] = await db.insert(users).values({
    username,
    firstName: suffix,
    lastName: 'Tester',
    fullName: `${suffix} Tester`,
    emails: [`${username}@example.com`],
    password: await bcrypt.hash(VALID_PASSWORD, BCRYPT_SALT_ROUNDS),
    role,
    isSiteAdmin: opts.siteAdmin === true,
    isEmailVerified: true,
    coppaStatus: 'not_applicable',
  }).returning();

  if (opts.member !== false) {
    await db.insert(userOrganizations).values({
      userId: user.id,
      organizationId: testOrg.id,
      role,
    }).onConflictDoNothing();
  }
  return user;
}

async function loginAs(username: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password: VALID_PASSWORD });
  const set = res.headers['set-cookie'];
  return Array.isArray(set) ? set[0] : (set as unknown as string);
}

function invitePayload(overrides: Record<string, unknown> = {}) {
  return {
    email: `${TEST_PREFIX}invitee_${uniqueId()}@example.com`,
    firstName: 'Invited',
    lastName: 'Person',
    role: 'athlete',
    organizationId: testOrg.id,
    teamIds: [],
    ...overrides,
  };
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to run integration tests.');
  }

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const id = uniqueId();
  const [org] = await db.insert(organizations).values({
    name: `OrgAdminUserMgmtOrg-${id}`,
    orgType: 'club',
  }).returning();
  testOrg = org;

  const orgAdmin = await createUser(`orgadmin_${id}`, 'org_admin');
  const coach = await createUser(`coach_${id}`, 'coach');
  const athlete = await createUser(`athlete_${id}`, 'athlete');
  const siteAdmin = await createUser(`siteadmin_${id}`, 'org_admin', { siteAdmin: true, member: false });

  cookies.orgAdmin = await loginAs(orgAdmin.username);
  cookies.coach = await loginAs(coach.username);
  cookies.athlete = await loginAs(athlete.username);
  cookies.siteAdmin = await loginAs(siteAdmin.username);
});

afterAll(async () => {
  try {
    await db.delete(invitations).where(eq(invitations.organizationId, testOrg.id));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrg.id));
    await db.delete(users).where(like(users.username, `${TEST_PREFIX}%`));
    await db.delete(organizations).where(eq(organizations.id, testOrg.id));
  } catch {
    // best-effort cleanup
  }
});

describe('POST /api/invitations — site_admin role', () => {
  it('org admin cannot invite role site_admin → 403, no invitation row', async () => {
    const payload = invitePayload({ role: 'site_admin' });

    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', cookies.orgAdmin)
      .send(payload);

    expect(res.status).toBe(403);
    const rows = await db.select().from(invitations).where(eq(invitations.email, payload.email));
    expect(rows).toHaveLength(0);
  });

  it('coach cannot invite role site_admin → 403, no invitation row', async () => {
    const payload = invitePayload({ role: 'site_admin' });

    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', cookies.coach)
      .send(payload);

    expect(res.status).toBe(403);
    const rows = await db.select().from(invitations).where(eq(invitations.email, payload.email));
    expect(rows).toHaveLength(0);
  });

  it('org admin can still invite org_admin, coach and athlete', async () => {
    for (const role of ['org_admin', 'coach', 'athlete']) {
      const res = await request(app)
        .post('/api/invitations')
        .set('Cookie', cookies.orgAdmin)
        .send(invitePayload({ role }));
      expect(res.status, `role ${role}`).toBe(201);
    }
  });
});

describe('GET /api/organizations-with-users — roster access', () => {
  it('org admin gets their organization with its users', async () => {
    const res = await request(app)
      .get('/api/organizations-with-users')
      .set('Cookie', cookies.orgAdmin);

    expect(res.status).toBe(200);
    const org = res.body.find((o: { id: string }) => o.id === testOrg.id);
    expect(org).toBeDefined();
    expect(org.users.length).toBeGreaterThanOrEqual(3);
  });

  it('coach gets no roster → 403', async () => {
    const res = await request(app)
      .get('/api/organizations-with-users')
      .set('Cookie', cookies.coach);

    expect(res.status).toBe(403);
  });

  it('athlete gets no roster → 403', async () => {
    const res = await request(app)
      .get('/api/organizations-with-users')
      .set('Cookie', cookies.athlete);

    expect(res.status).toBe(403);
  });

  it('site admin still gets organizations', async () => {
    const res = await request(app)
      .get('/api/organizations-with-users')
      .set('Cookie', cookies.siteAdmin);

    expect(res.status).toBe(200);
    expect(res.body.some((o: { id: string }) => o.id === testOrg.id)).toBe(true);
  });
});
