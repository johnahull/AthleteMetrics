/**
 * Integration Tests for Metric Explanation Editor (Issue #367, Phase 2)
 *
 * Verifies:
 *  - GET /api/admin/metric-explanations returns all built-ins with override status
 *  - PUT /api/admin/metric-explanations/:code upserts partial overrides
 *  - DELETE /api/admin/metric-explanations/:code resets to default
 *  - Non-site-admin gets 403 on all admin endpoints
 *  - Report generation reflects site-admin overrides
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
  siteMetricExplanations,
  siteSettings,
  reports,
  reportSnapshots,
} from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

let app: Express;
let testOrg: any;
let siteAdmin: any;
let siteAdminCookie: string;
let regularCoach: any;
let coachCookie: string;

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

  // Ensure site_settings exists
  const existingSettings = await db.select().from(siteSettings).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(siteSettings).values({});
  }

  [testOrg] = await db
    .insert(organizations)
    .values({
      name: `Expl Editor Org ${ts}`,
      description: 'metric explanation editor integration org',
      isActive: true,
    })
    .returning();

  const hashed = await hashPassword('TestPassword123!');

  // Site admin
  [siteAdmin] = await db
    .insert(users)
    .values({
      username: `expl_site_admin_${ts}`,
      emails: [`expl_site_admin_${ts}@test.com`],
      password: hashed,
      firstName: 'Site',
      lastName: 'Admin',
      fullName: 'Site Admin',
      isSiteAdmin: true,
    })
    .returning();

  await db.insert(userOrganizations).values({
    userId: siteAdmin.id,
    organizationId: testOrg.id,
    role: 'org_admin',
  });

  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: siteAdmin.username, password: 'TestPassword123!' });
  siteAdminCookie = adminLogin.headers['set-cookie'][0];

  // Regular coach (not site admin)
  [regularCoach] = await db
    .insert(users)
    .values({
      username: `expl_coach_${ts}`,
      emails: [`expl_coach_${ts}@test.com`],
      password: hashed,
      firstName: 'Regular',
      lastName: 'Coach',
      fullName: 'Regular Coach',
      isSiteAdmin: false,
    })
    .returning();

  await db.insert(userOrganizations).values({
    userId: regularCoach.id,
    organizationId: testOrg.id,
    role: 'coach',
  });

  const coachLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: regularCoach.username, password: 'TestPassword123!' });
  coachCookie = coachLogin.headers['set-cookie'][0];
});

afterEach(async () => {
  // Clean up reports + snapshots first (FK deps)
  if (testOrg?.id) {
    const orgReports = await db.select({ id: reports.id }).from(reports).where(eq(reports.organizationId, testOrg.id));
    for (const r of orgReports) {
      await db.delete(reportSnapshots).where(eq(reportSnapshots.reportId, r.id));
      await db.delete(reports).where(eq(reports.id, r.id));
    }
  }

  // Clean up overrides
  await db.delete(siteMetricExplanations);

  if (siteAdmin?.id && testOrg?.id) {
    await db.delete(userOrganizations).where(
      and(eq(userOrganizations.userId, siteAdmin.id), eq(userOrganizations.organizationId, testOrg.id)),
    );
  }
  if (regularCoach?.id && testOrg?.id) {
    await db.delete(userOrganizations).where(
      and(eq(userOrganizations.userId, regularCoach.id), eq(userOrganizations.organizationId, testOrg.id)),
    );
  }
  if (siteAdmin?.id) await db.delete(users).where(eq(users.id, siteAdmin.id));
  if (regularCoach?.id) await db.delete(users).where(eq(users.id, regularCoach.id));
  if (testOrg?.id) await db.delete(organizations).where(eq(organizations.id, testOrg.id));
});

afterAll(async () => {
  // no-op; per-test cleanup handles everything
});

describe('GET /api/admin/metric-explanations', () => {
  it('returns all 8 built-in metrics with hasOverride=false', async () => {
    const res = await request(app)
      .get('/api/admin/metric-explanations')
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(200);
    expect(res.body.metrics).toHaveLength(8);

    const fly = res.body.metrics.find((m: any) => m.code === 'FLY10_TIME');
    expect(fly).toBeDefined();
    expect(fly.title).toBe('10-Yard Fly');
    expect(fly.hasOverride).toBe(false);
    expect(fly.overrideFields).toEqual([]);
    expect(fly.directionOfBetter).toBe('lower');
  });

  it('returns 403 for non-site-admin', async () => {
    const res = await request(app)
      .get('/api/admin/metric-explanations')
      .set('Cookie', coachCookie);

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/admin/metric-explanations/:code', () => {
  it('creates a partial override and reflects it in GET', async () => {
    const putRes = await request(app)
      .put('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', siteAdminCookie)
      .send({ whyItMatters: 'Custom admin reason.' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.whyItMatters).toBe('Custom admin reason.');
    expect(putRes.body.hasOverride).toBe(true);
    expect(putRes.body.overrideFields).toContain('whyItMatters');
    // Non-overridden fields stay as built-in
    expect(putRes.body.title).toBe('10-Yard Fly');

    // Verify GET reflects the override
    const getRes = await request(app)
      .get('/api/admin/metric-explanations')
      .set('Cookie', siteAdminCookie);

    const fly = getRes.body.metrics.find((m: any) => m.code === 'FLY10_TIME');
    expect(fly.hasOverride).toBe(true);
    expect(fly.whyItMatters).toBe('Custom admin reason.');
    expect(fly.overrideFields).toEqual(['whyItMatters']);
  });

  it('updates an existing override with additional fields', async () => {
    await request(app)
      .put('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', siteAdminCookie)
      .send({ whyItMatters: 'First override.' });

    const res = await request(app)
      .put('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', siteAdminCookie)
      .send({ title: 'Fly 10' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Fly 10');
    expect(res.body.whyItMatters).toBe('First override.');
    expect(res.body.overrideFields).toEqual(expect.arrayContaining(['title', 'whyItMatters']));
  });

  it('clears a specific field by setting it to null', async () => {
    await request(app)
      .put('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', siteAdminCookie)
      .send({ whyItMatters: 'Temp override.', title: 'Fly 10' });

    const res = await request(app)
      .put('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', siteAdminCookie)
      .send({ title: null });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('10-Yard Fly'); // reverted to built-in
    expect(res.body.whyItMatters).toBe('Temp override.'); // kept
    expect(res.body.overrideFields).toContain('whyItMatters');
    expect(res.body.overrideFields).not.toContain('title');
  });

  it('returns 400 when no fields are provided', async () => {
    const res = await request(app)
      .put('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', siteAdminCookie)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 403 for non-site-admin', async () => {
    const res = await request(app)
      .put('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', coachCookie)
      .send({ whyItMatters: 'Hacked.' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/admin/metric-explanations/:code', () => {
  it('resets to default by deleting the override row', async () => {
    await request(app)
      .put('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', siteAdminCookie)
      .send({ whyItMatters: 'Will be deleted.' });

    const delRes = await request(app)
      .delete('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', siteAdminCookie);

    expect(delRes.status).toBe(200);
    expect(delRes.body.code).toBe('FLY10_TIME');

    // Verify GET shows no override
    const getRes = await request(app)
      .get('/api/admin/metric-explanations')
      .set('Cookie', siteAdminCookie);

    const fly = getRes.body.metrics.find((m: any) => m.code === 'FLY10_TIME');
    expect(fly.hasOverride).toBe(false);
  });

  it('returns 404 when no override exists', async () => {
    const res = await request(app)
      .delete('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(404);
  });

  it('returns 403 for non-site-admin', async () => {
    const res = await request(app)
      .delete('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', coachCookie);

    expect(res.status).toBe(403);
  });
});

describe('Report generation with site-admin overrides', () => {
  it('reflects site override in generated report metricExplanations', async () => {
    // Create an override for FLY10_TIME
    await request(app)
      .put('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', siteAdminCookie)
      .send({ whyItMatters: 'Admin-customized reason for fly time.' });

    // Create a report that includes FLY10_TIME
    const [testReport] = await db
      .insert(reports)
      .values({
        name: `Override Report ${Date.now()}`,
        organizationId: testOrg.id,
        reportType: 'team',
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['FLY10_TIME', 'VERTICAL_JUMP'],
        },
        createdBy: siteAdmin.id,
      })
      .returning();

    // Generate the report
    const res = await request(app)
      .post(`/api/reports/${testReport.id}/generate`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(200);
    expect(res.body.metricExplanations).toBeDefined();

    const fly = res.body.metricExplanations.FLY10_TIME;
    expect(fly).toBeDefined();
    // Overridden field should reflect the site admin's text
    expect(fly.whyItMatters).toBe('Admin-customized reason for fly time.');
    // Non-overridden fields should still be built-in
    expect(fly.title).toBe('10-Yard Fly');
    expect(fly.directionOfBetter).toBe('lower');

    // VERTICAL_JUMP should be pure built-in (no override)
    const vj = res.body.metricExplanations.VERTICAL_JUMP;
    expect(vj).toBeDefined();
    expect(vj.title).toBe('Vertical Jump');
  });

  it('snapshot freezes overridden text — later override deletion does not change snapshot', async () => {
    // Create an override
    await request(app)
      .put('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', siteAdminCookie)
      .send({ whyItMatters: 'Frozen override text for snapshot.' });

    // Create a report + snapshot
    const [testReport] = await db
      .insert(reports)
      .values({
        name: `Frozen Override Report ${Date.now()}`,
        organizationId: testOrg.id,
        reportType: 'team',
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['FLY10_TIME'],
        },
        createdBy: siteAdmin.id,
      })
      .returning();

    const snapRes = await request(app)
      .post(`/api/reports/${testReport.id}/snapshots`)
      .set('Cookie', siteAdminCookie)
      .send({ expirationDays: 7 });

    expect(snapRes.status).toBe(201);
    const token = snapRes.body.publicToken;
    expect(token).toBeTruthy();

    // Delete the override (reset to default)
    await request(app)
      .delete('/api/admin/metric-explanations/FLY10_TIME')
      .set('Cookie', siteAdminCookie);

    // The public snapshot should still have the overridden text
    const publicRes = await request(app).get(`/api/public/reports/${token}`);
    expect(publicRes.status).toBe(200);

    const frozen = publicRes.body.snapshotData?.metricExplanations?.FLY10_TIME;
    expect(frozen).toBeDefined();
    expect(frozen.whyItMatters).toBe('Frozen override text for snapshot.');
  });
});
