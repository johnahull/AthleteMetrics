/**
 * Integration tests — invitations for people who already have an account.
 *
 * Accepting an invitation for an existing account requires signing in as that account. Only an unclaimed
 * account (created by a coach, never signed into, in no other organization, not a site admin) can be claimed
 * by setting a username and password from the invitation page.
 *
 * Run:
 *   npx vitest run --config vitest.integration.config.ts tests/integration/invitation-existing-account.test.ts
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
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { INVITATION_PENDING_PASSWORD } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { and, eq, inArray } from 'drizzle-orm';
import { exactlyAge } from '../shared/age-helpers';

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
import { purgeTestRows } from '../helpers/purge-test-rows';

const PREFIX = 'invexist_';
const PASSWORD = 'ValidPass1!!';
const ADULT_DOB = '1990-01-01';

let app: Express;
let orgId: string;
let otherOrgId: string;
let orgAdmin: { id: string; username: string };
let coach: { id: string; username: string };

const id = () => crypto.randomBytes(5).toString('hex');
const hashToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

async function makeUser(opts: {
  password?: string | null;
  orgs?: Array<{ orgId: string; role: string }>;
  isSiteAdmin?: boolean;
  googleId?: string;
  birthDate?: string;
  email?: string;
} = {}) {
  const suffix = id();
  const password = opts.password === undefined
    ? await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS)
    : opts.password;
  const [user] = await db.insert(users).values({
    username: `${PREFIX}${suffix}`,
    firstName: 'Existing',
    lastName: 'Person',
    fullName: 'Existing Person',
    emails: [opts.email ?? `${PREFIX}${suffix}@example.com`],
    password,
    birthDate: opts.birthDate ?? ADULT_DOB,
    isSiteAdmin: opts.isSiteAdmin ?? false,
    isActive: true,
    isEmailVerified: true,
    coppaStatus: 'not_applicable',
    googleId: opts.googleId,
  }).returning();
  for (const m of opts.orgs ?? []) {
    await db.insert(userOrganizations).values({ userId: user.id, organizationId: m.orgId, role: m.role });
  }
  return user;
}

async function seedInvitation(params: { email: string; role?: string; playerId?: string }): Promise<string> {
  const raw = crypto.randomUUID();
  await db.insert(invitations).values({
    email: params.email,
    firstName: 'Invited',
    lastName: 'Person',
    organizationId: orgId,
    teamIds: [],
    role: params.role ?? 'athlete',
    invitedBy: orgAdmin.id,
    playerId: params.playerId,
    token: hashToken(raw),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  return raw;
}

function anonymousAcceptBody(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Invited',
    lastName: 'Person',
    username: `${PREFIX}new${id()}`,
    password: PASSWORD,
    legalAcceptedAt: new Date().toISOString(),
    birthDate: ADULT_DOB,
    ...overrides,
  };
}

async function signedIn(user: { username: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

function setsSessionCookie(res: request.Response): boolean {
  const header = res.headers['set-cookie'];
  const list = Array.isArray(header) ? header : header ? [header as string] : [];
  return list.some(c => c.startsWith('connect.sid'));
}

async function reload(userId: string) {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row;
}

async function membership(userId: string, organizationId: string) {
  const [row] = await db.select().from(userOrganizations)
    .where(and(eq(userOrganizations.userId, userId), eq(userOrganizations.organizationId, organizationId)));
  return row;
}

async function invitationRow(raw: string) {
  const [row] = await db.select().from(invitations).where(eq(invitations.token, hashToken(raw)));
  return row;
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const [org] = await db.insert(organizations).values({ name: `${PREFIX}org_${id()}` }).returning();
  const [other] = await db.insert(organizations).values({ name: `${PREFIX}other_${id()}` }).returning();
  orgId = org.id;
  otherOrgId = other.id;
  orgAdmin = await makeUser({ orgs: [{ orgId, role: 'org_admin' }] });
  coach = await makeUser({ orgs: [{ orgId, role: 'coach' }] });
});

afterAll(async () => {
  const orgIds = [orgId, otherOrgId].filter(Boolean);
  if (orgIds.length) {
    await db.delete(parentAthleteLinks).where(inArray(parentAthleteLinks.organizationId, orgIds));
  }
  await purgeTestRows({ usernameLike: [`${PREFIX}%`], orgIds });
});

describe('accepting an invitation for an existing account', () => {
  it('require sign-in to accept an invitation for an existing account (linked athlete with a password)', async () => {
    const existing = await makeUser({ orgs: [{ orgId, role: 'athlete' }] });
    const token = await seedInvitation({ email: existing.emails[0], playerId: existing.id });

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SIGN_IN_REQUIRED');
    expect(setsSessionCookie(res)).toBe(false);
    const after = await reload(existing.id);
    expect(after.username).toBe(existing.username);
    expect(after.password).toBe(existing.password);
    expect((await invitationRow(token)).isUsed).toBe(false);
  });

  it('require sign-in to accept an invitation for an existing account (matched by email, other organization)', async () => {
    const existing = await makeUser({ orgs: [{ orgId: otherOrgId, role: 'org_admin' }] });
    const token = await seedInvitation({ email: existing.emails[0], role: 'coach' });

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SIGN_IN_REQUIRED');
    expect(setsSessionCookie(res)).toBe(false);
    expect(await membership(existing.id, orgId)).toBeUndefined();
    expect((await invitationRow(token)).isUsed).toBe(false);
  });

  it('require sign-in for an account that signs in with Google only', async () => {
    const existing = await makeUser({ password: null, googleId: `g-${id()}` });
    const token = await seedInvitation({ email: existing.emails[0] });

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SIGN_IN_REQUIRED');
    expect((await reload(existing.id)).password).toBeNull();
    expect(await membership(existing.id, orgId)).toBeUndefined();
  });

  it('after signing in, the same person accepts and only the membership is added', async () => {
    const existing = await makeUser({ orgs: [{ orgId: otherOrgId, role: 'athlete' }] });
    const token = await seedInvitation({ email: existing.emails[0], role: 'coach' });
    const agent = await signedIn(existing);

    const res = await agent.post(`/api/invitations/${token}/accept`)
      .send({ legalAcceptedAt: new Date().toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((await membership(existing.id, orgId))?.role).toBe('coach');
    const after = await reload(existing.id);
    expect(after.username).toBe(existing.username);
    expect(after.password).toBe(existing.password);
    expect(after.emails).toEqual(existing.emails);
    expect(after.isSiteAdmin).toBe(false);
    expect((await invitationRow(token)).isUsed).toBe(true);
    const me = await agent.get('/api/auth/me');
    expect(me.body?.user?.id ?? me.body?.id).toBe(existing.id);
  });

  it('after a signed-in acceptance the session role and organization are recomputed as sign-in does', async () => {
    const existing = await makeUser(); // in no organization: signs in as an athlete without a primary organization
    const token = await seedInvitation({ email: existing.emails[0], role: 'coach' });
    const agent = await signedIn(existing);
    const before = await agent.get('/api/auth/me');
    expect(before.body.user.role).toBe('athlete');
    expect(before.body.user.primaryOrganizationId).toBeUndefined();

    const res = await agent.post(`/api/invitations/${token}/accept`)
      .send({ legalAcceptedAt: new Date().toISOString() });

    expect(res.status).toBe(200);
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.id).toBe(existing.id);
    expect(me.body.user.role).toBe('coach');
    expect(me.body.user.primaryOrganizationId).toBe(orgId);
  });

  it('a signed-in user cannot accept an invitation that belongs to a different account', async () => {
    const owner = await makeUser({ orgs: [{ orgId: otherOrgId, role: 'athlete' }] });
    const someoneElse = await makeUser({ orgs: [{ orgId: otherOrgId, role: 'athlete' }] });
    const token = await seedInvitation({ email: owner.emails[0] });
    const agent = await signedIn(someoneElse);

    const res = await agent.post(`/api/invitations/${token}/accept`)
      .send({ legalAcceptedAt: new Date().toISOString() });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WRONG_ACCOUNT');
    expect(await membership(owner.id, orgId)).toBeUndefined();
    expect(await membership(someoneElse.id, orgId)).toBeUndefined();
    expect((await invitationRow(token)).isUsed).toBe(false);
  });

  it('a site admin account cannot be signed into or changed through an invitation', async () => {
    const admin = await makeUser({ isSiteAdmin: true });
    const token = await seedInvitation({ email: admin.emails[0], role: 'org_admin' });

    const anon = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());
    expect(anon.status).toBe(403);
    expect(setsSessionCookie(anon)).toBe(false);

    const agent = await signedIn(admin);
    const own = await agent.post(`/api/invitations/${token}/accept`)
      .send({ legalAcceptedAt: new Date().toISOString() });
    expect(own.status).toBe(403);

    expect(await membership(admin.id, orgId)).toBeUndefined();
    expect((await reload(admin.id)).password).toBe(admin.password);
    expect((await invitationRow(token)).isUsed).toBe(false);
  });

  it('a site admin row with the pending placeholder cannot be claimed', async () => {
    const admin = await makeUser({ isSiteAdmin: true, password: INVITATION_PENDING_PASSWORD });
    const token = await seedInvitation({ email: admin.emails[0], playerId: admin.id });

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());

    expect(res.status).toBe(403);
    expect((await reload(admin.id)).password).toBe(INVITATION_PENDING_PASSWORD);
  });

  it('an unclaimed athlete of the inviting organization claims the account', async () => {
    const unclaimed = await makeUser({ password: INVITATION_PENDING_PASSWORD, orgs: [{ orgId, role: 'athlete' }] });
    const token = await seedInvitation({ email: unclaimed.emails[0], playerId: unclaimed.id });
    const body = anonymousAcceptBody();

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(body);

    expect(res.status).toBe(200);
    expect(setsSessionCookie(res)).toBe(true);
    const after = await reload(unclaimed.id);
    expect(after.username).toBe(body.username);
    expect(await bcrypt.compare(PASSWORD, after.password!)).toBe(true);
  });

  it('an unclaimed account matched by email (no linked athlete) is claimed with the chosen credentials', async () => {
    const unclaimed = await makeUser({ password: INVITATION_PENDING_PASSWORD, orgs: [{ orgId, role: 'athlete' }] });
    const token = await seedInvitation({ email: unclaimed.emails[0] });
    const body = anonymousAcceptBody();

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(body);

    expect(res.status).toBe(200);
    const after = await reload(unclaimed.id);
    expect(after.username).toBe(body.username);
    expect(await bcrypt.compare(PASSWORD, after.password!)).toBe(true);
  });

  it('an imported athlete (hashed pending placeholder) claims the account', async () => {
    const imported = await makeUser({
      password: await bcrypt.hash(INVITATION_PENDING_PASSWORD, 4),
      orgs: [{ orgId, role: 'athlete' }],
    });
    await db.update(users).set({ isActive: false }).where(eq(users.id, imported.id));
    const token = await seedInvitation({ email: imported.emails[0], playerId: imported.id });
    const body = anonymousAcceptBody();

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(body);

    expect(res.status).toBe(200);
    const after = await reload(imported.id);
    expect(after.username).toBe(body.username);
    expect(after.isActive).toBe(true);
  });

  it('claiming an account through an invitation never marks its email verified', async () => {
    for (const playerId of [true, false]) {
      const unclaimed = await makeUser({ password: INVITATION_PENDING_PASSWORD, orgs: [{ orgId, role: 'athlete' }] });
      await db.update(users).set({ isEmailVerified: false }).where(eq(users.id, unclaimed.id));
      const token = await seedInvitation({ email: unclaimed.emails[0], playerId: playerId ? unclaimed.id : undefined });

      const res = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());

      expect(res.status).toBe(200);
      expect((await reload(unclaimed.id)).isEmailVerified).toBe(false);
      expect(res.body.user?.emailVerified).not.toBe(true);
    }
  });

  it('a brand-new invitee is not marked email-verified by accepting', async () => {
    const email = `${PREFIX}fresh${id()}@example.com`;
    const token = await seedInvitation({ email });
    const res = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());
    expect(res.status).toBe(200);
    expect((await reload(res.body.user.id)).isEmailVerified).toBe(false);
  });

  it('an unclaimed account that belongs to another organization cannot be claimed', async () => {
    const unclaimed = await makeUser({
      password: INVITATION_PENDING_PASSWORD,
      orgs: [{ orgId, role: 'athlete' }, { orgId: otherOrgId, role: 'athlete' }],
    });
    const token = await seedInvitation({ email: unclaimed.emails[0], playerId: unclaimed.id });

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SIGN_IN_REQUIRED');
    const after = await reload(unclaimed.id);
    expect(after.password).toBe(INVITATION_PENDING_PASSWORD);
    expect(after.username).toBe(unclaimed.username);
  });

  it('a brand-new invitee creates an account and is signed in', async () => {
    const email = `${PREFIX}fresh${id()}@example.com`;
    const token = await seedInvitation({ email });
    const body = anonymousAcceptBody();

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(body);

    expect(res.status).toBe(200);
    expect(setsSessionCookie(res)).toBe(true);
  });

  it('parent invitation for an existing account requires sign-in, then links the signed-in parent', async () => {
    const child = await makeUser({ orgs: [{ orgId, role: 'athlete' }] });
    const parent = await makeUser({ orgs: [{ orgId: otherOrgId, role: 'athlete' }] });
    const token = await seedInvitation({ email: parent.emails[0], role: 'parent', playerId: child.id });

    const anon = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());
    expect(anon.status).toBe(401);
    expect(anon.body.code).toBe('SIGN_IN_REQUIRED');
    expect(setsSessionCookie(anon)).toBe(false);

    const agent = await signedIn(parent);
    const res = await agent.post(`/api/invitations/${token}/accept`)
      .send({ legalAcceptedAt: new Date().toISOString() });
    expect(res.status).toBe(200);
    const [link] = await db.select().from(parentAthleteLinks)
      .where(and(eq(parentAthleteLinks.athleteUserId, child.id), eq(parentAthleteLinks.parentUserId, parent.id)));
    expect(link).toBeDefined();
    expect((await reload(child.id)).password).toBe(child.password);
  });

  it('a signed-in acceptance requires the CSRF token', async () => {
    const existing = await makeUser();
    const token = await seedInvitation({ email: existing.emails[0] });
    const agent = await signedIn(existing);

    process.env.DISABLE_CSRF = 'false';
    try {
      const res = await agent.post(`/api/invitations/${token}/accept`)
        .send({ legalAcceptedAt: new Date().toISOString() });
      expect(res.status).toBe(403);
    } finally {
      process.env.DISABLE_CSRF = 'true';
    }
    expect(await membership(existing.id, orgId)).toBeUndefined();
  });

  it('the invitation details say whether sign-in is needed', async () => {
    const existing = await makeUser();
    const claimedToken = await seedInvitation({ email: existing.emails[0] });
    const freshToken = await seedInvitation({ email: `${PREFIX}fresh${id()}@example.com` });

    expect((await request(app).get(`/api/invitations/${claimedToken}`)).body.requiresSignIn).toBe(true);
    expect((await request(app).get(`/api/invitations/${freshToken}`)).body.requiresSignIn).toBe(false);
  });
});

describe('accepting: parent invitations, races, organizations, email case, deactivation', () => {
  it('a parent invitation sent to the child\'s own (shared family) email never claims the child\'s account', async () => {
    const child = await makeUser({ password: INVITATION_PENDING_PASSWORD, orgs: [{ orgId, role: 'athlete' }] });
    const token = await seedInvitation({ email: child.emails[0], role: 'parent', playerId: child.id });

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());

    expect(res.status).toBe(403);
    expect(setsSessionCookie(res)).toBe(false);
    const after = await reload(child.id);
    expect(after.password).toBe(INVITATION_PENDING_PASSWORD);
    expect(after.username).toBe(child.username);
    expect((await invitationRow(token)).isUsed).toBe(false);
  });

  it('a parent invitation sent to a sibling athlete\'s email never claims the sibling\'s account', async () => {
    const child = await makeUser({ orgs: [{ orgId, role: 'athlete' }] });
    const sibling = await makeUser({ password: INVITATION_PENDING_PASSWORD, orgs: [{ orgId, role: 'athlete' }] });
    const token = await seedInvitation({ email: sibling.emails[0], role: 'parent', playerId: child.id });

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());

    expect([401, 403]).toContain(res.status);
    expect(setsSessionCookie(res)).toBe(false);
    expect((await reload(sibling.id)).password).toBe(INVITATION_PENDING_PASSWORD);
    const links = await db.select().from(parentAthleteLinks).where(eq(parentAthleteLinks.athleteUserId, child.id));
    expect(links).toHaveLength(0);
  });

  it('a signed-in teen cannot accept a parent invitation, for themself or a sibling', async () => {
    const teen = await makeUser({ birthDate: exactlyAge(15), orgs: [{ orgId, role: 'athlete' }] });
    const sibling = await makeUser({ orgs: [{ orgId, role: 'athlete' }] });
    const forSelf = await seedInvitation({ email: teen.emails[0], role: 'parent', playerId: teen.id });
    const forSibling = await seedInvitation({ email: teen.emails[0], role: 'parent', playerId: sibling.id });
    const agent = await signedIn(teen);

    const self = await agent.post(`/api/invitations/${forSelf}/accept`).send({ legalAcceptedAt: new Date().toISOString() });
    const sib = await agent.post(`/api/invitations/${forSibling}/accept`).send({ legalAcceptedAt: new Date().toISOString() });

    expect(self.status).toBe(403);
    expect(sib.status).toBe(400);
    const links = await db.select().from(parentAthleteLinks)
      .where(inArray(parentAthleteLinks.athleteUserId, [teen.id, sibling.id]));
    expect(links).toHaveLength(0);
  });

  it('two invitations for one unclaimed athlete accepted at the same time: only one claims the account', async () => {
    const unclaimed = await makeUser({ password: INVITATION_PENDING_PASSWORD, orgs: [{ orgId, role: 'athlete' }] });
    const first = await seedInvitation({ email: unclaimed.emails[0], playerId: unclaimed.id });
    const second = await seedInvitation({ email: `${PREFIX}alt${id()}@example.com`, playerId: unclaimed.id });
    const a = anonymousAcceptBody();
    const b = anonymousAcceptBody();

    const results = await Promise.all([
      request(app).post(`/api/invitations/${first}/accept`).send(a),
      request(app).post(`/api/invitations/${second}/accept`).send(b),
    ]);

    expect(results.map(r => r.status).sort()).toEqual([200, 401]);
    expect(results.filter(setsSessionCookie)).toHaveLength(1);
    const winner = results[0].status === 200 ? a : b;
    const after = await reload(unclaimed.id);
    expect(after.username).toBe(winner.username);
    expect(await bcrypt.compare(PASSWORD, after.password!)).toBe(true);
  });

  it('an unclaimed account in no organization cannot be claimed by an organization\'s invitation', async () => {
    const orphan = await makeUser({ password: INVITATION_PENDING_PASSWORD });
    const token = await seedInvitation({ email: orphan.emails[0], playerId: orphan.id });

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());

    expect(res.status).toBe(401);
    expect((await reload(orphan.id)).password).toBe(INVITATION_PENDING_PASSWORD);
  });

  it('matches an existing account whatever the case of the email', async () => {
    const existing = await makeUser({ email: `${PREFIX}Mixed.${id()}@Example.com`, orgs: [{ orgId: otherOrgId, role: 'athlete' }] });
    const token = await seedInvitation({ email: existing.emails[0].toLowerCase() });

    expect((await request(app).get(`/api/invitations/${token}`)).body.requiresSignIn).toBe(true);
    const res = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SIGN_IN_REQUIRED');
    const dupes = await db.select().from(users).where(eq(users.firstName, 'Invited'));
    expect(dupes.filter(u => u.emails.some(e => e.toLowerCase() === existing.emails[0].toLowerCase()))).toHaveLength(0);
  });

  it('a deactivated account cannot accept, even from a session that is still open', async () => {
    const existing = await makeUser({ orgs: [{ orgId: otherOrgId, role: 'athlete' }] });
    const token = await seedInvitation({ email: existing.emails[0] });
    const agent = await signedIn(existing);
    await db.update(users).set({ isActive: false }).where(eq(users.id, existing.id));

    const res = await agent.post(`/api/invitations/${token}/accept`).send({ legalAcceptedAt: new Date().toISOString() });

    expect(res.status).toBe(403);
    expect(await membership(existing.id, orgId)).toBeUndefined();
    expect((await reload(existing.id)).isActive).toBe(false);
  });

  it('a signed-in account that needs parental consent after accepting loses every session', async () => {
    const existing = await makeUser({ orgs: [{ orgId: otherOrgId, role: 'athlete' }] });
    await db.update(users).set({ birthDate: null }).where(eq(users.id, existing.id));
    const token = await seedInvitation({ email: existing.emails[0] });
    const agent = await signedIn(existing);
    const other = await signedIn(existing);

    const res = await agent.post(`/api/invitations/${token}/accept`).send({
      legalAcceptedAt: new Date().toISOString(),
      birthDate: exactlyAge(10),
      parentEmail: `${PREFIX}parent${id()}@example.com`,
    });

    expect(res.status).toBe(200);
    expect(res.body.requiresParentalConsent).toBe(true);
    expect((await reload(existing.id)).coppaStatus).toBe('pending_consent');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect((await other.get('/api/auth/me')).status).toBe(401);
  });

  it('a signed-in member of the organization keeps their role: the invitation is refused', async () => {
    const member = await makeUser({ orgs: [{ orgId, role: 'coach' }] });
    const token = await seedInvitation({ email: member.emails[0], role: 'athlete' });
    const agent = await signedIn(member);

    const res = await agent.post(`/api/invitations/${token}/accept`).send({ legalAcceptedAt: new Date().toISOString() });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_MEMBER');
    expect((await membership(member.id, orgId))?.role).toBe('coach');
    expect((await invitationRow(token)).isUsed).toBe(false);
  });

  it('an unclaimed athlete who is a member of the organization claims the account and stays an athlete', async () => {
    const unclaimed = await makeUser({ password: INVITATION_PENDING_PASSWORD, orgs: [{ orgId, role: 'athlete' }] });
    const token = await seedInvitation({ email: unclaimed.emails[0], playerId: unclaimed.id });

    const res = await request(app).post(`/api/invitations/${token}/accept`).send(anonymousAcceptBody());

    expect(res.status).toBe(200);
    expect((await membership(unclaimed.id, orgId))?.role).toBe('athlete');
  });

  it('a parent invitation for a member of the organization links the child and keeps the member\'s role', async () => {
    const child = await makeUser({ orgs: [{ orgId, role: 'athlete' }] });
    const coachParent = await makeUser({ orgs: [{ orgId, role: 'coach' }] });
    const token = await seedInvitation({ email: coachParent.emails[0], role: 'parent', playerId: child.id });
    const agent = await signedIn(coachParent);

    const res = await agent.post(`/api/invitations/${token}/accept`).send({ legalAcceptedAt: new Date().toISOString() });

    expect(res.status).toBe(200);
    expect((await membership(coachParent.id, orgId))?.role).toBe('coach');
    const [link] = await db.select().from(parentAthleteLinks)
      .where(and(eq(parentAthleteLinks.athleteUserId, child.id), eq(parentAthleteLinks.parentUserId, coachParent.id)));
    expect(link).toBeDefined();
  });

  it('an account linked as a child to a parent cannot accept a parent invitation', async () => {
    const childAccount = await makeUser({ orgs: [{ orgId: otherOrgId, role: 'athlete' }] });
    const sibling = await makeUser({ orgs: [{ orgId, role: 'athlete' }] });
    await db.insert(parentAthleteLinks).values({
      parentEmail: `${PREFIX}guardian${id()}@example.com`,
      athleteUserId: childAccount.id,
      organizationId: otherOrgId,
      isActive: true,
    });
    const token = await seedInvitation({ email: childAccount.emails[0], role: 'parent', playerId: sibling.id });
    const agent = await signedIn(childAccount);

    const res = await agent.post(`/api/invitations/${token}/accept`).send({ legalAcceptedAt: new Date().toISOString() });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_NOT_ELIGIBLE');
    expect(await membership(childAccount.id, orgId)).toBeUndefined();
    const links = await db.select().from(parentAthleteLinks).where(eq(parentAthleteLinks.athleteUserId, sibling.id));
    expect(links).toHaveLength(0);
  });
});

describe('creating an invitation', () => {
  it('rejects an athleteId that is not a member of the organization', async () => {
    const outsider = await makeUser({ orgs: [{ orgId: otherOrgId, role: 'athlete' }] });
    const agent = await signedIn(coach);

    const res = await agent.post('/api/invitations')
      .send({ athleteId: outsider.id, role: 'athlete', organizationId: orgId });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not belong/i);
    const rows = await db.select().from(invitations).where(eq(invitations.playerId, outsider.id));
    expect(rows).toHaveLength(0);
  });

  it('does not return a link for a member athlete who already has an account, and emails it', async () => {
    const athlete = await makeUser({ orgs: [{ orgId, role: 'athlete' }] });
    const agent = await signedIn(coach);
    emailMocks.sendInvitation.mockClear();

    const res = await agent.post('/api/invitations')
      .send({ athleteId: athlete.id, role: 'athlete', organizationId: orgId });

    expect(res.status).toBe(201);
    expect(res.body.inviteLinks ?? []).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toMatch(/token=/);
    expect(emailMocks.sendInvitation).toHaveBeenCalledTimes(1);
  });

  it('returns a link for a member athlete whose account is unclaimed', async () => {
    const athlete = await makeUser({ password: INVITATION_PENDING_PASSWORD, orgs: [{ orgId, role: 'athlete' }] });
    const agent = await signedIn(coach);

    const res = await agent.post('/api/invitations')
      .send({ athleteId: athlete.id, role: 'athlete', organizationId: orgId });

    expect(res.status).toBe(201);
    expect(res.body.inviteLinks).toHaveLength(1);
  });

  it('does not return a link when the email belongs to an existing account, and emails it', async () => {
    const existing = await makeUser({ orgs: [{ orgId: otherOrgId, role: 'org_admin' }] });
    const agent = await signedIn(orgAdmin);
    emailMocks.sendInvitation.mockClear();

    const res = await agent.post('/api/invitations')
      .send({ email: existing.emails[0], role: 'coach', organizationId: orgId });

    expect(res.status).toBe(201);
    expect(res.body.inviteLink).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/token=/);
    expect(emailMocks.sendInvitation).toHaveBeenCalledTimes(1);
  });

  it('does not return a link for a parent invitation to an existing account', async () => {
    const child = await makeUser({ orgs: [{ orgId, role: 'athlete' }] });
    const parent = await makeUser();
    const agent = await signedIn(coach);

    const res = await agent.post('/api/invitations')
      .send({ email: parent.emails[0], role: 'parent', organizationId: orgId, athleteId: child.id });

    expect(res.status).toBe(201);
    expect(res.body.inviteLink).toBeUndefined();
  });

  it('returns a link for a new email address', async () => {
    const agent = await signedIn(orgAdmin);

    const res = await agent.post('/api/invitations')
      .send({ email: `${PREFIX}fresh${id()}@example.com`, role: 'coach', organizationId: orgId });

    expect(res.status).toBe(201);
    expect(res.body.inviteLink).toMatch(/token=/);
  });

  it('listing invitations never returns a usable token', async () => {
    const agent = await signedIn(orgAdmin);
    const created = await agent.post('/api/invitations')
      .send({ email: `${PREFIX}fresh${id()}@example.com`, role: 'coach', organizationId: orgId });
    const raw = new URL(created.body.inviteLink).searchParams.get('token')!;

    const list = await agent.get('/api/invitations');
    const row = list.body.find((i: { id: string }) => i.id === created.body.id);
    expect(row).toBeDefined();
    expect(JSON.stringify(list.body)).not.toContain(raw);
  });
});
