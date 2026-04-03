/**
 * Integration tests — COPPA AI consent gate in report-routes.ts (GAP 5)
 *
 * Source: packages/api/routes/report-routes.ts
 *   POST /api/reports/:id/generate-insights
 *   Lines around the COPPA canAccessAI / getMinorsWithoutAIConsent check.
 *
 * Covers:
 *  1. Individual report — minor athlete WITHOUT AI consent → 403 ai_consent_required
 *  2. Individual report — minor athlete WITH AI consent → passes COPPA gate
 *     (AI call itself may fail due to missing API key — that is expected & acceptable)
 *  3. Team report — at least one minor WITHOUT AI consent → 403 with count in message
 *  4. Team report — all minors HAVE AI consent → passes COPPA gate
 *
 * The tests intentionally stop at the COPPA gate boundary. If the org has
 * aiEnabled=false the request will be blocked by requireAIEnabled before
 * reaching COPPA logic, so the test org is created with both AI flags enabled.
 * The AI generation itself will fail (no API key in test env) — that is fine;
 * any non-403 response for COPPA reasons is a pass.
 *
 * Run:
 *   export $(cat .env | xargs) && npm run test:run -- tests/integration/report-coppa-ai-gate.test.ts
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
import { parentalConsents, parentAthleteLinks } from '@shared/schema/tables/coppa';
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

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Insert a confirmed parental consent record granting (or withholding) AI consent */
async function insertConfirmedConsent(athleteUserId: string, parentEmail: string, aiConsentGranted: boolean) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const [consent] = await db.insert(parentalConsents).values({
    athleteUserId,
    parentEmail,
    tokenHash: hashToken(rawToken),
    status: 'confirmed',
    aiConsentGranted,
    confirmedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }).returning();
  return consent;
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

/** Create an org with both AI flags enabled.
 *
 * Uses raw SQL to avoid Drizzle referencing schema columns (e.g. ai_prompt_context)
 * that may not yet exist in the test database.
 *
 * The requireAIEnabled middleware checks:
 *   organization.aiEnabledBySiteAdmin === true AND organization.aiEnabled === true
 * Both must be set so the middleware passes control to the COPPA gate check.
 */
async function createOrgWithAI(ts: number) {
  const name = `${TEST_PREFIX}org_${ts}`;
  const result = await db.execute(
    sql`INSERT INTO organizations (name, is_active, ai_enabled_by_site_admin, ai_enabled)
        VALUES (${name}, true, true, true)
        RETURNING id, name, ai_enabled_by_site_admin, ai_enabled, coppa_enabled`
  );
  const row = (result as any)[0];
  if (!row?.id) throw new Error(`Failed to create test org: ${name}`);
  return row;
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

// ============================================================================
// Setup / Teardown
// ============================================================================

let app: Express;
let adminCookie: string;
let adminUserId: string;

// Test entities — created once, cleaned up in afterAll
let testOrg: any;

const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];
const createdReportIds: string[] = [];
const createdConsentIds: string[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to run integration tests.');
  }

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  // ----------------------------------------------------------------
  // Get / login as site admin (env admin).
  //
  // Site admins bypass requireRole() and canAccessOrganization(), so we
  // use the admin cookie throughout to avoid the "coach login" path which
  // triggers getUserOrganizations → fails in test DBs missing ai_prompt_context.
  // ----------------------------------------------------------------
  const adminRows = await db.select().from(users)
    .where(eq(users.username, process.env.ADMIN_USER || 'admin'))
    .limit(1);
  if (adminRows.length === 0) {
    throw new Error('Admin user not found — ensure admin is initialized by registerRoutes()');
  }
  adminUserId = adminRows[0].id;

  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({
      username: process.env.ADMIN_USER || 'admin',
      password: process.env.ADMIN_PASSWORD || 'TestPassword123!',
    });
  if (adminLogin.status !== 200 || !adminLogin.headers['set-cookie']) {
    throw new Error(`Admin login failed (${adminLogin.status})`);
  }
  adminCookie = adminLogin.headers['set-cookie'][0];

  // ----------------------------------------------------------------
  // Create a shared org for this test suite (raw SQL to avoid missing columns)
  // ----------------------------------------------------------------
  const ts = Date.now();
  testOrg = await createOrgWithAI(ts);
  createdOrgIds.push(testOrg.id);
});

