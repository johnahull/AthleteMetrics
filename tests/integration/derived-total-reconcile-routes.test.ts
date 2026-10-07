/**
 * Issue #526: site-admin repair action for missing/stale derived totals
 * (POST /api/derived-totals/reconcile) and the DERIVED_TOTAL_STALE warning on the
 * single and bulk delete responses.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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
import { DerivedMetricCalculator } from '../../packages/api/services/derived-metric-calculator';
import { events, measurements, organizations, userOrganizations, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = 'TestPass123!';
const DATE = '2026-04-20';
const PATTERNS = [
  'MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE',
  'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP',
];

let app: Express;
let orgId: string;
let athleteId: string;
let siteAdminId: string;
let coachId: string;
let orgAdminId: string;
let siteAdminCookie: string;
let coachCookie: string;
let orgAdminCookie: string;
let nextIp = 1;
const ip = () => `10.1.0.${nextIp++}`;

const reconcile = (cookie: string | null, body: Record<string, unknown> = {}) => {
  const req = request(app).post('/api/derived-totals/reconcile').set('X-Forwarded-For', ip());
  return (cookie ? req.set('Cookie', cookie) : req).send(body);
};

const totalRows = () =>
  db
    .select()
    .from(measurements)
    .where(
      and(
        eq(measurements.userId, athleteId),
        eq(measurements.metric, 'MQI_TOTAL'),
        eq(measurements.date, DATE),
        eq(measurements.isCalculated, true)
      )
    );

async function seedScores(value = '2') {
  // Direct inserts bypass the calculator: this is the state left behind when the
  // post-commit recalculation failed.
  await db.insert(measurements).values(
    PATTERNS.map((metric) => ({
      userId: athleteId,
      organizationId: orgId,
      submittedBy: coachId, isVerified: true,
      metric,
      value,
      units: 'score',
      age: 17,
      date: DATE,
    })) as any
  );
}

beforeAll(async () => {
  const up = fs.readFileSync(path.resolve(__dirname, '../../migrations/0146_seed_mqi_metrics.sql'), 'utf-8');
  await db.execute(sql.raw(up));
  const p148 = path.resolve(__dirname, '../../migrations/0148_mqi_latest_event_selection.sql');
  await db.execute(sql.raw(fs.readFileSync(p148, 'utf-8')));
  app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

beforeEach(async () => {
  const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const [org] = await db.insert(organizations).values({ name: `Reconcile Org ${ts}`, isActive: true } as any).returning();
  orgId = org.id;
  const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
  const mk = async (tag: string, extra: Record<string, unknown> = {}) =>
    (
      await db
        .insert(users)
        .values({
          username: `rc_${tag}_${ts}`,
          emails: [`rc_${tag}_${ts}@test.com`],
          password: hashed,
          firstName: tag,
          lastName: 'Rc',
          fullName: `${tag} Rc`,
          birthDate: '2008-01-01',
          birthYear: 2008,
          ...extra,
        } as any)
        .returning()
    )[0];
  const athlete = await mk('ath');
  const siteAdmin = await mk('site', { isSiteAdmin: true });
  const coach = await mk('coach');
  const orgAdmin = await mk('orgadmin');
  athleteId = athlete.id;
  siteAdminId = siteAdmin.id;
  coachId = coach.id;
  orgAdminId = orgAdmin.id;
  await db.insert(userOrganizations).values([
    { userId: athleteId, organizationId: orgId, role: 'athlete' },
    { userId: coachId, organizationId: orgId, role: 'coach' },
    { userId: orgAdminId, organizationId: orgId, role: 'org_admin' },
  ] as any);
  const login = async (u: any) =>
    (await request(app).post('/api/auth/login').send({ username: u.username, password: PASSWORD })).headers['set-cookie'][0];
  siteAdminCookie = await login(siteAdmin);
  coachCookie = await login(coach);
  orgAdminCookie = await login(orgAdmin);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete(measurements).where(eq(measurements.userId, athleteId));
  const ids = [athleteId, siteAdminId, coachId, orgAdminId];
  await db.delete(userOrganizations).where(inArray(userOrganizations.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe('POST /api/derived-totals/reconcile', () => {
  it('401 when unauthenticated', async () => {
    expect((await reconcile(null)).status).toBe(401);
  });

  it('403 for a coach', async () => {
    await seedScores();
    const res = await reconcile(coachCookie, { organizationId: orgId });
    expect(res.status).toBe(403);
    expect(await totalRows()).toHaveLength(0);
  });

  it('403 for an org admin (site-admin-only action)', async () => {
    await seedScores();
    const res = await reconcile(orgAdminCookie, { organizationId: orgId });
    expect(res.status).toBe(403);
    expect(await totalRows()).toHaveLength(0);
  });

  it('400 on an invalid body', async () => {
    const res = await reconcile(siteAdminCookie, { limit: -5 });
    expect(res.status).toBe(400);
  });

  it('dryRun reports the missing total without writing it', async () => {
    await seedScores();
    const res = await reconcile(siteAdminCookie, { organizationId: orgId, dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.drifted).toBe(1);
    expect(res.body.findings[0]).toMatchObject({
      userId: athleteId, metric: 'MQI_TOTAL', date: DATE, reason: 'missing_total', outcome: 'detected',
    });
    expect(await totalRows()).toHaveLength(0);
  });

  it('creates a missing total for a complete source set, and is idempotent', async () => {
    await seedScores('2');
    const res = await reconcile(siteAdminCookie, { organizationId: orgId });
    expect(res.status).toBe(200);
    expect(res.body.repaired).toBe(1);
    expect(res.body.failed).toBe(0);
    const rows = await totalRows();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].value)).toBe(16);

    const again = await reconcile(siteAdminCookie, { organizationId: orgId });
    expect(again.body.drifted).toBe(0);
    expect(await totalRows()).toHaveLength(1);
  });

  it('does not create a total for an incomplete source set', async () => {
    await db.insert(measurements).values({
      userId: athleteId, organizationId: orgId, submittedBy: coachId, isVerified: true,
      metric: 'MQ_JUMP', value: '2', units: 'score', age: 17, date: DATE,
    } as any);
    const res = await reconcile(siteAdminCookie, { organizationId: orgId });
    expect(res.body.drifted).toBe(0);
    expect(await totalRows()).toHaveLength(0);
  });

  it('repairs a stale total after a source value changed behind the calculator', async () => {
    await seedScores('2');
    await reconcile(siteAdminCookie, { organizationId: orgId });
    await db
      .update(measurements)
      .set({ value: '3' })
      .where(and(eq(measurements.userId, athleteId), eq(measurements.metric, 'MQ_JUMP')));

    const res = await reconcile(siteAdminCookie, { organizationId: orgId });
    expect(res.body.repaired).toBe(1);
    expect(res.body.findings[0].reason).toBe('stale_total');
    expect(Number((await totalRows())[0].value)).toBe(17);
  });

  it('removes an orphaned total whose source was deleted behind the calculator', async () => {
    await seedScores('2');
    await reconcile(siteAdminCookie, { organizationId: orgId });
    await db
      .delete(measurements)
      .where(and(eq(measurements.userId, athleteId), eq(measurements.metric, 'MQ_JUMP')));

    const res = await reconcile(siteAdminCookie, { organizationId: orgId });
    expect(res.body.repaired).toBe(1);
    expect(res.body.findings[0].reason).toBe('orphaned_total');
    expect(await totalRows()).toHaveLength(0);
  });

  it('honours the limit and reports truncation', async () => {
    await seedScores('2');
    const [second] = await db
      .insert(users)
      .values({
        username: `rc_second_${Date.now()}`,
        emails: [`rc_second_${Date.now()}@test.com`],
        password: 'x',
        firstName: 'Second',
        lastName: 'Rc',
        fullName: 'Second Rc',
        birthDate: '2008-01-01',
        birthYear: 2008,
      } as any)
      .returning();
    try {
      await db.insert(measurements).values(
        PATTERNS.map((metric) => ({
          userId: second.id, organizationId: orgId, submittedBy: coachId, isVerified: true,
          metric, value: '1', units: 'score', age: 17, date: DATE,
        })) as any
      );
      const res = await reconcile(siteAdminCookie, { organizationId: orgId, limit: 1 });
      expect(res.body.drifted).toBe(2);
      expect(res.body.repaired).toBe(1);
      expect(res.body.truncated).toBe(true);
      const rest = await reconcile(siteAdminCookie, { organizationId: orgId });
      expect(rest.body.repaired).toBe(1);
      expect(rest.body.truncated).toBe(false);
    } finally {
      await db.delete(measurements).where(eq(measurements.userId, second.id));
      await db.delete(users).where(eq(users.id, second.id));
    }
  });

  it('counts a repair that fails again as failed, not repaired', async () => {
    await seedScores('2');
    vi.spyOn(DerivedMetricCalculator.prototype as any, 'computeAndUpsertDerived').mockRejectedValue(new Error('still down'));
    const res = await reconcile(siteAdminCookie, { organizationId: orgId });
    expect(res.status).toBe(200);
    expect(res.body.failed).toBe(1);
    expect(res.body.repaired).toBe(0);
    expect(await totalRows()).toHaveLength(0);
  });
  it('ignores an unverified complete source set (the calculator ignores it too)', async () => {
    await seedScores('2');
    await db.update(measurements).set({ isVerified: false }).where(eq(measurements.userId, athleteId));
    const res = await reconcile(siteAdminCookie, { organizationId: orgId, dryRun: true });
    expect(res.body.drifted).toBe(0);
  });

  it('does not re-flag a worse same-date retest forever', async () => {
    await seedScores('2');
    await reconcile(siteAdminCookie, { organizationId: orgId });
    await db.insert(measurements).values({
      userId: athleteId, organizationId: orgId, submittedBy: coachId, isVerified: true,
      metric: 'MQ_JUMP', value: '1', units: 'score', age: 17, date: DATE,
    } as any);
    const res = await reconcile(siteAdminCookie, { organizationId: orgId });
    expect(res.body.drifted).toBe(0);
  });

  it('does not flag an older Movement Quality event on the same date', async () => {
    const mkEvent = async (name: string, start: string) =>
      (
        await db
          .insert(events)
          .values({ name, organizationId: orgId, startDate: new Date(start), createdBy: coachId } as any)
          .returning()
      )[0];
    const older = await mkEvent('rc older', `${DATE}T08:00:00Z`);
    const newer = await mkEvent('rc newer', `${DATE}T16:00:00Z`);
    try {
      for (const [ev, value] of [[older, '1'], [newer, '3']] as const) {
        await db.insert(measurements).values(
          PATTERNS.map((metric) => ({
            userId: athleteId, organizationId: orgId, submittedBy: coachId, isVerified: true,
            eventId: ev.id, metric, value, units: 'score', age: 17, date: DATE,
          })) as any
        );
      }
      const first = await reconcile(siteAdminCookie, { organizationId: orgId });
      expect(first.body.repaired).toBe(1);
      expect(Number((await totalRows())[0].value)).toBe(24);
      const again = await reconcile(siteAdminCookie, { organizationId: orgId });
      expect(again.body.drifted).toBe(0);
    } finally {
      await db.delete(measurements).where(eq(measurements.userId, athleteId));
      await db.delete(events).where(inArray(events.id, [older.id, newer.id]));
    }
  });

  it("an 'unchanged' outcome does not consume the repair budget", async () => {
    await seedScores('2');
    const [second] = await db
      .insert(users)
      .values({
        username: `rc_s2_${Date.now()}`, emails: [`rc_s2_${Date.now()}@test.com`], password: 'x',
        firstName: 'S2', lastName: 'Rc', fullName: 'S2 Rc', birthDate: '2008-01-01', birthYear: 2008,
      } as any)
      .returning();
    try {
      await db.insert(measurements).values(
        PATTERNS.map((metric) => ({
          userId: second.id, organizationId: orgId, submittedBy: coachId, isVerified: true,
          metric, value: '1', units: 'score', age: 17, date: DATE,
        })) as any
      );
      const original = DerivedMetricCalculator.prototype.recalculateForAthlete;
      // First repair attempt is a no-op (a false positive); the next calls go through
      vi.spyOn(DerivedMetricCalculator.prototype, 'recalculateForAthlete')
        .mockImplementationOnce(async () => undefined)
        .mockImplementation(function (this: any, ...args: any[]) {
          return (original as any).apply(this, args);
        });
      const res = await reconcile(siteAdminCookie, { organizationId: orgId, limit: 1 });
      expect(res.body.unchanged).toBe(1);
      expect(res.body.repaired).toBe(1);
      expect(res.body.truncated).toBe(false);
      expect(res.body.drifted).toBe(2);
      expect(res.body.findings.map((f: any) => f.outcome)).toEqual(['repaired']);
    } finally {
      await db.delete(measurements).where(eq(measurements.userId, second.id));
      await db.delete(users).where(eq(users.id, second.id));
    }
  });

  it('attributes failures only to the metric being reconciled', async () => {
    await seedScores('2');
    const original = DerivedMetricCalculator.prototype.recalculateForAthlete;
    vi.spyOn(DerivedMetricCalculator.prototype, 'recalculateForAthlete').mockImplementation(async function (this: any, ...args: any[]) {
      this.failures.push({ metric: 'SOME_CUSTOM_TOTAL', date: DATE, userId: athleteId });
      return (original as any).apply(this, args);
    });
    const res = await reconcile(siteAdminCookie, { organizationId: orgId });
    expect(res.body.failed).toBe(0);
    expect(res.body.repaired).toBe(1);
  });

  it("an org-scoped run leaves another organization's totals alone", async () => {
    const [orgB] = await db.insert(organizations).values({ name: `Reconcile Org B ${Date.now()}`, isActive: true } as any).returning();
    const [other] = await db
      .insert(users)
      .values({
        username: `rc_b_${Date.now()}`, emails: [`rc_b_${Date.now()}@test.com`], password: 'x',
        firstName: 'B', lastName: 'Rc', fullName: 'B Rc', birthDate: '2008-01-01', birthYear: 2008,
      } as any)
      .returning();
    try {
      await db.insert(measurements).values({
        userId: other.id, organizationId: orgB.id, submittedBy: coachId, metric: 'MQI_TOTAL',
        value: '9', units: 'score', age: 17, date: DATE, isCalculated: true,
        calculatedFromMeasurementIds: [athleteId], calculationMetadata: { formula: 'x', sourceValues: {} },
      } as any);
      const res = await reconcile(siteAdminCookie, { organizationId: orgId });
      expect(res.body.drifted).toBe(0);
      expect(await db.select().from(measurements).where(eq(measurements.userId, other.id))).toHaveLength(1);
    } finally {
      await db.delete(measurements).where(eq(measurements.userId, other.id));
      await db.delete(users).where(eq(users.id, other.id));
      await db.delete(organizations).where(eq(organizations.id, orgB.id));
    }
  });

  it('dryRun applies the limit to findings, with truncated and full counts', async () => {
    await seedScores('2');
    const [second] = await db
      .insert(users)
      .values({
        username: `rc_d2_${Date.now()}`, emails: [`rc_d2_${Date.now()}@test.com`], password: 'x',
        firstName: 'D2', lastName: 'Rc', fullName: 'D2 Rc', birthDate: '2008-01-01', birthYear: 2008,
      } as any)
      .returning();
    try {
      await db.insert(measurements).values(
        PATTERNS.map((metric) => ({
          userId: second.id, organizationId: orgId, submittedBy: coachId, isVerified: true,
          metric, value: '1', units: 'score', age: 17, date: DATE,
        })) as any
      );
      const res = await reconcile(siteAdminCookie, { organizationId: orgId, dryRun: true, limit: 1 });
      expect(res.body.drifted).toBe(2);
      expect(res.body.findings).toHaveLength(1);
      expect(res.body.truncated).toBe(true);
    } finally {
      await db.delete(measurements).where(eq(measurements.userId, second.id));
      await db.delete(users).where(eq(users.id, second.id));
    }
  });

  it('does not spend rate limit on unauthenticated requests', async () => {
    const ipAddr = ip();
    for (let i = 0; i < 12; i++) {
      await request(app).post('/api/derived-totals/reconcile').set('X-Forwarded-For', ipAddr).send({});
    }
    const res = await request(app)
      .post('/api/derived-totals/reconcile')
      .set('X-Forwarded-For', ipAddr)
      .set('Cookie', siteAdminCookie)
      .send({ dryRun: true, organizationId: orgId });
    expect(res.status).toBe(200);
  });
});

describe('delete responses carry DERIVED_TOTAL_STALE warnings', () => {
  const seedOne = async () => {
    const [m] = await db
      .insert(measurements)
      .values({
        userId: athleteId, organizationId: orgId, submittedBy: coachId, isVerified: true,
        metric: 'MQ_JUMP', value: '2', units: 'score', age: 17, date: DATE,
      } as any)
      .returning();
    return m;
  };

  it('DELETE /api/measurements/:id: success without warnings key, warnings when recalculation fails', async () => {
    const ok = await seedOne();
    const res1 = await request(app).delete(`/api/measurements/${ok.id}`).set('X-Forwarded-For', ip()).set('Cookie', siteAdminCookie);
    expect(res1.status).toBe(200);
    expect(res1.body.message).toBe('Measurement deleted successfully');
    expect('warnings' in res1.body).toBe(false);

    const bad = await seedOne();
    vi.spyOn(DerivedMetricCalculator.prototype as any, 'computeAndUpsertDerived').mockRejectedValue(new Error('timeout'));
    const res2 = await request(app).delete(`/api/measurements/${bad.id}`).set('X-Forwarded-For', ip()).set('Cookie', siteAdminCookie);
    expect(res2.status).toBe(200);
    expect(res2.body.message).toBe('Measurement deleted successfully');
    expect(res2.body.warnings).toEqual([{ code: 'DERIVED_TOTAL_STALE', metric: 'MQI_TOTAL', date: DATE, userId: athleteId }]);
  });

  it('POST /api/measurements/bulk-delete: warnings when recalculation fails', async () => {
    const m = await seedOne();
    vi.spyOn(DerivedMetricCalculator.prototype as any, 'computeAndUpsertDerived').mockRejectedValue(new Error('timeout'));
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', ip())
      .set('Cookie', siteAdminCookie)
      .send({ measurementIds: [m.id] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);
    expect(res.body.warnings).toEqual([{ code: 'DERIVED_TOTAL_STALE', metric: 'MQI_TOTAL', date: DATE, userId: athleteId }]);
  });
});
