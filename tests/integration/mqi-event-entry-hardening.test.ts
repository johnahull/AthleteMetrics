/**
 * AM-FEAT-015: hardening of the event measurement write path (review findings).
 *
 *  - no athlete notifications / achievements before results are published
 *  - audit trail (verifiedBy) and event organization on event writes
 *  - MQ scores always use the event's date (server-side), not the client's
 *  - typed error mapping (400 / 403 / generic 500)
 *  - one MQ row per (athlete, metric, event) even under concurrent writes
 *  - atomic per-athlete Movement Quality save (PUT .../movement-quality)
 *  - a realistic 25-athlete session is not rate limited
 *
 * Uses the real RATE_LIMITS (no mock), so the session test exercises the
 * production limiter configuration.
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET =
  'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { and, eq, inArray, sql } from 'drizzle-orm';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

vi.mock('../../packages/api/services/measurement-notification-service', () => ({
  notifyNewMeasurement: vi.fn().mockResolvedValue(undefined),
}));

import { registerRoutes } from '../../packages/api/routes';
import { db } from '../../packages/api/db';
import { notifyNewMeasurement } from '../../packages/api/services/measurement-notification-service';
import { AchievementService } from '../../packages/api/services/achievement-service';
import {
  organizations,
  users,
  userOrganizations,
  teams,
  userTeams,
  measurements,
  events,
  siteMetrics,
} from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

const PASSWORD = 'TestCoach123!';
const PATTERNS = [
  'MQ_LIN_ACCEL',
  'MQ_MAX_VELO',
  'MQ_DECEL',
  'MQ_SHUFFLE',
  'MQ_LATRUN',
  'MQ_HIPTURN',
  'MQ_BACKPEDAL',
  'MQ_JUMP',
];
const PAIRED = `TEST_EVT_PAIRED_${Date.now()}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let app: Express;
const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
let orgA: any;
let orgB: any;
let teamA: any;
let coachA: any;
let coachB: any;
let coachSession: any;
let athlete: any;
let teamlessAthlete: any;
let coachACookie: string;
let coachBCookie: string;
const eventIds: string[] = [];
const extraUserIds: string[] = [];
let day = 0;

async function login(username: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

async function mkUser(tag: string, birthDate?: string) {
  const [u] = await db
    .insert(users)
    .values({
      username: `mqh_${tag}_${suffix}`,
      emails: [`mqh_${tag}_${suffix}@test.com`],
      password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
      firstName: tag,
      lastName: 'Test',
      fullName: `${tag} Test`,
      birthDate,
    } as any)
    .returning();
  return u;
}

/** Each event gets its own calendar day so totals never collide across tests */
async function mkEvent(opts: { start?: string; frozen?: boolean; published?: boolean } = {}) {
  day += 1;
  const start = opts.start ?? `2026-05-${String(day).padStart(2, '0')}T10:00:00Z`;
  const [e] = await db
    .insert(events)
    .values({
      name: `MQH Event ${suffix} ${day}`,
      organizationId: orgA.id,
      startDate: new Date(start),
      isFrozen: opts.frozen ?? false,
      resultsPublishedAt: opts.published ? new Date() : null,
      createdBy: coachA.id,
    } as any)
    .returning();
  eventIds.push(e.id);
  return e;
}

const eventDay = (e: any) => new Date(e.startDate).toISOString().split('T')[0];

const rowsFor = (userId: string, metric: string, eventId?: string) =>
  db
    .select()
    .from(measurements)
    .where(
      and(
        eq(measurements.userId, userId),
        eq(measurements.metric, metric),
        ...(eventId ? [eq(measurements.eventId, eventId)] : []),
      ),
    );

const single = (eventId: string, body: Record<string, unknown>, cookie = coachACookie) =>
  request(app).post(`/api/events/${eventId}/measurements`).set('Cookie', cookie).send(body);

const saveMq = (eventId: string, userId: string, body: Record<string, unknown>, cookie = coachACookie) =>
  request(app)
    .put(`/api/events/${eventId}/athletes/${userId}/movement-quality`)
    .set('Cookie', cookie)
    .send(body);

