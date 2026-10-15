/**
 * AM-FEAT-015 D3: zero scores are valid ONLY for Movement Quality metrics (0-3
 * ordinals); every other metric keeps positive() behavior, including existing
 * metrics whose site_metrics validation_min is 0 (spec criterion 6).
 * Re-applies migration 0146 in beforeAll.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { measurements, organizations, siteMetrics, teams, userTeams, users, userOrganizations } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The up-migration is idempotent (ON CONFLICT upserts). Re-apply it so these tests do not
// depend on suite ordering: other suites delete derived site_metrics rows from the shared DB.
const seedMqiMetrics = async () => {
  const upSql = fs.readFileSync(path.resolve(__dirname, '../../migrations/0146_seed_mqi_metrics.sql'), 'utf-8');
  await db.execute(sql.raw(upSql));
};

describe('MeasurementService zero / range validation', () => {
  const service = new MeasurementService();

  beforeAll(seedMqiMetrics);
  let orgId: string;
  let athleteId: string;
  let coachId: string;

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `Zero Org ${suffix}` }).returning();
    orgId = org.id;
    const [team] = await db
      .insert(teams)
      .values({ name: 'Zero Team', organizationId: orgId, level: 'College' })
      .returning();
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `zero-${tag}-${suffix}`,
            emails: [`zero-${tag}-${suffix}@test.com`],
            password: 'x',
            firstName: 'Z',
            lastName: tag,
            fullName: `Z ${tag}`,
            birthDate: '2008-01-01',
            birthYear: 2008,
          } as any)
          .returning()
      )[0].id;
    athleteId = await mk('ath');
    coachId = await mk('coach');
    await db.insert(userOrganizations).values({ userId: athleteId, organizationId: orgId, role: 'athlete' } as any);
    await db.insert(userTeams).values({ userId: athleteId, teamId: team.id, joinedAt: new Date('2020-01-01'), isActive: true });
  });

  afterEach(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
    await db.delete(userTeams).where(eq(userTeams.userId, athleteId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(teams).where(eq(teams.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, [athleteId, coachId]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const create = (metric: string, value: number) =>
    service.createMeasurement({ userId: athleteId, metric, value, date: '2026-03-10' } as any, coachId, 'coach');

  it('stores a 0 score for an MQ metric', async () => {
    const m = await create('MQ_JUMP', 0);
    expect(Number(m.value)).toBe(0);
    expect(m.units).toBe('score');
  });

  it.each([
    [4, /at most 3/],
    [-1, /at least 0/],
    [1.5, /whole number/],
  ])('rejects MQ score %s', async (v, message) => {
    await expect(create('MQ_JUMP', v)).rejects.toThrow(message);
  });

  it('stores an all-zero (all Absent) pattern set through the service and totals it to 0', async () => {
    const patterns = ['MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE', 'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP'];
    for (const metric of patterns) await create(metric, 0);
    const totals = await db
      .select()
      .from(measurements)
      .where(and(eq(measurements.userId, athleteId), eq(measurements.metric, 'MQI_TOTAL')));
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(0);
  });

  it.each(['MQI_TOTAL', 'MQ_TRANSITION_TOTAL'])('rejects manual entry of the calculated total %s', async (code) => {
    await expect(create(code, 10)).rejects.toThrow(/calculated automatically/);
  });

  // Existing metrics with validation_min = 0 in site_metrics must behave exactly as
  // before AM-FEAT-015: 0 rejected, max not enforced, decimals allowed (criterion 6).
  // Bounds mirror migrations 0128 / 0130 / 0137; rows are only inserted if absent.
  describe('existing metrics with validation_min = 0 are unchanged', () => {
    const LEGACY = [
      { code: 'RSI_L', unit: 'ratio', validationMin: '0', validationMax: '5', decimalPrecision: 2, aboveMax: 6.25 },
      { code: 'RSI_R', unit: 'ratio', validationMin: '0', validationMax: '5', decimalPrecision: 2, aboveMax: 5.5 },
      { code: 'AGILITY_505_M_LSI', unit: '%', validationMin: '0', validationMax: '100', decimalPrecision: 1, aboveMax: 101.5 },
      { code: 'RSI_ASYM', unit: '%', validationMin: '0', validationMax: '100', decimalPrecision: 1, aboveMax: 120 },
      { code: 'COND_YYIR1_DISTANCE', unit: 'm', validationMin: '0', validationMax: '4000', decimalPrecision: 0, aboveMax: 4100.5 },
    ];
    const inserted: string[] = [];

    beforeAll(async () => {
      for (const m of LEGACY) {
        const rows = await db
          .insert(siteMetrics)
          .values({
            code: m.code,
            label: m.code,
            category: 'test',
            unit: m.unit,
            metricType: 'higher_is_better',
            isActive: true,
            validationMin: m.validationMin,
            validationMax: m.validationMax,
            decimalPrecision: m.decimalPrecision,
          } as any)
          .onConflictDoNothing()
          .returning({ code: siteMetrics.code });
        inserted.push(...rows.map((r) => r.code));
      }
    });

    afterAll(async () => {
      if (inserted.length) await db.delete(siteMetrics).where(inArray(siteMetrics.code, inserted));
    });

    it.each(LEGACY.map((m) => [m.code, m.aboveMax]))('%s: rejects 0, accepts %s (above max)', async (code, aboveMax) => {
      await expect(create(code as string, 0)).rejects.toThrow(/positive/i);
      const m = await create(code as string, aboveMax as number);
      expect(Number(m.value)).toBe(aboveMax);
    });
  });

  it('keeps rejecting 0 for a standard metric (FLY10_TIME)', async () => {
    await expect(create('FLY10_TIME', 0)).rejects.toThrow(/positive/i);
  });

  it('keeps rejecting 0 for an unknown metric code', async () => {
    await expect(create('NO_SUCH_METRIC', 0)).rejects.toThrow(/positive/i);
  });

  it('update: allows 0 on an MQ score, rejects 0 on a standard metric', async () => {
    const mq = await create('MQ_JUMP', 2);
    const updated = await service.updateMeasurement(mq.id, { value: 0 }, undefined, 'coach');
    expect(Number(updated.value)).toBe(0);
    await expect(service.updateMeasurement(mq.id, { value: 4 }, undefined, 'coach')).rejects.toThrow(/at most 3/);

    const fly = await create('FLY10_TIME', 1.5);
    await expect(service.updateMeasurement(fly.id, { value: 0 }, undefined, 'coach')).rejects.toThrow(/positive/i);
  });
});

describe('POST /api/measurements value validation response shape', () => {
  let app: Express;
  let orgId: string;
  let teamId: string;
  let athlete: any;
  let coach: any;
  let cookie: string;

  // Posted by a coach: athletes cannot enter MQ scores at all (403, see mqi-athlete-restriction).
  beforeAll(async () => {
    await seedMqiMetrics();
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `Zero Route Org ${suffix}` }).returning();
    orgId = org.id;
    const [team] = await db
      .insert(teams)
      .values({ name: 'Zero Route Team', organizationId: orgId, level: 'College' })
      .returning();
    teamId = team.id;
    const password = await bcrypt.hash('ZeroRoute123!', BCRYPT_SALT_ROUNDS);
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `zero-route-${tag}-${suffix}`,
            emails: [`zero-route-${tag}-${suffix}@test.com`],
            password,
            firstName: 'Zero',
            lastName: `Route${tag}`,
            fullName: `Zero Route${tag}`,
            birthDate: '2008-01-01',
          } as any)
          .returning()
      )[0];
    athlete = await mk('ath');
    coach = await mk('coach');
    await db.insert(userOrganizations).values([
      { userId: athlete.id, organizationId: orgId, role: 'athlete' },
      { userId: coach.id, organizationId: orgId, role: 'coach' },
    ] as any);
    await db.insert(userTeams).values({ userId: athlete.id, teamId, joinedAt: new Date('2020-01-01'), isActive: true });
    const login = await request(app).post('/api/auth/login').send({ username: coach.username, password: 'ZeroRoute123!' });
    cookie = login.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athlete.id));
    await db.delete(userTeams).where(eq(userTeams.teamId, teamId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(teams).where(eq(teams.id, teamId));
    await db.delete(users).where(inArray(users.id, [athlete.id, coach.id]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('returns 400 { message, field: "value" } for an out-of-range MQ score', async () => {
    const res = await request(app)
      .post('/api/measurements')
      .set('Cookie', cookie)
      .send({ userId: athlete.id, metric: 'MQ_JUMP', value: 4, date: '2026-03-10' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Value must be at most 3', field: 'value' });
  });
});
