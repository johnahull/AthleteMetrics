/**
 * Accounts without a set password cannot sign in with a password.
 *
 * An account whose password has not been set yet (invited, imported or auto-created) stores a
 * placeholder. Older rows hold a bcrypt hash of that placeholder, newer rows the placeholder itself.
 * Neither may be accepted by any sign-in or password-verification path, while normal sign-in,
 * invitation claim and password reset keep working.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import bcrypt from 'bcrypt';
import request from 'supertest';
import express from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { AuthService } from '../../packages/api/services/auth-service';
import { UserService } from '../../packages/api/services/user-service';
import { PasswordResetService } from '../../packages/api/auth/password-reset';
import { users, INVITATION_PENDING_PASSWORD } from '@shared/schema';
import type { User } from '@shared/schema';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PREFIX = 'pendsign';
const PLACEHOLDER = INVITATION_PENDING_PASSWORD;
const PASSWORD = 'TestPass123!';
const NEW_PASSWORD = 'BrandNewPass456!';

type Kind = 'hashed placeholder (older rows)' | 'unhashed placeholder (new rows)';
const KINDS: Kind[] = ['hashed placeholder (older rows)', 'unhashed placeholder (new rows)'];

describe('Accounts without a set password cannot sign in with a password', () => {
  const authService = new AuthService();
  const userService = new UserService();
  let app: express.Express;
  let seq = 0;

  const uniq = () => `${Date.now()}${seq++}`;

  /**
   * Accept, without signing in, an invitation to a new organization that names only the account's email (no
   * linked account id). The account is not in that organization, so it cannot be claimed and the acceptance is
   * refused until its owner signs in (lib/invitation-account.ts).
   */
  async function acceptByEmail(account: User) {
    const org = await storage.createOrganization({ name: `${PREFIX} Org ${uniq()}`, orgType: 'club', description: 'x' });
    const inviter = await makeWithPassword();
    const inv = await storage.createInvitation({
      email: account.emails![0], firstName: 'Pending', lastName: 'Account', organizationId: org.id,
      role: 'athlete', invitedBy: inviter.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await expect(storage.acceptInvitation(inv.token, {
      email: account.emails![0], username: `${PREFIX}${uniq()}e`, password: NEW_PASSWORD, firstName: 'Pending', lastName: 'Account',
    })).rejects.toMatchObject({ code: 'SIGN_IN_REQUIRED' });
  }

  /** An active account whose password was never set, in the stored shape of `kind`. */
  async function makePending(kind: Kind): Promise<User> {
    const u = uniq();
    const user = await storage.createUser({
      username: `${PREFIX}${u}`,
      emails: [`${PREFIX}${u}@test.com`],
      firstName: 'Pending',
      lastName: 'Account',
      isActive: true,
    } as any);
    if (kind === 'hashed placeholder (older rows)') {
      await db.update(users)
        .set({ password: await bcrypt.hash(PLACEHOLDER, 4) })
        .where(eq(users.id, user.id));
    }
    return (await storage.getUser(user.id))!;
  }

  async function makeWithPassword(): Promise<User> {
    const u = uniq();
    return storage.createUser({
      username: `${PREFIX}${u}`,
      password: PASSWORD,
      emails: [`${PREFIX}${u}@test.com`],
      firstName: 'Normal',
      lastName: 'Account',
      role: 'athlete',
      birthDate: '1990-01-01', // a complete profile, so authenticated requests pass the profile gate
    });
  }

  /** A signed-in session for `user` (signs in with its real password, then reshapes the stored password). */
  async function sessionFor(kind: Kind) {
    const user = await makeWithPassword();
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD });
    expect(res.status).toBe(200);
    const stored = kind === 'hashed placeholder (older rows)' ? await bcrypt.hash(PLACEHOLDER, 4) : PLACEHOLDER;
    await db.update(users).set({ password: stored }).where(eq(users.id, user.id));
    return { user, agent };
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    await registerRoutes(app);
  });

  afterAll(async () => {
    await purgeTestRows({ usernameLike: [`${PREFIX}%`], orgNameLike: [`${PREFIX}%`] });
  });

  describe('new writes store no usable password', () => {
    it('createUser without a password stores the placeholder unhashed', async () => {
      const user = await makePending('unhashed placeholder (new rows)');
      expect(user.password).toBe(PLACEHOLDER);
    });

    it('createUser given the placeholder stores it unhashed', async () => {
      const u = uniq();
      const user = await storage.createUser({
        username: `${PREFIX}${u}`, emails: [`${PREFIX}${u}@test.com`], firstName: 'A', lastName: 'B',
        password: PLACEHOLDER, isActive: false,
      } as any);
      expect((await storage.getUser(user.id))!.password).toBe(PLACEHOLDER);
    });

    it('updateUser given the placeholder stores it unhashed', async () => {
      const user = await makeWithPassword();
      await storage.updateUser(user.id, { password: PLACEHOLDER });
      expect((await storage.getUser(user.id))!.password).toBe(PLACEHOLDER);
    });
  });

  describe.each(KINDS)('stored as %s', (kind) => {
    it('AuthService.login refuses the placeholder by username and by email', async () => {
      const user = await makePending(kind);
      const byName = await authService.login({ username: user.username, password: PLACEHOLDER });
      const byEmail = await authService.login({ username: user.emails[0], password: PLACEHOLDER });
      expect(byName.success).toBe(false);
      expect(byEmail.success).toBe(false);
      expect(byName.user).toBeUndefined();
    });

    it.each([true, false])('AuthService.login answers a pending account (isActive %s) like a wrong password', async (isActive) => {
      const user = await makePending(kind);
      await db.update(users).set({ isActive }).where(eq(users.id, user.id));
      const r = await authService.login({ username: user.username, password: 'AnyGuess123!x' });
      expect(r).toEqual({ success: false, error: 'Invalid credentials' });
      expect((await storage.getUser(user.id))!.loginAttempts).toBe(1);
    });

    it('POST /api/auth/login refuses the placeholder', async () => {
      const user = await makePending(kind);
      const byName = await request(app).post('/api/auth/login').send({ username: user.username, password: PLACEHOLDER });
      const byEmail = await request(app).post('/api/auth/login').send({ username: user.emails[0], password: PLACEHOLDER });
      expect(byName.status).toBe(401);
      expect(byEmail.status).toBe(401);
    });

    it('POST /api/enhanced-auth/login refuses the placeholder', async () => {
      const user = await makePending(kind);
      const byName = await request(app).post('/api/enhanced-auth/login').send({ username: user.username, password: PLACEHOLDER });
      const byEmail = await request(app).post('/api/enhanced-auth/login').send({ username: user.emails[0], password: PLACEHOLDER });
      expect(byName.status).toBe(401);
      expect(byEmail.status).toBe(401);
      expect(byName.body.message).toBe('Invalid username or password');
    });

    it('storage.authenticateUser and authenticateUserByEmail refuse the placeholder', async () => {
      const user = await makePending(kind);
      expect(await storage.authenticateUser(user.username, PLACEHOLDER)).toBeNull();
      expect(await storage.authenticateUserByEmail(user.emails[0], PLACEHOLDER)).toBeNull();
    });

    it('PasswordResetService.changePassword refuses the placeholder as the current password', async () => {
      const user = await makePending(kind);
      const r = await PasswordResetService.changePassword(user.id, PLACEHOLDER, NEW_PASSWORD, '127.0.0.1');
      expect(r.success).toBe(false);
      expect((await storage.getUser(user.id))!.password).toBe(user.password);
    });

    it('POST /api/enhanced-auth/change-password refuses the placeholder as the current password', async () => {
      const { user, agent } = await sessionFor(kind);
      const before = (await storage.getUser(user.id))!.password;
      const res = await agent.post('/api/enhanced-auth/change-password').send({ currentPassword: PLACEHOLDER, newPassword: NEW_PASSWORD });
      expect(res.body.success).toBe(false);
      expect((await storage.getUser(user.id))!.password).toBe(before);
    });

    it('PUT /api/profile/password refuses the placeholder as the current password', async () => {
      const { user, agent } = await sessionFor(kind);
      const before = (await storage.getUser(user.id))!.password;
      const res = await agent.put('/api/profile/password').send({ currentPassword: PLACEHOLDER, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
      // A session on an account without a set password may set one (no current password exists),
      // but the placeholder itself must never verify as a current password.
      if (kind === 'hashed placeholder (older rows)') {
        expect(res.status).toBe(400);
        expect((await storage.getUser(user.id))!.password).toBe(before);
      }
      const after = (await storage.getUser(user.id))!;
      expect(await storage.authenticateUser(after.username, PLACEHOLDER)).toBeNull();
    });

    it('UserService.changePassword leaves the stored value unchanged for the placeholder', async () => {
      const user = await makePending(kind);
      await expect(userService.changePassword(user.id, PLACEHOLDER, NEW_PASSWORD)).rejects.toThrow();
      expect((await storage.getUser(user.id))!.password).toBe(user.password);
    });

    it('password reset sets a usable password on the pending account', async () => {
      const user = await makePending(kind);
      const token = `${PREFIX}${uniq()}tok`;
      await storage.createPasswordResetToken({
        userId: user.id, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000), ipAddress: '127.0.0.1',
      });
      const r = await PasswordResetService.resetPassword(token, NEW_PASSWORD, '127.0.0.1');
      expect(r.success).toBe(true);
      expect((await authService.login({ username: user.username, password: NEW_PASSWORD })).success).toBe(true);
      expect((await authService.login({ username: user.username, password: PLACEHOLDER })).success).toBe(false);
    });

    it('accepting an invitation linked to the pending athlete sets a usable password', async () => {
      const athlete = await makePending(kind);
      const org = await storage.createOrganization({ name: `${PREFIX} Org ${uniq()}`, orgType: 'club', description: 'x' });
      // Claimable only as an athlete of the inviting organization and of no other one
      await storage.addUserToOrganization(athlete.id, org.id, 'athlete');
      const inviter = await makeWithPassword();
      const inv = await storage.createInvitation({
        email: athlete.emails[0], firstName: 'Pending', lastName: 'Account', organizationId: org.id,
        role: 'athlete', invitedBy: inviter.id, playerId: athlete.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const claimedName = `${PREFIX}${uniq()}c`;
      await storage.acceptInvitation(inv.token, {
        email: athlete.emails[0], username: claimedName, password: NEW_PASSWORD, firstName: 'Pending', lastName: 'Account',
      });
      expect((await authService.login({ username: claimedName, password: NEW_PASSWORD })).success).toBe(true);
      expect((await authService.login({ username: claimedName, password: PLACEHOLDER })).success).toBe(false);
    });

    it('an invitation matched only by email does not set a password or reactivate the pending account', async () => {
      const athlete = await makePending(kind);
      await db.update(users).set({ isActive: false }).where(eq(users.id, athlete.id));
      const stored = (await storage.getUser(athlete.id))!.password;
      await acceptByEmail(athlete);
      const after = (await storage.getUser(athlete.id))!;
      expect(after.password).toBe(stored);
      expect(after.isActive).toBe(false);
      expect((await authService.login({ username: athlete.username, password: NEW_PASSWORD })).success).toBe(false);
    });
  });

  describe('an invitation matched only by email', () => {
    it('leaves the password of an account that has one unchanged', async () => {
      const user = await makeWithPassword();
      const stored = (await storage.getUser(user.id))!.password;
      await acceptByEmail(user);
      expect((await storage.getUser(user.id))!.password).toBe(stored);
      expect((await authService.login({ username: user.username, password: PASSWORD })).success).toBe(true);
      expect((await authService.login({ username: user.username, password: NEW_PASSWORD })).success).toBe(false);
    });

    it('does not set a password on an athlete created without one', async () => {
      const u = uniq();
      const org = await storage.createOrganization({ name: `${PREFIX} Org ${uniq()}`, orgType: 'club', description: 'x' });
      const athlete = await storage.createAthlete({
        firstName: 'Pending', lastName: `Created${u}`, emails: [`${PREFIX}${u}@test.com`], organizationId: org.id,
      } as any);
      await acceptByEmail(athlete);
      expect((await storage.getUser(athlete.id))!.password).toBe(PLACEHOLDER);
      expect((await authService.login({ username: athlete.username, password: NEW_PASSWORD })).success).toBe(false);
    });
  });

  describe('POST /api/enhanced-auth/login applies the same account checks', () => {
    it.each([
      ['a deactivated account', { isActive: false }],
      ['an account awaiting parental consent', { coppaStatus: 'pending_consent' }],
      ['an account whose consent was revoked', { coppaStatus: 'consent_revoked' }],
    ])('refuses %s even with the right password', async (_label, state) => {
      const user = await makeWithPassword();
      await db.update(users).set({ isEmailVerified: true, ...state } as any).where(eq(users.id, user.id));
      const res = await request(app).post('/api/enhanced-auth/login').send({ username: user.username, password: PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.headers['set-cookie']?.join(';') ?? '').not.toContain('connect.sid');
      // The right password is not counted as a failed guess
      expect((await storage.getUser(user.id))!.loginAttempts ?? 0).toBe(0);
    });
  });

  describe('account creation by a site admin', () => {
    async function siteAdminAgent() {
      const admin = await makeWithPassword();
      await db.update(users).set({ isSiteAdmin: true }).where(eq(users.id, admin.id));
      const agent = request.agent(app);
      expect((await agent.post('/api/auth/login').send({ username: admin.username, password: PASSWORD })).status).toBe(200);
      const csrf = (await agent.get('/api/csrf-token')).body.csrfToken;
      return { agent, csrf };
    }

    it('POST /api/users answers without the stored password', async () => {
      const { agent, csrf } = await siteAdminAgent();
      const username = `${PREFIX}${uniq()}r`;
      const res = await agent.post('/api/users').set('X-CSRF-Token', csrf)
        .send({ username, emails: [`${username}@test.com`], password: PASSWORD, firstName: 'Made', lastName: 'ByRoute', role: 'athlete' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('mfaSecret');
    });

    it('POST /api/site-admins answers without the stored password', async () => {
      const { agent, csrf } = await siteAdminAgent();
      const username = `${PREFIX}${uniq()}a`;
      const res = await agent.post('/api/site-admins').set('X-CSRF-Token', csrf)
        .send({ username, firstName: 'Site', lastName: 'Admin', password: PASSWORD });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body).not.toHaveProperty('password');
    });
  });

  describe('legitimate sign-in still works', () => {
    it('an account created by a site admin signs in with the password given', async () => {
      const username = `${PREFIX}${uniq()}u`;
      await userService.createUser({ username, emails: [`${username}@test.com`], password: PASSWORD, firstName: 'Made', lastName: 'ByAdmin', role: 'athlete' } as any, 'unused');
      expect((await authService.login({ username, password: PASSWORD })).success).toBe(true);
    });

    it('a new site admin signs in with the password given', async () => {
      const requester = await makeWithPassword();
      await db.update(users).set({ isSiteAdmin: true }).where(eq(users.id, requester.id));
      const username = `${PREFIX}${uniq()}s`;
      await userService.createSiteAdmin({ username, firstName: 'Site', lastName: 'Admin', password: PASSWORD }, requester.id);
      expect((await authService.login({ username, password: PASSWORD })).success).toBe(true);
    });

    it('a deactivated account is told so only when the password is right', async () => {
      const user = await makeWithPassword();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));
      expect((await authService.login({ username: user.username, password: 'WrongPass123!x' })).error).toBe('Invalid credentials');
      const right = await authService.login({ username: user.username, password: PASSWORD });
      expect(right.success).toBe(false);
      expect(right.error).toContain('deactivated');
      // The right password is not counted as a failed guess
      expect((await storage.getUser(user.id))!.loginAttempts).toBe(1);
    });

    it('a normal account signs in on every path', async () => {
      const user = await makeWithPassword();
      expect((await authService.login({ username: user.username, password: PASSWORD })).success).toBe(true);
      expect((await authService.login({ username: user.emails[0], password: PASSWORD })).success).toBe(true);
      expect((await request(app).post('/api/auth/login').send({ username: user.username, password: PASSWORD })).status).toBe(200);
      expect(await storage.authenticateUser(user.username, PASSWORD)).not.toBeNull();
      expect(await storage.authenticateUserByEmail(user.emails[0], PASSWORD)).not.toBeNull();
      // enhanced-auth requires a verified email
      await db.update(users).set({ isEmailVerified: true }).where(eq(users.id, user.id));
      expect((await request(app).post('/api/enhanced-auth/login').send({ username: user.username, password: PASSWORD })).status).toBe(200);
    });

    it('a normal account changes its password with its real current password', async () => {
      const user = await makeWithPassword();
      const r = await PasswordResetService.changePassword(user.id, PASSWORD, NEW_PASSWORD, '127.0.0.1');
      expect(r.success).toBe(true);
      expect((await authService.login({ username: user.username, password: NEW_PASSWORD })).success).toBe(true);
    });
  });
});