beforeAll(async () => {
  const seed = fs.readFileSync(path.resolve(__dirname, '../../migrations/0146_seed_mqi_metrics.sql'), 'utf-8');
  await db.execute(sql.raw(seed));
  await db.execute(sql.raw(fs.readFileSync(path.resolve(__dirname, '../../migrations/0148_mqi_latest_event_selection.sql'), 'utf-8')));
  await db.insert(siteMetrics).values({
    code: PAIRED,
    label: 'TEST paired 1RM',
    category: 'strength',
    unit: 'lbs',
    metricType: 'higher_is_better',
    isActive: true,
    auxiliaryInputConfig: {
      label: 'Reps',
      unit: 'reps',
      validationMin: 1,
      validationMax: 12,
      required: true,
      computeFormula: 'load * (1 + reps / 30)',
      primaryInputLabel: 'Weight Lifted',
      primaryInputUnit: 'lbs',
    },
  } as any);

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  [orgA] = await db.insert(organizations).values({ name: `MQH Org A ${suffix}`, isActive: true }).returning();
  [orgB] = await db.insert(organizations).values({ name: `MQH Org B ${suffix}`, isActive: true }).returning();
  [teamA] = await db.insert(teams).values({ name: `MQH Team ${suffix}`, organizationId: orgA.id }).returning();
  coachA = await mkUser('coachA');
  coachB = await mkUser('coachB');
  coachSession = await mkUser('coachSession');
  athlete = await mkUser('athlete', '2008-01-01');
  teamlessAthlete = await mkUser('teamless', '2008-01-01');
  await db.insert(userOrganizations).values([
    { userId: coachA.id, organizationId: orgA.id, role: 'coach' },
    { userId: coachSession.id, organizationId: orgA.id, role: 'coach' },
    { userId: coachB.id, organizationId: orgB.id, role: 'coach' },
    { userId: athlete.id, organizationId: orgA.id, role: 'athlete' },
    { userId: teamlessAthlete.id, organizationId: orgA.id, role: 'athlete' },
  ] as any);
  await db.insert(userTeams).values({ userId: athlete.id, teamId: teamA.id, isActive: true, joinedAt: new Date('2020-01-01') });
  coachACookie = await login(coachA.username);
  coachBCookie = await login(coachB.username);
});

afterAll(async () => {
  const uids = [coachA, coachB, coachSession, athlete, teamlessAthlete].filter(Boolean).map((u) => u.id).concat(extraUserIds);
  if (uids.length) await db.delete(measurements).where(inArray(measurements.userId, uids));
  if (eventIds.length) await db.delete(events).where(inArray(events.id, eventIds));
  await db.delete(siteMetrics).where(eq(siteMetrics.code, PAIRED));
  await db.delete(userTeams).where(inArray(userTeams.userId, uids));
  await db.delete(userOrganizations).where(inArray(userOrganizations.organizationId, [orgA.id, orgB.id]));
  await db.delete(teams).where(eq(teams.id, teamA.id));
  if (uids.length) await db.delete(users).where(inArray(users.id, uids));
  await db.delete(organizations).where(inArray(organizations.id, [orgA.id, orgB.id]));
});

describe('event writes: side effects and audit trail', () => {
  it('sends no athlete notification and runs no achievement check before results are published', async () => {
    const achievements = vi.spyOn(AchievementService.prototype, 'checkAchievements');
    try {
      const ev = await mkEvent();
      const one = await single(ev.id, { userId: athlete.id, metric: 'VERTICAL_JUMP', value: 30, date: eventDay(ev) });
      expect(one.status).toBe(201);
      const many = await request(app)
        .post(`/api/events/${ev.id}/measurements/bulk`)
        .set('Cookie', coachACookie)
        .send({ measurements: PATTERNS.map((metric) => ({ userId: athlete.id, metric, value: 2, date: eventDay(ev) })) });
      expect(many.status).toBe(201);
      const mq = await saveMq(ev.id, athlete.id, { upserts: [{ metric: 'MQ_JUMP', value: 3 }], deletes: [] });
      expect(mq.status).toBe(200);

      expect(vi.mocked(notifyNewMeasurement)).not.toHaveBeenCalled();
      expect(achievements).not.toHaveBeenCalled();
    } finally {
      achievements.mockRestore();
    }
  });

  it('notifies again once the event results are published', async () => {
    const ev = await mkEvent({ published: true });
    const res = await single(ev.id, { userId: athlete.id, metric: 'VERTICAL_JUMP', value: 31, date: eventDay(ev) });
    expect(res.status).toBe(201);
    expect(vi.mocked(notifyNewMeasurement)).toHaveBeenCalledTimes(1);
  });

  it('records the coach as verifier and the event organization', async () => {
    const ev = await mkEvent();
    const res = await single(ev.id, { userId: teamlessAthlete.id, metric: 'MQ_DECEL', value: 2, date: eventDay(ev) });
    expect(res.status).toBe(201);
    const [row] = await rowsFor(teamlessAthlete.id, 'MQ_DECEL', ev.id);
    expect(row.isVerified).toBe(true);
    expect(row.verifiedBy).toBe(coachA.id);
    expect(row.organizationId).toBe(orgA.id);
  });

  it('MQ scores use the event date even when the client sends a different (local) date', async () => {
    // 00:30 UTC: a coach in the Americas sees the previous calendar day locally
    const ev = await mkEvent({ start: '2026-06-02T00:30:00Z' });
    const res = await request(app)
      .post(`/api/events/${ev.id}/measurements/bulk`)
      .set('Cookie', coachACookie)
      .send({ measurements: PATTERNS.map((metric) => ({ userId: athlete.id, metric, value: 1, date: '2026-06-01' })) });
    expect(res.status).toBe(201);
    const [row] = await rowsFor(athlete.id, 'MQ_JUMP', ev.id);
    expect(row.date).toBe('2026-06-02');
    expect(row.eventDateSnapshot).toBe('2026-06-02');
    const totals = await rowsFor(athlete.id, 'MQI_TOTAL');
    expect(totals.filter((t) => t.date === '2026-06-02')).toHaveLength(1);
    expect(totals.filter((t) => t.date === '2026-06-01')).toHaveLength(0);
  });
});

