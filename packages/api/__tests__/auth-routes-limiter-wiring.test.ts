/**
 * Proves the PRODUCTION auth routes (registerAuthRoutes) use the right rate limiter on each endpoint.
 * AuthService and PasswordResetService are mocked; the limiters are real, with the localhost/test-env bypass
 * disabled through the `skipRateLimit` option.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  requestPasswordReset: vi.fn(),
  validateResetToken: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('../services/auth-service', () => ({
  AuthService: class {
    login = mocks.login;
    determineUserRoleAndContext = vi.fn().mockResolvedValue({ role: 'athlete', primaryOrganizationId: undefined });
    getUserOrganizations = vi.fn().mockResolvedValue([]);
    startImpersonation = vi.fn();
  },
}));
vi.mock('../auth/password-reset', () => ({
  PasswordResetService: {
    requestPasswordReset: mocks.requestPasswordReset,
    validateResetToken: mocks.validateResetToken,
    resetPassword: mocks.resetPassword,
  },
}));
vi.mock('../services/coppa-service', () => ({ coppaService: { writeCoppaAudit: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../services/coppa-email-token-store', () => ({ generateParentEmailToken: vi.fn().mockReturnValue('tok') }));
vi.mock('../storage', () => ({ storage: {} }));
vi.mock('../middleware', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireSiteAdmin: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../lib/session-helpers', () => ({
  regenerateSession: vi.fn().mockResolvedValue(undefined),
  saveSession: vi.fn().mockResolvedValue(undefined),
}));

import { registerAuthRoutes } from '../routes/auth-routes';

const user = {
  id: 'u1', username: 'ann', firstName: 'A', lastName: 'B', emails: ['a@b.c'],
  isSiteAdmin: false, isEmailVerified: true, coppaStatus: 'not_applicable',
};

function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).session = {}; next(); });
  registerAuthRoutes(app, { skipRateLimit: () => false });
  return app;
}

const ip = '10.1.1.1';
const post = (app: express.Express, path: string, body: object = {}, from = ip) =>
  request(app).post(path).set('X-Forwarded-For', from).send(body);
const login = (app: express.Express, from = ip) =>
  post(app, '/api/auth/login', { username: 'ann', password: 'x' }, from);

const outcomes: Array<[string, any, number]> = [
  ['401 wrong password', { success: false, error: 'Invalid credentials' }, 401],
  ['403 COPPA block', { success: true, user: { ...user, coppaStatus: 'pending_consent' } }, 403],
  ['423 locked', { success: false, accountLocked: true, error: 'locked', lockUntil: new Date() }, 423],
];

describe('registerAuthRoutes limiter wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestPasswordReset.mockResolvedValue({ success: true });
    mocks.validateResetToken.mockResolvedValue({ valid: false });
    mocks.resetPassword.mockResolvedValue({ success: false });
  });

  it.each(outcomes)('login counts a %s towards the failure limiter (20 allowed, 21st is 429)', async (_n, result, status) => {
    mocks.login.mockResolvedValue(result);
    const app = buildApp();
    for (let i = 0; i < 20; i++) expect((await login(app)).status).toBe(status);
    expect((await login(app)).status).toBe(429);
  });

  it('login counts a 500 towards the failure limiter', async () => {
    mocks.login.mockRejectedValue(new Error('boom'));
    const app = buildApp();
    for (let i = 0; i < 20; i++) expect((await login(app)).status).toBe(500);
    expect((await login(app)).status).toBe(429);
  });

  it('login never counts a success or an MFA challenge', async () => {
    const app = buildApp();
    mocks.login.mockResolvedValue({ success: true, user });
    for (let i = 0; i < 30; i++) expect((await login(app)).status).toBe(200);
    mocks.login.mockResolvedValue({ success: false, requiresMFA: true });
    for (let i = 0; i < 30; i++) {
      const r = await login(app);
      expect(r.status).toBe(200);
      expect(r.body.requiresMFA).toBe(true);
    }
    mocks.login.mockResolvedValue({ success: false, error: 'Invalid credentials' });
    for (let i = 0; i < 20; i++) expect((await login(app)).status).toBe(401);
    expect((await login(app)).status).toBe(429);
  });

  it('forgot-password allows 5 requests then 429, and login still works', async () => {
    mocks.login.mockResolvedValue({ success: true, user });
    const app = buildApp();
    for (let i = 0; i < 5; i++) {
      expect((await post(app, '/api/auth/forgot-password', { email: 'a@b.c' })).status).toBe(200);
    }
    expect((await post(app, '/api/auth/forgot-password', { email: 'a@b.c' })).status).toBe(429);
    expect((await login(app)).status).toBe(200);
    expect(mocks.requestPasswordReset).toHaveBeenCalledTimes(5);
  });

  it.each(['/api/auth/validate-reset-token', '/api/auth/reset-password'])(
    '%s allows 20 requests then 429',
    async (path) => {
      const app = buildApp();
      const body = { token: 't', newPassword: 'p' };
      for (let i = 0; i < 20; i++) expect((await post(app, path, body)).status).toBe(200);
      expect((await post(app, path, body)).status).toBe(429);
    }
  );

  it('validate-reset-token and reset-password share one bucket, separate from forgot-password and login', async () => {
    mocks.login.mockResolvedValue({ success: true, user });
    const app = buildApp();
    const body = { token: 't', newPassword: 'p' };
    for (let i = 0; i < 10; i++) {
      await post(app, '/api/auth/validate-reset-token', body);
      await post(app, '/api/auth/reset-password', body);
    }
    expect((await post(app, '/api/auth/validate-reset-token', body)).status).toBe(429);
    expect((await post(app, '/api/auth/reset-password', body)).status).toBe(429);
    expect((await post(app, '/api/auth/forgot-password', { email: 'a@b.c' })).status).toBe(200);
    expect((await login(app)).status).toBe(200);
  });

  it('a normal reset flow with reloads and a rejected password stays under the limit', async () => {
    const app = buildApp();
    expect((await post(app, '/api/auth/forgot-password', { email: 'a@b.c' })).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await post(app, '/api/auth/validate-reset-token', { token: 't' })).status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await post(app, '/api/auth/reset-password', { token: 't', newPassword: 'p' })).status).toBe(200);
  });

  it('limits are per IP', async () => {
    mocks.login.mockResolvedValue({ success: false, error: 'Invalid credentials' });
    const app = buildApp();
    for (let i = 0; i < 21; i++) await login(app, '10.1.1.1');
    expect((await login(app, '10.1.1.1')).status).toBe(429);
    expect((await login(app, '10.1.1.2')).status).toBe(401);
  });

  it('the 429 body is the shared limiter message', async () => {
    const app = buildApp();
    for (let i = 0; i < 5; i++) await post(app, '/api/auth/forgot-password', { email: 'a@b.c' });
    const r = await post(app, '/api/auth/forgot-password', { email: 'a@b.c' });
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ message: 'Too many authentication attempts, please try again later.' });
  });
});
