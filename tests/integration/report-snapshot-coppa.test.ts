/**
 * Regression test — COPPA minor-detection at team-report snapshot creation.
 *
 * ReportService.createSnapshot() flags a snapshot as publicAccessRestricted
 * when the report's roster includes a minor (isMinor=true), so the public
 * link is gated by enforcePublicSnapshotAccess (see coppa-routes.test.ts's
 * "A3" suite for the gate itself).
 *
 * For team reports, the roster comes back as `athleteRankings`
 * (TeamReportData), not `athletes` — createSnapshot's minor-detection was
 * still looking for `data?.athletes`, so it never found any athlete IDs to
 * check and `publicAccessRestricted` stayed false for every team snapshot,
 * regardless of whether a minor was on the roster.
 *
 * Modeled on tests/integration/report-team-chart-selection.test.ts (same
 * harness/bootstrap).
 */

// Set environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true'; // Bypass rate limits for these tests

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations, reports, measurements } from '@shared/schema';
import { eq } from 'drizzle-orm';
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
let coachAuthCookie: string;
let createdReportIds: string[] = [];
let createdAthleteIds: string[] = [];

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

beforeEach(async () => {
  [testOrg] = await db.insert(organizations).values({
    name: `SnapshotCoppa Org ${Date.now()}`,
    description: 'Test organization for report snapshot COPPA integration tests',
    isActive: true,
  }).returning();

  const coachPassword = await hashPassword('TestCoach123!');
  [testCoach] = await db.insert(users).values({
    username: `snapshotcoppacoach_${Date.now()}`,
    emails: [`snapshotcoppacoach_${Date.now()}@test.com`],
    password: coachPassword,
    firstName: 'SnapshotCoppa',
    lastName: 'Coach',
    fullName: 'SnapshotCoppa Coach',
  }).returning();

  await db.insert(userOrganizations).values({
    userId: testCoach.id,
    organizationId: testOrg.id,
    role: 'coach',
  });

  const coachLogin = await request(app)
    .post('/api/auth/login')
    .send({
      username: testCoach.username,
      password: 'TestCoach123!',
    });

  coachAuthCookie = coachLogin.headers['set-cookie'][0];
});

afterEach(async () => {
  for (const reportId of createdReportIds) {
    // report_snapshots.report_id cascades on report delete.
    await db.delete(reports).where(eq(reports.id, reportId));
  }
  createdReportIds = [];

  for (const athleteId of createdAthleteIds) {
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, athleteId));
    await db.delete(users).where(eq(users.id, athleteId));
  }
  createdAthleteIds = [];

  if (testCoach && testOrg) {
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, testCoach.id));
  }
  if (testCoach) {
    await db.delete(users).where(eq(users.id, testCoach.id));
    testCoach = null;
  }
  if (testOrg) {
    await db.delete(organizations).where(eq(organizations.id, testOrg.id));
  }
});

/** Seed a roster athlete with one VERTICAL_JUMP measurement, optionally a minor. */
async function seedAthlete(value: string, options: { isMinor?: boolean } = {}) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const [athlete] = await db.insert(users).values({
    username: `snapshotcoppaathlete_${stamp}`,
    emails: [`snapshotcoppaathlete_${stamp}@test.com`],
    password: await hashPassword('AthletePass123!'),
    firstName: 'SnapshotCoppa',
    lastName: 'Athlete',
    fullName: 'SnapshotCoppa Athlete',
    isMinor: options.isMinor ?? false,
  }).returning();
  createdAthleteIds.push(athlete.id);

  await db.insert(userOrganizations).values({
    userId: athlete.id,
    organizationId: testOrg.id,
    role: 'athlete',
  });

  await db.insert(measurements).values({
    userId: athlete.id,
    submittedBy: testCoach.id,
    date: '2024-01-15',
    age: options.isMinor ? 15 : 22,
    metric: 'VERTICAL_JUMP',
    value,
    units: 'in',
    organizationId: testOrg.id,
    isVerified: true,
  });

  return athlete;
}

async function createTeamReport() {
  const [report] = await db.insert(reports).values({
    name: 'Snapshot COPPA Report',
    organizationId: testOrg.id,
    reportType: 'team',
    config: {
      timeframe: { type: 'preset', preset: 'all_time' },
      metrics: ['VERTICAL_JUMP'],
    },
    createdBy: testCoach.id,
  }).returning();
  createdReportIds.push(report.id);
  return report;
}

function createSnapshot(reportId: string) {
  return request(app)
    .post(`/api/reports/${reportId}/snapshots`)
    .set('Cookie', coachAuthCookie)
    .send({});
}

describe('POST /api/reports/:id/snapshots — team-report COPPA minor detection', () => {
  it('flags publicAccessRestricted when a minor is on the roster', async () => {
    await seedAthlete('24.000', { isMinor: true });
    const report = await createTeamReport();

    const response = await createSnapshot(report.id);

    expect(response.status).toBe(201);
    expect(response.body.containsMinorData).toBe(true);
    expect(response.body.publicAccessRestricted).toBe(true);
  });

  it('leaves publicAccessRestricted false when no minor is on the roster', async () => {
    await seedAthlete('24.000', { isMinor: false });
    const report = await createTeamReport();

    const response = await createSnapshot(report.id);

    expect(response.status).toBe(201);
    expect(response.body.containsMinorData).toBe(false);
    expect(response.body.publicAccessRestricted).toBe(false);
  });
});
