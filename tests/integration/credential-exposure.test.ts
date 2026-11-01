/**
 * Integration tests — credentials and invitation tokens must never leave the API
 *
 * Several org/user endpoints used to return whole `users` rows (password hash, MFA secret, backup
 * codes, parent email, OAuth ids) and whole `invitations` rows (bearer tokens) to ordinary org
 * members. These tests plant recognisable sentinel values and assert they never appear in any
 * response, and that invitation tokens are only returned to people who manage that invitation.
 *
 * Run:
 *   npx dotenv -e <env file> -- npx vitest run --config vitest.integration.config.ts tests/integration/credential-exposure.test.ts
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
import { userOrganizations, invitations, membershipRequests } from '@shared/schema/tables/membership';
import { eq, inArray, like } from 'drizzle-orm';
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

const TEST_PREFIX = 'credexp_';
const VALID_PASSWORD = 'TestPassword1!';
const id = crypto.randomBytes(4).toString('hex');

const SECRET = {
  mfa: `MFA-SENTINEL-${id}`,
  backup: `BACKUP-SENTINEL-${id}`,
  parentEmail: `parent-sentinel-${id}@example.com`,
  google: `google-sentinel-${id}`,
  birthDate: '2010-05-05',
};
const TOKEN = {
  adminA: `TOKEN-ADMIN-A-${id}`,
  coachA: `TOKEN-COACH-A-${id}`,
  athleteA: `TOKEN-ATHLETE-A-${id}`,
  adminB: `TOKEN-ADMIN-B-${id}`,
};

let app: Express;
let orgA: { id: string };
let orgB: { id: string };
let victimId: string;
const cookies: Record<'orgAdmin' | 'coach' | 'athlete' | 'siteAdmin' | 'mixed', string> = {
  orgAdmin: '', coach: '', athlete: '', siteAdmin: '', mixed: '',
};
const createdUserIds: string[] = [];

async function createUser(
  suffix: string,
  memberships: Array<{ orgId: string; role: 'org_admin' | 'coach' | 'athlete' }>,
  extra: Partial<typeof users.$inferInsert> = {},
) {
  const username = `${TEST_PREFIX}${suffix}_${id}`;
  const [user] = await db.insert(users).values({
    username,
    firstName: suffix,
    lastName: 'Tester',
    fullName: `${suffix} Tester`,
    emails: [`${username}@example.com`],
    password: await bcrypt.hash(VALID_PASSWORD, BCRYPT_SALT_ROUNDS),
    isEmailVerified: true,
    coppaStatus: 'not_applicable',
    ...extra,
  }).returning();
  createdUserIds.push(user.id);
  for (const m of memberships) {
    await db.insert(userOrganizations).values({ userId: user.id, organizationId: m.orgId, role: m.role });
  }
  return user;
}

async function loginAs(username: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password: VALID_PASSWORD });
  const set = res.headers['set-cookie'];
  return Array.isArray(set) ? set[0] : (set as unknown as string);
}

const get = (path: string, who: keyof typeof cookies) =>
  request(app).get(path).set('Cookie', cookies[who]);

/** Credentials and security state that must never appear in ANY response, not even to the account owner. */
function expectNoSecrets(body: unknown) {
  const text = JSON.stringify(body);
  expect(text).not.toContain(SECRET.mfa);
  expect(text).not.toContain(SECRET.backup);
  expect(text).not.toContain(SECRET.google);
  expect(text).not.toContain('$2b$'); // bcrypt hash
  for (const key of ['"password"', '"mfaSecret"', '"backupCodes"', '"googleId"', '"appleId"', '"lockedUntil"']) {
    expect(text).not.toContain(key);
  }
}

