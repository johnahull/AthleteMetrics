/**
 * Integration tests for paired-input metric routes (weight-lifting maxes).
 *
 * Covers:
 *   - POST /api/measurements/calculate-lift-preview (happy path + 4 error cases)
 *   - POST /api/measurements with auxiliaryValue persists computed 1RM,
 *     auxiliary input, isCalculated=true, and calculationMetadata
 *
 * Auth model: athlete logs in, creates measurements for self.
 *
 * Test metric is inserted directly into site_metrics in beforeEach so this
 * file does not depend on the seed migration 0125 having run.
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import {
  organizations,
  users,
  userOrganizations,
  teams,
  userTeams,
  measurements,
  siteMetrics,
} from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

let app: Express;
let testOrg: any;
let athlete: any;
let team: any;
let athleteCookie: string;

const TEST_METRIC_CODE = 'TEST_BENCH_1RM_INT';
const TEST_AUXILIARY_CONFIG = {
  label: 'Reps',
  unit: 'reps',
  validationMin: 1,
  validationMax: 12,
  required: true,
  computeFormula: 'load * (1 + reps / 30)',
  primaryInputLabel: 'Weight Lifted',
  primaryInputUnit: 'lbs',
};

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

beforeEach(async () => {
  const ts = Date.now();

  [testOrg] = await db
    .insert(organizations)
    .values({
      name: `Lift Routes Org ${ts}`,
      description: 'lift-max route tests',
      isActive: true,
    })
    .returning();

  [team] = await db
    .insert(teams)
    .values({
      organizationId: testOrg.id,
      name: `Lift Team ${ts}`,
      level: 'Club',
    })
    .returning();

  const hashed = await hashPassword('TestAthlete123!');
  [athlete] = await db
    .insert(users)
    .values({
      username: `lift_athlete_${ts}`,
      emails: [`lift_athlete_${ts}@test.com`],
      password: hashed,
      firstName: 'Test',
      lastName: 'Lifter',
      fullName: 'Test Lifter',
    })
    .returning();

  await db.insert(userOrganizations).values({
    userId: athlete.id,
    organizationId: testOrg.id,
    role: 'athlete',
  });

  // Set joinedAt to an explicit date before any test measurements so the
  // measurement-service's auto-team-detect (which filters joinedAt <= measurementDate)
  // includes this membership. Without an explicit date, joinedAt = now() (timestamp)
  // can race ahead of measurementDate (date-only, parsed at UTC midnight).
  await db.insert(userTeams).values({
    userId: athlete.id,
    teamId: team.id,
    isActive: true,
    joinedAt: new Date('2024-01-01T00:00:00Z'),
  });

  // Seed the test metric (paired-input 1RM-est, isolated from prod codes)
  await db.insert(siteMetrics).values({
    code: TEST_METRIC_CODE,
    label: 'TEST Bench Press 1RM',
    category: 'strength',
    unit: 'lbs',
    metricType: 'higher_is_better',
    isActive: true,
    auxiliaryInputConfig: TEST_AUXILIARY_CONFIG,
  });

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: athlete.username, password: 'TestAthlete123!' });
  athleteCookie = login.headers['set-cookie'][0];
});

afterEach(async () => {
  // Order matters for FK cascades
  if (athlete?.id) {
    await db.delete(measurements).where(eq(measurements.userId, athlete.id));
  }
  if (athlete?.id && team?.id) {
    await db
      .delete(userTeams)
      .where(and(eq(userTeams.userId, athlete.id), eq(userTeams.teamId, team.id)));
  }
  if (team?.id) {
    await db.delete(teams).where(eq(teams.id, team.id));
  }
  if (athlete?.id && testOrg?.id) {
    await db
      .delete(userOrganizations)
      .where(
        and(
          eq(userOrganizations.userId, athlete.id),
          eq(userOrganizations.organizationId, testOrg.id),
        ),
      );
  }
  if (athlete?.id) {
    await db.delete(users).where(eq(users.id, athlete.id));
  }
  if (testOrg?.id) {
    await db.delete(organizations).where(eq(organizations.id, testOrg.id));
  }
  await db.delete(siteMetrics).where(eq(siteMetrics.code, TEST_METRIC_CODE));
});

describe('POST /api/measurements/calculate-lift-preview', () => {
  it('returns the computed Epley 1RM for valid inputs', async () => {
    const res = await request(app)
      .post('/api/measurements/calculate-lift-preview')
      .set('Cookie', athleteCookie)
      .send({ metricCode: TEST_METRIC_CODE, primary: 315, auxiliary: 3 });

    expect(res.status).toBe(200);
    expect(res.body.computedValue).toBe(346.5);
    expect(res.body.formula).toBe(TEST_AUXILIARY_CONFIG.computeFormula);
    expect(res.body.primaryUnit).toBe('lbs');
    expect(res.body.auxiliaryLabel).toBe('Reps');
  });

  it('401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/measurements/calculate-lift-preview')
      .send({ metricCode: TEST_METRIC_CODE, primary: 315, auxiliary: 3 });
    expect(res.status).toBe(401);
  });

  it('404 when metric does not exist', async () => {
    const res = await request(app)
      .post('/api/measurements/calculate-lift-preview')
      .set('Cookie', athleteCookie)
      .send({ metricCode: 'NONEXISTENT_METRIC', primary: 315, auxiliary: 3 });
    expect(res.status).toBe(404);
  });

  it('400 with field=auxiliaryValue when auxiliary out of range', async () => {
    const res = await request(app)
      .post('/api/measurements/calculate-lift-preview')
      .set('Cookie', athleteCookie)
      .send({ metricCode: TEST_METRIC_CODE, primary: 315, auxiliary: 13 });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('auxiliaryValue');
    expect(res.body.message).toMatch(/at most 12/i);
  });

  it('400 when missing required auxiliary', async () => {
    const res = await request(app)
      .post('/api/measurements/calculate-lift-preview')
      .set('Cookie', athleteCookie)
      .send({ metricCode: TEST_METRIC_CODE, primary: 315 });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('auxiliaryValue');
  });

  it('400 with field=metricCode when metric is not paired-input', async () => {
    // Insert a non-paired-input metric for this test
    const nonPairedCode = 'TEST_NON_PAIRED';
    await db.insert(siteMetrics).values({
      code: nonPairedCode,
      label: 'Non-Paired',
      unit: 's',
      metricType: 'lower_is_better',
      isActive: true,
    });

    try {
      const res = await request(app)
        .post('/api/measurements/calculate-lift-preview')
        .set('Cookie', athleteCookie)
        .send({ metricCode: nonPairedCode, primary: 315, auxiliary: 3 });

      expect(res.status).toBe(400);
      expect(res.body.field).toBe('metricCode');
    } finally {
      await db.delete(siteMetrics).where(eq(siteMetrics.code, nonPairedCode));
    }
  });
});

describe('POST /api/measurements (paired-input persistence)', () => {
  it('persists computed value, auxiliaryValue, isCalculated, and metadata', async () => {
    const res = await request(app)
      .post('/api/measurements')
      .set('Cookie', athleteCookie)
      .send({
        userId: athlete.id,
        date: '2026-04-27',
        metric: TEST_METRIC_CODE,
        value: 315,
        auxiliaryValue: 3,
        teamId: team.id,
      });

    expect(res.status).toBe(201);
    expect(parseFloat(res.body.value)).toBe(346.5);
    expect(parseFloat(res.body.auxiliaryValue)).toBe(3);
    expect(res.body.units).toBe('lbs');
    expect(res.body.isCalculated).toBe(true);
    expect(res.body.calculationMetadata.formula).toBe(TEST_AUXILIARY_CONFIG.computeFormula);
    expect(res.body.calculationMetadata.sourceValues).toEqual({ load: 315, reps: 3 });
    expect(res.body.calculationMetadata.parentMetric).toBe(TEST_METRIC_CODE);
  });

  it('rejects with field=auxiliaryValue when missing required reps', async () => {
    const res = await request(app)
      .post('/api/measurements')
      .set('Cookie', athleteCookie)
      .send({
        userId: athlete.id,
        date: '2026-04-27',
        metric: TEST_METRIC_CODE,
        value: 315,
        // auxiliaryValue intentionally missing
      });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('auxiliaryValue');
  });

  it('rejects when reps out of range (auxiliary > 12)', async () => {
    const res = await request(app)
      .post('/api/measurements')
      .set('Cookie', athleteCookie)
      .send({
        userId: athlete.id,
        date: '2026-04-27',
        metric: TEST_METRIC_CODE,
        value: 315,
        auxiliaryValue: 15,
      });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('auxiliaryValue');
  });
});

describe('PUT /api/measurements/:id (paired-input recompute)', () => {
  it('recomputes value when auxiliaryValue changes', async () => {
    // First create a measurement
    const createRes = await request(app)
      .post('/api/measurements')
      .set('Cookie', athleteCookie)
      .send({
        userId: athlete.id,
        date: '2026-04-27',
        metric: TEST_METRIC_CODE,
        value: 315,
        auxiliaryValue: 3,
        teamId: team.id,
      });
    expect(createRes.status).toBe(201);
    const measurementId = createRes.body.id;

    // Now update reps from 3 to 5 — value should recompute from 346.5 to 367.5
    const updateRes = await request(app)
      .put(`/api/measurements/${measurementId}`)
      .set('Cookie', athleteCookie)
      .send({ auxiliaryValue: 5 });

    expect(updateRes.status).toBe(200);
    expect(parseFloat(updateRes.body.value)).toBe(367.5);
    expect(parseFloat(updateRes.body.auxiliaryValue)).toBe(5);
    expect(updateRes.body.isCalculated).toBe(true);
  });

  it('recomputes when metric is changed TO a paired-input metric', async () => {
    // Seed a non-paired-input metric for the source side of the change
    const NON_PAIRED_CODE = 'TEST_NON_PAIRED_FOR_CHANGE';
    await db.insert(siteMetrics).values({
      code: NON_PAIRED_CODE,
      label: 'TEST Non-Paired Source',
      unit: 's',
      metricType: 'lower_is_better',
      isActive: true,
    });

    try {
      // Create as a non-paired-input measurement
      const createRes = await request(app)
        .post('/api/measurements')
        .set('Cookie', athleteCookie)
        .send({
          userId: athlete.id,
          date: '2026-04-27',
          metric: NON_PAIRED_CODE,
          value: 100,
          teamId: team.id,
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.isCalculated).toBe(false);
      const measurementId = createRes.body.id;

      // Change metric to paired-input AND provide auxiliaryValue. The recompute
      // must fire on metric-change (not just value/aux change) — this was the
      // bug found in code review.
      const updateRes = await request(app)
        .put(`/api/measurements/${measurementId}`)
        .set('Cookie', athleteCookie)
        .send({ metric: TEST_METRIC_CODE, value: 315, auxiliaryValue: 3 });

      expect(updateRes.status).toBe(200);
      expect(parseFloat(updateRes.body.value)).toBe(346.5);
      expect(updateRes.body.isCalculated).toBe(true);
      expect(updateRes.body.units).toBe('lbs');
      expect(updateRes.body.calculationMetadata?.formula).toBe(TEST_AUXILIARY_CONFIG.computeFormula);
    } finally {
      await db.delete(siteMetrics).where(eq(siteMetrics.code, NON_PAIRED_CODE));
    }
  });

  it('recomputes correctly when only value (load) changes, keeping existing reps', async () => {
    // Verifies the existingSourceLoad path: when reps are unchanged and load is
    // corrected, the recompute uses the new load (not the prior estimated 1RM).
    const createRes = await request(app)
      .post('/api/measurements')
      .set('Cookie', athleteCookie)
      .send({
        userId: athlete.id,
        date: '2026-04-27',
        metric: TEST_METRIC_CODE,
        value: 315,
        auxiliaryValue: 3,
        teamId: team.id,
      });
    expect(createRes.status).toBe(201);
    expect(parseFloat(createRes.body.value)).toBe(346.5); // 315 * 1.1
    const measurementId = createRes.body.id;

    // Correct load from 315 → 320, keep reps=3. Expected: 320 * (1 + 3/30) = 352.
    const updateRes = await request(app)
      .put(`/api/measurements/${measurementId}`)
      .set('Cookie', athleteCookie)
      .send({ value: 320 });

    expect(updateRes.status).toBe(200);
    expect(parseFloat(updateRes.body.value)).toBe(352);
    expect(parseFloat(updateRes.body.auxiliaryValue)).toBe(3);
    expect(updateRes.body.isCalculated).toBe(true);
    expect(updateRes.body.calculationMetadata.sourceValues).toEqual({ load: 320, reps: 3 });
  });

  it('clears paired-input state when metric is changed AWAY from paired-input', async () => {
    const NON_PAIRED_CODE = 'TEST_NON_PAIRED_TARGET';
    await db.insert(siteMetrics).values({
      code: NON_PAIRED_CODE,
      label: 'TEST Non-Paired Target',
      unit: 's',
      metricType: 'lower_is_better',
      isActive: true,
    });

    try {
      // Start with a paired-input measurement
      const createRes = await request(app)
        .post('/api/measurements')
        .set('Cookie', athleteCookie)
        .send({
          userId: athlete.id,
          date: '2026-04-27',
          metric: TEST_METRIC_CODE,
          value: 315,
          auxiliaryValue: 3,
          teamId: team.id,
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.isCalculated).toBe(true);
      const measurementId = createRes.body.id;

      // Change metric away from paired-input. Stale isCalculated /
      // calculationMetadata / auxiliaryValue must be cleared — this was the
      // second bug found in code review (would render an "est." badge on a
      // plain measurement).
      const updateRes = await request(app)
        .put(`/api/measurements/${measurementId}`)
        .set('Cookie', athleteCookie)
        .send({ metric: NON_PAIRED_CODE, value: 12.5 });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.isCalculated).toBe(false);
      expect(updateRes.body.calculationMetadata).toBeNull();
      expect(updateRes.body.auxiliaryValue).toBeNull();
      expect(updateRes.body.units).toBe('s');
    } finally {
      await db.delete(siteMetrics).where(eq(siteMetrics.code, NON_PAIRED_CODE));
    }
  });
});
