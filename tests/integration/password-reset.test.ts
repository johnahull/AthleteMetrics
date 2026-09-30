/**
 * Integration tests for the password reset flow.
 *
 * The flow was non-functional: the frontend calls /api/auth/forgot-password and
 * /api/auth/reset-password (unmounted), and the storage layer was stubbed with
 * no passwordResetTokens table. These tests drive the working end-to-end flow.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { storage } from '../../packages/api/storage';
import type { User } from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

// Capture the reset link (and therefore the raw token) that would be emailed.
const sentResetEmails: Array<{ email: string; resetLink: string }> = [];
vi.mock('../../packages/api/services/email-service', () => ({
  emailService: {
    sendPasswordReset: vi.fn(async (email: string, data: { userName: string; resetLink: string }) => {
      sentResetEmails.push({ email, resetLink: data.resetLink });
      return true;
    }),
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendInvitation: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';
import { emailService } from '../../packages/api/services/email-service';
import { PasswordResetService } from '../../packages/api/auth/password-reset';

const OLD_PASSWORD = 'OldPass123!';
const NEW_PASSWORD = 'BrandNewPass456!';

function tokenFromLink(link: string): string {
  return new URL(link, 'http://localhost').searchParams.get('token') ?? '';
}

describe('Password reset flow', () => {
  let app: express.Express;
  let user: User;
  let email: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);
  });

  beforeEach(async () => {
    sentResetEmails.length = 0;
    const ts = `${Date.now()}${Math.floor(performance.now())}`;
    email = `wave2reset${ts}@test.com`;
    user = await storage.createUser({
      username: `wave2reset${ts}`,
      password: OLD_PASSWORD,
      emails: [email],
      firstName: 'Reset',
      lastName: 'User',
    });
  });

  afterAll(async () => {
    // beforeEach users are cleaned up individually below via afterAll sweep not
    // needed; each test deletes its own user.
  });

  it('completes request -> reset -> login with the new password', async () => {
    const forgot = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(forgot.status).toBe(200);

    // A reset link (with the raw token) was emailed.
    expect(sentResetEmails.length).toBe(1);
    const token = tokenFromLink(sentResetEmails[0].resetLink);
    expect(token.length).toBeGreaterThan(20);

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: NEW_PASSWORD });
    expect(reset.status).toBe(200);
    expect(reset.body.success).toBe(true);

    // Old password no longer works; new password does.
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: OLD_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);

    await storage.deleteUser(user.id);
  });

  it('returns 200 for an unknown email (no account enumeration) and sends nothing', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: `nobody${Date.now()}@test.com` });
    expect(res.status).toBe(200);
    expect(sentResetEmails.length).toBe(0);
    await storage.deleteUser(user.id);
  });

  it('rejects a reused reset token', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email }).expect(200);
    const token = tokenFromLink(sentResetEmails[0].resetLink);

    await request(app).post('/api/auth/reset-password').send({ token, newPassword: NEW_PASSWORD }).expect(200);
    const second = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'AnotherPass789!' });
    expect(second.body.success).toBe(false);

    await storage.deleteUser(user.id);
  });

  it('does not persist the raw token (stored value is hashed)', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email }).expect(200);
    const token = tokenFromLink(sentResetEmails[0].resetLink);

    // Looking up by the raw token must succeed (storage hashes internally)...
    const found = await storage.findPasswordResetToken(token);
    expect(found?.userId).toBe(user.id);
    // ...but the raw token value must not appear as a stored column value.
    expect((found as any).token).toBeUndefined();

    await storage.deleteUser(user.id);
  });

  it('requestEmailVerification actually sends a verification email with a token link', async () => {
    (emailService.sendEmailVerification as any).mockClear();

    const result = await PasswordResetService.requestEmailVerification(user.id, email, '127.0.0.1');
    expect(result.success).toBe(true);

    expect(emailService.sendEmailVerification).toHaveBeenCalledTimes(1);
    const [toEmail, data] = (emailService.sendEmailVerification as any).mock.calls.at(-1);
    expect(toEmail).toBe(email);
    expect(data.verificationLink).toMatch(/verify-email\?token=/);

    await storage.deleteUser(user.id);
  });
});