/** Secrets plus other people's private details (parent email): what a non-owner must never get. */
function expectNoCredentials(body: unknown) {
  expectNoSecrets(body);
  expect(JSON.stringify(body)).not.toContain(SECRET.parentEmail);
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set to run integration tests.');

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  [orgA] = await db.insert(organizations).values({ name: `CredExpOrgA-${id}`, orgType: 'club' }).returning();
  [orgB] = await db.insert(organizations).values({ name: `CredExpOrgB-${id}`, orgType: 'club' }).returning();

  // googleId is unique per user; the shared prefix is what the assertions search for
  const secretsFor = (who: string) => ({
    mfaSecret: SECRET.mfa,
    backupCodes: [SECRET.backup],
    parentEmail: SECRET.parentEmail,
    googleId: `${SECRET.google}-${who}`,
    birthDate: SECRET.birthDate,
    birthYear: 2010,
  });
  const orgAdmin = await createUser('orgadmin', [{ orgId: orgA.id, role: 'org_admin' }], secretsFor('orgadmin'));
  const coach = await createUser('coach', [{ orgId: orgA.id, role: 'coach' }], secretsFor('coach'));
  const athlete = await createUser('athlete', [{ orgId: orgA.id, role: 'athlete' }], secretsFor('athlete'));
  const victim = await createUser('victim', [{ orgId: orgA.id, role: 'athlete' }], secretsFor('victim'));
  victimId = victim.id;
  const siteAdmin = await createUser('siteadmin', [], { isSiteAdmin: true });
  // org_admin in A but only an athlete in B
  const mixed = await createUser('mixed', [
    { orgId: orgA.id, role: 'org_admin' },
    { orgId: orgB.id, role: 'athlete' },
  ], { birthDate: '1990-01-01' }); // athletes need a birth date to pass the profile-completion gate

  const requester = await createUser('requester', [], secretsFor('requester'));
  await db.insert(membershipRequests).values({ userId: requester.id, organizationId: orgA.id, status: 'pending' });

  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const inv = (email: string, organizationId: string, role: string, token: string) => ({
    email, organizationId, role, token, status: 'pending', expiresAt: future,
  });
  await db.insert(invitations).values([
    inv(`${TEST_PREFIX}adminA_${id}@example.com`, orgA.id, 'org_admin', TOKEN.adminA),
    inv(`${TEST_PREFIX}coachA_${id}@example.com`, orgA.id, 'coach', TOKEN.coachA),
    inv(`${TEST_PREFIX}athleteA_${id}@example.com`, orgA.id, 'athlete', TOKEN.athleteA),
    inv(`${TEST_PREFIX}adminB_${id}@example.com`, orgB.id, 'org_admin', TOKEN.adminB),
  ]);

  cookies.orgAdmin = await loginAs(orgAdmin.username);
  cookies.coach = await loginAs(coach.username);
  cookies.athlete = await loginAs(athlete.username);
  cookies.siteAdmin = await loginAs(siteAdmin.username);
  cookies.mixed = await loginAs(mixed.username);
});

afterAll(async () => {
  try {
    const orgIds = [orgA.id, orgB.id];
    await db.delete(membershipRequests).where(inArray(membershipRequests.organizationId, orgIds));
    await db.delete(invitations).where(inArray(invitations.organizationId, orgIds));
    await db.delete(userOrganizations).where(inArray(userOrganizations.organizationId, orgIds));
    await db.delete(users).where(like(users.username, `${TEST_PREFIX}%`));
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  } catch {
    // best-effort cleanup
  }
});

describe('GET /api/organizations/:id/profile', () => {
  it('an athlete gets no credentials, no tokens, and no invitations at all', async () => {
    const res = await get(`/api/organizations/${orgA.id}/profile`, 'athlete');
    expect(res.status).toBe(200);
    expectNoCredentials(res.body);
    const text = JSON.stringify(res.body);
    for (const token of Object.values(TOKEN)) expect(text).not.toContain(token);
    expect(res.body.invitations).toEqual([]);
  });

  it('an athlete does not see other members\' birth dates', async () => {
    const res = await get(`/api/organizations/${orgA.id}/profile`, 'athlete');
    expect(JSON.stringify(res.body)).not.toContain(SECRET.birthDate);
  });

  it('a coach gets no credentials and only athlete invitation tokens', async () => {
    const res = await get(`/api/organizations/${orgA.id}/profile`, 'coach');
    expect(res.status).toBe(200);
    expectNoCredentials(res.body);
    const text = JSON.stringify(res.body);
    expect(text).toContain(TOKEN.athleteA);
    expect(text).not.toContain(TOKEN.adminA);
    expect(text).not.toContain(TOKEN.coachA);
  });

  it('an org admin gets no credentials but keeps the tokens needed for "copy invite link"', async () => {
    const res = await get(`/api/organizations/${orgA.id}/profile`, 'orgAdmin');
    expect(res.status).toBe(200);
    expectNoCredentials(res.body);
    const text = JSON.stringify(res.body);
    expect(text).toContain(TOKEN.adminA);
    expect(text).toContain(TOKEN.coachA);
    expect(text).toContain(TOKEN.athleteA);
    expect(text).not.toContain(TOKEN.adminB); // other organization
    // the screen still has what it renders
    const member = [...res.body.coaches, ...res.body.athletes][0];
    expect(member.user.fullName).toEqual(expect.any(String));
    expect(member.user.emails).toEqual(expect.any(Array));
  });
});

describe('GET /api/organizations-with-users', () => {
  it('an org admin gets no credentials, keeps own-org tokens, and sees no other org\'s tokens', async () => {
    const res = await get('/api/organizations-with-users', 'orgAdmin');
    expect(res.status).toBe(200);
    expectNoCredentials(res.body);
    const text = JSON.stringify(res.body);
    expect(text).toContain(TOKEN.adminA);
    expect(text).not.toContain(TOKEN.adminB);
  });

  it('a site admin gets no credentials', async () => {
    const res = await get('/api/organizations-with-users', 'siteAdmin');
    expect(res.status).toBe(200);
    expectNoCredentials(res.body);
  });
});

