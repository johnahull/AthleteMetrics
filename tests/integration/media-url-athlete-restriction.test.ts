/**
 * AM-FEAT-015 R1: athletes may not attach clips. Only coach, org_admin and
 * site_admin may set a non-empty mediaUrl on a measurement; any other role
 * (athlete, parent, guest, or no role at all) is rejected (HTTP 403 on the
 * measurement routes). Every role may still omit or clear mediaUrl.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true'; // a 429 must not mask the 403s asserted here

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { EventMeasurementsService } from '../../packages/api/services/event-measurements-service';
import { storage } from '../../packages/api/storage';
import { events, measurements, organizations, teams, userOrganizations, userTeams, users } from '@shared/schema';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const CLIP = 'https://clips.example.com/video/athlete-attempt';
const ATHLETE_CLIP_DENIED = /only coaches and admins can attach clips/i;
const PASSWORD = 'ClipAthlete123!';

describe('Athletes cannot attach clips (R1)', () => {
  const service = new MeasurementService();
  let app: Express;
  let orgId: string;
  let teamId: string;
  let athlete: any;
  let coach: any;
  let parent: any;
  let guest: any;
  let athleteCookie: string;
  let coachCookie: string;
  let parentCookie: string;
  let guestCookie: string;

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
    parent = await mk('parent');
    guest = await mk('guest');
    await db.insert(userOrganizations).values([
      { userId: athlete.id, organizationId: orgId, role: 'athlete' },
      { userId: coach.id, organizationId: orgId, role: 'coach' },
      { userId: guest.id, organizationId: orgId, role: 'guest' },
    ] as any);
    await db.insert(userTeams).values({ userId: athlete.id, teamId, joinedAt: new Date('2020-01-01'), isActive: true });
    // A user with no organization and an active parent link logs in with role 'parent'
    await db.insert(parentAthleteLinks).values({
      parentEmail: parent.emails[0],
      parentUserId: parent.id,
      athleteUserId: athlete.id,
      isActive: true,
    });

    const loginAs = async (u: any) =>
      (await request(app).post('/api/auth/login').send({ username: u.username, password: PASSWORD })).headers['set-cookie'][0];
    athleteCookie = await loginAs(athlete);
    coachCookie = await loginAs(coach);
    parentCookie = await loginAs(parent);
    guestCookie = await loginAs(guest);
  });

  afterEach(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athlete.id));
  });

  afterAll(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athlete.id));
    await db.delete(events).where(eq(events.organizationId, orgId));
    await db.delete(parentAthleteLinks).where(eq(parentAthleteLinks.parentUserId, parent.id));
    await db.delete(userTeams).where(eq(userTeams.teamId, teamId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(teams).where(eq(teams.id, teamId));
    await db.delete(users).where(inArray(users.id, [athlete.id, coach.id, parent.id, guest.id]));
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

    it('create: only coach, org_admin and site_admin may attach a clip (allowlist)', async () => {
      for (const role of ['parent', 'guest', 'viewer', '']) {
        await expect(createAs(role, CLIP)).rejects.toThrow(ATHLETE_CLIP_DENIED);
      }
      expect(await athleteRows()).toHaveLength(0);
      for (const role of ['org_admin', 'site_admin']) {
        expect((await createAs(role, CLIP)).mediaUrl).toBe(CLIP);
      }
    });

    it('create: any role may omit or clear the clip', async () => {
      for (const role of ['parent', 'guest']) {
        expect((await createAs(role, null)).mediaUrl).toBeNull();
        // The route's Zod schema turns '' into null; the service just must not reject it
        expect((await createAs(role, '')).mediaUrl).toBeFalsy();
      }
    });

    // The batch route admits only coaches and admins (canUseBatchEndpoint), so the
    // service is called directly to prove R1 holds for every other role too.
    it.each([
      ['athlete', () => athlete],
      ['parent', () => parent],
      ['guest', () => guest],
    ])('batch: rejects every clip item submitted by a %s', async (role, who) => {
      const result = await service.createMeasurementsBatch(
        [{ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', mediaUrl: CLIP } as any],
        { id: who().id, role },
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

    it('update: rejects parent, guest and an undefined role setting a clip (fails closed)', async () => {
      const m = await createAs('coach');
      for (const role of ['parent', 'guest', undefined]) {
        await expect(service.updateMeasurement(m.id, { mediaUrl: CLIP }, undefined, role)).rejects.toThrow(
          ATHLETE_CLIP_DENIED
        );
      }
      const [row] = await athleteRows();
      expect(row.mediaUrl).toBeNull();
    });

    it('update: an undefined role may still clear a clip or leave it untouched', async () => {
      const m = await createAs('coach', CLIP);
      expect((await service.updateMeasurement(m.id, { value: 31 }, undefined, undefined)).mediaUrl).toBe(CLIP);
      expect((await service.updateMeasurement(m.id, { mediaUrl: null }, undefined, undefined)).mediaUrl).toBeNull();
    });

    it('update: org_admin and site_admin may set a clip', async () => {
      const m = await createAs('coach');
      expect((await service.updateMeasurement(m.id, { mediaUrl: CLIP }, undefined, 'org_admin')).mediaUrl).toBe(CLIP);
      expect((await service.updateMeasurement(m.id, { mediaUrl: `${CLIP}-2` }, undefined, 'site_admin')).mediaUrl).toBe(`${CLIP}-2`);
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

    it.each([
      ['parent', () => parentCookie],
      ['guest', () => guestCookie],
    ])('POST /api/measurements: 403 for a %s clip and nothing is written', async (_role, cookie) => {
      const res = await request(app)
        .post('/api/measurements')
        .set('Cookie', cookie())
        .send({ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', mediaUrl: CLIP });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(ATHLETE_CLIP_DENIED);
      expect(await athleteRows()).toHaveLength(0);
    });

    it('POST /api/measurements: a coach clip still succeeds', async () => {
      const res = await request(app)
        .post('/api/measurements')
        .set('Cookie', coachCookie)
        .send({ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', mediaUrl: CLIP });
      expect(res.status).toBe(201);
      expect(res.body.mediaUrl).toBe(CLIP);
    });

    it.each([
      ['parent', () => parent, () => parentCookie],
      ['guest', () => guest, () => guestCookie],
    ])('PUT /api/measurements/:id: 403 when a %s adds a clip to their own entry', async (role, who, cookie) => {
      const own = await service.createMeasurement(
        { userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', teamId } as any,
        who().id,
        role
      );
      const res = await request(app).put(`/api/measurements/${own.id}`).set('Cookie', cookie()).send({ mediaUrl: CLIP });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(ATHLETE_CLIP_DENIED);
      expect((await athleteRows())[0].mediaUrl).toBeNull();
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

    it('POST /api/measurements/batch: athletes are denied by the batch endpoint gate', async () => {
      const res = await request(app)
        .post('/api/measurements/batch')
        .set('Cookie', athleteCookie)
        .send({ measurements: [{ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', mediaUrl: CLIP }] });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Athletes cannot use batch measurement entry');
      expect(await athleteRows()).toHaveLength(0);
    });

    it('POST /api/measurements/batch: a coach batch with a clip still succeeds', async () => {
      const res = await request(app)
        .post('/api/measurements/batch')
        .set('Cookie', coachCookie)
        .send({ measurements: [{ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', mediaUrl: CLIP }] });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect((await athleteRows())[0].mediaUrl).toBe(CLIP);
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
        // Denied by the event-manager gate (coach/org_admin of the event's org), not a later check
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Access denied' });
        expect(await athleteRows()).toHaveLength(0);
      });

      it('POST /api/events/:eventId/measurements/bulk: 403 for athlete clips', async () => {
        const res = await request(app)
          .post(`/api/events/${eventId}/measurements/bulk`)
          .set('Cookie', athleteCookie)
          .send({ measurements: [{ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-01-15', mediaUrl: CLIP }] });
        // Denied by the event-manager gate (coach/org_admin of the event's org), not a later check
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Access denied' });
        expect(await athleteRows()).toHaveLength(0);
      });
    });
  });

  describe('EventMeasurementsService enforces the clip allowlist itself', () => {
    const eventService = new EventMeasurementsService(storage);
    let eventId: string;
    const input = (mediaUrl?: string | null) => ({
      userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: new Date('2026-01-15'), mediaUrl,
    });

    beforeAll(async () => {
      const [event] = await db
        .insert(events)
        .values({ organizationId: orgId, name: 'Clip Service Event', startDate: new Date('2026-01-15') } as any)
        .returning({ id: events.id });
      eventId = event.id;
    });

    it.each(['athlete', 'parent', 'guest', undefined])('createEventMeasurement: rejects a clip for role %s', async (role) => {
      await expect(eventService.createEventMeasurement(eventId, input(CLIP), coach.id, role)).rejects.toThrow(ATHLETE_CLIP_DENIED);
      expect(await athleteRows()).toHaveLength(0);
    });

    it('createEventMeasurement: a coach clip is stored; no clip needs no role', async () => {
      expect((await eventService.createEventMeasurement(eventId, input(CLIP), coach.id, 'coach')).mediaUrl).toBe(CLIP);
      expect((await eventService.createEventMeasurement(eventId, input(null), coach.id, 'athlete')).mediaUrl).toBeNull();
    });

    it.each(['athlete', 'parent', 'guest'])('createEventMeasurementsBulk: a %s clip is a per-item error and nothing is written', async (role) => {
      const result = await eventService.createEventMeasurementsBulk(eventId, [input(CLIP)], coach.id, role);
      expect(result.created).toHaveLength(0);
      expect(result.errors).toEqual([{ index: 0, error: expect.stringMatching(ATHLETE_CLIP_DENIED) }]);
      expect(await athleteRows()).toHaveLength(0);
    });

    it('createEventMeasurementsBulk: a coach clip is stored', async () => {
      const result = await eventService.createEventMeasurementsBulk(eventId, [input(CLIP)], coach.id, 'coach');
      expect(result.errors).toEqual([]);
      expect(result.created[0].mediaUrl).toBe(CLIP);
    });
  });
});
