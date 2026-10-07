/**
 * Personal measurements (organization_id IS NULL, athlete self-entry) belong to
 * their athlete only. Another signed-in user must not read them, or their
 * mediaUrl, through GET /api/measurements (filterMode=personal|all) or
 * GET /api/measurements/:id. Site admins keep cross-organization access.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { measurements, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'PersonalIso123!';
const CLIP = 'https://clips.example.com/personal-only-SENTINEL';

describe('personal measurements are visible only to their athlete', () => {
  let app: Express;
  let owner: any;
  let other: any;
  let admin: any;
  let ownerRowId: string;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    const mk = async (tag: string, extra: Record<string, unknown> = {}) =>
      (
        await db
          .insert(users)
          .values({
            username: `piso-${tag}-${suffix}`,
            emails: [`piso-${tag}-${suffix}@test.com`],
            password: hashed,
            firstName: 'P',
            lastName: tag,
            fullName: `P ${tag}`,
            ...extra,
          } as any)
          .returning()
      )[0];
    owner = await mk('owner');
    other = await mk('other');
    admin = await mk('admin', { isSiteAdmin: true });

    const [row] = await db
      .insert(measurements)
      .values({
        userId: owner.id,
        submittedBy: owner.id,
        date: '2026-02-01',
        metric: 'VERTICAL_JUMP',
        value: '30',
        units: 'in',
        age: 18,
        isVerified: false,
        organizationId: null,
        mediaUrl: CLIP,
      } as any)
      .returning();
    ownerRowId = row.id;

    for (const [name, u] of Object.entries({ owner, other, admin })) {
      const login = await request(app).post('/api/auth/login').send({ username: u.username, password: PASSWORD });
      cookies[name] = login.headers['set-cookie'][0];
    }
  });

  afterAll(async () => {
    const ids = [owner.id, other.id, admin.id];
    await db.delete(measurements).where(inArray(measurements.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  });

  const list = (who: string, query: Record<string, string>) =>
    request(app).get('/api/measurements').query({ includeUnverified: 'true', ...query }).set('Cookie', cookies[who]);

  it.each([{ filterMode: 'personal' }, { filterMode: 'all' }])(
    'another user does not get the personal rows (%o)',
    async (query) => {
      const res = await list('other', query);
      expect(res.status).toBe(200);
      expect(res.body.map((m: any) => m.id)).not.toContain(ownerRowId);
      expect(JSON.stringify(res.body)).not.toContain(CLIP);
    },
  );

  it.each([{ filterMode: 'personal' }, { filterMode: 'all' }])(
    'the owner still gets their personal rows with the clip (%o)',
    async (query) => {
      const res = await list('owner', query);
      expect(res.status).toBe(200);
      const row = res.body.find((m: any) => m.id === ownerRowId);
      expect(row?.mediaUrl).toBe(CLIP);
    },
  );

  it('a site admin still gets personal rows', async () => {
    const res = await list('admin', { filterMode: 'personal', userId: owner.id });
    expect(res.status).toBe(200);
    expect(res.body.map((m: any) => m.id)).toContain(ownerRowId);
  });

  it('GET /api/measurements/:id: another user is denied a personal row', async () => {
    const res = await request(app).get(`/api/measurements/${ownerRowId}`).set('Cookie', cookies.other);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(CLIP);
  });

  it('GET /api/measurements/:id: the owner and a site admin can read it', async () => {
    for (const who of ['owner', 'admin']) {
      const res = await request(app).get(`/api/measurements/${ownerRowId}`).set('Cookie', cookies[who]);
      expect(res.status, who).toBe(200);
      expect(res.body.mediaUrl).toBe(CLIP);
    }
  });
});
