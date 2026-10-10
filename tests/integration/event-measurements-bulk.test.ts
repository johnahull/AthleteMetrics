/**
 * Who and what an event measurement write may target (recording-sheet PR A):
 * POST /api/events/:eventId/measurements and .../measurements/bulk accept only athletes with an
 * eligible registration (approved, checked_in, completed) and metrics configured on the event, cap a
 * bulk request at 200 items, and replace a saved row by id (replaceMeasurementId) instead of appending.
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { and, eq, inArray } from 'drizzle-orm';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

// The suite issues more writes than the production per-window limit allows
vi.mock('../../packages/api/constants/rate-limits', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, RATE_LIMITS: { ...actual.RATE_LIMITS, STANDARD: 10000, MUTATION: 10000 } };
});

import { registerRoutes } from '../../packages/api/routes';
import { db } from '../../packages/api/db';
import {
  organizations,
  users,
  userOrganizations,
  measurements,
  events,
  eventRegistrations,
  eventMetrics,
  siteMetrics,
  registrationStatusEnum,
  EVENT_DATA_ENTRY_REGISTRATION_STATUSES,
} from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';

const PASSWORD = 'TestCoach123!';
const DATE = '2026-04-10';
const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();
// Own metrics (no derived metric depends on them), created here and removed in afterAll
const SPRINT = `EMB_SPRINT_${tag}`;
const JUMP = `EMB_JUMP_${tag}`;
const OFF_EVENT = `EMB_OFF_${tag}`;
// Paired-input (1RM-style): stored with is_calculated = true and no source rows
const PAIRED = `EMB_PAIRED_${tag}`;
const OWN_METRICS = [SPRINT, JUMP, OFF_EVENT, PAIRED];

let app: Express;
let orgA: any;
let orgB: any;
let coach: any;
let coachCookie: string;
let member: any; // orgA athlete, not registered
let outsider: any; // orgB athlete, registered (open event) but not an orgA member
const byStatus: Record<string, any> = {};
const eventIds: string[] = [];
const userIds: string[] = [];

async function mkUser(name: string) {
  const [u] = await db
    .insert(users)
    .values({
      username: `emb_${name}_${tag}`.toLowerCase(),
      emails: [`emb_${name}_${tag}@test.com`.toLowerCase()],
      password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
      firstName: name,
      lastName: 'Emb',
      fullName: `${name} Emb`,
      birthDate: '2008-01-01',
    } as any)
    .returning();
  userIds.push(u.id);
  return u;
}

/** An orgA event with SPRINT and JUMP configured and every status athlete (+ outsider) registered */
async function mkEvent(frozen = false) {
  const [e] = await db
    .insert(events)
    .values({
      name: `EMB Event ${tag} ${eventIds.length}`,
      organizationId: orgA.id,
      startDate: new Date(`${DATE}T10:00:00Z`),
      isFrozen: frozen,
      createdBy: coach.id,
    } as any)
    .returning();
  eventIds.push(e.id);
  await db.insert(eventMetrics).values([
    { eventId: e.id, metricCode: SPRINT, displayOrder: 1 },
    { eventId: e.id, metricCode: JUMP, displayOrder: 2 },
    { eventId: e.id, metricCode: PAIRED, displayOrder: 3 },
  ]);
  await db.insert(eventRegistrations).values([
    ...registrationStatusEnum.map((status) => ({
      eventId: e.id,
      userId: byStatus[status].id,
      userFullNameSnapshot: byStatus[status].fullName,
      status,
    })),
    { eventId: e.id, userId: outsider.id, userFullNameSnapshot: outsider.fullName, status: 'approved' as const },
  ]);
  return e;
}

const item = (userId: string, extra: Record<string, unknown> = {}) => ({
  userId,
  metric: SPRINT,
  value: 4.5,
  date: DATE,
  ...extra,
});
const bulk = (eventId: string, items: unknown[]) =>
  request(app).post(`/api/events/${eventId}/measurements/bulk`).set('Cookie', coachCookie).send({ measurements: items });
const single = (eventId: string, body: Record<string, unknown>) =>
  request(app).post(`/api/events/${eventId}/measurements`).set('Cookie', coachCookie).send(body);
const rowsOf = (eventId: string) => db.select().from(measurements).where(eq(measurements.eventId, eventId));

const NOT_REGISTERED = /not registered for this event/i;
const NOT_ON_EVENT = /not one of this event's metrics/i;
const BAD_REPLACE = /replaceMeasurementId/;

