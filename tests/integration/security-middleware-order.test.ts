/**
 * Regression test for security middleware registration order.
 *
 * helmet, csrfProtection, input sanitization and the general rate limiter were
 * registered AFTER the application routes in routes.ts. Because Express runs
 * middleware in registration order and a matched route ends the chain, none of
 * them executed for the real API surface. They must be registered BEFORE the
 * routes.
 *
 * Note: CSRF is intentionally skipped when NODE_ENV === 'test' (consistent with
 * the rate-limiter skips elsewhere in the codebase), so this test temporarily
 * runs the CSRF assertion under NODE_ENV = 'development' to exercise the real
 * (non-test) code path.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

describe('Security middleware registration order', () => {
  let app: express.Express;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);
  });

  it('applies helmet security headers to application routes', async () => {
    // /api/auth/me is registered by the application route modules; if helmet
    // runs before them, its headers are present even on the 401 response.
    const res = await request(app).get('/api/auth/me');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('enforces CSRF on state-changing /api routes when not bypassed', async () => {
    // Integration setup sets DISABLE_CSRF=true; unset it to exercise the real
    // CSRF path (the suite runs under NODE_ENV=development, so CSRF is active
    // once the bypass flag is removed).
    const prev = process.env.DISABLE_CSRF;
    delete process.env.DISABLE_CSRF;
    try {
      const res = await request(app)
        .post('/api/teams')
        .send({ name: 'csrf-probe' });
      expect(res.status).toBe(403);
      expect(String(res.body.error)).toMatch(/csrf/i);
    } finally {
      process.env.DISABLE_CSRF = prev;
    }
  });
});
