/**
 * Integration Tests for Team Report Chart Selection + Trend/Distribution Payload
 *
 * Verifies resolveTeamChartSelection and the teamTrends/teamDistributions payload
 * produced by generateTeamReport (via POST /api/reports/:id/generate) against a
 * real test database:
 *   1. config.charts.trends=true seeds `teamTrends[METRIC]`.
 *   2. config.charts.boxSwarm=true seeds `teamDistributions[METRIC]`.
 *   3. config.charts present but both false -> teamTrends/teamDistributions omitted.
 *   4. Back-compat: a team config with NO `charts` field omits BOTH
 *      teamTrends and teamDistributions (proves resolveTeamChartSelection's
 *      all-off legacy default end-to-end, not just at the unit level).
 *
 * Modeled on tests/integration/report-chart-selection.test.ts (same harness/bootstrap).
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
  const defaultJsonParser = express.json();
  const isLargePdfUpload = (req: express.Request) =>
    req.method === 'POST' &&
    req.path.endsWith('/pdf') &&
    (req.path.startsWith('/api/reports/') || req.path.startsWith('/api/public/reports/'));
  app.use((req, res, next) =>
    isLargePdfUpload(req) ? next() : defaultJsonParser(req, res, next),
  );
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

beforeEach(async () => {
  [testOrg] = await db.insert(organizations).values({
    name: `TeamChartSel Org ${Date.now()}`,
    description: 'Test organization for team report chart-selection integration tests',
    isActive: true,
  }).returning();

  const coachPassword = await hashPassword('TestCoach123!');
  [testCoach] = await db.insert(users).values({
    username: `teamchartselcoach_${Date.now()}`,
    emails: [`teamchartselcoach_${Date.now()}@test.com`],
    password: coachPassword,
    firstName: 'TeamChartSel',
    lastName: 'Coach',
    fullName: 'TeamChartSel Coach',
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

/**
 * Seed a roster athlete with two VERTICAL_JUMP measurements on distinct dates
 * (so trends has a >= 2 team-series point when combined across the roster).
 */
async function seedAthlete(values: Array<{ date: string; value: string }>) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const [athlete] = await db.insert(users).values({
    username: `teamchartselathlete_${stamp}`,
    emails: [`teamchartselathlete_${stamp}@test.com`],
    password: await hashPassword('AthletePass123!'),
    firstName: 'TeamChartSel',
    lastName: 'Athlete',
    fullName: 'TeamChartSel Athlete',
  }).returning();
  createdAthleteIds.push(athlete.id);

  await db.insert(userOrganizations).values({
    userId: athlete.id,
    organizationId: testOrg.id,
    role: 'athlete',
  });

  for (const { date, value } of values) {
    await db.insert(measurements).values({
      userId: athlete.id,
      submittedBy: testCoach.id,
      date,
      age: 17,
      metric: 'VERTICAL_JUMP',
      value,
      units: 'in',
      organizationId: testOrg.id,
      isVerified: true,
    });
  }

  return athlete;
}

async function createTeamReport(extraConfig: Record<string, any>) {
  const [report] = await db.insert(reports).values({
    name: 'Team Chart-Selection Report',
    organizationId: testOrg.id,
    reportType: 'team',
    config: {
      timeframe: { type: 'preset', preset: 'all_time' },
      metrics: ['VERTICAL_JUMP'],
      ...extraConfig,
    },
    createdBy: testCoach.id,
  }).returning();
  createdReportIds.push(report.id);
  return report;
}

async function generate(reportId: string) {
  return request(app)
    .post(`/api/reports/${reportId}/generate`)
    .set('Cookie', coachAuthCookie)
    .send({});
}

describe('POST /api/reports/:id/generate — team teamTrends payload', () => {
  it('includes teamTrends[METRIC] when charts.trends is true', async () => {
    // Two athletes each with two dated measurements -> teamSeries has >= 2 points.
    await seedAthlete([
      { date: '2024-01-15', value: '20.000' },
      { date: '2024-03-15', value: '24.000' },
    ]);
    await seedAthlete([
      { date: '2024-01-15', value: '22.000' },
      { date: '2024-03-15', value: '26.000' },
    ]);
    const report = await createTeamReport({ charts: { trends: true } });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('reportType', 'team');
    expect(response.body.teamTrends).toBeDefined();
    expect(response.body.teamTrends).toHaveProperty('VERTICAL_JUMP');
    expect(Array.isArray(response.body.teamTrends.VERTICAL_JUMP.teamSeries)).toBe(true);
    expect(response.body.teamTrends.VERTICAL_JUMP.teamSeries.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(response.body.teamTrends.VERTICAL_JUMP.athleteSeries)).toBe(true);
    expect(response.body.teamTrends.VERTICAL_JUMP.athleteSeries.length).toBe(2);
  });

  it('omits teamTrends when charts.trends is false', async () => {
    await seedAthlete([
      { date: '2024-01-15', value: '20.000' },
      { date: '2024-03-15', value: '24.000' },
    ]);
    const report = await createTeamReport({ charts: { trends: false } });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body.teamTrends).toBeUndefined();
  });
});

