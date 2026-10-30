/**
 * Integration tests: POST /api/profile/complete (athlete birthdate + email completion).
 *
 * Run (CI shape DB: db:push + seed-default-metrics):
 *   DATABASE_URL=... npx vitest run --config vitest.integration.config.ts tests/integration/profile-completion.test.ts
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { users, organizations, userOrganizations, emailVerificationTokens } from '@shared/schema';
import { coppaService } from '../../packages/api/services/coppa-service';
import { storage } from '../../packages/api/storage';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'ValidPass1!';
const tag = randomUUID().slice(0, 8);
let app: Express;
let orgId: string;
let hash: string;
const userIds: string[] = [];

async function makeUser(
  name: string,
  opts: { birthDate?: string | null; emails?: string[]; role?: 'athlete' | 'coach' } = {},
) {
  const username = `pc-${tag}-${name}`;
  const emails = opts.emails ?? [`${username}@example.com`];
  const [u] = await db.insert(users).values({
    username,
    firstName: 'Pat',
    lastName: name,
    fullName: `Pat ${name}`,
    emails,
    password: hash,
    isSiteAdmin: false,
    isEmailVerified: true,
    birthDate: opts.birthDate ?? null,
  }).returning({ id: users.id });
  userIds.push(u.id);
  await db.insert(userOrganizations).values({ userId: u.id, organizationId: orgId, role: opts.role ?? 'athlete' });
  return { id: u.id, username, emails };
}

async function login(username: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const row = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set to run integration tests.');
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
  hash = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
  const [org] = await db.insert(organizations).values({ name: `pc-org-${tag}` }).returning({ id: organizations.id });
  orgId = org.id;
});

afterAll(async () => {
  if (userIds.length) {
    await db.delete(parentAthleteLinks).where(inArray(parentAthleteLinks.athleteUserId, userIds)).catch(() => {});
    await db.delete(emailVerificationTokens).where(inArray(emailVerificationTokens.userId, userIds)).catch(() => {});
    await db.delete(userOrganizations).where(inArray(userOrganizations.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

const adultDob = '1995-04-12';
const yearsAgo = (n: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
};

describe('POST /api/profile/complete', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/profile/complete').send({ birthDate: adultDob });
    expect(res.status).toBe(401);
  });

  it('adult supplies DOB: saved, second submit is 409', async () => {
    const u = await makeUser('adult');
    const agent = await login(u.username);
    const res = await agent.post('/api/profile/complete').send({ birthDate: adultDob });
    expect(res.status).toBe(200);
    expect(String((await row(u.id)).birthDate)).toBe(adultDob);

    const again = await agent.post('/api/profile/complete').send({ birthDate: '1990-01-01' });
    expect(again.status).toBe(409);
    expect(String((await row(u.id)).birthDate)).toBe(adultDob);
  });

  it('400 when a missing field is not supplied', async () => {
    const u = await makeUser('nofield');
    const agent = await login(u.username);
    expect((await agent.post('/api/profile/complete').send({})).status).toBe(400);
  });

  it('400 on future and malformed dates', async () => {
    const u = await makeUser('baddate');
    const agent = await login(u.username);
    const future = new Date(Date.now() + 86400000 * 400).toISOString().slice(0, 10);
    expect((await agent.post('/api/profile/complete').send({ birthDate: future })).status).toBe(400);
    expect((await agent.post('/api/profile/complete').send({ birthDate: '2001-02-31x' })).status).toBe(400);
    expect((await row(u.id)).birthDate).toBeNull();
  });

  it('409 when nothing is missing (coach)', async () => {
    const u = await makeUser('coach', { role: 'coach' });
    const agent = await login(u.username);
    expect((await agent.post('/api/profile/complete').send({ birthDate: adultDob })).status).toBe(409);
    expect((await row(u.id)).birthDate).toBeNull();
  });

  it('ignores fields that are not missing', async () => {
    const u = await makeUser('ignore', { birthDate: adultDob });
    const agent = await login(u.username);
    // email is fine and DOB is present, so nothing missing -> 409 and no overwrite
    const res = await agent.post('/api/profile/complete').send({ birthDate: '1980-01-01', email: 'x@example.com' });
    expect(res.status).toBe(409);
    const r = await row(u.id);
    expect(String(r.birthDate)).toBe(adultDob);
    expect(r.emails).toEqual(u.emails);
  });

  describe('under 13 failure handling', () => {
    afterEach(() => vi.restoreAllMocks());

    it('initiateConsent failure: rolls back, 500, session kept so the child can retry', async () => {
      const u = await makeUser('u13fail', { emails: [`u13fail-${tag}@temp.local`] });
      const agent = await login(u.username);
      vi.spyOn(coppaService, 'initiateConsent').mockResolvedValueOnce({ success: false, error: 'x' } as any);
      const res = await agent.post('/api/profile/complete')
        .send({ birthDate: yearsAgo(10), email: `u13fail-${tag}@example.com`, parentEmail: `p-${tag}@example.com` });
      expect(res.status).toBe(500);
      const r = await row(u.id);
      expect(r.birthDate).toBeNull();
      expect(r.coppaStatus).toBe('not_applicable');
      expect(r.parentEmail).toBeNull();
      expect(r.emails).toEqual([`u13fail-${tag}@temp.local`]);
      expect((await agent.get('/api/auth/me')).status).toBe(200);
    });

    it('an audit-log failure after commit does not 500 the child', async () => {
      const u = await makeUser('u13audit');
      const agent = await login(u.username);
      vi.spyOn(storage, 'createAuditLog').mockRejectedValue(new Error('audit down'));
      const res = await agent.post('/api/profile/complete').send({ birthDate: yearsAgo(10), parentEmail: `pa-${tag}@example.com` });
      expect(res.status).toBe(200);
      expect(res.body.requiresParentalConsent).toBe(true);
    });

    it.each([[false], [undefined]])('consent email not sent (emailSent=%s) -> "could not send" message', async (emailSent) => {
      const u = await makeUser(`u13mail-${String(emailSent)}`);
      const agent = await login(u.username);
      vi.spyOn(coppaService, 'initiateConsent').mockResolvedValueOnce({ success: true, consentId: 'c', emailSent } as any);
      const res = await agent.post('/api/profile/complete').send({ birthDate: yearsAgo(10), parentEmail: `pm-${tag}@example.com` });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/could not send/i);
    });

    it('a new email entered with an under-13 DOB still gets a verification token', async () => {
      const u = await makeUser('u13tok', { emails: [`u13tok-${tag}@temp.local`] });
      const agent = await login(u.username);
      const res = await agent.post('/api/profile/complete')
        .send({ birthDate: yearsAgo(10), email: `u13tok-${tag}@example.com`, parentEmail: `pt-${tag}@example.com` });
      expect(res.status).toBe(200);
      const toks = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, u.id));
      expect(toks.length).toBeGreaterThan(0);
    });
  });

  it('400 when the parent email is any of the athlete\'s own emails', async () => {
    const u = await makeUser('ownparent', { emails: [`own1-${tag}@example.com`, `own2-${tag}@example.com`] });
    const agent = await login(u.username);
    const res = await agent.post('/api/profile/complete')
      .send({ birthDate: yearsAgo(10), parentEmail: `OWN2-${tag}@example.com` });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('parentEmail');
    expect((await row(u.id)).birthDate).toBeNull();
  });

  it('409 when the email matches a stored mixed-case email of another account', async () => {
    const other = await makeUser('mixed', { emails: [`Mixed-${tag}@Example.com`] });
    const u = await makeUser('mixedph', { birthDate: adultDob, emails: [`mixedph-${tag}@temp.local`] });
    const agent = await login(u.username);
    const res = await agent.post('/api/profile/complete').send({ email: `mixed-${tag}@example.com` });
    expect(res.status).toBe(409);
    expect(other.id).toBeTruthy();
  });

  describe('under 13', () => {
    it('400 without a parent email, or with the athlete email', async () => {
      const u = await makeUser('u13a');
      const agent = await login(u.username);
      const dob = yearsAgo(10);
      expect((await agent.post('/api/profile/complete').send({ birthDate: dob })).status).toBe(400);
      expect((await agent.post('/api/profile/complete').send({ birthDate: dob, parentEmail: u.emails[0] })).status).toBe(400);
      expect((await row(u.id)).birthDate).toBeNull();
    });

    it('sets pending_consent, deletes ALL sessions, other session cannot change the DOB', async () => {
      const u = await makeUser('u13b');
      const a = await login(u.username);
      const b = await login(u.username);
      const dob = yearsAgo(10);
      const res = await a
        .post('/api/profile/complete')
        .send({ birthDate: dob, parentEmail: `Parent-${tag}@Example.com` });
      expect(res.status).toBe(200);
      expect(res.body.requiresParentalConsent).toBe(true);

      const r = await row(u.id);
      expect(r.coppaStatus).toBe('pending_consent');
      expect(r.isMinor).toBe(true);
      expect(r.parentEmail).toBe(`parent-${tag}@example.com`);
      expect(String(r.birthDate)).toBe(dob);

      expect((await a.get('/api/auth/me')).status).toBe(401);
      expect((await b.get('/api/auth/me')).status).toBe(401);
      const retry = await b.post('/api/profile/complete').send({ birthDate: adultDob });
      expect(retry.status).toBe(401);
      expect(String((await row(u.id)).birthDate)).toBe(dob);
    });
  });

  it('13-17 with a parent email: one active link row, user keeps session', async () => {
    const u = await makeUser('teen');
    const agent = await login(u.username);
    const res = await agent
      .post('/api/profile/complete')
      .send({ birthDate: yearsAgo(15), parentEmail: `teenparent-${tag}@example.com` });
    expect(res.status).toBe(200);
    expect(res.body.requiresParentalConsent).toBeFalsy();
    const links = await db.select().from(parentAthleteLinks).where(eq(parentAthleteLinks.athleteUserId, u.id));
    expect(links).toHaveLength(1);
    expect(links[0].isActive).toBe(true);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  describe('email', () => {
    it('replaces placeholder, lowercases, unverifies and refreshes the session email', async () => {
      const u = await makeUser('ph', { birthDate: adultDob, emails: [`ph-${tag}@temp.local`] });
      const agent = await login(u.username);
      const res = await agent.post('/api/profile/complete').send({ email: `New-${tag}@Example.com` });
      expect(res.status).toBe(200);
      const r = await row(u.id);
      expect(r.emails).toEqual([`new-${tag}@example.com`]);
      expect(r.isEmailVerified).toBe(false);
      const me = await agent.get('/api/auth/me');
      expect(me.body.user.email).toBe(`new-${tag}@example.com`);
    });

    it('409 when the email belongs to another account', async () => {
      const other = await makeUser('taken');
      const u = await makeUser('ph2', { birthDate: adultDob, emails: [`ph2-${tag}@temp.local`] });
      const agent = await login(u.username);
      const res = await agent.post('/api/profile/complete').send({ email: other.emails[0] });
      expect(res.status).toBe(409);
      expect((await row(u.id)).emails).toEqual([`ph2-${tag}@temp.local`]);
    });

    it('both missing: needs both', async () => {
      const u = await makeUser('both', { emails: [`both-${tag}@temp.local`] });
      const agent = await login(u.username);
      expect((await agent.post('/api/profile/complete').send({ birthDate: adultDob })).status).toBe(400);
      const ok = await agent.post('/api/profile/complete').send({ birthDate: adultDob, email: `both-${tag}@example.com` });
      expect(ok.status).toBe(200);
    });
  });
});

describe('profile completion gate', () => {
  const API = '/api/teams';

  it('blocks a no-DOB athlete on normal APIs with profile_incomplete', async () => {
    const u = await makeUser('g-nodob');
    const agent = await login(u.username);
    const res = await agent.get(API);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('profile_incomplete');
    expect(res.body.missingFields).toEqual(['birthDate']);
  });

  it('/auth/me stays reachable and reports missingProfileFields', async () => {
    const u = await makeUser('g-me');
    const agent = await login(u.username);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.missingProfileFields).toEqual(['birthDate']);

    const ok = await makeUser('g-me-ok', { birthDate: adultDob });
    const okMe = await (await login(ok.username)).get('/api/auth/me');
    expect(okMe.body.user.missingProfileFields).toEqual([]);
  });

  it('/auth/me of a consent-blocked session is 403 with the coppa code', async () => {
    const u = await makeUser('g-me-coppa', { birthDate: yearsAgo(10) });
    const agent = await login(u.username);
    await db.update(users).set({ coppaStatus: 'pending_consent' }).where(eq(users.id, u.id));
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('coppa_pending_consent');
  });

  it('does not gate a coach without DOB', async () => {
    const u = await makeUser('g-coach', { role: 'coach' });
    const agent = await login(u.username);
    const res = await agent.get(API);
    expect(res.body?.code).not.toBe('profile_incomplete');
    expect((await agent.get('/api/auth/me')).body.user.missingProfileFields).toEqual([]);
  });

  it('gates coach-in-A / athlete-in-B even when session role is coach', async () => {
    const [orgB] = await db.insert(organizations).values({ name: `zz-pc-org-${tag}` }).returning({ id: organizations.id });
    const u = await makeUser('g-dual', { role: 'coach' }); // coach in pc-org-*, sorts first
    await db.insert(userOrganizations).values({ userId: u.id, organizationId: orgB.id, role: 'athlete' });
    try {
      const agent = await login(u.username);
      const me = await agent.get('/api/auth/me');
      expect(me.body.user.role).toBe('coach');
      expect(me.body.user.missingProfileFields).toEqual(['birthDate']);
      const res = await agent.get(API);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('profile_incomplete');
    } finally {
      await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgB.id));
      await db.delete(organizations).where(eq(organizations.id, orgB.id));
    }
  });

  it('does not gate an impersonated session', async () => {
    const target = await makeUser('g-imp');
    const [admin] = await db.insert(users).values({
      username: `pc-${tag}-siteadmin`, firstName: 'Site', lastName: 'Admin', fullName: 'Site Admin',
      emails: [`pc-${tag}-siteadmin@example.com`], password: hash, isSiteAdmin: true, isEmailVerified: true,
    }).returning({ id: users.id });
    userIds.push(admin.id);
    const agent = await login(`pc-${tag}-siteadmin`);
    const imp = await agent.post(`/api/admin/impersonate/${target.id}`);
    expect(imp.status).toBe(200);
    const res = await agent.get(API);
    expect(res.body?.code).not.toBe('profile_incomplete');
  });

  it('gated session can still log in, log out, read public reports and check email', async () => {
    const u = await makeUser('g-allow');
    const agent = await login(u.username);
    const pub = await agent.get('/api/public/reports/does-not-exist-token');
    expect(pub.body?.code).not.toBe('profile_incomplete');
    const check = await agent.get('/api/auth/check-email').query({ email: `free-${tag}@example.com` });
    expect(check.body?.code).not.toBe('profile_incomplete');
    expect(check.status).toBe(200);
    const again = await agent.post('/api/auth/login').send({ username: u.username, password: PASSWORD });
    expect(again.status).toBe(200);
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
  });

  it('completion unblocks the user', async () => {
    const u = await makeUser('g-unblock');
    const agent = await login(u.username);
    expect((await agent.get(API)).body.code).toBe('profile_incomplete');
    expect((await agent.post('/api/profile/complete').send({ birthDate: adultDob })).status).toBe(200);
    const after = await agent.get(API);
    expect(after.body?.code).not.toBe('profile_incomplete');
    expect((await agent.get('/api/auth/me')).body.user.missingProfileFields).toEqual([]);
  });

  it('re-checks while incomplete: an outside fix unblocks without a new login', async () => {
    const u = await makeUser('g-fix');
    const agent = await login(u.username);
    expect((await agent.get(API)).body.code).toBe('profile_incomplete');
    await db.update(users).set({ birthDate: adultDob }).where(eq(users.id, u.id));
    expect((await agent.get(API)).body?.code).not.toBe('profile_incomplete');
  });

  it.each(['pending_consent', 'needs_parent_email', 'consent_revoked'] as const)(
    'a live session of a %s user is blocked by the gate',
    async (status) => {
      const u = await makeUser(`g-${status}`, { birthDate: yearsAgo(10) });
      const agent = await login(u.username); // e.g. a session obtained before the status changed / via OAuth
      await db.update(users).set({ coppaStatus: status }).where(eq(users.id, u.id));
      const res = await agent.get(API);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(`coppa_${status}`);
    },
  );
});