beforeAll(async () => {
  await db
    .insert(siteMetrics)
    .values([SPRINT, JUMP, OFF_EVENT].map((code) => ({ code, label: `Label ${code}`, category: 'speed', unit: 's', metricType: 'lower_is_better' }) as any))
    .onConflictDoNothing();
  await db.insert(siteMetrics).values({
    code: PAIRED,
    label: `Label ${PAIRED}`,
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

  [orgA] = await db.insert(organizations).values({ name: `EMB Org A ${tag}`, isActive: true }).returning();
  [orgB] = await db.insert(organizations).values({ name: `EMB Org B ${tag}`, isActive: true }).returning();
  coach = await mkUser('coach');
  member = await mkUser('member');
  outsider = await mkUser('outsider');
  for (const status of registrationStatusEnum) byStatus[status] = await mkUser(status);
  await db.insert(userOrganizations).values([
    { userId: coach.id, organizationId: orgA.id, role: 'coach' },
    { userId: member.id, organizationId: orgA.id, role: 'athlete' },
    { userId: outsider.id, organizationId: orgB.id, role: 'athlete' },
    ...registrationStatusEnum.map((s) => ({ userId: byStatus[s].id, organizationId: orgA.id, role: 'athlete' })),
  ] as any);

  const login = await request(app).post('/api/auth/login').send({ username: coach.username, password: PASSWORD });
  expect(login.status).toBe(200);
  coachCookie = login.headers['set-cookie'][0];
});

afterAll(async () => {
  if (eventIds.length) {
    await db.delete(measurements).where(inArray(measurements.eventId, eventIds));
    await db.delete(events).where(inArray(events.id, eventIds)); // cascades registrations and event metrics
  }
  await purgeTestRows({ userIds, orgIds: [orgA?.id, orgB?.id] });
  await db.delete(measurements).where(inArray(measurements.metric, OWN_METRICS));
  await db.delete(siteMetrics).where(inArray(siteMetrics.code, OWN_METRICS));
});

describe('shared constant', () => {
  it('lists the statuses whose athletes can have results entered', () => {
    expect([...EVENT_DATA_ENTRY_REGISTRATION_STATUSES]).toEqual(['approved', 'checked_in', 'completed']);
  });
});

describe('who can be written to', () => {
  it.each([...EVENT_DATA_ENTRY_REGISTRATION_STATUSES])('accepts a %s athlete (single and bulk)', async (status) => {
    const ev = await mkEvent();
    const one = await single(ev.id, item(byStatus[status].id));
    expect(one.status).toBe(201);
    const many = await bulk(ev.id, [item(byStatus[status].id, { metric: JUMP, value: 20 })]);
    expect(many.status).toBe(201);
    expect(many.body.errors).toEqual([]);
    expect(many.body.created).toHaveLength(1);
    expect(await rowsOf(ev.id)).toHaveLength(2);
  });

  it.each(['pending', 'waitlisted', 'declined', 'cancelled'])('rejects a %s athlete (single 400, bulk per-item)', async (status) => {
    const ev = await mkEvent();
    const one = await single(ev.id, item(byStatus[status].id));
    expect(one.status).toBe(400);
    expect(one.body.error).toMatch(NOT_REGISTERED);
    const many = await bulk(ev.id, [item(byStatus.approved.id), item(byStatus[status].id)]);
    expect(many.status).toBe(201);
    expect(many.body.created).toHaveLength(1);
    expect(many.body.errors).toEqual([{ index: 1, error: expect.stringMatching(NOT_REGISTERED) }]);
    expect(await rowsOf(ev.id)).toHaveLength(1);
  });

  it('rejects an organization member who is not registered', async () => {
    const ev = await mkEvent();
    const one = await single(ev.id, item(member.id));
    expect(one.status).toBe(400);
    expect(one.body.error).toMatch(NOT_REGISTERED);
    const many = await bulk(ev.id, [item(member.id)]);
    expect(many.body.errors).toEqual([{ index: 0, error: expect.stringMatching(NOT_REGISTERED) }]);
    expect(await rowsOf(ev.id)).toHaveLength(0);
  });

  it('still rejects an athlete of another organization with the membership error', async () => {
    const ev = await mkEvent();
    const one = await single(ev.id, item(outsider.id));
    expect(one.status).toBe(400);
    expect(one.body.error).toMatch(/not a member of this event's organization/i);
    const many = await bulk(ev.id, [item(outsider.id)]);
    expect(many.body.errors).toEqual([{ index: 0, error: expect.stringMatching(/not a member/i) }]);
    expect(await rowsOf(ev.id)).toHaveLength(0);
  });

  it('rejects a metric that is not configured on the event', async () => {
    const ev = await mkEvent();
    const one = await single(ev.id, item(byStatus.approved.id, { metric: OFF_EVENT }));
    expect(one.status).toBe(400);
    expect(one.body.error).toMatch(NOT_ON_EVENT);
    const many = await bulk(ev.id, [item(byStatus.approved.id), item(byStatus.approved.id, { metric: OFF_EVENT })]);
    expect(many.body.created).toHaveLength(1);
    expect(many.body.errors).toEqual([{ index: 1, error: expect.stringMatching(NOT_ON_EVENT) }]);
    expect(await rowsOf(ev.id)).toHaveLength(1);
  });

  it('a frozen event stays blocked', async () => {
    const ev = await mkEvent(true);
    expect((await single(ev.id, item(byStatus.approved.id))).status).toBe(400);
    const many = await bulk(ev.id, [item(byStatus.approved.id)]);
    expect(many.status).toBe(400);
    expect(many.body.error).toMatch(/frozen/i);
    expect(await rowsOf(ev.id)).toHaveLength(0);
  });
});

describe('batch size and append', () => {
  it('201 items are refused with 400 and nothing is written', async () => {
    const ev = await mkEvent();
    const tooMany = await bulk(ev.id, Array.from({ length: 201 }, () => item(byStatus.approved.id)));
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error).toMatch(/200/);
    expect(await rowsOf(ev.id)).toHaveLength(0);
  });

  it('exactly 200 items are accepted', async () => {
    const ev = await mkEvent();
    const res = await bulk(ev.id, Array.from({ length: 200 }, () => item(byStatus.approved.id)));
    expect(res.status).toBe(201);
    expect(res.body.errors).toEqual([]);
    expect(res.body.created).toHaveLength(200);
    expect(await rowsOf(ev.id)).toHaveLength(200);
  });

  it('every created and replaced entry carries its index in the request', async () => {
    const ev = await mkEvent();
    const a = byStatus.approved.id;
    const saved = (await single(ev.id, item(a, { value: 4.9 }))).body;
    const res = await bulk(ev.id, [
      item(a, { value: 4.5 }),
      item(a, { value: 4.6, replaceMeasurementId: saved.id }),
      item(member.id),
      item(a, { metric: JUMP, value: 20 }),
    ]);
    expect(res.status).toBe(201);
    expect(res.body.created.map((m: any) => [m.index, Number(m.value)])).toEqual([
      [0, 4.5],
      [3, 20],
    ]);
    expect(res.body.replaced.map((m: any) => [m.index, m.id])).toEqual([[1, saved.id]]);
    expect(res.body.errors).toEqual([{ index: 2, error: expect.stringMatching(NOT_REGISTERED) }]);
  });

  it('normal items keep append semantics (trials are separate rows)', async () => {
    const ev = await mkEvent();
    const a = byStatus.checked_in.id;
    const res = await bulk(ev.id, [item(a, { value: 4.5 }), item(a, { value: 4.4 })]);
    expect(res.body.created).toHaveLength(2);
    await bulk(ev.id, [item(a, { value: 4.3 })]);
    const rows = await rowsOf(ev.id);
    expect(rows.map((r) => Number(r.value)).sort()).toEqual([4.3, 4.4, 4.5]);
  });
});

describe('replaceMeasurementId', () => {
  it('replaces the saved row in place, and re-sending the same replace changes nothing', async () => {
    const ev = await mkEvent();
    const a = byStatus.approved.id;
    const saved = (await single(ev.id, item(a, { value: 4.9 }))).body;

    const first = await bulk(ev.id, [item(a, { value: 4.6, replaceMeasurementId: saved.id })]);
    expect(first.status).toBe(201);
    expect(first.body.errors).toEqual([]);
    expect(first.body.created).toEqual([]);
    expect(first.body.replaced).toHaveLength(1);
    expect(first.body.replaced[0].id).toBe(saved.id);

    const again = await bulk(ev.id, [item(a, { value: 4.6, replaceMeasurementId: saved.id })]);
    expect(again.body.errors).toEqual([]);
    expect(again.body.replaced[0].id).toBe(saved.id);

    const rows = await rowsOf(ev.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(saved.id);
    expect(Number(rows[0].value)).toBe(4.6);
  });

  it('the single route replaces too (200, same id)', async () => {
    const ev = await mkEvent();
    const a = byStatus.completed.id;
    const saved = (await single(ev.id, item(a, { value: 4.9 }))).body;
    const res = await single(ev.id, item(a, { value: 4.7, replaceMeasurementId: saved.id }));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(saved.id);
    const rows = await rowsOf(ev.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].value)).toBe(4.7);
  });

  it('rejects a row of another event, athlete or metric, a cross-row derived row and an unknown id, and never inserts', async () => {
    const ev = await mkEvent();
    const other = await mkEvent();
    const a = byStatus.approved.id;
    const b = byStatus.checked_in.id;
    const mine = (await single(ev.id, item(a, { value: 4.9 }))).body;
    const otherEvent = (await single(other.id, item(a, { value: 4.9 }))).body;
    const otherAthlete = (await single(ev.id, item(b, { value: 4.9 }))).body;
    const otherMetric = (await single(ev.id, item(a, { metric: JUMP, value: 20 }))).body;
    const [calculated] = await db
      .insert(measurements)
      .values({
        userId: a,
        submittedBy: coach.id,
        date: DATE,
        age: 18,
        metric: SPRINT,
        value: '4.800',
        units: 's',
        eventId: ev.id,
        organizationId: orgA.id,
        isCalculated: true,
        // Cross-row derived: computed from other measurement rows
        calculatedFromMeasurementIds: [mine.id],
        calculationMetadata: {},
      } as any)
      .returning();

    const ids = [otherEvent.id, otherAthlete.id, otherMetric.id, calculated.id, 'no-such-measurement'];
    const res = await bulk(ev.id, ids.map((replaceMeasurementId) => item(a, { value: 4.1, replaceMeasurementId })));
    expect(res.status).toBe(201);
    expect(res.body.created).toEqual([]);
    expect(res.body.replaced).toEqual([]);
    expect(res.body.errors).toEqual(ids.map((_, index) => ({ index, error: expect.stringMatching(BAD_REPLACE) })));

    const single400 = await single(ev.id, item(a, { value: 4.1, replaceMeasurementId: otherEvent.id }));
    expect(single400.status).toBe(400);
    expect(single400.body.error).toMatch(BAD_REPLACE);

    // Nothing was inserted or changed
    const rows = await rowsOf(ev.id);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => Number(r.value) !== 4.1)).toBe(true);
    expect(Number((await rowsOf(other.id))[0].value)).toBe(4.9);
    expect(mine.id).toBeDefined();
  });

  it('replaces a paired-input row: the value is recomputed and the row is listed as replaced', async () => {
    const ev = await mkEvent();
    const a = byStatus.approved.id;
    const saved = (await single(ev.id, item(a, { metric: PAIRED, value: 300, auxiliaryValue: 3 }))).body;
    expect(saved.isCalculated).toBe(true);
    expect(Number(saved.value)).toBe(330);

    const res = await bulk(ev.id, [item(a, { metric: PAIRED, value: 300, auxiliaryValue: 6, replaceMeasurementId: saved.id })]);
    expect(res.status).toBe(201);
    expect(res.body.errors).toEqual([]);
    expect(res.body.created).toEqual([]);
    expect(res.body.replaced).toHaveLength(1);
    expect(res.body.replaced[0].id).toBe(saved.id);
    expect(Number(res.body.replaced[0].value)).toBe(360);

    const rows = await rowsOf(ev.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].value)).toBe(360);
    expect(Number(rows[0].auxiliaryValue)).toBe(6);
    expect(rows[0].isCalculated).toBe(true);
  });

  it('a replaceMeasurementId sent twice in one batch: the first applies, later ones are per-item errors', async () => {
    const ev = await mkEvent();
    const a = byStatus.approved.id;
    const saved = (await single(ev.id, item(a, { value: 4.9 }))).body;
    const res = await bulk(ev.id, [
      item(a, { value: 4.6, replaceMeasurementId: saved.id }),
      item(a, { value: 4.5 }),
      item(a, { value: 4.4, replaceMeasurementId: saved.id }),
    ]);
    expect(res.status).toBe(201);
    expect(res.body.replaced.map((m: any) => m.index)).toEqual([0]);
    expect(res.body.created.map((m: any) => m.index)).toEqual([1]);
    expect(res.body.errors).toEqual([{ index: 2, error: expect.stringMatching(/more than once/i) }]);
    const replacedRow = (await rowsOf(ev.id)).find((r) => r.id === saved.id)!;
    expect(Number(replacedRow.value)).toBe(4.6);
  });

  it('a replace for an unregistered athlete is refused even with a matching row', async () => {
    const ev = await mkEvent();
    const a = byStatus.approved.id;
    const saved = (await single(ev.id, item(a, { value: 4.9 }))).body;
    await db
      .update(eventRegistrations)
      .set({ status: 'cancelled' })
      .where(and(eq(eventRegistrations.eventId, ev.id), eq(eventRegistrations.userId, a)));
    const res = await bulk(ev.id, [item(a, { value: 4.2, replaceMeasurementId: saved.id })]);
    expect(res.body.errors).toEqual([{ index: 0, error: expect.stringMatching(NOT_REGISTERED) }]);
    expect(Number((await rowsOf(ev.id))[0].value)).toBe(4.9);
  });

  it('a frozen event blocks a replace', async () => {
    const ev = await mkEvent();
    const a = byStatus.approved.id;
    const saved = (await single(ev.id, item(a, { value: 4.9 }))).body;
    await db.update(events).set({ isFrozen: true }).where(eq(events.id, ev.id));
    const res = await bulk(ev.id, [item(a, { value: 4.2, replaceMeasurementId: saved.id })]);
    expect(res.status).toBe(400);
    expect(Number((await rowsOf(ev.id))[0].value)).toBe(4.9);
  });
});
