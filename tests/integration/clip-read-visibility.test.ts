/**
 * Clip (mediaUrl) read visibility (AM-FEAT-015, decided rule):
 * inside organization-scoped views a measurement's mediaUrl is returned only to
 * coaches / org admins of the row's organization, site admins, and the athlete
 * who owns the row. A teammate athlete, a parent or any other role gets the row
 * without mediaUrl.
 *
 * Covers GET /api/measurements (org list and filterMode=all history),
 * GET /api/measurements/:id and GET /api/events/:eventId/measurements.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { events, measurements, organizations, userOrganizations, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'ClipVisibility123!';
const CLIP = `https://clips.example.com/clip-visibility-SENTINEL-${Date.now()}`;
const EVENT_CLIP = `https://clips.example.com/clip-visibility-event-SENTINEL-${Date.now()}`;

type Who = 'owner' | 'teammate' | 'coach' | 'orgAdmin' | 'siteAdmin' | 'parent';

describe('clip (mediaUrl) read visibility', () => {
  let app: Express;
  const u = {} as Record<Who, any>;
  const cookies = {} as Record<Who, string>;
  let orgId: string;
  let eventId: string;
  let rowId: string;
  let eventRowId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    const [org] = await db.insert(organizations).values({ name: `ClipVis Org ${suffix}` }).returning();
    orgId = org.id;

    const roles: Record<Who, string | null> = {
      owner: 'athlete',
      teammate: 'athlete',
      coach: 'coach',
      orgAdmin: 'org_admin',
      siteAdmin: null,
      parent: 'parent',
    };
    for (const [who, role] of Object.entries(roles) as Array<[Who, string | null]>) {
      [u[who]] = await db
        .insert(users)
        .values({
          username: `clipvis-${who}-${suffix}`,
          emails: [`clipvis-${who}-${suffix}@test.com`],
          password: hashed,
          firstName: 'Clip',
          lastName: who,
          fullName: `Clip ${who}`,
          ...(who === 'siteAdmin' ? { isSiteAdmin: true } : {}),
        } as any)
        .returning();
      if (role) {
        await db.insert(userOrganizations).values({ userId: u[who].id, organizationId: orgId, role } as any);
      }
    }

    const [event] = await db
      .insert(events)
      .values({
        organizationId: orgId,
        name: `ClipVis Event ${suffix}`,
        startDate: new Date('2026-02-10T10:00:00Z'),
        resultsPublishedAt: new Date('2026-02-11T10:00:00Z'),
      } as any)
      .returning();
    eventId = event.id;

    const row = (extra: Record<string, unknown>) => ({
      userId: u.owner.id,
      submittedBy: u.coach.id,
      metric: 'VERTICAL_JUMP',
      value: '30',
      units: 'in',
      age: 18,
      isVerified: true,
      organizationId: orgId,
      ...extra,
    });
    [{ id: rowId }] = await db
      .insert(measurements)
      .values(row({ date: '2026-02-01', mediaUrl: CLIP }) as any)
      .returning({ id: measurements.id });
    [{ id: eventRowId }] = await db
      .insert(measurements)
      .values(row({ date: '2026-02-10', mediaUrl: EVENT_CLIP, eventId }) as any)
      .returning({ id: measurements.id });

    for (const who of Object.keys(roles) as Who[]) {
      const login = await request(app).post('/api/auth/login').send({ username: u[who].username, password: PASSWORD });
      expect(login.status, `login ${who}`).toBe(200);
      cookies[who] = login.headers['set-cookie'][0];
    }
  });

  afterAll(async () => {
    const ids = Object.values(u).map((x) => x.id);
    await db.delete(measurements).where(inArray(measurements.userId, ids));
    await db.delete(events).where(eq(events.id, eventId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, ids));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const ALLOWED: Who[] = ['owner', 'coach', 'orgAdmin', 'siteAdmin'];
  const DENIED: Who[] = ['teammate', 'parent'];

  const orgList = (who: Who) =>
    request(app)
      .get('/api/measurements')
      .query({ organizationId: orgId, athleteId: u.owner.id, includeUnverified: 'true' })
      .set('Cookie', cookies[who]);
  const allOrgsList = (who: Who) =>
    request(app)
      .get('/api/measurements')
      .query({ filterMode: 'all', orgIds: orgId, athleteId: u.owner.id, includeUnverified: 'true' })
      .set('Cookie', cookies[who]);

  describe.each([
    ['GET /api/measurements (organization list)', orgList],
    ['GET /api/measurements?filterMode=all (all-orgs history)', allOrgsList],
  ] as const)('%s', (_name, list) => {
    it.each(ALLOWED)('%s gets the row with its clip', async (who) => {
      const res = await list(who);
      expect(res.status).toBe(200);
      const row = res.body.find((m: any) => m.id === rowId);
      expect(row?.mediaUrl).toBe(CLIP);
    });

    it('a teammate athlete gets the row without its clip', async () => {
      const res = await list('teammate');
      expect(res.status).toBe(200);
      const row = res.body.find((m: any) => m.id === rowId);
      expect(row).toBeDefined();
      expect(row).not.toHaveProperty('mediaUrl');
      expect(JSON.stringify(res.body)).not.toContain(CLIP);
    });

    it('a parent never receives the clip', async () => {
      const res = await list('parent');
      expect(JSON.stringify(res.body)).not.toContain(CLIP);
    });
  });

  describe('GET /api/measurements/:id', () => {
    const one = (who: Who) => request(app).get(`/api/measurements/${rowId}`).set('Cookie', cookies[who]);

    it.each(ALLOWED)('%s gets the clip', async (who) => {
      const res = await one(who);
      expect(res.status).toBe(200);
      expect(res.body.mediaUrl).toBe(CLIP);
    });

    it('a teammate athlete gets the row without its clip', async () => {
      const res = await one('teammate');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(rowId);
      expect(res.body).not.toHaveProperty('mediaUrl');
    });

    it('a parent never receives the clip', async () => {
      const res = await one('parent');
      expect(JSON.stringify(res.body)).not.toContain(CLIP);
    });
  });

  describe('GET /api/events/:eventId/measurements', () => {
    const eventList = (who: Who, userId = u.owner.id) =>
      request(app).get(`/api/events/${eventId}/measurements`).query({ userId }).set('Cookie', cookies[who]);

    it.each(ALLOWED)('%s gets the clip (managers, and the owner after publication)', async (who) => {
      const res = await eventList(who);
      expect(res.status).toBe(200);
      const row = res.body.find((m: any) => m.id === eventRowId);
      expect(row?.mediaUrl).toBe(EVENT_CLIP);
    });

    it.each(DENIED)('%s never receives the clip', async (who) => {
      for (const userId of [u.owner.id, u[who].id]) {
        const res = await eventList(who, userId);
        expect(JSON.stringify(res.body)).not.toContain(EVENT_CLIP);
      }
    });
  });
});
