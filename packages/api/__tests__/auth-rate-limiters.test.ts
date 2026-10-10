/**
 * Unit tests for the login / password-reset rate limiters (no database).
 * The skip function is injected so the localhost/test-env bypass can be disabled.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthRateLimiters } from '../middleware/auth-rate-limiters';

const MESSAGE = 'Too many authentication attempts, please try again later.';

function buildApp(skip: () => boolean = () => false) {
  const { loginLimiter, forgotPasswordLimiter, resetTokenLimiter } = createAuthRateLimiters({ skip });
  const app = express();
  app.set('trust proxy', 1); // same value as production (packages/api/index.ts)
  app.use(express.json());
  app.post('/login', loginLimiter, (req, res) => {
    res.status(req.body?.ok ? 200 : 401).json({ ok: !!req.body?.ok });
  });
  app.post('/forgot-password', forgotPasswordLimiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.post('/reset-token', resetTokenLimiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

const login = (app: express.Express, ok: boolean, ip = '10.0.0.1') =>
  request(app).post('/login').set('X-Forwarded-For', ip).send({ ok });

describe('createAuthRateLimiters', () => {
  it('allows 20 failed logins and blocks the 21st with 429', async () => {
    const app = buildApp();
    for (let i = 0; i < 20; i++) {
      expect((await login(app, false)).status).toBe(401);
    }
    const res = await login(app, false);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ message: MESSAGE });
  });

  it('never counts successful logins', async () => {
    const app = buildApp();
    for (let i = 0; i < 60; i++) {
      expect((await login(app, true)).status).toBe(200);
    }
  });

  it('successes do not consume the failure budget', async () => {
    const app = buildApp();
    for (let i = 0; i < 10; i++) expect((await login(app, true)).status).toBe(200);
    for (let i = 0; i < 20; i++) expect((await login(app, false)).status).toBe(401);
    expect((await login(app, false)).status).toBe(429);
  });

  it('password reset allows 5 requests, blocks the 6th, and does not affect login', async () => {
    const app = buildApp();
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/forgot-password').set('X-Forwarded-For', '10.0.0.1');
      expect(r.status).toBe(200);
    }
    const blocked = await request(app).post('/forgot-password').set('X-Forwarded-For', '10.0.0.1');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ message: MESSAGE });
    expect((await login(app, false)).status).toBe(401);
  });

  it('reset-token endpoints allow 20 requests, block the 21st, and have their own bucket', async () => {
    const app = buildApp();
    for (let i = 0; i < 20; i++) {
      const r = await request(app).post('/reset-token').set('X-Forwarded-For', '10.0.0.1');
      expect(r.status).toBe(200);
    }
    const blocked = await request(app).post('/reset-token').set('X-Forwarded-For', '10.0.0.1');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ message: MESSAGE });
    // forgot-password and login are unaffected
    expect((await request(app).post('/forgot-password').set('X-Forwarded-For', '10.0.0.1')).status).toBe(200);
    expect((await login(app, false)).status).toBe(401);
  });

  it('forgot-password requests do not consume the reset-token budget', async () => {
    const app = buildApp();
    for (let i = 0; i < 6; i++) await request(app).post('/forgot-password').set('X-Forwarded-For', '10.0.0.1');
    expect((await request(app).post('/reset-token').set('X-Forwarded-For', '10.0.0.1')).status).toBe(200);
  });

  it('login failures do not consume the password reset budget', async () => {
    const app = buildApp();
    for (let i = 0; i < 20; i++) await login(app, false);
    const r = await request(app).post('/forgot-password').set('X-Forwarded-For', '10.0.0.1');
    expect(r.status).toBe(200);
  });

  it('keeps separate budgets per IP', async () => {
    const app = buildApp();
    for (let i = 0; i < 21; i++) await login(app, false, '10.0.0.1');
    expect((await login(app, false, '10.0.0.1')).status).toBe(429);
    expect((await login(app, false, '10.0.0.2')).status).toBe(401);
  });

  it('honours the injected skip function', async () => {
    const app = buildApp(() => true);
    for (let i = 0; i < 30; i++) expect((await login(app, false)).status).toBe(401);
    for (let i = 0; i < 25; i++) {
      const r = await request(app).post(i % 2 ? '/forgot-password' : '/reset-token');
      expect(r.status).toBe(200);
    }
  });
});
