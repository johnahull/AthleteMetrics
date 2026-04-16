/**
 * Integration Tests for Metric Explanations in Reports (Issue #367)
 *
 * Verifies:
 *  - POST /api/reports/:id/generate returns metricExplanations keyed by metric code
 *  - Custom metric descriptions are resolved from customOrgMetrics
 *  - Public snapshots freeze metricExplanations into snapshotData (persistent)
 *  - GET /api/public/reports/:token returns the frozen metricExplanations
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import {
  organizations,
  users,
  userOrganizations,
  reports,
  reportSnapshots,
  customOrgMetrics,
} from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

let app: Express;
let testOrg: any;
let testCoach: any;
let coachCookie: string;
let testReport: any;

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
      name: `Metric Expl Org ${ts}`,
      description: 'metric explanations integration org',
      isActive: true,
    })
    .returning();

  const hashed = await hashPassword('TestCoach123!');
  [testCoach] = await db
    .insert(users)
    .values({
      username: `expl_coach_${ts}`,
      emails: [`expl_coach_${ts}@test.com`],
      password: hashed,
      firstName: 'Test',
      lastName: 'Coach',
      fullName: 'Test Coach',
    })
    .returning();

  await db.insert(userOrganizations).values({
    userId: testCoach.id,
    organizationId: testOrg.id,
    role: 'coach',
  });

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: testCoach.username, password: 'TestCoach123!' });
  coachCookie = login.headers['set-cookie'][0];
});

afterEach(async () => {
  if (testReport?.id) {
    await db.delete(reportSnapshots).where(eq(reportSnapshots.reportId, testReport.id));
    await db.delete(reports).where(eq(reports.id, testReport.id));
    testReport = null;
  }
  if (testOrg?.id) {
    await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, testOrg.id));
  }
  if (testCoach?.id && testOrg?.id) {
    await db
      .delete(userOrganizations)
      .where(
        and(
          eq(userOrganizations.userId, testCoach.id),
          eq(userOrganizations.organizationId, testOrg.id),
        ),
      );
  }
  if (testCoach?.id) {
    await db.delete(users).where(eq(users.id, testCoach.id));
  }
  if (testOrg?.id) {
    await db.delete(organizations).where(eq(organizations.id, testOrg.id));
  }
});

afterAll(async () => {
  // no-op; per-test cleanup handles everything
});

describe('POST /api/reports/:id/generate — metricExplanations', () => {
  it('includes metricExplanations keyed by every requested built-in metric', async () => {
    [testReport] = await db
      .insert(reports)
      .values({
        name: 'Explanations Built-in',
        organizationId: testOrg.id,
        reportType: 'team',
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['FLY10_TIME', 'VERTICAL_JUMP'],
        },
        createdBy: testCoach.id,
      })
      .returning();

    const res = await request(app)
      .post(`/api/reports/${testReport.id}/generate`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(res.body.metricExplanations).toBeDefined();
    expect(res.body.metricExplanations.FLY10_TIME).toBeDefined();
    expect(res.body.metricExplanations.FLY10_TIME.title).toBe('10-Yard Fly');
    expect(res.body.metricExplanations.FLY10_TIME.directionOfBetter).toBe('lower');
    expect(res.body.metricExplanations.VERTICAL_JUMP.directionOfBetter).toBe('higher');
  });

  it('resolves custom metric descriptions from customOrgMetrics', async () => {
    await db.insert(customOrgMetrics).values({
      organizationId: testOrg.id,
      code: 'CUSTOM_BROAD_JUMP',
      label: 'Broad Jump',
      description: 'Horizontal jump distance from standing start.',
      unit: 'inches',
      metricType: 'higher_is_better',
    });

    [testReport] = await db
      .insert(reports)
      .values({
        name: 'Explanations Custom',
        organizationId: testOrg.id,
        reportType: 'team',
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['CUSTOM_BROAD_JUMP'],
        },
        createdBy: testCoach.id,
      })
      .returning();

    const res = await request(app)
      .post(`/api/reports/${testReport.id}/generate`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    const explanation = res.body.metricExplanations?.CUSTOM_BROAD_JUMP;
    expect(explanation).toBeDefined();
    expect(explanation.title).toBe('Broad Jump');
    expect(explanation.whatItMeasures).toBe('Horizontal jump distance from standing start.');
    expect(explanation.directionOfBetter).toBe('higher');
    expect(explanation.unitNote).toMatch(/inches/i);
    expect(explanation.unitNote).toMatch(/higher is better/i);
  });

  it('falls back to a generic placeholder for unknown codes', async () => {
    [testReport] = await db
      .insert(reports)
      .values({
        name: 'Explanations Unknown',
        organizationId: testOrg.id,
        reportType: 'team',
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['UNKNOWN_METRIC_CODE'],
        },
        createdBy: testCoach.id,
      })
      .returning();

    const res = await request(app)
      .post(`/api/reports/${testReport.id}/generate`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(res.body.metricExplanations?.UNKNOWN_METRIC_CODE).toBeDefined();
    expect(res.body.metricExplanations.UNKNOWN_METRIC_CODE.whatItMeasures).toMatch(
      /custom metric tracked by your organization/i,
    );
  });
});

describe('PDF generation — glossary section', () => {
  it('returns a PDF with glossary content for a report with explanations', async () => {
    [testReport] = await db
      .insert(reports)
      .values({
        name: 'PDF Glossary Test',
        organizationId: testOrg.id,
        reportType: 'team',
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['FLY10_TIME', 'VERTICAL_JUMP'],
        },
        createdBy: testCoach.id,
      })
      .returning();

    const res = await request(app)
      .get(`/api/reports/${testReport.id}/pdf?format=simplified`)
      .set('Cookie', coachCookie)
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk as Buffer));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
    const pdfBuffer = res.body as Buffer;
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    // PDF magic header
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
    // jsPDF encodes text; search across raw buffer for glossary title fragment.
    const raw = pdfBuffer.toString('latin1');
    expect(raw).toMatch(/Glossary of Metrics/);
  });
});

describe('Snapshot freezing — metricExplanations', () => {
  it('persists metricExplanations at snapshotData top level', async () => {
    [testReport] = await db
      .insert(reports)
      .values({
        name: 'Freeze Test',
        organizationId: testOrg.id,
        reportType: 'team',
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['FLY10_TIME'],
        },
        createdBy: testCoach.id,
      })
      .returning();

    const snapRes = await request(app)
      .post(`/api/reports/${testReport.id}/snapshots`)
      .set('Cookie', coachCookie)
      .send({ expirationDays: 7 });

    expect(snapRes.status).toBe(201);
    const token = snapRes.body.publicToken;
    expect(token).toBeTruthy();

    const publicRes = await request(app).get(`/api/public/reports/${token}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.snapshotData?.metricExplanations?.FLY10_TIME).toBeDefined();
    expect(publicRes.body.snapshotData.metricExplanations.FLY10_TIME.title).toBe('10-Yard Fly');
  });

  it('freezes custom metric text — later DB edits do not change public view', async () => {
    await db.insert(customOrgMetrics).values({
      organizationId: testOrg.id,
      code: 'CUSTOM_FROZEN',
      label: 'Frozen Metric',
      description: 'Original description.',
      unit: 'seconds',
      metricType: 'lower_is_better',
    });

    [testReport] = await db
      .insert(reports)
      .values({
        name: 'Frozen Custom',
        organizationId: testOrg.id,
        reportType: 'team',
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['CUSTOM_FROZEN'],
        },
        createdBy: testCoach.id,
      })
      .returning();

    const snapRes = await request(app)
      .post(`/api/reports/${testReport.id}/snapshots`)
      .set('Cookie', coachCookie)
      .send({ expirationDays: 7 });
    expect(snapRes.status).toBe(201);
    const token = snapRes.body.publicToken;

    await db
      .update(customOrgMetrics)
      .set({ description: 'Updated description AFTER snapshot.' })
      .where(
        and(
          eq(customOrgMetrics.organizationId, testOrg.id),
          eq(customOrgMetrics.code, 'CUSTOM_FROZEN'),
        ),
      );

    const publicRes = await request(app).get(`/api/public/reports/${token}`);
    expect(publicRes.status).toBe(200);
    const frozen = publicRes.body.snapshotData?.metricExplanations?.CUSTOM_FROZEN;
    expect(frozen).toBeDefined();
    expect(frozen.whatItMeasures).toBe('Original description.');
    expect(frozen.whatItMeasures).not.toMatch(/AFTER snapshot/i);
  });

  it('does not transform malicious markdown server-side (XSS defense lives client-side)', async () => {
    const maliciousDescription = '<script>alert(1)</script>Normal text.';
    await db.insert(customOrgMetrics).values({
      organizationId: testOrg.id,
      code: 'CUSTOM_XSS',
      label: 'XSS Metric',
      description: maliciousDescription,
      unit: 'seconds',
      metricType: 'lower_is_better',
    });

    [testReport] = await db
      .insert(reports)
      .values({
        name: 'XSS Test',
        organizationId: testOrg.id,
        reportType: 'team',
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['CUSTOM_XSS'],
        },
        createdBy: testCoach.id,
      })
      .returning();

    const snapRes = await request(app)
      .post(`/api/reports/${testReport.id}/snapshots`)
      .set('Cookie', coachCookie)
      .send({ expirationDays: 7 });
    expect(snapRes.status).toBe(201);
    const token = snapRes.body.publicToken;

    const publicRes = await request(app).get(`/api/public/reports/${token}`);
    expect(publicRes.status).toBe(200);
    const frozen = publicRes.body.snapshotData?.metricExplanations?.CUSTOM_XSS;
    expect(frozen).toBeDefined();
    expect(frozen.whatItMeasures).toBe(maliciousDescription);
  });
});
