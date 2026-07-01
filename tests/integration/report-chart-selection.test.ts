/**
 * Integration Tests for Report Chart Selection + Distribution Payload
 *
 * Verifies the chart-selection resolver and peer-distribution payload produced
 * by generateIndividualReport (via POST /api/reports/:id/generate) against a
 * real test database:
 *   1. config.charts.distribution=true seeds `distributions[METRIC]` (with
 *      values/athleteValue/stats) when there are >= 2 athletes for the metric.
 *   2. config.charts.distribution=false omits `distributions`.
 *   3. config.charts.trends gates the `trends` field on/off.
 *   4. Back-compat: a config with NO `charts` field falls back to
 *      resolveChartSelection defaults (trends from legacy showTrends,
 *      distribution off).
 *   5. distribution enabled but < 2 peers for the metric -> metric omitted
 *      (distributions undefined when it was the only metric).
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

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations, reports, measurements, teams } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

// Mock vite module before importing registerRoutes
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';

// Helper function for password hashing
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

// Test data
let app: Express;
let testOrg: any;
let testCoach: any;
let testAthlete: any;
let coachAuthCookie: string;
let createdReportIds: string[] = [];
let createdPeerIds: string[] = [];
let createdTeamIds: string[] = [];

beforeAll(async () => {
  // Create Express app and register routes (mirrors the sibling report-trends harness).
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

afterAll(async () => {
  if (testCoach) {
    await db.delete(users).where(eq(users.id, testCoach.id));
  }
});

beforeEach(async () => {
  // Create fresh test organization
  [testOrg] = await db.insert(organizations).values({
    name: `ChartSel Org ${Date.now()}`,
    description: 'Test organization for report chart-selection integration tests',
    isActive: true,
  }).returning();

  // Create test coach user
  const coachPassword = await hashPassword('TestCoach123!');
  [testCoach] = await db.insert(users).values({
    username: `chartselcoach_${Date.now()}`,
    emails: [`chartselcoach_${Date.now()}@test.com`],
    password: coachPassword,
    firstName: 'ChartSel',
    lastName: 'Coach',
    fullName: 'ChartSel Coach',
  }).returning();

  await db.insert(userOrganizations).values({
    userId: testCoach.id,
    organizationId: testOrg.id,
    role: 'coach',
  });

  // Create test athlete user (the report subject)
  const athletePassword = await hashPassword('AthletePass123!');
  [testAthlete] = await db.insert(users).values({
    username: `chartselathlete_${Date.now()}`,
    emails: [`chartselathlete_${Date.now()}@test.com`],
    password: athletePassword,
    firstName: 'ChartSel',
    lastName: 'Athlete',
    fullName: 'ChartSel Athlete',
  }).returning();

  await db.insert(userOrganizations).values({
    userId: testAthlete.id,
    organizationId: testOrg.id,
    role: 'athlete',
  });

  // Seed two VERTICAL_JUMP measurements on different dates within an all_time window.
  // Two dates so trends has a >= 2 point series; best (27.5) is the athleteValue.
  await db.insert(measurements).values({
    userId: testAthlete.id,
    submittedBy: testCoach.id,
    date: '2024-01-15',
    age: 17,
    metric: 'VERTICAL_JUMP',
    value: '24.000',
    units: 'in',
    organizationId: testOrg.id,
    isVerified: true,
  });
  await db.insert(measurements).values({
    userId: testAthlete.id,
    submittedBy: testCoach.id,
    date: '2024-03-15',
    age: 17,
    metric: 'VERTICAL_JUMP',
    value: '27.500',
    units: 'in',
    organizationId: testOrg.id,
    isVerified: true,
  });

  // Login as coach and get session cookie
  const coachLogin = await request(app)
    .post('/api/auth/login')
    .send({
      username: testCoach.username,
      password: 'TestCoach123!',
    });

  coachAuthCookie = coachLogin.headers['set-cookie'][0];
});

afterEach(async () => {
  // Cleanup any peer athletes seeded for the distribution tests. Must run before
  // the organization is deleted below, since peer measurements/memberships FK it.
  for (const peerId of createdPeerIds) {
    await db.delete(measurements).where(eq(measurements.userId, peerId));
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, peerId));
    await db.delete(users).where(eq(users.id, peerId));
  }
  createdPeerIds = [];

  // Cleanup in reverse dependency order
  for (const reportId of createdReportIds) {
    await db.delete(reports).where(eq(reports.id, reportId));
  }
  createdReportIds = [];

  for (const teamId of createdTeamIds) {
    await db.delete(teams).where(eq(teams.id, teamId));
  }
  createdTeamIds = [];

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

/**
 * Seed a peer athlete in the same org with one measurement for `metric`.
 * The distribution peer set is "best value per athlete in the org for the
 * metric" — so the report athlete plus one peer gives the >= 2 values that
 * computeDistribution requires.
 */
