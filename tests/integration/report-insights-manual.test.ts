/**
 * Integration tests — manual coaching insights (PATCH /api/reports/:id/insights)
 *
 * Manual text needs no AI: the route works with AI off for the org, stores
 * coachingInsightsModel = null, and requires coach+ in the REPORT's organization
 * (not the session's primary-org role). Generate keeps its AI gate.
 *
 * Run:
 *   export $(cat .env | xargs) && npm run test:run -- tests/integration/report-insights-manual.test.ts
 */

// Set env vars before any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { users, organizations } from '@shared/schema/tables/core';
import { userOrganizations } from '@shared/schema/tables/membership';
import { reports } from '@shared/schema/tables/reports';
import { eq, and, like, sql } from 'drizzle-orm';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

// ============================================================================
// Mocks — must be declared before registerRoutes import
// ============================================================================

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

vi.mock('../../packages/api/services/email-service', () => ({
  emailService: {
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendInvitation: vi.fn().mockResolvedValue(true),
    sendWelcome: vi.fn().mockResolvedValue(true),
    sendPasswordReset: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn().mockImplementation(() => ({
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendEmailVerification: vi.fn().mockResolvedValue(true),
  })),
}));

import { registerRoutes } from '../../packages/api/routes';

// ============================================================================
// Helpers
// ============================================================================

const TEST_PREFIX = 'rpt_coppa_ai_';
const COACH_PASSWORD = 'CoachPassword1!';

function uid() {
  return crypto.randomBytes(4).toString('hex');
}

/** Create a test user (coach by default) */
async function createUser(suffix: string, opts: {
  coppaStatus?: string;
  isMinor?: boolean;
  parentEmail?: string;
} = {}) {
  const id = uid();
  const [user] = await db.insert(users).values({
    username: `${TEST_PREFIX}${suffix}_${id}`,
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
    emails: [`${TEST_PREFIX}${suffix}_${id}@example.com`],
    password: await bcrypt.hash(COACH_PASSWORD, BCRYPT_SALT_ROUNDS),
    isEmailVerified: true,
    isSiteAdmin: false,
    coppaStatus: (opts.coppaStatus ?? 'not_applicable') as any,
    isMinor: opts.isMinor ?? false,
    parentEmail: opts.parentEmail,
  }).returning();
  return user;
}

/** Link a user to an org */
async function addToOrg(userId: string, orgId: string, role: string) {
  await db.insert(userOrganizations).values({
    userId,
    organizationId: orgId,
    role,
  }).onConflictDoNothing();
}

/** Insert a report row directly */
async function insertReport(opts: {
  orgId: string;
  createdBy: string;
  reportType: 'individual' | 'team';
  athleteId?: string;
}) {
  const config: Record<string, unknown> = {
    timeframe: { type: 'preset', preset: 'all_time' },
    metrics: ['FLY10_TIME'],
  };
  if (opts.athleteId) {
    config.filters = { athleteId: opts.athleteId };
  }
  const [report] = await db.insert(reports).values({
    name: `${TEST_PREFIX}report_${uid()}`,
    organizationId: opts.orgId,
    createdBy: opts.createdBy,
    reportType: opts.reportType,
    config,
  }).returning();
  return report;
}

async function createOrg(ts: number, label: string, aiOn: boolean) {
  const name = `${TEST_PREFIX}${label}_${ts}`;
  const result = await db.execute(
    sql`INSERT INTO organizations (name, is_active, ai_enabled_by_site_admin, ai_enabled)
        VALUES (${name}, true, ${aiOn}, ${aiOn}) RETURNING id`
  );
  return (result as any)[0].id as string;
}

async function login(username: string) {
  const res = await request(app).post('/api/auth/login').send({ username, password: COACH_PASSWORD });
  if (res.status !== 200) throw new Error(`login failed (${res.status})`);
  return res.headers['set-cookie'][0];
}

let app: Express;
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];
const createdReportIds: string[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set to run integration tests.');
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

afterAll(async () => {
  for (const id of createdReportIds) await db.delete(reports).where(eq(reports.id, id)).catch(() => {});
  for (const id of createdUserIds) {
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, id)).catch(() => {});
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  for (const id of createdOrgIds) await db.delete(organizations).where(eq(organizations.id, id)).catch(() => {});
  await db.delete(users).where(like(users.username, `${TEST_PREFIX}%`)).catch(() => {});
});

