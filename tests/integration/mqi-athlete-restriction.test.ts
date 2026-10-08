/**
 * AM-FEAT-015 R2: athletes may not enter Movement Quality (MQ) scores.
 * MQ scores are coach-entered rubric values, so only coach, org_admin and
 * site_admin may create/update/batch/import an MQ metric; every other role
 * (athlete, parent, guest, or no role at all) is rejected (HTTP 403 on the
 * measurement routes). Athletes keep entering their other (non-MQ) measurements.
 *
 * Also resolves open item M4 (unverified athlete MQ scores never produce a
 * total): athletes cannot create MQ scores at all, so no unverified athlete
 * score can sit in a pattern set.
 * Re-applies migration 0146 in beforeAll.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { events, measurements, organizations, teams, userOrganizations, userTeams, users } from '@shared/schema';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MQ_PATTERNS = ['MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE', 'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP'];
const ATHLETE_MQ_DENIED = /only coaches and admins can enter movement quality/i;
const PASSWORD = 'MqAthlete123!';

describe('Athletes cannot enter Movement Quality scores (R2)', () => {
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
    const upSql = fs.readFileSync(path.resolve(__dirname, '../../migrations/0146_seed_mqi_metrics.sql'), 'utf-8');
    await db.execute(sql.raw(upSql));

    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `MQ Athlete Org ${suffix}` }).returning();
    orgId = org.id;
    const [team] = await db
      .insert(teams)
      .values({ name: `MQ Athlete Team ${suffix}`, organizationId: orgId, level: 'College' })
      .returning();
    teamId = team.id;
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `mq-ath-${tag}-${suffix}`,
            emails: [`mq-ath-${tag}-${suffix}@test.com`],
            password: hashed,
            firstName: 'Mq',
            lastName: `Restrict${tag}`,
            fullName: `Mq Restrict${tag}`,
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

  const athleteRows = (metric?: string) =>
    db
      .select()
      .from(measurements)
      .where(metric ? and(eq(measurements.userId, athlete.id), eq(measurements.metric, metric)) : eq(measurements.userId, athlete.id));

  describe('MeasurementService', () => {
    const createAs = (role: string, metric: string, value: number) =>
      service.createMeasurement(
        { userId: athlete.id, metric, value, date: '2026-03-10' } as any,
        role === 'athlete' ? athlete.id : coach.id,
        role
      );

    it('create: rejects an MQ score from an athlete and writes nothing', async () => {
      await expect(createAs('athlete', 'MQ_JUMP', 2)).rejects.toThrow(ATHLETE_MQ_DENIED);
      expect(await athleteRows()).toHaveLength(0);
    });

    it('create: still accepts an MQ score from a coach', async () => {
      const m = await createAs('coach', 'MQ_JUMP', 2);
      expect(Number(m.value)).toBe(2);
    });

    it('create: only coach, org_admin and site_admin may enter MQ scores (allowlist)', async () => {
      for (const role of ['parent', 'guest', 'viewer', '']) {
        await expect(
          service.createMeasurement({ userId: athlete.id, metric: 'MQ_JUMP', value: 2, date: '2026-03-10' } as any, coach.id, role)
        ).rejects.toThrow(ATHLETE_MQ_DENIED);
      }
      expect(await athleteRows()).toHaveLength(0);
      for (const role of ['coach', 'org_admin', 'site_admin']) {
        const m = await service.createMeasurement(
          { userId: athlete.id, metric: 'MQ_JUMP', value: 2, date: '2026-03-10' } as any,
          coach.id,
          role
        );
        expect(Number(m.value)).toBe(2);
        await db.delete(measurements).where(eq(measurements.id, m.id));
      }
    });

    it('create: still accepts a non-MQ measurement from an athlete', async () => {
      const m = await createAs('athlete', 'FLY10_TIME', 1.52);
      expect(Number(m.value)).toBe(1.52);
    });

    // The batch route admits only coaches and admins (canUseBatchEndpoint), so the
    // service is called directly to prove R2 holds for every other role too.
    it.each([
      ['athlete', () => athlete],
      ['parent', () => parent],
      ['guest', () => guest],
    ])('batch: rejects every MQ item submitted by a %s', async (role, who) => {
      const result = await service.createMeasurementsBatch(
        [
          { userId: athlete.id, metric: 'MQ_JUMP', value: 2, date: '2026-03-10' } as any,
          { userId: athlete.id, metric: 'MQ_DECEL', value: 1, date: '2026-03-10' } as any,
        ],
        { id: who().id, role },
        false
      );
      expect(result.created).toBe(0);
      expect(result.errors).toHaveLength(2);
      for (const e of result.errors) expect(e.message).toMatch(ATHLETE_MQ_DENIED);
      expect(await athleteRows()).toHaveLength(0);
    });

    it('update: rejects an athlete editing an MQ score', async () => {
      const m = await createAs('coach', 'MQ_JUMP', 2);
      await expect(service.updateMeasurement(m.id, { value: 3 }, undefined, 'athlete')).rejects.toThrow(ATHLETE_MQ_DENIED);
      const [row] = await athleteRows('MQ_JUMP');
      expect(Number(row.value)).toBe(2);
    });

    it('update: rejects an athlete switching a measurement onto an MQ metric', async () => {
      const m = await createAs('athlete', 'FLY10_TIME', 1.52);
      await expect(
        service.updateMeasurement(m.id, { metric: 'MQ_JUMP', value: 2 }, undefined, 'athlete')
      ).rejects.toThrow(ATHLETE_MQ_DENIED);
      expect(await athleteRows('MQ_JUMP')).toHaveLength(0);
    });

    it('update: rejects parent, guest and an undefined role editing an MQ score (fails closed)', async () => {
      const m = await createAs('coach', 'MQ_JUMP', 2);
      for (const role of ['parent', 'guest', undefined]) {
        await expect(service.updateMeasurement(m.id, { value: 3 }, undefined, role)).rejects.toThrow(ATHLETE_MQ_DENIED);
      }
      const [row] = await athleteRows('MQ_JUMP');
      expect(Number(row.value)).toBe(2);
    });

    it('update: org_admin and site_admin may edit an MQ score', async () => {
      const m = await createAs('coach', 'MQ_JUMP', 1);
      expect(Number((await service.updateMeasurement(m.id, { value: 2 }, undefined, 'org_admin')).value)).toBe(2);
      expect(Number((await service.updateMeasurement(m.id, { value: 3 }, undefined, 'site_admin')).value)).toBe(3);
    });

    it('update: still lets an athlete edit a non-MQ measurement and a coach edit an MQ score', async () => {
      const fly = await createAs('athlete', 'FLY10_TIME', 1.52);
      expect(Number((await service.updateMeasurement(fly.id, { value: 1.6 }, undefined, 'athlete')).value)).toBe(1.6);
      const mq = await createAs('coach', 'MQ_JUMP', 2);
      expect(Number((await service.updateMeasurement(mq.id, { value: 3 }, undefined, 'coach')).value)).toBe(3);
    });

    // M4: an MQI_TOTAL only sums verified scores, and athlete entries are unverified.
    // With R2 an athlete cannot create any MQ score, so a pattern set can never
    // contain an unverified athlete score and no trigger change is needed.
    it('M4: an athlete cannot create the pattern scores, so no unverified score can feed MQI_TOTAL', async () => {
      for (const metric of MQ_PATTERNS) {
        await expect(createAs('athlete', metric, 2)).rejects.toThrow(ATHLETE_MQ_DENIED);
      }
      expect(await athleteRows()).toHaveLength(0);
      expect(await athleteRows('MQI_TOTAL')).toHaveLength(0);
    });
  });

  describe('routes', () => {
    it('POST /api/measurements: 403 for an athlete MQ score', async () => {
      const res = await request(app)
        .post('/api/measurements')
        .set('Cookie', athleteCookie)
        .send({ userId: athlete.id, metric: 'MQ_JUMP', value: 2, date: '2026-03-10' });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(ATHLETE_MQ_DENIED);
      expect(await athleteRows()).toHaveLength(0);
    });

    it.each([
      ['parent', () => parentCookie],
      ['guest', () => guestCookie],
    ])('POST /api/measurements: 403 for a %s MQ score and nothing is written', async (_role, cookie) => {
      const res = await request(app)
        .post('/api/measurements')
        .set('Cookie', cookie())
        .send({ userId: athlete.id, metric: 'MQ_JUMP', value: 2, date: '2026-03-10' });
      expect(res.status).toBe(403);
      // parent and guest are now stopped by the writer-role allowlist before the MQ check (#515)
      expect(res.body.message).toMatch(/cannot create measurements/i);
      expect(await athleteRows()).toHaveLength(0);
    });

    it('POST /api/measurements: a coach MQ score still succeeds', async () => {
      const res = await request(app)
        .post('/api/measurements')
        .set('Cookie', coachCookie)
        .send({ userId: athlete.id, metric: 'MQ_JUMP', value: 2, date: '2026-03-10' });
      expect(res.status).toBe(201);
      expect(await athleteRows('MQ_JUMP')).toHaveLength(1);
    });

    it.each([
      ['parent', () => parent, () => parentCookie],
      ['guest', () => guest, () => guestCookie],
    ])('PUT /api/measurements/:id: 403 when a %s moves their own entry onto an MQ metric', async (role, who, cookie) => {
      const own = await service.createMeasurement(
        { userId: athlete.id, metric: 'FLY10_TIME', value: 1.52, date: '2026-03-10', teamId } as any,
        who().id,
        role
      );
      const res = await request(app)
        .put(`/api/measurements/${own.id}`)
        .set('Cookie', cookie())
        .send({ metric: 'MQ_JUMP', value: 2 });
      expect(res.status).toBe(403);
      // Issue #514: a parent or guest has no coach / athlete role in the row's organization, so the route refuses
      // the edit outright; the service's MQ allowlist is the second layer behind it.
      expect(res.body.message).toMatch(new RegExp(`${ATHLETE_MQ_DENIED.source}|you can only update measurements`, 'i'));
      const [row] = await athleteRows();
      expect(row.metric).toBe('FLY10_TIME');
    });

    it('POST /api/measurements: athlete non-MQ entry still succeeds', async () => {
      const res = await request(app)
        .post('/api/measurements')
        .set('Cookie', athleteCookie)
        .send({ userId: athlete.id, metric: 'FLY10_TIME', value: 1.52, date: '2026-03-10' });
      expect(res.status).toBe(201);
    });

    it('PUT /api/measurements/:id: 403 when an athlete moves their own entry onto an MQ metric', async () => {
      // Team context gives the entry the athlete's organization, which the PUT route requires.
      const own = await service.createMeasurement(
        { userId: athlete.id, metric: 'FLY10_TIME', value: 1.52, date: '2026-03-10', teamId } as any,
        athlete.id,
        'athlete'
      );
      const res = await request(app)
        .put(`/api/measurements/${own.id}`)
        .set('Cookie', athleteCookie)
        .send({ metric: 'MQ_JUMP', value: 2 });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(ATHLETE_MQ_DENIED);
      const [row] = await athleteRows();
      expect(row.metric).toBe('FLY10_TIME');
    });

    it('PUT /api/measurements/:id: 400 when a coach moves a measurement onto MQI_TOTAL', async () => {
      const own = await service.createMeasurement(
        { userId: athlete.id, metric: 'FLY10_TIME', value: 1.52, date: '2026-03-10', teamId } as any,
        coach.id,
        'coach'
      );
      const res = await request(app)
        .put(`/api/measurements/${own.id}`)
        .set('Cookie', coachCookie)
        .send({ metric: 'MQI_TOTAL', value: 12 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/calculated automatically/);
      const [row] = await athleteRows();
      expect(row.metric).toBe('FLY10_TIME');
    });

    it('PUT /api/measurements/:id: 400 when a coach edits the value of a calculated MQI_TOTAL', async () => {
      for (const metric of MQ_PATTERNS) {
        await service.createMeasurement({ userId: athlete.id, metric, value: 2, date: '2026-03-10' } as any, coach.id, 'coach');
      }
      const [total] = await athleteRows('MQI_TOTAL');
      expect(Number(total.value)).toBe(16);
      const res = await request(app)
        .put(`/api/measurements/${total.id}`)
        .set('Cookie', coachCookie)
        .send({ value: 20 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/calculated automatically/);
      const [after] = await athleteRows('MQI_TOTAL');
      expect(Number(after.value)).toBe(16);
    });

    it('POST /api/measurements/batch: athletes are denied by the batch endpoint gate', async () => {
      const res = await request(app)
        .post('/api/measurements/batch')
        .set('Cookie', athleteCookie)
        .send({ measurements: [{ userId: athlete.id, metric: 'MQ_JUMP', value: 2, date: '2026-03-10' }] });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Athletes cannot use batch measurement entry');
      expect(await athleteRows()).toHaveLength(0);
    });

    it('POST /api/measurements/batch: a coach batch with MQ scores still succeeds', async () => {
      const res = await request(app)
        .post('/api/measurements/batch')
        .set('Cookie', coachCookie)
        .send({ measurements: [{ userId: athlete.id, metric: 'MQ_JUMP', value: 2, date: '2026-03-10' }] });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(await athleteRows('MQ_JUMP')).toHaveLength(1);
    });

    it('POST /api/import/measurements: an athlete MQ row is rejected and nothing is written', async () => {
      const csv = [
        'firstName,lastName,teamName,date,metric,value',
        `Mq,Restrictathlete,MQ Athlete Team,2026-03-10,MQ_JUMP,2`,
      ].join('\n');
      const res = await request(app)
        .post('/api/import/measurements')
        .set('Cookie', athleteCookie)
        .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'match_only' }))
        .attach('file', Buffer.from(csv), 'measurements.csv');
      // Athletes are now rejected from measurement import outright (#516)
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/your role cannot import measurement data/i);
      expect(await athleteRows()).toHaveLength(0);
    });

    describe('event measurement routes (canManageEventMeasurements)', () => {
      let eventId: string;

      beforeAll(async () => {
        const [event] = await db
          .insert(events)
          .values({ organizationId: orgId, name: 'MQ Athlete Event', startDate: new Date('2026-03-10') } as any)
          .returning({ id: events.id });
        eventId = event.id;
      });

      it('POST /api/events/:eventId/measurements: 403 for an athlete MQ score', async () => {
        const res = await request(app)
          .post(`/api/events/${eventId}/measurements`)
          .set('Cookie', athleteCookie)
          .send({ userId: athlete.id, metric: 'MQ_JUMP', value: 2, date: '2026-03-10' });
        // Denied by the event-manager gate (coach/org_admin of the event's org), not a later check
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Access denied' });
        expect(await athleteRows()).toHaveLength(0);
      });

      it('POST /api/events/:eventId/measurements: 400 (not 500) for an out-of-range MQ score from a coach', async () => {
        const res = await request(app)
          .post(`/api/events/${eventId}/measurements`)
          .set('Cookie', coachCookie)
          .send({ userId: athlete.id, metric: 'MQ_JUMP', value: 4, date: '2026-03-10' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/at most 3/);
        expect(await athleteRows()).toHaveLength(0);
      });

      it('POST /api/events/:eventId/measurements: 400 for a manual MQI_TOTAL from a coach', async () => {
        const res = await request(app)
          .post(`/api/events/${eventId}/measurements`)
          .set('Cookie', coachCookie)
          .send({ userId: athlete.id, metric: 'MQI_TOTAL', value: 12, date: '2026-03-10' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/calculated automatically/);
        expect(await athleteRows()).toHaveLength(0);
      });

      it('POST /api/events/:eventId/measurements/bulk: 403 for athlete MQ scores', async () => {
        const res = await request(app)
          .post(`/api/events/${eventId}/measurements/bulk`)
          .set('Cookie', athleteCookie)
          .send({ measurements: [{ userId: athlete.id, metric: 'MQ_JUMP', value: 2, date: '2026-03-10' }] });
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Access denied' });
        expect(await athleteRows()).toHaveLength(0);
      });
    });
  });
});