async function seedPeerAthlete(metric: string, value: string, date = '2024-02-15', teamId?: string) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const [peer] = await db.insert(users).values({
    username: `chartselpeer_${stamp}`,
    emails: [`chartselpeer_${stamp}@test.com`],
    password: await hashPassword('PeerPass123!'),
    firstName: 'ChartSel',
    lastName: 'Peer',
    fullName: 'ChartSel Peer',
  }).returning();
  createdPeerIds.push(peer.id);

  await db.insert(userOrganizations).values({
    userId: peer.id,
    organizationId: testOrg.id,
    role: 'athlete',
  });

  await db.insert(measurements).values({
    userId: peer.id,
    submittedBy: testCoach.id,
    date,
    age: 17,
    metric,
    value,
    units: 'in',
    organizationId: testOrg.id,
    teamId,
    isVerified: true,
  });

  return peer;
}

/** Seed a team in the test org and track it for cleanup. Returns its id. */
async function seedTeam(name: string): Promise<string> {
  const [team] = await db.insert(teams).values({
    organizationId: testOrg.id,
    name,
  }).returning();
  createdTeamIds.push(team.id);
  return team.id;
}

/**
 * Create an individual report over VERTICAL_JUMP with an arbitrary config
 * fragment (e.g. { charts: { distribution: true } } or { showTrends: true }).
 */
async function createIndividualReport(extraConfig: Record<string, any>) {
  const [report] = await db.insert(reports).values({
    name: 'Individual Chart-Selection Report',
    organizationId: testOrg.id,
    reportType: 'individual',
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
    .send({ athleteId: testAthlete.id });
}

describe('POST /api/reports/:id/generate — distribution payload', () => {
  it('includes distributions[METRIC] when charts.distribution is true and peers exist', async () => {
    // Two peers (distinct from the report athlete's 27.5) so the peers-only
    // `values` array has >= 2 entries. The org population for the box is the
    // athlete + these two peers = 3.
    await seedPeerAthlete('VERTICAL_JUMP', '20.000');
    await seedPeerAthlete('VERTICAL_JUMP', '24.000');
    const report = await createIndividualReport({ charts: { distribution: true } });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('reportType', 'individual');

    expect(response.body.distributions).toBeDefined();
    const dist = response.body.distributions.VERTICAL_JUMP;
    expect(dist).toBeDefined();

    // values: peer dots only — the backend excludes the athlete before sampling
    // so the athlete is not double-plotted (once as a peer dot, once as the star).
    expect(Array.isArray(dist.values)).toBe(true);
    expect(dist.values.length).toBeGreaterThanOrEqual(2);

    // athleteValue: the report athlete's best (27.5), and NOT present among the
    // peer dots (proves the exclusion-before-sampling contract).
    expect(typeof dist.athleteValue).toBe('number');
    expect(dist.values).not.toContain(dist.athleteValue);

    // stats: five-number summary
    expect(dist.stats).toBeDefined();
    for (const key of ['min', 'q1', 'median', 'q3', 'max']) {
      expect(typeof dist.stats[key]).toBe('number');
    }

    // direction: VERTICAL_JUMP is higher-is-better (drives the histogram's
    // "better" axis annotation on the frontend).
    expect(dist.direction).toBe('higher');
  });

  it('excludes the athlete by id, not by value: a peer tying the athlete stays', async () => {
    // A peer whose best equals the athlete's best (27.5). The athlete is removed
    // from the peer set by id, so this tying peer must remain — the old
    // value-equality removal would have wrongly dropped it.
    await seedPeerAthlete('VERTICAL_JUMP', '27.500');
    await seedPeerAthlete('VERTICAL_JUMP', '20.000');
    const report = await createIndividualReport({ charts: { distribution: true } });

    const response = await generate(report.id);
    expect(response.status).toBe(200);

    const dist = response.body.distributions.VERTICAL_JUMP;
    expect(dist.athleteValue).toBe(27.5);
    // The tying peer is kept exactly once; the athlete's own 27.5 is not among the peers.
    expect(dist.values.filter((v: number) => v === 27.5)).toHaveLength(1);
    expect(dist.values).toContain(20);
  });

  it('scopes the peer cohort to the report filter teams and names the group', async () => {
    // Two peers ON the filtered team, one peer OFF it. The distribution must
    // reflect only the on-team peers, and comparisonLabel must name the team.
    const teamId = await seedTeam('Alpha Squad');
    await seedPeerAthlete('VERTICAL_JUMP', '22.000', '2024-02-15', teamId);
    await seedPeerAthlete('VERTICAL_JUMP', '25.000', '2024-02-15', teamId);
    await seedPeerAthlete('VERTICAL_JUMP', '30.000', '2024-02-15'); // off-team, must be excluded
    const report = await createIndividualReport({
      charts: { distribution: true },
      filters: { teamIds: [teamId] },
    });

    const response = await generate(report.id);
    expect(response.status).toBe(200);

    const dist = response.body.distributions.VERTICAL_JUMP;
    expect(dist).toBeDefined();
    // Only the two on-team peers are in the cohort; the off-team 30 is excluded.
    expect(dist.values).toContain(22);
    expect(dist.values).toContain(25);
    expect(dist.values).not.toContain(30);
    // The caption names the cohort.
    expect(response.body.comparisonLabel).toBe('Alpha Squad');
  });

  it('omits distributions when charts.distribution is false', async () => {
    await seedPeerAthlete('VERTICAL_JUMP', '20.000');
    const report = await createIndividualReport({ charts: { distribution: false } });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body.distributions).toBeUndefined();
  });

  it('omits the metric when distribution is enabled but there are < 2 peers', async () => {
    // No peer seeded — only the report athlete has VERTICAL_JUMP, so the peer
    // set has a single value and computeDistribution returns null. With it being
    // the only metric, `distributions` collapses to undefined.
    const report = await createIndividualReport({ charts: { distribution: true } });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body.distributions).toBeUndefined();
  });
});