afterAll(async () => {
  // Clean up in reverse FK order
  for (const id of createdReportIds) {
    await db.delete(reports).where(eq(reports.id, id)).catch(() => {});
  }
  for (const id of createdConsentIds) {
    await db.delete(parentalConsents).where(eq(parentalConsents.id, id)).catch(() => {});
  }
  for (const userId of createdUserIds) {
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, userId)).catch(() => {});
    await db.delete(parentAthleteLinks).where(eq(parentAthleteLinks.athleteUserId, userId)).catch(() => {});
    await db.delete(parentalConsents).where(eq(parentalConsents.athleteUserId, userId)).catch(() => {});
    await db.delete(users).where(eq(users.id, userId)).catch(() => {});
  }
  for (const orgId of createdOrgIds) {
    await db.delete(organizations).where(eq(organizations.id, orgId)).catch(() => {});
  }
  // Sweep by username prefix to catch any stragglers
  await db.delete(users).where(like(users.username, `${TEST_PREFIX}%`)).catch(() => {});
});

// ============================================================================
// GAP 5a — Individual report, minor WITHOUT AI consent → 403
// ============================================================================

describe('POST /api/reports/:id/generate-insights — individual report, minor WITHOUT AI consent', () => {
  it('returns 403 with code ai_consent_required when minor athlete lacks AI consent', async () => {
    // Create a minor athlete in the org with coppaStatus='consented' but
    // aiConsentGranted=false on the consent record (i.e., parent opted out of AI).
    const minorUser = await createUser('minor_noai', {
      coppaStatus: 'consented',
      isMinor: true,
      parentEmail: `${TEST_PREFIX}parent_noai_${uid()}@example.com`,
    });
    createdUserIds.push(minorUser.id);
    await addToOrg(minorUser.id, testOrg.id, 'athlete');

    // Consent record with aiConsentGranted=false
    const consent = await insertConfirmedConsent(
      minorUser.id,
      minorUser.parentEmail!,
      false,
    );
    createdConsentIds.push(consent.id);

    // Create an individual report targeting this minor
    const report = await insertReport({
      orgId: testOrg.id,
      createdBy: adminUserId,
      reportType: 'individual',
      athleteId: minorUser.id,
    });
    createdReportIds.push(report.id);

    const res = await request(app)
      .post(`/api/reports/${report.id}/generate-insights`)
      .set('Cookie', adminCookie)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ai_consent_required');
    expect(res.body.featureDisabled).toBe(true);
    expect(res.body.reason).toBe('minor_without_ai_consent');
  });
});

// ============================================================================
// GAP 5b — Individual report, minor WITH AI consent → passes COPPA gate
// ============================================================================

describe('POST /api/reports/:id/generate-insights — individual report, minor WITH AI consent', () => {
  it('does NOT return 403 for COPPA reasons when minor has granted AI consent', async () => {
    // Create a minor athlete with a confirmed consent record where
    // aiConsentGranted=true.
    const minorUser = await createUser('minor_hasai', {
      coppaStatus: 'consented',
      isMinor: true,
      parentEmail: `${TEST_PREFIX}parent_hasai_${uid()}@example.com`,
    });
    createdUserIds.push(minorUser.id);
    await addToOrg(minorUser.id, testOrg.id, 'athlete');

    const consent = await insertConfirmedConsent(
      minorUser.id,
      minorUser.parentEmail!,
      true, // AI consent granted
    );
    createdConsentIds.push(consent.id);

    const report = await insertReport({
      orgId: testOrg.id,
      createdBy: adminUserId,
      reportType: 'individual',
      athleteId: minorUser.id,
    });
    createdReportIds.push(report.id);

    const res = await request(app)
      .post(`/api/reports/${report.id}/generate-insights`)
      .set('Cookie', adminCookie)
      .send({});

    // The COPPA gate should NOT block this request.
    // The response may be a non-403 error (e.g., 500 if no AI API key, or 404
    // if the org is missing site settings) — any non-COPPA-403 is a pass.
    expect(res.status).not.toBe(403);
    // Specifically verify it is not the COPPA code
    if (res.status === 403) {
      expect(res.body.code).not.toBe('ai_consent_required');
    }
  });
});

