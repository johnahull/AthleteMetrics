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

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { users, organizations, userOrganizations } from '@shared/schema';
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
