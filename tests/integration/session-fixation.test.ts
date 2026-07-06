/**
 * Regression test for session fixation on the username/password login.
 *
 * The login handler set req.session.user without first calling
 * req.session.regenerate(), so a session ID planted before authentication
 * survived login and could be reused to hijack the authenticated session.
 * OAuth and invitation-acceptance already regenerate; login/register did not.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

function sidFromSetCookie(setCookie: string[] | undefined): string | undefined {
  if (!setCookie) return undefined;
  const header = setCookie.find((c) => c.startsWith('connect.sid='));
  if (!header) return undefined;
  return header.split(';')[0].split('=')[1];
}

describe('Login session fixation', () => {
  let app: express.Express;
  let user: User;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);

    const ts = Date.now();
    user = await storage.createUser({
      username: `wave1session${ts}`,
      password: PASSWORD,
      emails: [`wave1session${ts}@test.com`],
      firstName: 'Session',
      lastName: 'Fixation',
    });
  });

  afterAll(async () => {
    try { await storage.deleteUser(user.id); } catch { /* ignore */ }
  });

  it('regenerates the session ID on login', async () => {
    const agent = request.agent(app);

    // Establish a pre-auth session (csrf-token endpoint writes to the session).
    const pre = await agent.get('/api/csrf-token');
    const sidBefore = sidFromSetCookie(pre.headers['set-cookie'] as unknown as string[]);
    expect(sidBefore).toBeTruthy();

    const login = await agent
      .post('/api/auth/login')
      .send({ username: user.username, password: PASSWORD })
      .expect(200);
    const sidAfter = sidFromSetCookie(login.headers['set-cookie'] as unknown as string[]);

    expect(sidAfter).toBeTruthy();
    expect(sidAfter).not.toBe(sidBefore);
  });
});
