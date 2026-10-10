/**
 * Account lockout is keyed on the user ID and the attempt counter is atomic.
 *
 * Regression tests for two flaws in the old email-keyed lockout:
 *  - accounts without an email were never locked, and accounts sharing an email locked the wrong sibling;
 *  - the counter was read, incremented in JS and written back, and the lock was checked before bcrypt, so
 *    concurrent wrong-password requests all saw "not locked" and each got a guess.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import bcrypt from 'bcrypt';
import request from 'supertest';
import express from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { AuthService } from '../../packages/api/services/auth-service';
import { users } from '@shared/schema';
import type { User } from '@shared/schema';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'TestPass123!';
const MAX = 5;
const PREFIX = 'lockuid';

describe('Login lockout keyed on user id with an atomic counter', () => {
  const authService = new AuthService();
  let app: express.Express;
  let seq = 0;

  async function makeUser(opts: { emails?: string[] } = {}): Promise<User> {
    const uniq = `${Date.now()}${seq++}`;
    const user = await storage.createUser({
      username: `${PREFIX}${uniq}`,
      password: PASSWORD,
      emails: [`${PREFIX}${uniq}@test.com`],
      firstName: 'Lock',
      lastName: 'Test',
    });
    if (opts.emails) {
      // createUser substitutes a placeholder address when no email is given; set the real value directly
      await db.update(users).set({ emails: opts.emails }).where(eq(users.id, user.id));
    }
    return (await storage.getUser(user.id))!;
  }

  const wrong = (u: User) => authService.login({ username: u.username, password: 'wrong-password' });
  const right = (u: User) => authService.login({ username: u.username, password: PASSWORD });
  const state = async (u: User) => (await storage.getUser(u.id))!;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    await registerRoutes(app);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await purgeTestRows({ usernameLike: [`${PREFIX}%`] });
  });

  it('locks a user with NO emails after 5 wrong passwords and rejects the correct password with 423', async () => {
    const user = await makeUser({ emails: [] });
    for (let i = 0; i < MAX; i++) {
      const r = await wrong(user);
      expect(r.accountLocked).toBeUndefined();
      expect(r.error).toBe('Invalid credentials');
    }
    const locked = await right(user);
    expect(locked.success).toBe(false);
    expect(locked.accountLocked).toBe(true);
    expect(locked.lockUntil).toBeInstanceOf(Date);

    const res = await request(app).post('/api/auth/login').send({ username: user.username, password: PASSWORD });
    expect(res.status).toBe(423);
    expect(res.body.accountLocked).toBe(true);
  });

  it('still locks a user that has an email', async () => {
    const user = await makeUser();
    for (let i = 0; i < MAX; i++) await wrong(user);
    expect((await right(user)).accountLocked).toBe(true);
  });

  it('locks the attacked account only when two users share an email', async () => {
    const shared = `${PREFIX}shared${Date.now()}@test.com`;
    const first = await makeUser({ emails: [shared] });
    const second = await makeUser({ emails: [shared] });
    for (let i = 0; i < MAX; i++) await wrong(second);

    expect((await right(second)).accountLocked).toBe(true);
    const ok = await right(first);
    expect(ok.success).toBe(true);
    expect((await state(first)).loginAttempts).toBe(0);
  });

  it('allows at most 5 password comparisons for 20 concurrent wrong-password logins and ends locked', async () => {
    const user = await makeUser({ emails: [] });
    const compare = vi.spyOn(bcrypt, 'compare');

    const results = await Promise.all(Array.from({ length: 20 }, () => wrong(user)));

    expect(compare.mock.calls.length).toBe(MAX);
    expect(results.filter((r) => r.accountLocked === true)).toHaveLength(20 - MAX);
    expect(results.filter((r) => r.error === 'Invalid credentials')).toHaveLength(MAX);
    const after = await state(user);
    expect(after.lockedUntil).not.toBeNull();
    expect(after.loginAttempts).toBe(MAX);
  });

  it('starts a fresh count once the lock has expired', async () => {
    const user = await makeUser();
    for (let i = 0; i < MAX; i++) await wrong(user);
    await db.update(users).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(users.id, user.id));

    const r = await wrong(user);
    expect(r.accountLocked).toBeUndefined();
    const after = await state(user);
    expect(after.loginAttempts).toBe(1);
    expect(after.lockedUntil).toBeNull();
    expect((await right(user)).success).toBe(true);
  });

  it('resets the counter on a successful login', async () => {
    const user = await makeUser();
    for (let i = 0; i < 3; i++) await wrong(user);
    expect((await state(user)).loginAttempts).toBe(3);
    expect((await right(user)).success).toBe(true);
    const after = await state(user);
    expect(after.loginAttempts).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it('does not count a correct password that only needs an MFA code', async () => {
    const user = await makeUser();
    await storage.updateUser(user.id, { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' });
    for (let i = 0; i < 3; i++) {
      const r = await right(user);
      expect(r.requiresMFA).toBe(true);
    }
    expect((await state(user)).loginAttempts).toBe(0);
  });

  it('counts wrong MFA codes towards the lock', async () => {
    const user = await makeUser();
    await storage.updateUser(user.id, { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' });
    for (let i = 0; i < MAX; i++) {
      const r = await authService.login({ username: user.username, password: PASSWORD, mfaToken: '000000' });
      expect(r.error).toBe('Invalid authentication code');
    }
    expect((await right(user)).accountLocked).toBe(true);
  });

  it('does not count or lock unknown usernames', async () => {
    for (let i = 0; i < MAX + 2; i++) {
      const r = await authService.login({ username: `${PREFIX}nobody${Date.now()}`, password: 'x' });
      expect(r.error).toBe('Invalid credentials');
      expect(r.accountLocked).toBeUndefined();
    }
  });

  it('applies the same protection to /api/enhanced-auth/login', async () => {
    const user = await makeUser({ emails: [] });
    // verified address is not required to reach the password check; wrong passwords never get that far
    for (let i = 0; i < MAX; i++) {
      const r = await request(app)
        .post('/api/enhanced-auth/login')
        .set('X-Forwarded-For', `10.9.${seq}.${i}`)
        .send({ username: user.username, password: 'wrong-password' });
      expect(r.status).toBe(401);
    }
    const shared = await state(user);
    expect(shared.lockedUntil).not.toBeNull();
    // the primary login honours the lock set through the enhanced endpoint (one counter per user id)
    expect((await right(user)).accountLocked).toBe(true);
  });
});