describe('user endpoints', () => {
  it('GET /api/users (site admin) returns no credentials', async () => {
    const res = await get('/api/users', 'siteAdmin');
    expect(res.status).toBe(200);
    expectNoCredentials(res.body);
  });

  it('GET /api/users (org roster) returns no credentials to a coach or an athlete', async () => {
    for (const who of ['coach', 'athlete'] as const) {
      const plain = await get(`/api/users?organizationId=${orgA.id}`, who);
      expect(plain.status, who).toBe(200);
      expectNoCredentials(plain.body);
      const withTeams = await get(`/api/users?organizationId=${orgA.id}&includeTeamMemberships=true`, who);
      expect(withTeams.status, who).toBe(200);
      expectNoCredentials(withTeams.body);
    }
  });

  it('GET /api/users roster hides teammates\' contact and age details from an athlete but not from a coach', async () => {
    const asAthlete = await get(`/api/users?organizationId=${orgA.id}&includeTeamMemberships=true`, 'athlete');
    expect(asAthlete.status).toBe(200);
    const athleteText = JSON.stringify(asAthlete.body);
    expect(athleteText).not.toContain(SECRET.birthDate);
    expect(athleteText).not.toContain('"birthYear":2010'); // a birth year tells anyone a minor is underage
    expect(athleteText).not.toContain('@example.com'); // no teammate emails

    const asCoach = await get(`/api/users?organizationId=${orgA.id}&includeTeamMemberships=true`, 'coach');
    expect(asCoach.status).toBe(200);
    expect(JSON.stringify(asCoach.body)).toContain('@example.com');
    expect(JSON.stringify(asCoach.body)).toContain(SECRET.birthDate);
    expect(JSON.stringify(asCoach.body)).toContain('"birthYear":2010');
  });

  it('GET /api/site-admins returns no credentials', async () => {
    const res = await get('/api/site-admins', 'siteAdmin');
    expect(res.status).toBe(200);
    expectNoCredentials(res.body);
  });

  it('GET /api/users/:id/profile for an org mate returns no credentials and no birth date', async () => {
    const res = await get(`/api/users/${victimId}/profile`, 'athlete');
    expect(res.status).toBe(200);
    expectNoCredentials(res.body);
    expect(JSON.stringify(res.body)).not.toContain(SECRET.birthDate);
  });

  it('GET /api/users/:id/profile for yourself returns no secrets but still your own parent email', async () => {
    const me = await request(app).get('/api/auth/me').set('Cookie', cookies.athlete);
    const res = await get(`/api/users/${me.body.user?.id ?? me.body.id}/profile`, 'athlete');
    expect(res.status).toBe(200);
    expectNoSecrets(res.body);
    expect(res.body.parentEmail).toBe(SECRET.parentEmail);
  });

  it('PUT /api/profile returns no secrets but keeps the fields the profile form reads back', async () => {
    const res = await request(app).put('/api/profile').set('Cookie', cookies.athlete).send({ firstName: 'Athlete' });
    expect(res.status).toBe(200);
    expectNoSecrets(res.body);
    expect(res.body.parentEmail).toBe(SECRET.parentEmail); // profile.tsx resets the form from this
    expect(res.body.firstName).toBe('Athlete');
  });

  it('GET /api/users/:id/profile as a site admin returns no credentials', async () => {
    const res = await get(`/api/users/${victimId}/profile`, 'siteAdmin');
    expect(res.status).toBe(200);
    expectNoCredentials(res.body);
  });
});

describe('GET /api/membership-requests/organization/:id', () => {
  it('returns requesters without credentials to a coach and to an org admin', async () => {
    for (const who of ['coach', 'orgAdmin'] as const) {
      const res = await get(`/api/membership-requests/organization/${orgA.id}`, who);
      expect(res.status, who).toBe(200);
      expect(res.body.requests.length, who).toBeGreaterThan(0);
      expectNoCredentials(res.body);
      expect(res.body.requests[0].user.fullName).toEqual(expect.any(String));
    }
  });
});

describe('invitation lists', () => {
  it('GET /api/invitations/athletes is refused to an athlete', async () => {
    const res = await get('/api/invitations/athletes', 'athlete');
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(TOKEN.athleteA);
  });

  it('GET /api/invitations/athletes gives a coach only athlete invitations', async () => {
    const res = await get('/api/invitations/athletes', 'coach');
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).toContain(TOKEN.athleteA);
    expect(text).not.toContain(TOKEN.adminA);
    expectNoCredentials(res.body);
  });

  it('GET /api/invitations does not apply an org_admin role in org A to org B', async () => {
    const res = await get('/api/invitations', 'mixed');
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).toContain(TOKEN.adminA); // org admin in A: allowed
    expect(text).not.toContain(TOKEN.adminB); // only an athlete in B: not allowed
  });
});
