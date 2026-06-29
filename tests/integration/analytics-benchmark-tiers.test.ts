/**
 * Integration Tests for GET /api/analytics/benchmark-tiers
 *
 * Verifies the tier-comparison endpoint against a real test database:
 *   1. With an org tier benchmark group + an athlete measurement, returns a
 *      non-null `comparison` with the expected tierName / nextTierName.
 *   2. For a metric/athlete with no benchmark (and no measurement), returns
 *      `{ comparison: null }` with HTTP 200 (no-data contract).
 *   3. Missing athleteId/metric query params returns HTTP 400.
 *
 * Modeled on tests/integration/report-trends.test.ts (same harness/bootstrap).
 */

// Set environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true'; // Bypass rate limits for these tests

import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { db } from '../../packages/api/db';
import {
  organizations,
  users,
  userOrganizations,
  measurements,
  customBenchmarks,
  organizationBenchmarks,
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

// Mock vite module before importing registerRoutes
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

let app: Express;
let testOrg: any;
let testCoach: any;
let testAthlete: any;
let coachAuthCookie: string;
let createdBenchmarkIds: string[] = [];
let createdOrgBenchmarkIds: string[] = [];

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

afterAll(async () => {
  if (testCoach) {
    await db.delete(users).where(eq(users.id, testCoach.id));
  }
});

beforeEach(async () => {
  // Fresh organization
  [testOrg] = await db.insert(organizations).values({
    name: `Tiers Org ${Date.now()}`,
    description: 'Test organization for benchmark-tiers integration tests',
    isActive: true,
  }).returning();

  // Coach (requester)
  const coachPassword = await hashPassword('TestCoach123!');
  [testCoach] = await db.insert(users).values({
    username: `tierscoach_${Date.now()}`,
    emails: [`tierscoach_${Date.now()}@test.com`],
    password: coachPassword,
    firstName: 'Tiers',
    lastName: 'Coach',
    fullName: 'Tiers Coach',
  }).returning();

  await db.insert(userOrganizations).values({
    userId: testCoach.id,
    organizationId: testOrg.id,
    role: 'coach',
  });

  // Athlete
  const athletePassword = await hashPassword('AthletePass123!');
  [testAthlete] = await db.insert(users).values({
    username: `tiersathlete_${Date.now()}`,
    emails: [`tiersathlete_${Date.now()}@test.com`],
    password: athletePassword,
    firstName: 'Tiers',
    lastName: 'Athlete',
    fullName: 'Tiers Athlete',
  }).returning();

  await db.insert(userOrganizations).values({
    userId: testAthlete.id,
    organizationId: testOrg.id,
    role: 'athlete',
  });

  // Two VERTICAL_JUMP measurements; best (higher-is-better) = 27.5
  await db.insert(measurements).values([
    {
      userId: testAthlete.id,
      submittedBy: testCoach.id,
      date: '2024-01-15',
      age: 17,
      metric: 'VERTICAL_JUMP',
      value: '24.000',
      units: 'in',
      organizationId: testOrg.id,
      isVerified: true,
    },
    {
      userId: testAthlete.id,
      submittedBy: testCoach.id,
      date: '2024-03-15',
      age: 17,
      metric: 'VERTICAL_JUMP',
      value: '27.500',
      units: 'in',
      organizationId: testOrg.id,
      isVerified: true,
    },
  ]);

  // Custom tier benchmark group for VERTICAL_JUMP, enabled for the org.
  // 27.5 falls inside "Good" [25,30]; the next better tier is "Elite".
  const tierGroupId = randomUUID();
  const tierDefs = [
    { tierOrder: 1, tierName: 'Elite', tierColor: 'green', minValue: '30.00', maxValue: '50.00' },
    { tierOrder: 2, tierName: 'Good', tierColor: 'blue', minValue: '25.00', maxValue: '30.00' },
    { tierOrder: 3, tierName: 'Developing', tierColor: 'gray', minValue: '0.00', maxValue: '25.00' },
  ];
  const insertedTiers = await db.insert(customBenchmarks).values(
    tierDefs.map((t) => ({
      organizationId: testOrg.id,
      metricCode: 'VERTICAL_JUMP',
      name: `VJ ${t.tierName}`,
      comparisonOperator: 'range',
      minValue: t.minValue,
      maxValue: t.maxValue,
      tierGroupId,
      tierOrder: t.tierOrder,
      tierName: t.tierName,
      tierColor: t.tierColor,
      isActive: true,
    }))
  ).returning();
  createdBenchmarkIds = insertedTiers.map((b) => b.id);

  const insertedOrgBenchmarks = await db.insert(organizationBenchmarks).values(
    insertedTiers.map((b, idx) => ({
      organizationId: testOrg.id,
      benchmarkId: b.id,
      benchmarkType: 'custom',
      isEnabled: true,
      // (organization_id, display_order) has a partial unique index — keep distinct
      displayOrder: idx + 1,
    }))
  ).returning();
  createdOrgBenchmarkIds = insertedOrgBenchmarks.map((o) => o.id);

  // Login as coach
  const coachLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: testCoach.username, password: 'TestCoach123!' });

  coachAuthCookie = coachLogin.headers['set-cookie'][0];
});

