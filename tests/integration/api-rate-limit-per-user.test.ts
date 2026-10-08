/**
 * The app-wide /api limiter (100 requests / 15 min) is keyed per signed-in user,
 * so users behind one IP (e.g. a team on gym Wi-Fi) do not share a budget;
 * anonymous requests are still limited per IP.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
delete process.env.BYPASS_GENERAL_RATE_LIMIT;

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';
import { purgeTestRows } from '../helpers/purge-test-rows';

const PASSWORD = 'ApiLimiter123!';
const LIMIT = 100;
// Any /api path is counted by the limiter before routing; this one does not exist
const PROBE = '/api/__rate-limit-probe';

describe('app-wide /api rate limiter', () => {
  let app: Express;
  const created: string[] = [];
  const cookies: string[] = [];

  beforeAll(async () => {
    app = express();
    app.set('trust proxy', 1); // as in production (index.ts), so X-Forwarded-For sets req.ip
    app.use(express.json());
    await registerRoutes(app);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    for (const tag of ['a', 'b']) {
      const [u] = await db
        .insert(users)
        .values({
          username: `apilim-${tag}-${suffix}`,
          emails: [`apilim-${tag}-${suffix}@test.com`],
          password: hashed,
          firstName: 'Api',
          lastName: tag,
          fullName: `Api ${tag}`,
        } as any)
        .returning();
      created.push(u.id);
      // Logins come from localhost, which the /api limiter skips
      const login = await request(app).post('/api/auth/login').send({ username: u.username, password: PASSWORD });
      expect(login.status).toBe(200);
      cookies.push(login.headers['set-cookie'][0]);
    }
  });

  afterAll(async () => {
    await purgeTestRows({ userIds: created });
  });

  const hit = (ip: string, cookie?: string) => {
    const req = request(app).get(PROBE).set('X-Forwarded-For', ip);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('two signed-in users behind one IP do not share a budget', async () => {
    const ip = '203.0.113.10';
    for (let i = 0; i < LIMIT; i++) {
      expect((await hit(ip, cookies[0])).status, `request ${i + 1}`).not.toBe(429);
    }
    expect((await hit(ip, cookies[0])).status).toBe(429);
    expect((await hit(ip, cookies[1])).status).not.toBe(429);
  }, 60000);

  it('anonymous requests are still limited per IP', async () => {
    const ip = '203.0.113.20';
    for (let i = 0; i < LIMIT; i++) {
      expect((await hit(ip)).status, `request ${i + 1}`).not.toBe(429);
    }
    expect((await hit(ip)).status).toBe(429);
    expect((await hit('203.0.113.21')).status).not.toBe(429);
  }, 60000);
});
