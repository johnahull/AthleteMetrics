/**
 * Regression tests for account lockout and MFA on the REAL login path.
 *
 * The live login (/api/auth/login -> AuthService.login) enforced neither
 * account lockout nor MFA — that logic only lived in the unused
 * /api/enhanced-auth/login handler. This consolidates both onto the path the
 * web client actually uses.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { storage } from '../../packages/api/storage';
import type { User } from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'TestPass123!';

describe('Login account lockout and MFA', () => {
  let app: express.Express;
  let seq = 0;

  async function makeUser(): Promise<User> {
    const uniq = `${Date.now()}${seq++}`;
    return storage.createUser({
      username: `wave2lock${uniq}`,
      password: PASSWORD,
      emails: [`wave2lock${uniq}@test.com`],
      firstName: 'Lock',
      lastName: 'Test',
    });
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);
  });

  it('locks the account after 5 failed attempts, blocking even a correct password', async () => {
    const user = await makeUser();
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ username: user.username, password: 'wrongpass' });
    }

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: PASSWORD });

    expect(res.status).toBe(423);
    expect(res.body.accountLocked).toBe(true);

    await storage.deleteUser(user.id);
  });

  it('resets failed attempts on a successful login', async () => {
    const user = await makeUser();
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/auth/login').send({ username: user.username, password: 'wrongpass' });
    }

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: PASSWORD });
    expect(ok.status).toBe(200);

    await storage.deleteUser(user.id);
  });

  it('requires an MFA code when the user has MFA enabled', async () => {
    const user = await makeUser();
    await storage.updateUser(user.id, { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: PASSWORD });

    expect(res.body.requiresMFA).toBe(true);
    expect(res.body.user).toBeUndefined();

    await storage.deleteUser(user.id);
  });
});