afterEach(async () => {
  if (createdOrgBenchmarkIds.length > 0) {
    await db.delete(organizationBenchmarks).where(inArray(organizationBenchmarks.id, createdOrgBenchmarkIds));
    createdOrgBenchmarkIds = [];
  }
  if (createdBenchmarkIds.length > 0) {
    await db.delete(customBenchmarks).where(inArray(customBenchmarks.id, createdBenchmarkIds));
    createdBenchmarkIds = [];
  }
  if (testAthlete) {
    await db.delete(measurements).where(eq(measurements.userId, testAthlete.id));
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, testAthlete.id));
    await db.delete(users).where(eq(users.id, testAthlete.id));
    testAthlete = null;
  }
  if (testCoach && testOrg) {
    await db.delete(userOrganizations).where(
      and(
        eq(userOrganizations.userId, testCoach.id),
        eq(userOrganizations.organizationId, testOrg.id)
      )
    );
  }
  if (testCoach) {
    await db.delete(users).where(eq(users.id, testCoach.id));
    testCoach = null;
  }
  if (testOrg) {
    await db.delete(organizations).where(eq(organizations.id, testOrg.id));
  }
});

describe('GET /api/analytics/benchmark-tiers', () => {
  it('returns a non-null comparison with the expected tier for a benchmarked metric', async () => {
    const response = await request(app)
      .get('/api/analytics/benchmark-tiers')
      .query({ athleteId: testAthlete.id, metric: 'VERTICAL_JUMP' })
      .set('Cookie', coachAuthCookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('comparison');
    expect(response.body.comparison).not.toBeNull();

    const c = response.body.comparison;
    // Best value 27.5 falls in the "Good" tier (25–30)
    expect(c.tierName).toBe('Good');
    expect(c.athleteValue).toBe(27.5);
    expect(c.isBestTier).toBe(false);
    // Next better tier is "Elite"
    expect(c.nextTierName).toBe('Elite');
    expect(typeof c.distanceToNextTier).toBe('number');
    // Full tier set is returned for charting
    expect(Array.isArray(c.allTiers)).toBe(true);
    expect(c.allTiers.length).toBe(3);
  });

  it('returns comparison null (200) for a metric/athlete with no benchmark or measurement', async () => {
    const response = await request(app)
      .get('/api/analytics/benchmark-tiers')
      .query({ athleteId: testAthlete.id, metric: 'FLY10_TIME' })
      .set('Cookie', coachAuthCookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('comparison', null);
  });

  it('returns 400 when athleteId or metric is missing', async () => {
    const missingMetric = await request(app)
      .get('/api/analytics/benchmark-tiers')
      .query({ athleteId: testAthlete.id })
      .set('Cookie', coachAuthCookie);
    expect(missingMetric.status).toBe(400);

    const missingAthlete = await request(app)
      .get('/api/analytics/benchmark-tiers')
      .query({ metric: 'VERTICAL_JUMP' })
      .set('Cookie', coachAuthCookie);
    expect(missingAthlete.status).toBe(400);
  });

  it('requires authentication', async () => {
    const response = await request(app)
      .get('/api/analytics/benchmark-tiers')
      .query({ athleteId: testAthlete.id, metric: 'VERTICAL_JUMP' });
    expect(response.status).toBe(401);
  });

  it('returns 403 when the requester shares no org with the athlete (cross-org)', async () => {
    // Second org + an athlete that belongs ONLY to that org. The coach belongs
    // only to testOrg, so there is no shared organization → access denied.
    const [otherOrg] = await db.insert(organizations).values({
      name: `Other Tiers Org ${Date.now()}`,
      description: 'Second org for cross-org isolation test',
      isActive: true,
    }).returning();

    const otherAthletePassword = await hashPassword('OtherAthlete123!');
    const [otherAthlete] = await db.insert(users).values({
      username: `othertiersathlete_${Date.now()}`,
      emails: [`othertiersathlete_${Date.now()}@test.com`],
      password: otherAthletePassword,
      firstName: 'Other',
      lastName: 'Athlete',
      fullName: 'Other Athlete',
    }).returning();

    await db.insert(userOrganizations).values({
      userId: otherAthlete.id,
      organizationId: otherOrg.id,
      role: 'athlete',
    });

    try {
      const response = await request(app)
        .get('/api/analytics/benchmark-tiers')
        .query({ athleteId: otherAthlete.id, metric: 'VERTICAL_JUMP' })
        .set('Cookie', coachAuthCookie);

      expect(response.status).toBe(403);
    } finally {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, otherAthlete.id));
      await db.delete(users).where(eq(users.id, otherAthlete.id));
      await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
    }
  });

  it('excludes unverified measurements from the athlete best value (verified-only)', async () => {
    // beforeEach seeded two VERIFIED measurements (24.0, 27.5) → best verified 27.5 ("Good").
    // Add an UNVERIFIED measurement of 35.0 which, if counted, would be the better value
    // and place the athlete in "Elite". The endpoint must ignore it.
    await db.insert(measurements).values({
      userId: testAthlete.id,
      submittedBy: testCoach.id,
      date: '2024-05-15',
      age: 17,
      metric: 'VERTICAL_JUMP',
      value: '35.000',
      units: 'in',
      organizationId: testOrg.id,
      isVerified: false,
    });

    const response = await request(app)
      .get('/api/analytics/benchmark-tiers')
      .query({ athleteId: testAthlete.id, metric: 'VERTICAL_JUMP' })
      .set('Cookie', coachAuthCookie);

    expect(response.status).toBe(200);
    expect(response.body.comparison).not.toBeNull();

    const c = response.body.comparison;
    // Reflects only the VERIFIED best (27.5), not the better unverified 35.0.
    expect(c.athleteValue).toBe(27.5);
    expect(c.tierName).toBe('Good');
  });
});
