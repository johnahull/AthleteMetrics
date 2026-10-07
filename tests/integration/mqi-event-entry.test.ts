/**
 * AM-FEAT-015 Phase 3: MQI capture through the event measurement routes.
 *
 * Event writes must go through MeasurementService so that: units come from
 * site_metrics ('score'), coach entries auto-verify, metric-aware validation
 * applies (0 valid for MQ), the derived-metric calculator fires (MQI_TOTAL),
 * re-POSTing an MQ score edits it instead of duplicating, and frozen events
 * stay frozen (decision 6).
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

// The suite issues more mutations than the production per-window limit allows
vi.mock('../../packages/api/constants/rate-limits', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, RATE_LIMITS: { ...actual.RATE_LIMITS, MUTATION: 10000 } };
});

import { registerRoutes } from '../../packages/api/routes';
import { db } from '../../packages/api/db';
import {
  organizations,
  users,
  userOrganizations,
  teams,
  userTeams,
  measurements,
  events,
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
const DATE = '2026-03-10';
const CLIP = 'https://clips.example.com/v/1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let app: Express;
const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
let orgA: any;
let orgB: any;
let teamA: any;
let coachA: any;
let coachB: any;
let athlete: any;
let coachACookie: string;
let coachBCookie: string;
const eventIds: string[] = [];

async function login(username: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

async function mkUser(tag: string) {
  const [u] = await db
    .insert(users)
    .values({
      username: `mqe_${tag}_${suffix}`,
      emails: [`mqe_${tag}_${suffix}@test.com`],
      password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
      firstName: tag,
      lastName: 'Test',
      fullName: `${tag} Test`,
      birthDate: tag === 'athlete' ? '2008-01-01' : undefined,
    } as any)
    .returning();
  return u;
}

async function mkEvent(opts: { start: string; frozen?: boolean; org?: any } = { start: `${DATE}T10:00:00Z` }) {
  const [e] = await db
    .insert(events)
    .values({
      name: `MQE Event ${suffix} ${eventIds.length}`,
      organizationId: (opts.org ?? orgA).id,
      startDate: new Date(opts.start),
      isFrozen: opts.frozen ?? false,
      createdBy: coachA.id,
    } as any)
    .returning();
  eventIds.push(e.id);
  return e;
}

const rowsFor = (metric: string, eventId?: string) =>
  db
    .select()
    .from(measurements)
    .where(
      and(
        eq(measurements.userId, athlete.id),
        eq(measurements.metric, metric),
        ...(eventId ? [eq(measurements.eventId, eventId)] : []),
      ),
    );

const bulk = (eventId: string, values: number[], cookie = coachACookie, extra: Record<string, unknown> = {}) =>
  request(app)
    .post(`/api/events/${eventId}/measurements/bulk`)
    .set('Cookie', cookie)
    .send({
      measurements: values.map((value, i) => ({
        userId: athlete.id,
        metric: PATTERNS[i],
        value,
        date: DATE,
        ...extra,
      })),
    });

const single = (eventId: string, metric: string, value: number, cookie = coachACookie, extra: Record<string, unknown> = {}) =>
  request(app)
    .post(`/api/events/${eventId}/measurements`)
    .set('Cookie', cookie)
    .send({ userId: athlete.id, metric, value, date: DATE, ...extra });

beforeAll(async () => {
  // Other suites delete derived site_metrics rows; the 0146 seed is idempotent.
  const seed = fs.readFileSync(path.resolve(__dirname, '../../migrations/0146_seed_mqi_metrics.sql'), 'utf-8');
  await db.execute(sql.raw(seed));
  // Apply 0148 (latest-event selection) when present
  const p148 = path.resolve(__dirname, '../../migrations/0148_mqi_latest_event_selection.sql');
  if (fs.existsSync(p148)) await db.execute(sql.raw(fs.readFileSync(p148, 'utf-8')));

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  [orgA] = await db.insert(organizations).values({ name: `MQE Org A ${suffix}`, isActive: true }).returning();
  [orgB] = await db.insert(organizations).values({ name: `MQE Org B ${suffix}`, isActive: true }).returning();
  [teamA] = await db.insert(teams).values({ name: `MQE Team ${suffix}`, organizationId: orgA.id }).returning();
  coachA = await mkUser('coachA');
  coachB = await mkUser('coachB');
  athlete = await mkUser('athlete');
  await db.insert(userOrganizations).values([
    { userId: coachA.id, organizationId: orgA.id, role: 'coach' },
    { userId: coachB.id, organizationId: orgB.id, role: 'coach' },
    { userId: athlete.id, organizationId: orgA.id, role: 'athlete' },
  ] as any);
  await db.insert(userTeams).values({ userId: athlete.id, teamId: teamA.id, isActive: true });
  coachACookie = await login(coachA.username);
  coachBCookie = await login(coachB.username);
});

afterAll(async () => {
  const uids = [coachA?.id, coachB?.id, athlete?.id].filter(Boolean);
  if (uids.length) await db.delete(measurements).where(inArray(measurements.userId, uids));
  if (eventIds.length) await db.delete(events).where(inArray(events.id, eventIds));
  await db.delete(userTeams).where(eq(userTeams.teamId, teamA.id));
  await db.delete(userOrganizations).where(inArray(userOrganizations.organizationId, [orgA.id, orgB.id]));
  await db.delete(teams).where(eq(teams.id, teamA.id));
  if (uids.length) await db.delete(users).where(inArray(users.id, uids));
  await db.delete(organizations).where(inArray(organizations.id, [orgA.id, orgB.id]));
});

describe('MQI entry via event routes', () => {
  it('8 scores -> MQI_TOTAL on the event date with units "score"', async () => {
    const ev = await mkEvent();
    const res = await bulk(ev.id, [3, 2, 1, 0, 3, 2, 1, 3]); // 15
    expect(res.status).toBe(201);
    expect(res.body.errors).toEqual([]);
    expect(res.body.created).toHaveLength(8);

    const [first] = await rowsFor('MQ_LIN_ACCEL', ev.id);
    expect(first.units).toBe('score');
    expect(first.isVerified).toBe(true);
    expect(first.eventId).toBe(ev.id);
    expect(first.eventNameSnapshot).toBe(ev.name);

    const [total] = await rowsFor('MQI_TOTAL');
    expect(total).toBeDefined();
    expect(Number(total.value)).toBe(15);
    expect(total.date).toBe(DATE);
    expect(total.units).toBe('score');
    expect(total.isCalculated).toBe(true);
  });

  it('accepts 0 and rejects out-of-range / fractional MQ scores', async () => {
    const ev = await mkEvent({ start: '2026-03-11T10:00:00Z' });
    const zero = await single(ev.id, 'MQ_DECEL', 0, coachACookie, { date: '2026-03-11' });
    expect(zero.status).toBe(201);
    expect(Number(zero.body.value)).toBe(0);
    const four = await single(ev.id, 'MQ_JUMP', 4, coachACookie, { date: '2026-03-11' });
    expect(four.status).toBe(400);
    const frac = await single(ev.id, 'MQ_JUMP', 1.5, coachACookie, { date: '2026-03-11' });
    expect(frac.status).toBe(400);
    expect(await rowsFor('MQ_JUMP', ev.id)).toHaveLength(0);
  });

  it('re-POSTing an MQ score edits it in place (no duplicate) and recalculates the total', async () => {
    const ev = await mkEvent({ start: '2026-03-12T10:00:00Z' });
    const d = '2026-03-12';
    const first = await request(app)
      .post(`/api/events/${ev.id}/measurements/bulk`)
      .set('Cookie', coachACookie)
      .send({ measurements: PATTERNS.map((metric) => ({ userId: athlete.id, metric, value: 2, date: d })) });
    expect(first.status).toBe(201);
    const totalOn = async () =>
      (await rowsFor('MQI_TOTAL')).filter((r) => r.date === d);
    expect(Number((await totalOn())[0].value)).toBe(16);

    const edit = await single(ev.id, 'MQ_MAX_VELO', 3, coachACookie, { date: d, notes: 'late hip', mediaUrl: CLIP });
    expect(edit.status).toBe(201);
    const rows = await rowsFor('MQ_MAX_VELO', ev.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].value)).toBe(3);
    expect(rows[0].notes).toBe('late hip');
    expect(rows[0].mediaUrl).toBe(CLIP);
    const totals = await totalOn();
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(17);

    // Bulk upsert edits too
    const again = await request(app)
      .post(`/api/events/${ev.id}/measurements/bulk`)
      .set('Cookie', coachACookie)
      .send({ measurements: [{ userId: athlete.id, metric: 'MQ_MAX_VELO', value: 1, date: d, mediaUrl: '' }] });
    expect(again.status).toBe(201);
    const rows2 = await rowsFor('MQ_MAX_VELO', ev.id);
    expect(rows2).toHaveLength(1);
    expect(rows2[0].mediaUrl).toBeNull();
    expect(Number((await totalOn())[0].value)).toBe(15);
  });

  it('7 of 8 scores produce no MQI_TOTAL', async () => {
    const ev = await mkEvent({ start: '2026-03-13T10:00:00Z' });
    const d = '2026-03-13';
    const res = await request(app)
      .post(`/api/events/${ev.id}/measurements/bulk`)
      .set('Cookie', coachACookie)
      .send({ measurements: PATTERNS.slice(0, 7).map((metric) => ({ userId: athlete.id, metric, value: 3, date: d })) });
    expect(res.status).toBe(201);
    expect((await rowsFor('MQI_TOTAL')).filter((r) => r.date === d)).toHaveLength(0);
  });

  it('transition scores are optional and never leak into MQI_TOTAL', async () => {
    const ev = await mkEvent({ start: '2026-03-14T10:00:00Z' });
    const d = '2026-03-14';
    await request(app)
      .post(`/api/events/${ev.id}/measurements/bulk`)
      .set('Cookie', coachACookie)
      .send({
        measurements: [
          ...PATTERNS.map((metric) => ({ userId: athlete.id, metric, value: 1, date: d })),
          { userId: athlete.id, metric: 'MQ_TRANS_DECEL_CUT', value: 3, date: d },
        ],
      });
    const [total] = (await rowsFor('MQI_TOTAL')).filter((r) => r.date === d);
    expect(Number(total.value)).toBe(8);
    expect((await rowsFor('MQ_TRANSITION_TOTAL')).filter((r) => r.date === d)).toHaveLength(0);
  });

  it('clearing one score removes the total; clearing is event-scoped', async () => {
    const ev = await mkEvent({ start: '2026-03-15T10:00:00Z' });
    const d = '2026-03-15';
    await request(app)
      .post(`/api/events/${ev.id}/measurements/bulk`)
      .set('Cookie', coachACookie)
      .send({ measurements: PATTERNS.map((metric) => ({ userId: athlete.id, metric, value: 2, date: d })) });
    expect((await rowsFor('MQI_TOTAL')).filter((r) => r.date === d)).toHaveLength(1);

    const [row] = await rowsFor('MQ_SHUFFLE', ev.id);
    const otherEvent = await mkEvent({ start: '2026-03-16T10:00:00Z' });
    const wrong = await request(app)
      .put(`/api/events/${otherEvent.id}/athletes/${athlete.id}/movement-quality`)
      .set('Cookie', coachACookie)
      .send({ upserts: [], deletes: [row.id] });
    expect(wrong.status).toBe(404);

    const del = await request(app)
      .put(`/api/events/${ev.id}/athletes/${athlete.id}/movement-quality`)
      .set('Cookie', coachACookie)
      .send({ upserts: [], deletes: [row.id] });
    expect(del.status).toBe(200);
    expect(await rowsFor('MQ_SHUFFLE', ev.id)).toHaveLength(0);
    expect((await rowsFor('MQI_TOTAL')).filter((r) => r.date === d)).toHaveLength(0);
  });

  it('frozen events reject create, edit and delete (no MQ exemption)', async () => {
    const ev = await mkEvent({ start: '2026-03-17T10:00:00Z', frozen: true });
    const post = await single(ev.id, 'MQ_DECEL', 2, coachACookie, { date: '2026-03-17' });
    expect(post.status).toBe(400);
    expect(post.body.error).toMatch(/frozen/i);
    const b = await request(app)
      .post(`/api/events/${ev.id}/measurements/bulk`)
      .set('Cookie', coachACookie)
      .send({ measurements: [{ userId: athlete.id, metric: 'MQ_DECEL', value: 2, date: '2026-03-17' }] });
    expect(b.status).toBe(400);
    expect(await rowsFor('MQ_DECEL', ev.id)).toHaveLength(0);

    // A score that existed before the freeze cannot be deleted either
    const [m] = await db
      .insert(measurements)
      .values({
        userId: athlete.id,
        submittedBy: coachA.id,
        metric: 'MQ_DECEL',
        value: '2',
        units: 'score',
        date: '2026-03-17',
        age: 18,
        isVerified: true,
        eventId: ev.id,
      } as any)
      .returning();
    const del = await request(app)
      .put(`/api/events/${ev.id}/athletes/${athlete.id}/movement-quality`)
      .set('Cookie', coachACookie)
      .send({ upserts: [], deletes: [m.id] });
    expect(del.status).toBe(400);
    expect(await rowsFor('MQ_DECEL', ev.id)).toHaveLength(1);
  });

  it("denies another organization's coach (create, edit, delete)", async () => {
    const ev = await mkEvent({ start: '2026-03-18T10:00:00Z' });
    const denied = await single(ev.id, 'MQ_DECEL', 2, coachBCookie, { date: '2026-03-18' });
    expect(denied.status).toBe(403);
    const ok = await single(ev.id, 'MQ_DECEL', 2, coachACookie, { date: '2026-03-18' });
    const del = await request(app)
      .put(`/api/events/${ev.id}/athletes/${athlete.id}/movement-quality`)
      .set('Cookie', coachBCookie)
      .send({ upserts: [], deletes: [ok.body.id] });
    expect(del.status).toBe(403);
    expect(await rowsFor('MQ_DECEL', ev.id)).toHaveLength(1);
  });

  it('there is no generic DELETE route for one event measurement (the atomic PUT clears scores)', async () => {
    const ev = await mkEvent({ start: '2026-03-28T10:00:00Z' });
    const ok = await single(ev.id, 'MQ_DECEL', 2, coachACookie, { date: '2026-03-28' });
    const del = await request(app)
      .delete(`/api/events/${ev.id}/measurements/${ok.body.id}`)
      .set('Cookie', coachACookie);
    expect(del.status).toBe(404);
    expect(await rowsFor('MQ_DECEL', ev.id)).toHaveLength(1);
  });

  it('non-MQ event measurements are unchanged: units from site_metrics, positive-only', async () => {
    const ev = await mkEvent({ start: '2026-03-19T10:00:00Z' });
    const ok = await single(ev.id, 'VERTICAL_JUMP', 31, coachACookie, { date: '2026-03-19' });
    expect(ok.status).toBe(201);
    expect(ok.body.eventId).toBe(ev.id);
    expect(ok.body.isVerified).toBe(true);
    const zero = await single(ev.id, 'VERTICAL_JUMP', 0, coachACookie, { date: '2026-03-19' });
    expect(zero.status).toBe(400);
  });

  it('two events on the same day: the latest event wins for the total (decision 11)', async () => {
    const d = '2026-03-20';
    const early = await mkEvent({ start: `${d}T09:00:00Z` });
    const late = await mkEvent({ start: `${d}T15:00:00Z` });
    const set = (value: number) =>
      PATTERNS.map((metric) => ({ userId: athlete.id, metric, value, date: d }));
    const r1 = await request(app).post(`/api/events/${early.id}/measurements/bulk`).set('Cookie', coachACookie).send({ measurements: set(3) });
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    const totalNow = async () => (await rowsFor('MQI_TOTAL')).filter((r) => r.date === d);
    expect(Number((await totalNow())[0].value)).toBe(24);

    await request(app).post(`/api/events/${late.id}/measurements/bulk`).set('Cookie', coachACookie).send({ measurements: set(1) });
    const totals = await totalNow();
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(8);

    // Editing a score in the EARLIER event must not change the total
    await single(early.id, 'MQ_JUMP', 0, coachACookie, { date: d });
    expect(Number((await totalNow())[0].value)).toBe(8);
  });

  it('latest event is chosen by event start time, not entry order (later event entered FIRST)', async () => {
    const d = '2026-03-22';
    const early = await mkEvent({ start: `${d}T09:00:00Z` });
    const late = await mkEvent({ start: `${d}T15:00:00Z` });
    const set = (value: number) => PATTERNS.map((metric) => ({ userId: athlete.id, metric, value, date: d }));
    const totalNow = async () => (await rowsFor('MQI_TOTAL')).filter((r) => r.date === d);

    // Backfill order: the afternoon event is entered before the morning one
    const r1 = await request(app).post(`/api/events/${late.id}/measurements/bulk`).set('Cookie', coachACookie).send({ measurements: set(1) });
    expect(r1.status).toBe(201);
    expect(Number((await totalNow())[0].value)).toBe(8);
    const r2 = await request(app).post(`/api/events/${early.id}/measurements/bulk`).set('Cookie', coachACookie).send({ measurements: set(3) });
    expect(r2.status).toBe(201);

    const totals = await totalNow();
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(8);
  });

  it('MQ metrics are selectable as event metrics (appear in the org metric list and can be added to an event)', async () => {
    const list = await request(app)
      .get('/api/metrics')
      .set('Cookie', coachACookie)
      .set('x-organization-id', orgA.id);
    expect(list.status).toBe(200);
    const codes = list.body.map((m: any) => m.code);
    for (const code of [...PATTERNS, 'MQ_TRANS_GAS_BRAKE', 'MQI_TOTAL']) expect(codes).toContain(code);
    expect(list.body.find((m: any) => m.code === 'MQ_JUMP').category).toBe('Movement Quality');

    const ev = await mkEvent({ start: '2026-03-21T10:00:00Z' });
    const add = await request(app)
      .post(`/api/events/${ev.id}/metrics`)
      .set('Cookie', coachACookie)
      .send({ metricCode: 'MQ_JUMP' });
    expect(add.status).toBe(201);
  });
});