describe('POST /api/reports/:id/generate — trends gate via charts', () => {
  it('omits trends when charts.trends is false', async () => {
    const report = await createIndividualReport({ charts: { trends: false } });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body.trends).toBeUndefined();
  });

  it('includes trends[METRIC] when charts.trends is true', async () => {
    const report = await createIndividualReport({ charts: { trends: true } });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body.trends).toBeDefined();
    expect(response.body.trends).toHaveProperty('VERTICAL_JUMP');
    expect(Array.isArray(response.body.trends.VERTICAL_JUMP.series)).toBe(true);
    expect(response.body.trends.VERTICAL_JUMP.series.length).toBeGreaterThanOrEqual(2);
  });
});

describe('POST /api/reports/:id/generate — explicit empty charts (all-off)', () => {
  it('treats a present-but-empty charts object as all-off: no distributions, no trends', async () => {
    // A peer exists (distribution could resolve) but an explicit empty `charts`
    // selects nothing — distinguishing it from legacy "no charts" defaults.
    await seedPeerAthlete('VERTICAL_JUMP', '20.000');
    const report = await createIndividualReport({ charts: {} });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body.distributions).toBeUndefined();
    expect(response.body.trends).toBeUndefined();
  });
});

describe('POST /api/reports/:id/generate — back-compat (no charts field)', () => {
  it('falls back to legacy defaults: showTrends drives trends, distribution off', async () => {
    // A peer exists, but with no `charts` field distribution stays off by default.
    await seedPeerAthlete('VERTICAL_JUMP', '20.000');
    const report = await createIndividualReport({ showTrends: true });

    const response = await generate(report.id);

    expect(response.status).toBe(200);

    // Legacy showTrends -> trends present
    expect(response.body.trends).toBeDefined();
    expect(response.body.trends).toHaveProperty('VERTICAL_JUMP');

    // Distribution defaults off for legacy reports
    expect(response.body.distributions).toBeUndefined();
  });
});
