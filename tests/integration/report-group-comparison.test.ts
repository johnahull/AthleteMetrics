/**
 * Integration tests for report config.groupComparison on generateIndividualReport
 * (via POST /api/reports/:id/generate): off -> no peer percentiles, team averages,
 * comparison label or event percentiles; missing key (legacy report) -> unchanged.
 * Harness mirrors report-chart-selection.test.ts.
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
import { organizations, users, userOrganizations, reports, measurements, teams, events, eventRegistrations, reportSnapshots } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

// Mock vite module before importing registerRoutes
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';
import { buildReportDataForAI } from '../../packages/api/routes/report-routes';
import { ReportService } from '../../packages/api/services/report-service';
import { buildPrompt } from '../../packages/api/services/ai-insights-service';

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
let createdEventIds: string[] = [];

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

beforeEach(async () => {
  // Create fresh test organization
  [testOrg] = await db.insert(organizations).values({
    name: `GroupCmp Org ${Date.now()}`,
    description: 'Test organization for report chart-selection integration tests',
    isActive: true,
  }).returning();

  // Create test coach user
  const coachPassword = await hashPassword('TestCoach123!');
  [testCoach] = await db.insert(users).values({
    username: `groupcmpcoach_${Date.now()}`,
    emails: [`groupcmpcoach_${Date.now()}@test.com`],
    password: coachPassword,
    firstName: 'GroupCmp',
    lastName: 'Coach',
    fullName: 'GroupCmp Coach',
  }).returning();

  await db.insert(userOrganizations).values({
    userId: testCoach.id,
    organizationId: testOrg.id,
    role: 'coach',
  });

  // Create test athlete user (the report subject)
  const athletePassword = await hashPassword('AthletePass123!');
  [testAthlete] = await db.insert(users).values({
    username: `groupcmpathlete_${Date.now()}`,
    emails: [`groupcmpathlete_${Date.now()}@test.com`],
    password: athletePassword,
    firstName: 'GroupCmp',
    lastName: 'Athlete',
    fullName: 'GroupCmp Athlete',
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

  if (testOrg) await db.delete(reports).where(eq(reports.organizationId, testOrg.id));
  createdReportIds = [];

  // Cleanup in reverse dependency order

  for (const teamId of createdTeamIds) {
    await db.delete(teams).where(eq(teams.id, teamId));
  }
  createdTeamIds = [];

  for (const eventId of createdEventIds) {
    await db.delete(events).where(eq(events.id, eventId));
  }
  createdEventIds = [];

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
    username: `groupcmppeer_${stamp}`,
    emails: [`groupcmppeer_${stamp}@test.com`],
    password: await hashPassword('PeerPass123!'),
    firstName: 'GroupCmp',
    lastName: 'Peer',
    fullName: 'GroupCmp Peer',
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


async function seedEvent() {
  const [event] = await db.insert(events).values({
    organizationId: testOrg.id,
    name: `GroupCmp Event ${Date.now()}`,
    startDate: new Date('2024-02-15T00:00:00Z'),
  }).returning();
  createdEventIds.push(event.id);
  await db.update(measurements).set({ eventId: event.id }).where(eq(measurements.userId, testAthlete.id));
  return event;
}

describe('POST /api/reports/:id/generate — groupComparison', () => {
  it('off: no percentiles, teamAverages, comparisonLabel, eventPercentiles or radar/distribution', async () => {
    await seedPeerAthlete('VERTICAL_JUMP', '20.000');
    await seedPeerAthlete('VERTICAL_JUMP', '24.000');
    const event = await seedEvent();
    const report = await createIndividualReport({
      groupComparison: false,
      eventId: event.id,
      includeEventPercentiles: true,
      charts: { radar: true, distribution: true },
    });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body.athlete.measurements.VERTICAL_JUMP).toBeTypeOf('number');
    expect(response.body.athlete.percentiles).toEqual({});
    expect(response.body.athlete.teamAverages).toEqual({});
    expect(response.body.athlete.eventPercentiles).toBeUndefined();
    expect(response.body.comparisonLabel).toBeUndefined();
    expect(response.body.distributions).toBeUndefined();
    expect(response.body.reportConfig.groupComparison).toBe(false);
  });

  it('missing key (legacy report) still compares', async () => {
    await seedPeerAthlete('VERTICAL_JUMP', '20.000');
    await seedPeerAthlete('VERTICAL_JUMP', '24.000');
    const report = await createIndividualReport({ charts: { distribution: true } });

    const response = await generate(report.id);

    expect(response.status).toBe(200);
    expect(response.body.athlete.percentiles.VERTICAL_JUMP).toBeTypeOf('number');
    expect(response.body.athlete.teamAverages.VERTICAL_JUMP).toBeTypeOf('number');
    expect(response.body.distributions?.VERTICAL_JUMP).toBeDefined();
  });

  it('snapshot of an off report stores groupComparison: false and no percentiles', async () => {
    await seedPeerAthlete('VERTICAL_JUMP', '20.000');
    const report = await createIndividualReport({ groupComparison: false, athleteId: testAthlete.id });

    const response = await request(app)
      .post(`/api/reports/${report.id}/snapshots`)
      .set('Cookie', coachAuthCookie)
      .send({});

    expect(response.status).toBe(201);
    const rows = await db.select().from(reportSnapshots).where(eq(reportSnapshots.reportId, report.id));
    expect(rows).toHaveLength(1);
    const data = rows[0].snapshotData as any;
    expect(data.reportConfig.groupComparison).toBe(false);
    expect(data.athlete.percentiles).toEqual({});
  });
});

describe('POST /api/events/:eventId/reports — groupComparison', () => {
  async function seedRegisteredEvent() {
    const event = await seedEvent();
    await db.insert(eventRegistrations).values({
      eventId: event.id,
      userId: testAthlete.id,
      userFullNameSnapshot: testAthlete.fullName,
      status: 'approved',
    });
    return event;
  }

  const create = (eventId: string, body: Record<string, unknown>) =>
    request(app)
      .post(`/api/events/${eventId}/reports`)
      .set('Cookie', coachAuthCookie)
      .send({ reportType: 'individual', athleteIds: [testAthlete.id], metrics: ['VERTICAL_JUMP'], ...body });

  it('stores groupComparison: false in the report config', async () => {
    const event = await seedRegisteredEvent();
    const response = await create(event.id, { groupComparison: false, includeEventPercentiles: false });
    expect(response.status).toBe(201);
    const [row] = await db.select().from(reports).where(eq(reports.organizationId, testOrg.id));
    expect((row.config as any).groupComparison).toBe(false);
  });

  it('omits the key when the caller sends none', async () => {
    const event = await seedRegisteredEvent();
    const response = await create(event.id, {});
    expect(response.status).toBe(201);
    const [row] = await db.select().from(reports).where(eq(reports.organizationId, testOrg.id));
    expect((row.config as any).groupComparison).toBeUndefined();
  });

  it('rejects a non-boolean groupComparison with 400', async () => {
    const event = await seedRegisteredEvent();
    const response = await create(event.id, { groupComparison: 'no' });
    expect(response.status).toBe(400);
  });
});

describe('individual PDF and AI report data — groupComparison', () => {
  const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };
  const pdfText = async (reportId: string) => {
    const res = await request(app)
      .get(`/api/reports/${reportId}/pdf?athleteId=${testAthlete.id}`)
      .set('Cookie', coachAuthCookie)
      .buffer(true)
      .parse(binary);
    expect(res.status).toBe(200);
    return (res.body as Buffer).toString('latin1');
  };

  it('PDF has no Percentile column when off', async () => {
    await seedPeerAthlete('VERTICAL_JUMP', '20.000');
    const text = await pdfText((await createIndividualReport({ groupComparison: false })).id);
    expect(text).toContain('Metric');
    expect(text).not.toContain('Percentile');
  });

  it('PDF keeps the Percentile column when the key is missing', async () => {
    await seedPeerAthlete('VERTICAL_JUMP', '20.000');
    const text = await pdfText((await createIndividualReport({})).id);
    expect(text).toContain('Percentile');
  });

  it('AI report data carries no teamAverage/percentile and the prompt no comparison line when off', async () => {
    await seedPeerAthlete('VERTICAL_JUMP', '20.000');
    await seedPeerAthlete('VERTICAL_JUMP', '24.000');
    const off = await createIndividualReport({ groupComparison: false, athleteId: testAthlete.id });
    const on = await createIndividualReport({ athleteId: testAthlete.id });

    const offData = await buildReportDataForAI(off as any, testCoach.id, new ReportService());
    expect(offData.metrics.length).toBeGreaterThan(0);
    for (const m of offData.metrics) {
      expect(m.teamAverage).toBeUndefined();
      expect(m.percentile).toBeUndefined();
    }
    expect(buildPrompt(offData)).not.toContain('compared to all athletes');

    const onData = await buildReportDataForAI(on as any, testCoach.id, new ReportService());
    expect(buildPrompt(onData)).toContain('compared to all athletes');
  });
});
