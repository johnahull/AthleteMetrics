/**
 * AM-FEAT-015 R1: athletes may not attach clips. Any write by an athlete-role
 * user that sets a non-empty mediaUrl on a measurement is rejected (HTTP 403 on
 * the measurement routes). Athletes may still omit or clear mediaUrl, and
 * coaches/admins are unaffected.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { events, measurements, organizations, teams, userOrganizations, userTeams, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const CLIP = 'https://clips.example.com/video/athlete-attempt';
const ATHLETE_CLIP_DENIED = /athletes cannot attach/i;
const PASSWORD = 'ClipAthlete123!';

describe('Athletes cannot attach clips (R1)', () => {
  const service = new MeasurementService();
  let app: Express;
  let orgId: string;
  let teamId: string;
  let athlete: any;
  let coach: any;
  let athleteCookie: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `Clip Athlete Org ${suffix}` }).returning();
    orgId = org.id;
    const [team] = await db
      .insert(teams)
      .values({ name: `Clip Athlete Team ${suffix}`, organizationId: orgId, level: 'College' })
      .returning();
    teamId = team.id;
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `clip-ath-${tag}-${suffix}`,
            emails: [`clip-ath-${tag}-${suffix}@test.com`],
            password: hashed,
            firstName: 'Clip',
            lastName: tag,
            fullName: `Clip ${tag}`,
            birthDate: '2008-01-01',
            birthYear: 2008,
          } as any)
          .returning()
      )[0];
    athlete = await mk('athlete');
    coach = await mk('coach');
    await db.insert(userOrganizations).values([
      { userId: athlete.id, organizationId: orgId, role: 'athlete' },
      { userId: coach.id, organizationId: orgId, role: 'coach' },
    ] as any);
    await db.insert(userTeams).values({ userId: athlete.id, teamId, joinedAt: new Date('2020-01-01'), isActive: true });

    const login = await request(app).post('/api/auth/login').send({ username: athlete.username, password: PASSWORD });
    athleteCookie = login.headers['set-cookie'][0];
  });

  afterEach(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athlete.id));
  });

  afterAll(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athlete.id));
    await db.delete(events).where(eq(events.organizationId, orgId));
    await db.delete(userTeams).where(eq(userTeams.teamId, teamId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(teams).where(eq(teams.id, teamId));
    await db.delete(users).where(inArray(users.id, [athlete.id, coach.id]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const athleteRows = () => db.select().from(measurements).where(eq(measurements.userId, athlete.id));

  // Team context gives the entry the athlete's organization, which the PUT route requires.
  const createAs = (role: string, mediaUrl?: string | null) =>
    service.createMeasurement(
      { userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', teamId, mediaUrl } as any,
      role === 'athlete' ? athlete.id : coach.id,
      role
    );

  describe('MeasurementService', () => {
    it('create: rejects a clip from an athlete and writes nothing', async () => {
      await expect(createAs('athlete', CLIP)).rejects.toThrow(ATHLETE_CLIP_DENIED);
      expect(await athleteRows()).toHaveLength(0);
    });

    it('create: an athlete without a clip (omitted or null) is accepted', async () => {
      expect((await createAs('athlete')).mediaUrl).toBeNull();
      expect((await createAs('athlete', null)).mediaUrl).toBeNull();
    });

    it('create: a coach can still attach a clip', async () => {
      expect((await createAs('coach', CLIP)).mediaUrl).toBe(CLIP);
    });

    it('batch: rejects every clip item submitted by an athlete', async () => {
      const result = await service.createMeasurementsBatch(
        [{ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', mediaUrl: CLIP } as any],
        { id: athlete.id, role: 'athlete' },
        false
      );
      expect(result.created).toBe(0);
      expect(result.errors).toEqual([{ index: 0, message: expect.stringMatching(ATHLETE_CLIP_DENIED) }]);
      expect(await athleteRows()).toHaveLength(0);
    });

    it('update: rejects an athlete setting a clip, keeps the stored value', async () => {
      const m = await createAs('athlete');
      await expect(service.updateMeasurement(m.id, { mediaUrl: CLIP }, undefined, 'athlete')).rejects.toThrow(
        ATHLETE_CLIP_DENIED
      );
      const [row] = await athleteRows();
      expect(row.mediaUrl).toBeNull();
    });

    it('update: an athlete may clear a clip; a coach may set one', async () => {
      const m = await createAs('coach', CLIP);
      expect((await service.updateMeasurement(m.id, { mediaUrl: null }, undefined, 'athlete')).mediaUrl).toBeNull();
      expect((await service.updateMeasurement(m.id, { mediaUrl: CLIP }, undefined, 'coach')).mediaUrl).toBe(CLIP);
    });
  });

  describe('routes', () => {
    it('POST /api/measurements: 403 for an athlete clip', async () => {
      const res = await request(app)
        .post('/api/measurements')
        .set('Cookie', athleteCookie)
        .send({ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', mediaUrl: CLIP });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(ATHLETE_CLIP_DENIED);
      expect(await athleteRows()).toHaveLength(0);
    });

    it('POST /api/measurements: an athlete sending an empty mediaUrl is accepted', async () => {
      const res = await request(app)
        .post('/api/measurements')
        .set('Cookie', athleteCookie)
        .send({ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', mediaUrl: '' });
      expect(res.status).toBe(201);
      expect(res.body.mediaUrl).toBeNull();
    });

    it('PUT /api/measurements/:id: 403 when an athlete adds a clip; clearing is allowed', async () => {
      const own = await createAs('athlete');
      const denied = await request(app)
        .put(`/api/measurements/${own.id}`)
        .set('Cookie', athleteCookie)
        .send({ mediaUrl: CLIP });
      expect(denied.status).toBe(403);
      expect(denied.body.message).toMatch(ATHLETE_CLIP_DENIED);
      expect((await athleteRows())[0].mediaUrl).toBeNull();

      const cleared = await request(app)
        .put(`/api/measurements/${own.id}`)
        .set('Cookie', athleteCookie)
        .send({ mediaUrl: null, value: 31 });
      expect(cleared.status).toBe(200);
      expect(cleared.body.mediaUrl).toBeNull();
    });

    it('POST /api/measurements/batch: athletes are denied', async () => {
      const res = await request(app)
        .post('/api/measurements/batch')
        .set('Cookie', athleteCookie)
        .send({ measurements: [{ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', mediaUrl: CLIP }] });
      expect(res.status).toBe(403);
      expect(await athleteRows()).toHaveLength(0);
    });

    describe('event measurement routes (canManageEventMeasurements)', () => {
      let eventId: string;

      beforeAll(async () => {
        const [event] = await db
          .insert(events)
          .values({ organizationId: orgId, name: 'Clip Athlete Event', startDate: new Date('2026-01-15') } as any)
          .returning({ id: events.id });
        eventId = event.id;
      });

      it('POST /api/events/:eventId/measurements: 403 for an athlete clip', async () => {
        const res = await request(app)
          .post(`/api/events/${eventId}/measurements`)
          .set('Cookie', athleteCookie)
          .send({ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', mediaUrl: CLIP });
        expect(res.status).toBe(403);
        expect(await athleteRows()).toHaveLength(0);
      });

      it('POST /api/events/:eventId/measurements/bulk: 403 for athlete clips', async () => {
        const res = await request(app)
          .post(`/api/events/${eventId}/measurements/bulk`)
          .set('Cookie', athleteCookie)
          .send({ measurements: [{ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', mediaUrl: CLIP }] });
        expect(res.status).toBe(403);
        expect(await athleteRows()).toHaveLength(0);
      });
    });
  });
});