describe('PATCH /api/reports/:id/insights — manual insights', () => {
  it('succeeds with AI off, stores model null; 403 when coach in primary org but athlete in report org', async () => {
    const ts = Date.now();
    // "a_" sorts first, so it is the coach's primary (session) organization
    const primaryOrg = await createOrg(ts, 'a_primary', false);
    const reportOrg = await createOrg(ts, 'b_report', false);
    createdOrgIds.push(primaryOrg, reportOrg);

    const coach = await createUser('coach');
    createdUserIds.push(coach.id);
    await addToOrg(coach.id, primaryOrg, 'coach');
    await addToOrg(coach.id, reportOrg, 'athlete');

    const report = await insertReport({ orgId: reportOrg, createdBy: coach.id, reportType: 'individual', athleteId: coach.id });
    createdReportIds.push(report.id);
    const cookie = await login(coach.username);

    const denied = await request(app).patch(`/api/reports/${report.id}/insights`).set('Cookie', cookie).send({ coachingInsights: 'x' });
    expect(denied.status).toBe(403);

    await db.update(userOrganizations).set({ role: 'coach' })
      .where(and(eq(userOrganizations.userId, coach.id), eq(userOrganizations.organizationId, reportOrg)));
    const cookie2 = await login(coach.username);

    const ok = await request(app).patch(`/api/reports/${report.id}/insights`).set('Cookie', cookie2).send({ coachingInsights: 'Hand-written.' });
    expect(ok.status).toBe(200);
    expect(ok.body.model).toBeNull();
    const [row] = await db.select().from(reports).where(eq(reports.id, report.id));
    expect(row.coachingInsights).toBe('Hand-written.');
    expect(row.coachingInsightsModel).toBeNull();
  });

  it('succeeds for a coach in the report org whose primary (first) org gives only the athlete role', async () => {
    const ts = Date.now();
    const primaryOrg = await createOrg(ts, 'a_first', false);
    const reportOrg = await createOrg(ts, 'b_second', false);
    createdOrgIds.push(primaryOrg, reportOrg);
    const user = await createUser('coach_inverse');
    createdUserIds.push(user.id);
    await addToOrg(user.id, primaryOrg, 'athlete');
    await addToOrg(user.id, reportOrg, 'coach');
    const report = await insertReport({ orgId: reportOrg, createdBy: user.id, reportType: 'individual', athleteId: user.id });
    createdReportIds.push(report.id);
    const cookie = await login(user.username);

    const ok = await request(app).patch(`/api/reports/${report.id}/insights`).set('Cookie', cookie).send({ coachingInsights: 'Hand-written.' });
    expect(ok.status).toBe(200);
    const blank = await request(app).patch(`/api/reports/${report.id}/insights`).set('Cookie', cookie).send({ coachingInsights: '   ' });
    expect(blank.status).toBe(400);
  });

  it('403 for a coach of a different organization', async () => {
    const ts = Date.now();
    const myOrg = await createOrg(ts, 'c_mine', false);
    const otherOrg = await createOrg(ts, 'd_other', false);
    createdOrgIds.push(myOrg, otherOrg);
    const coach = await createUser('coach_x');
    createdUserIds.push(coach.id);
    await addToOrg(coach.id, myOrg, 'coach');
    const report = await insertReport({ orgId: otherOrg, createdBy: coach.id, reportType: 'individual', athleteId: coach.id });
    createdReportIds.push(report.id);

    const res = await request(app).patch(`/api/reports/${report.id}/insights`).set('Cookie', await login(coach.username)).send({ coachingInsights: 'x' });
    expect(res.status).toBe(403);
  });

  it('POST generate-insights is still 403 when the org has AI off', async () => {
    const ts = Date.now();
    const org = await createOrg(ts, 'e_noai', false);
    createdOrgIds.push(org);
    const coach = await createUser('coach_y');
    createdUserIds.push(coach.id);
    await addToOrg(coach.id, org, 'coach');
    const report = await insertReport({ orgId: org, createdBy: coach.id, reportType: 'individual', athleteId: coach.id });
    createdReportIds.push(report.id);

    const res = await request(app).post(`/api/reports/${report.id}/generate-insights`).set('Cookie', await login(coach.username)).send({});
    expect(res.status).toBe(403);
  });
});