// ============================================================================
// GAP 5c — Team report, at least one minor WITHOUT AI consent → 403 with count
// ============================================================================

describe('POST /api/reports/:id/generate-insights — team report, minor WITHOUT AI consent', () => {
  it('returns 403 with count when at least one org minor lacks AI consent', async () => {
    // Create two minors in the org:
    //   - minor1: consented WITH AI consent
    //   - minor2: consented WITHOUT AI consent
    const minor1 = await createUser('team_minor_ok', {
      coppaStatus: 'consented',
      isMinor: true,
      parentEmail: `${TEST_PREFIX}par_ok_${uid()}@example.com`,
    });
    const minor2 = await createUser('team_minor_no', {
      coppaStatus: 'consented',
      isMinor: true,
      parentEmail: `${TEST_PREFIX}par_no_${uid()}@example.com`,
    });
    createdUserIds.push(minor1.id, minor2.id);
    await addToOrg(minor1.id, testOrg.id, 'athlete');
    await addToOrg(minor2.id, testOrg.id, 'athlete');

    const consent1 = await insertConfirmedConsent(minor1.id, minor1.parentEmail!, true);
    const consent2 = await insertConfirmedConsent(minor2.id, minor2.parentEmail!, false);
    createdConsentIds.push(consent1.id, consent2.id);

    // Team report (no specific athleteId — covers the whole org)
    const report = await insertReport({
      orgId: testOrg.id,
      createdBy: adminUserId,
      reportType: 'team',
    });
    createdReportIds.push(report.id);

    const res = await request(app)
      .post(`/api/reports/${report.id}/generate-insights`)
      .set('Cookie', adminCookie)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ai_consent_required');
    expect(res.body.featureDisabled).toBe(true);
    // The message should mention at least 1 minor without consent.
    // The exact count varies depending on how many minors exist in the org —
    // we only assert the pattern, not the specific number.
    expect(res.body.message).toMatch(/\d+\s+minor/i);
  });
});

// ============================================================================
// GAP 5d — Team report, ALL minors have AI consent → passes COPPA gate
// ============================================================================

describe('POST /api/reports/:id/generate-insights — team report, all minors have AI consent', () => {
  it('does NOT return 403 for COPPA reasons when all org minors have AI consent', async () => {
    // Build a FRESH isolated org so only the 2 minors created here are in it.
    // This avoids contamination from minors created in other test cases.
    // Admin is a site admin — bypasses requireRole and canAccessOrganization so
    // no coach login is needed here.
    const ts2 = Date.now() + 1;
    const isolatedOrg = await createOrgWithAI(ts2);
    createdOrgIds.push(isolatedOrg.id);

    // Create two minors, both with AI consent granted
    const minorA = await createUser('iso_minorA', {
      coppaStatus: 'consented',
      isMinor: true,
      parentEmail: `${TEST_PREFIX}parA_${uid()}@example.com`,
    });
    const minorB = await createUser('iso_minorB', {
      coppaStatus: 'consented',
      isMinor: true,
      parentEmail: `${TEST_PREFIX}parB_${uid()}@example.com`,
    });
    createdUserIds.push(minorA.id, minorB.id);
    await addToOrg(minorA.id, isolatedOrg.id, 'athlete');
    await addToOrg(minorB.id, isolatedOrg.id, 'athlete');

    const consentA = await insertConfirmedConsent(minorA.id, minorA.parentEmail!, true);
    const consentB = await insertConfirmedConsent(minorB.id, minorB.parentEmail!, true);
    createdConsentIds.push(consentA.id, consentB.id);

    const report = await insertReport({
      orgId: isolatedOrg.id,
      createdBy: adminUserId,
      reportType: 'team',
    });
    createdReportIds.push(report.id);

    const res = await request(app)
      .post(`/api/reports/${report.id}/generate-insights`)
      .set('Cookie', adminCookie)
      .send({});

    // COPPA gate should pass — response may be a different non-COPPA error
    expect(res.status).not.toBe(403);
    if (res.status === 403) {
      expect(res.body.code).not.toBe('ai_consent_required');
    }
  });
});