describe('event writes: error mapping', () => {
  it('a paired-input metric without its auxiliary input is a 400, not a 500', async () => {
    const ev = await mkEvent();
    const res = await single(ev.id, { userId: athlete.id, metric: PAIRED, value: 200, date: eventDay(ev) });
    expect(res.status).toBe(400);
  });

  it('forwards auxiliaryValue so paired-input metrics can be entered', async () => {
    const ev = await mkEvent();
    const res = await single(ev.id, { userId: athlete.id, metric: PAIRED, value: 300, auxiliaryValue: 3, date: eventDay(ev) });
    expect(res.status).toBe(201);
    expect(Number(res.body.value)).toBe(330);
  });

  it('an MQ row owned by another organization is a 403 on edit, never a 500', async () => {
    const ev = await mkEvent();
    await db.insert(measurements).values({
      userId: athlete.id,
      submittedBy: coachB.id,
      metric: 'MQ_HIPTURN',
      value: '1',
      units: 'score',
      date: eventDay(ev),
      age: 18,
      isVerified: true,
      eventId: ev.id,
      organizationId: orgB.id,
    } as any);
    const res = await single(ev.id, { userId: athlete.id, metric: 'MQ_HIPTURN', value: 3, date: eventDay(ev) });
    expect(res.status).toBe(403);
    const [row] = await rowsFor(athlete.id, 'MQ_HIPTURN', ev.id);
    expect(Number(row.value)).toBe(1);
  });

  it('an unexpected failure is a 500 without the raw error message', async () => {
    const ev = await mkEvent();
    const spy = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('relation "secret_internal" does not exist'));
    try {
      const res = await single(ev.id, { userId: athlete.id, metric: 'MQ_JUMP', value: 2, date: eventDay(ev) });
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('secret_internal');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('one MQ row per (athlete, metric, event)', () => {
  it('concurrent writes of the same score produce exactly one row', async () => {
    // Teamless athlete: no user_teams row lock incidentally serializes the writes
    const ev = await mkEvent();
    const results = await Promise.all(
      [0, 1, 2, 3, 2, 1].map((value) =>
        single(ev.id, { userId: teamlessAthlete.id, metric: 'MQ_SHUFFLE', value, date: eventDay(ev) }),
      ),
    );
    for (const r of results) expect(r.status).toBe(201);
    expect(await rowsFor(teamlessAthlete.id, 'MQ_SHUFFLE', ev.id)).toHaveLength(1);
  });
});

describe('PUT /api/events/:eventId/athletes/:userId/movement-quality', () => {
  it('saves a full set atomically and produces the total', async () => {
    const ev = await mkEvent();
    const res = await saveMq(ev.id, athlete.id, {
      upserts: PATTERNS.map((metric, i) => ({ metric, value: i % 4, notes: i === 0 ? 'late hip' : '' })),
      deletes: [],
    });
    expect(res.status).toBe(200);
    expect(res.body.saved).toHaveLength(8);
    const [total] = (await rowsFor(athlete.id, 'MQI_TOTAL')).filter((t) => t.date === eventDay(ev));
    expect(Number(total.value)).toBe(12);
  });

  it('rolls back every change when one score is invalid, and reports it per metric', async () => {
    const ev = await mkEvent();
    const first = await saveMq(ev.id, athlete.id, { upserts: [{ metric: 'MQ_LATRUN', value: 1 }], deletes: [] });
    const latrunId = first.body.saved[0].id;

    const res = await saveMq(ev.id, athlete.id, {
      upserts: [
        { metric: 'MQ_JUMP', value: 2 },
        { metric: 'MQ_DECEL', value: 4 },
      ],
      deletes: [latrunId],
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ metric: 'MQ_DECEL', error: expect.stringMatching(/at most 3/) }]);
    expect(await rowsFor(athlete.id, 'MQ_JUMP', ev.id)).toHaveLength(0);
    expect(await rowsFor(athlete.id, 'MQ_LATRUN', ev.id)).toHaveLength(1);
  });

  it('deletes are scoped to this event and athlete (404, nothing applied)', async () => {
    const ev = await mkEvent();
    const other = await mkEvent();
    const foreign = await saveMq(other.id, athlete.id, { upserts: [{ metric: 'MQ_JUMP', value: 2 }], deletes: [] });
    const res = await saveMq(ev.id, athlete.id, {
      upserts: [{ metric: 'MQ_DECEL', value: 1 }],
      deletes: [foreign.body.saved[0].id],
    });
    expect(res.status).toBe(404);
    expect(await rowsFor(athlete.id, 'MQ_JUMP', other.id)).toHaveLength(1);
    expect(await rowsFor(athlete.id, 'MQ_DECEL', ev.id)).toHaveLength(0);
  });

  it('only accepts Movement Quality base scores', async () => {
    const ev = await mkEvent();
    for (const metric of ['VERTICAL_JUMP', 'MQI_TOTAL']) {
      const res = await saveMq(ev.id, athlete.id, { upserts: [{ metric, value: 2 }], deletes: [] });
      expect(res.status).toBe(400);
    }
  });

  it('rejects frozen events and other organizations', async () => {
    const frozen = await mkEvent({ frozen: true });
    const f = await saveMq(frozen.id, athlete.id, { upserts: [{ metric: 'MQ_JUMP', value: 2 }], deletes: [] });
    expect(f.status).toBe(400);
    expect(f.body.error).toMatch(/frozen/i);

    const ev = await mkEvent();
    const denied = await saveMq(ev.id, athlete.id, { upserts: [{ metric: 'MQ_JUMP', value: 2 }], deletes: [] }, coachBCookie);
    expect(denied.status).toBe(403);
    expect(await rowsFor(athlete.id, 'MQ_JUMP', ev.id)).toHaveLength(0);
  });

  it('clearing a saved score deletes it and removes the total', async () => {
    const ev = await mkEvent();
    const full = await saveMq(ev.id, athlete.id, { upserts: PATTERNS.map((metric) => ({ metric, value: 2 })), deletes: [] });
    const jump = full.body.saved.find((m: any) => m.metric === 'MQ_JUMP');
    const res = await saveMq(ev.id, athlete.id, { upserts: [], deletes: [jump.id] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toEqual([jump.id]);
    expect(await rowsFor(athlete.id, 'MQ_JUMP', ev.id)).toHaveLength(0);
    expect((await rowsFor(athlete.id, 'MQI_TOTAL')).filter((t) => t.date === eventDay(ev))).toHaveLength(0);
  });

  it('a realistic 25-athlete session (one save per athlete plus grid saves) is not rate limited', async () => {
    const ev = await mkEvent();
    const roster = [];
    for (let i = 0; i < 25; i++) {
      const u = await mkUser(`roster${i}`, '2008-01-01');
      extraUserIds.push(u.id);
      roster.push(u);
    }
    await db.insert(userOrganizations).values(roster.map((u) => ({ userId: u.id, organizationId: orgA.id, role: 'athlete' })) as any);
    const cookie = await login(coachSession.username);

    const statuses: number[] = [];
    for (const u of roster) {
      const res = await saveMq(ev.id, u.id, { upserts: PATTERNS.map((metric) => ({ metric, value: 2 })), deletes: [] }, cookie);
      statuses.push(res.status);
    }
    for (let i = 0; i < 3; i++) {
      const grid = await request(app)
        .post(`/api/events/${ev.id}/measurements/bulk`)
        .set('Cookie', cookie)
        .send({ measurements: roster.map((u) => ({ userId: u.id, metric: 'VERTICAL_JUMP', value: 25 + i, date: eventDay(ev) })) });
      statuses.push(grid.status);
    }
    expect(statuses.filter((s) => s === 429)).toEqual([]);
    expect(statuses.every((s) => s === 200 || s === 201)).toBe(true);
  }, 60000);
});