describe('POST /api/reports/:id/generate — team teamDistributions payload', () => {
  it('includes teamDistributions[METRIC] when charts.boxSwarm is true and >= 2 athletes have values', async () => {
    await seedAthlete([{ date: '2024-01-15', value: '20.000' }]);
    await seedAthlete([{ date: '2024-01-15', value: '30.000' }]);
    const report = await createTeamReport({ charts: { boxSwarm: true } });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body.teamDistributions).toBeDefined();
    const dist = response.body.teamDistributions.VERTICAL_JUMP;
    expect(dist).toBeDefined();
    expect(dist.values).toEqual([20, 30]);
    expect(dist.teamAverage).toBe(25);
    expect(Array.isArray(dist.athletes)).toBe(true);
    expect(dist.athletes).toHaveLength(2);
    expect(dist.direction).toBe('higher');
  });

  it('omits teamDistributions when charts.boxSwarm is false', async () => {
    await seedAthlete([{ date: '2024-01-15', value: '20.000' }]);
    await seedAthlete([{ date: '2024-01-15', value: '30.000' }]);
    const report = await createTeamReport({ charts: { boxSwarm: false } });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body.teamDistributions).toBeUndefined();
  });
});

describe('POST /api/reports/:id/generate — explicit empty charts (all-off)', () => {
  it('an explicit empty charts object omits both teamTrends and teamDistributions', async () => {
    await seedAthlete([
      { date: '2024-01-15', value: '20.000' },
      { date: '2024-03-15', value: '24.000' },
    ]);
    await seedAthlete([{ date: '2024-01-15', value: '30.000' }]);
    const report = await createTeamReport({ charts: {} });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body.teamTrends).toBeUndefined();
    expect(response.body.teamDistributions).toBeUndefined();
  });
});

describe('POST /api/reports/:id/generate — back-compat (no charts field)', () => {
  it('a legacy team config with NO charts field omits both teamTrends and teamDistributions', async () => {
    // Seed data that WOULD produce both if charts were (wrongly) defaulted on,
    // proving the all-off legacy default end-to-end, not just at the unit level.
    await seedAthlete([
      { date: '2024-01-15', value: '20.000' },
      { date: '2024-03-15', value: '24.000' },
    ]);
    await seedAthlete([
      { date: '2024-01-15', value: '30.000' },
      { date: '2024-03-15', value: '32.000' },
    ]);
    const report = await createTeamReport({});

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('reportType', 'team');
    expect(response.body.teamTrends).toBeUndefined();
    expect(response.body.teamDistributions).toBeUndefined();
  });
});

// --- Stage 3: public snapshot surfaces the same team chart payload ---
//
// createSnapshot() calls generateTeamReport() directly (see report-service.ts),
// so the trends/distributions computation itself is already fully covered by
// the `/generate` tests above. This is a thin end-to-end check that the PUBLIC
// route (GET /api/public/reports/:token) actually forwards those same fields
// in snapshotData, rather than re-deriving or dropping them.
describe('GET /api/public/reports/:token — team chart payload passthrough', () => {
  it('surfaces teamTrends and teamDistributions on the public snapshot when selected', async () => {
    await seedAthlete([
      { date: '2024-01-15', value: '20.000' },
      { date: '2024-03-15', value: '24.000' },
    ]);
    await seedAthlete([
      { date: '2024-01-15', value: '30.000' },
      { date: '2024-03-15', value: '32.000' },
    ]);
    const report = await createTeamReport({ charts: { trends: true, boxSwarm: true } });

    const snapshotRes = await request(app)
      .post(`/api/reports/${report.id}/snapshots`)
      .set('Cookie', coachAuthCookie)
      .send({ expirationDays: 7 });
    expect(snapshotRes.status).toBe(201);
    const publicToken = snapshotRes.body.publicToken;
    expect(publicToken).toBeTruthy();

    const publicRes = await request(app).get(`/api/public/reports/${publicToken}`);

    expect(publicRes.status).toBe(200);
    const { snapshotData } = publicRes.body;
    expect(snapshotData).toHaveProperty('reportType', 'team');
    expect(snapshotData.teamTrends).toBeDefined();
    expect(snapshotData.teamTrends).toHaveProperty('VERTICAL_JUMP');
    expect(snapshotData.teamDistributions).toBeDefined();
    expect(snapshotData.teamDistributions).toHaveProperty('VERTICAL_JUMP');
  });
});
