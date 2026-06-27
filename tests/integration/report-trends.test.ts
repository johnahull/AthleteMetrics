/**
 * Integration Tests for Report Trends + PDF Embedding
 *
 * Verifies two pieces of the trends feature against a real test database:
 *   1. generateIndividualReport (via POST /api/reports/:id/generate) includes a
 *      top-level `trends` field ONLY when the report config has showTrends: true.
 *      When off/absent, `trends` is undefined and the existing single-value
 *      fields (athlete.measurements) are still present.
 *   2. POST /api/reports/:id/pdf accepts `chartImages` and returns a non-empty
 *      application/pdf response.
 *
 * Modeled on tests/integration/report-routes.test.ts (same harness/bootstrap).
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
import { organizations, users, userOrganizations, reports, measurements } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

// Mock vite module before importing registerRoutes
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';

// A tiny but valid 1x1 PNG, encoded as a data URL (what the client captures).
// NOTE: jsPDF parses and CRC-validates the PNG when embedding it, so the data
// URL must be byte-correct. This is a genuine 1x1 RGB PNG with a valid IDAT CRC.
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

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

beforeAll(async () => {
  // Create Express app and register routes
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
  // Create fresh test organization
  [testOrg] = await db.insert(organizations).values({
    name: `Trends Org ${Date.now()}`,
    description: 'Test organization for report trends integration tests',
    isActive: true,
  }).returning();

  // Create test coach user
  const coachPassword = await hashPassword('TestCoach123!');
  [testCoach] = await db.insert(users).values({
    username: `trendscoach_${Date.now()}`,
    emails: [`trendscoach_${Date.now()}@test.com`],
    password: coachPassword,
    firstName: 'Trends',
    lastName: 'Coach',
    fullName: 'Trends Coach',
  }).returning();

  await db.insert(userOrganizations).values({
    userId: testCoach.id,
    organizationId: testOrg.id,
    role: 'coach',
  });

  // Create test athlete user
  const athletePassword = await hashPassword('AthletePass123!');
  [testAthlete] = await db.insert(users).values({
    username: `trendsathlete_${Date.now()}`,
    emails: [`trendsathlete_${Date.now()}@test.com`],
    password: athletePassword,
    firstName: 'Trends',
    lastName: 'Athlete',
    fullName: 'Trends Athlete',
  }).returning();

  await db.insert(userOrganizations).values({
    userId: testAthlete.id,
    organizationId: testOrg.id,
    role: 'athlete',
  });

  // Seed two VERTICAL_JUMP measurements on different dates within an all_time window
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
  // Cleanup in reverse dependency order
  for (const reportId of createdReportIds) {
    await db.delete(reports).where(eq(reports.id, reportId));
  }
  createdReportIds = [];

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
  if (testOrg) {
    await db.delete(organizations).where(eq(organizations.id, testOrg.id));
  }
});

async function createIndividualReport(showTrends: boolean) {
  const [report] = await db.insert(reports).values({
    name: `Individual Trends Report (${showTrends ? 'on' : 'off'})`,
    organizationId: testOrg.id,
    reportType: 'individual',
    config: {
      timeframe: { type: 'preset', preset: 'all_time' },
      metrics: ['VERTICAL_JUMP'],
      ...(showTrends ? { showTrends: true } : {}),
    },
    createdBy: testCoach.id,
  }).returning();
  createdReportIds.push(report.id);
  return report;
}

describe('POST /api/reports/:id/generate — trends payload', () => {
  it('includes top-level trends when config.showTrends is true', async () => {
    const report = await createIndividualReport(true);

    const response = await request(app)
      .post(`/api/reports/${report.id}/generate`)
      .set('Cookie', coachAuthCookie)
      .send({ athleteId: testAthlete.id });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('reportType', 'individual');

    // Existing single-value fields remain present alongside trends
    expect(response.body).toHaveProperty('athlete');
    expect(response.body.athlete).toHaveProperty('measurements');
    expect(response.body.athlete.measurements).toHaveProperty('VERTICAL_JUMP');

    // Trends present with >= 2 points in the series
    expect(response.body.trends).toBeDefined();
    expect(response.body.trends).toHaveProperty('VERTICAL_JUMP');
    expect(Array.isArray(response.body.trends.VERTICAL_JUMP.series)).toBe(true);
    expect(response.body.trends.VERTICAL_JUMP.series.length).toBeGreaterThanOrEqual(2);
  });

  it('omits trends when config.showTrends is absent, keeping single-value fields', async () => {
    const report = await createIndividualReport(false);

    const response = await request(app)
      .post(`/api/reports/${report.id}/generate`)
      .set('Cookie', coachAuthCookie)
      .send({ athleteId: testAthlete.id });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('reportType', 'individual');

    // Single-value fields still present
    expect(response.body).toHaveProperty('athlete');
    expect(response.body.athlete).toHaveProperty('measurements');
    expect(response.body.athlete.measurements).toHaveProperty('VERTICAL_JUMP');

    // No trends field
    expect(response.body.trends).toBeUndefined();
  });
});

describe('POST /api/reports/:id/pdf — chart image embedding', () => {
  it('accepts chartImages and returns a non-empty application/pdf response', async () => {
    const report = await createIndividualReport(true);

    const response = await request(app)
      .post(`/api/reports/${report.id}/pdf`)
      .set('Cookie', coachAuthCookie)
      .send({
        athleteId: testAthlete.id,
        format: 'visual',
        chartImages: [
          { metricCode: 'VERTICAL_JUMP', dataUrl: TINY_PNG_DATA_URL },
        ],
      })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(Buffer.isBuffer(response.body)).toBe(true);
    // A real PDF is well over 1KB; assert the body is non-trivial.
    expect(response.body.length).toBeGreaterThan(1000);
  });

  it('requires authentication', async () => {
    const report = await createIndividualReport(true);

    const response = await request(app)
      .post(`/api/reports/${report.id}/pdf`)
      .send({
        athleteId: testAthlete.id,
        chartImages: [{ metricCode: 'VERTICAL_JUMP', dataUrl: TINY_PNG_DATA_URL }],
      });

    expect(response.status).toBe(401);
  });
});
