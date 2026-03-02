/**
 * Integration tests — COPPA data deletion endpoints
 *
 * Covers all three deletion route endpoints:
 *  1. POST /api/coppa/data-deletion/request   — initiate deletion request
 *  2. GET  /api/coppa/data-deletion/:requestId — view request details (site admin)
 *  3. POST /api/coppa/data-deletion/:requestId/process — execute deletion (site admin)
 *
 * LEGAL items are marked with [LEGAL]:
 *  - Audit log MUST be retained even after data deletion
 *  - User record must be soft-deleted (not hard-deleted) for compliance
 *
 * Email sending is mocked to prevent real emails in test runs.
 *
 * Run:
 *   export $(cat .env | xargs) && npm run test:run -- tests/integration/coppa-deletion.test.ts
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
import { users } from '@shared/schema/tables/core';
import {
  parentalConsents,
  coppaAuditLog,
  parentAthleteLinks,
  dataDeletionRequests,
} from '@shared/schema/tables/coppa';
import { measurements } from '@shared/schema/tables/measurements';
import { wellnessResponses } from '@shared/schema/tables/wellness';
import { eq, like, and } from 'drizzle-orm';
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
    sendDeletionRequestConfirmation: vi.fn().mockResolvedValue(true),
    sendDeletionCompletedNotification: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn().mockImplementation(() => ({
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendDeletionRequestConfirmation: vi.fn().mockResolvedValue(true),
    sendDeletionCompletedNotification: vi.fn().mockResolvedValue(true),
  })),
}));

import { registerRoutes } from '../../packages/api/routes';

// ============================================================================
// Helpers
// ============================================================================

const CORRECT_PASSWORD = 'ValidPass1!';

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function insertConsentRecord(params: {
  athleteUserId: string;
  parentEmail: string;
  status?: 'pending' | 'confirmed' | 'revoked' | 'expired';
  aiConsentGranted?: boolean | null;
}): Promise<{ rawToken: string; consentId: string }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [consent] = await db.insert(parentalConsents).values({
    athleteUserId: params.athleteUserId,
    parentEmail: params.parentEmail,
    tokenHash,
    status: params.status ?? 'confirmed',
    aiConsentGranted: params.aiConsentGranted ?? null,
    expiresAt,
    confirmedAt: params.status === 'confirmed' ? new Date() : null,
  }).returning({ id: parentalConsents.id });

  return { rawToken, consentId: consent.id };
}

// ============================================================================
// Setup / Teardown
// ============================================================================

let app: Express;
let siteAdminCookie: string;
let siteAdminUserId: string;

// Test user IDs — cleaned up in afterAll
let minorAthleteId: string;
let minorAthleteUsername: string;
let minorAthlete2Id: string;
let minorAthlete2Username: string;
let orgAdminId: string;
let orgAdminUsername: string;
let orgAdminCookie: string;

const TS = Date.now();

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to run integration tests.');
  }

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const hashedPassword = await bcrypt.hash(CORRECT_PASSWORD, BCRYPT_SALT_ROUNDS);

  // 1. Get site admin
  const adminRows = await db.select().from(users)
    .where(eq(users.username, process.env.ADMIN_USER || 'admin'))
    .limit(1);
  if (adminRows.length === 0) {
    throw new Error('Admin user not found — ensure admin is initialized by registerRoutes()');
  }
  siteAdminUserId = adminRows[0].id;

  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({
      username: process.env.ADMIN_USER || 'admin',
      password: process.env.ADMIN_PASSWORD || 'TestPassword123!',
    });

  if (adminLogin.status !== 200 || !adminLogin.headers['set-cookie']) {
    throw new Error(
      `Admin login failed (status: ${adminLogin.status}). ` +
      'Ensure ADMIN_PASSWORD matches the initialized admin user password.'
    );
  }
  siteAdminCookie = adminLogin.headers['set-cookie'][0];

  // 2. Create minor athlete with consented COPPA status (primary test subject)
  minorAthleteUsername = `del-minor-${TS}`;
  const [minorAthlete] = await db.insert(users).values({
    username: minorAthleteUsername,
    firstName: 'Delete',
    lastName: 'Minor',
    fullName: 'Delete Minor',
    emails: [`del-minor-${TS}@test.local`],
    password: hashedPassword,
    isSiteAdmin: false,
    coppaStatus: 'consented',
    isMinor: true,
    parentEmail: `parent-del-${TS}@test.local`,
    isEmailVerified: true,
  }).returning({ id: users.id });
  minorAthleteId = minorAthlete.id;

  // Insert a confirmed consent record for the minor
  await insertConsentRecord({
    athleteUserId: minorAthleteId,
    parentEmail: `parent-del-${TS}@test.local`,
    status: 'confirmed',
    aiConsentGranted: true,
  });

  // 3. Create second minor athlete (for process/complete tests)
  minorAthlete2Username = `del-minor2-${TS}`;
  const [minorAthlete2] = await db.insert(users).values({
    username: minorAthlete2Username,
    firstName: 'Delete2',
    lastName: 'Minor2',
    fullName: 'Delete2 Minor2',
    emails: [`del-minor2-${TS}@test.local`],
    password: hashedPassword,
    isSiteAdmin: false,
    coppaStatus: 'consented',
    isMinor: true,
    parentEmail: `parent-del2-${TS}@test.local`,
    isEmailVerified: true,
  }).returning({ id: users.id });
  minorAthlete2Id = minorAthlete2.id;

  await insertConsentRecord({
    athleteUserId: minorAthlete2Id,
    parentEmail: `parent-del2-${TS}@test.local`,
    status: 'confirmed',
    aiConsentGranted: false,
  });

  // 4. Create org admin
  orgAdminUsername = `del-orgadmin-${TS}`;
  const [orgAdmin] = await db.insert(users).values({
    username: orgAdminUsername,
    firstName: 'Org',
    lastName: 'Admin',
    fullName: 'Org Admin',
    emails: [`del-orgadmin-${TS}@test.local`],
    password: hashedPassword,
    isSiteAdmin: false,
    isEmailVerified: true,
    coppaStatus: 'not_applicable',
  }).returning({ id: users.id });
  orgAdminId = orgAdmin.id;

  const orgAdminLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: orgAdminUsername, password: CORRECT_PASSWORD });

  if (orgAdminLogin.status === 200 && orgAdminLogin.headers['set-cookie']) {
    orgAdminCookie = orgAdminLogin.headers['set-cookie'][0];
  }
});

afterAll(async () => {
  const idsToDelete = [minorAthleteId, minorAthlete2Id, orgAdminId].filter(Boolean);

  // Clean up deletion requests first (FK: athlete_user_id → users.id with cascade)
  for (const id of idsToDelete) {
    try {
      await db.delete(dataDeletionRequests).where(eq(dataDeletionRequests.athleteUserId, id));
    } catch { /* best-effort */ }
  }

  // Clean up consent records
  for (const id of idsToDelete) {
    try {
      await db.delete(parentAthleteLinks).where(eq(parentAthleteLinks.athleteUserId, id));
      await db.delete(parentalConsents).where(eq(parentalConsents.athleteUserId, id));
    } catch { /* best-effort */ }
  }

  // Delete users (measurements deleted by cascade or already soft-deleted)
  for (const id of idsToDelete) {
    try {
      await db.delete(users).where(eq(users.id, id));
    } catch { /* best-effort */ }
  }

  // Sweep by username pattern
  try {
    const sweepPatterns = [`del-minor-${TS}`, `del-minor2-${TS}`, `del-orgadmin-${TS}`];
    for (const pattern of sweepPatterns) {
      await db.delete(users).where(like(users.username, `${pattern}%`));
    }
  } catch { /* best-effort */ }
});

// ============================================================================
// 1. POST /api/coppa/data-deletion/request
// ============================================================================

describe('POST /api/coppa/data-deletion/request', () => {
  it('site admin can initiate deletion request for a minor athlete', async () => {
    const res = await request(app)
      .post('/api/coppa/data-deletion/request')
      .set('Cookie', siteAdminCookie)
      .send({
        athleteUserId: minorAthleteId,
        requestedByEmail: `parent-del-${TS}@test.local`,
        notes: 'Test deletion request',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.requestId).toBeTruthy();

    // Clean up for subsequent tests
    await db.delete(dataDeletionRequests)
      .where(eq(dataDeletionRequests.id, res.body.requestId));
  });

  it('unauthenticated request with valid token → 201', async () => {
    // The endpoint accepts public token-gated requests (parent email link)
    const { rawToken } = await insertConsentRecord({
      athleteUserId: minorAthleteId,
      parentEmail: `parent-del-${TS}@test.local`,
      status: 'confirmed',
    });

    const res = await request(app)
      .post('/api/coppa/data-deletion/request')
      .send({
        athleteUserId: minorAthleteId,
        requestedByEmail: `parent-del-${TS}@test.local`,
        consentToken: rawToken,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.requestId).toBeTruthy();

    // Clean up
    await db.delete(dataDeletionRequests)
      .where(eq(dataDeletionRequests.id, res.body.requestId));
  });

  it('unauthenticated without token → 401', async () => {
    const res = await request(app)
      .post('/api/coppa/data-deletion/request')
      .send({
        athleteUserId: minorAthleteId,
        requestedByEmail: `parent-del-${TS}@test.local`,
      });

    expect(res.status).toBe(401);
  });

  it('missing athleteUserId → 400', async () => {
    const res = await request(app)
      .post('/api/coppa/data-deletion/request')
      .set('Cookie', siteAdminCookie)
      .send({
        requestedByEmail: `parent-del-${TS}@test.local`,
      });

    expect(res.status).toBe(400);
  });

  it('missing requestedByEmail → 400', async () => {
    const res = await request(app)
      .post('/api/coppa/data-deletion/request')
      .set('Cookie', siteAdminCookie)
      .send({
        athleteUserId: minorAthleteId,
      });

    expect(res.status).toBe(400);
  });

  it('non-existent athleteUserId → 404', async () => {
    const res = await request(app)
      .post('/api/coppa/data-deletion/request')
      .set('Cookie', siteAdminCookie)
      .send({
        athleteUserId: crypto.randomUUID(),
        requestedByEmail: 'nobody@example.com',
      });

    expect(res.status).toBe(404);
  });

  it('org admin (no shared org) → 403', async () => {
    const res = await request(app)
      .post('/api/coppa/data-deletion/request')
      .set('Cookie', orgAdminCookie)
      .send({
        athleteUserId: minorAthleteId,
        requestedByEmail: `parent-del-${TS}@test.local`,
      });

    expect(res.status).toBe(403);
  });

  it('duplicate pending request → 409 Conflict', async () => {
    // Create the first request
    const first = await request(app)
      .post('/api/coppa/data-deletion/request')
      .set('Cookie', siteAdminCookie)
      .send({
        athleteUserId: minorAthleteId,
        requestedByEmail: `parent-del-${TS}@test.local`,
      });

    expect(first.status).toBe(201);

    // A second request for the same athlete while one is pending → 409
    const second = await request(app)
      .post('/api/coppa/data-deletion/request')
      .set('Cookie', siteAdminCookie)
      .send({
        athleteUserId: minorAthleteId,
        requestedByEmail: `parent-del-${TS}@test.local`,
      });

    expect(second.status).toBe(409);

    // Clean up
    await db.delete(dataDeletionRequests)
      .where(eq(dataDeletionRequests.id, first.body.requestId));
  });
});

// ============================================================================
// 2. GET /api/coppa/data-deletion/:requestId
// ============================================================================

describe('GET /api/coppa/data-deletion/:requestId', () => {
  let testRequestId: string;

  beforeAll(async () => {
    const [req] = await db.insert(dataDeletionRequests).values({
      athleteUserId: minorAthleteId,
      requestedByEmail: `parent-del-${TS}@test.local`,
      status: 'pending',
    }).returning({ id: dataDeletionRequests.id });
    testRequestId = req.id;
  });

  afterAll(async () => {
    if (testRequestId) {
      await db.delete(dataDeletionRequests)
        .where(eq(dataDeletionRequests.id, testRequestId));
    }
  });

  it('site admin can view request details', async () => {
    const res = await request(app)
      .get(`/api/coppa/data-deletion/${testRequestId}`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testRequestId);
    expect(res.body.athleteUserId).toBe(minorAthleteId);
    expect(res.body.status).toBe('pending');
    expect(res.body.requestedByEmail).toBeTruthy();
  });

  it('unauthenticated → 401', async () => {
    const res = await request(app)
      .get(`/api/coppa/data-deletion/${testRequestId}`);

    expect(res.status).toBe(401);
  });

  it('org admin (not site admin) → 403', async () => {
    const res = await request(app)
      .get(`/api/coppa/data-deletion/${testRequestId}`)
      .set('Cookie', orgAdminCookie);

    expect(res.status).toBe(403);
  });

  it('non-existent requestId → 404', async () => {
    const res = await request(app)
      .get(`/api/coppa/data-deletion/${crypto.randomUUID()}`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(404);
  });

  it('response includes expected fields', async () => {
    const res = await request(app)
      .get(`/api/coppa/data-deletion/${testRequestId}`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('athleteUserId');
    expect(res.body).toHaveProperty('requestedByEmail');
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('requestedAt');
  });
});

// ============================================================================
// 3. POST /api/coppa/data-deletion/:requestId/process
// ============================================================================

describe('POST /api/coppa/data-deletion/:requestId/process', () => {
  it('unauthenticated → 401', async () => {
    const [req] = await db.insert(dataDeletionRequests).values({
      athleteUserId: minorAthlete2Id,
      requestedByEmail: `parent-del2-${TS}@test.local`,
      status: 'pending',
    }).returning({ id: dataDeletionRequests.id });

    const res = await request(app)
      .post(`/api/coppa/data-deletion/${req.id}/process`);

    expect(res.status).toBe(401);

    await db.delete(dataDeletionRequests).where(eq(dataDeletionRequests.id, req.id));
  });

  it('org admin (not site admin) → 403', async () => {
    const [req] = await db.insert(dataDeletionRequests).values({
      athleteUserId: minorAthlete2Id,
      requestedByEmail: `parent-del2-${TS}@test.local`,
      status: 'pending',
    }).returning({ id: dataDeletionRequests.id });

    const res = await request(app)
      .post(`/api/coppa/data-deletion/${req.id}/process`)
      .set('Cookie', orgAdminCookie);

    expect(res.status).toBe(403);

    await db.delete(dataDeletionRequests).where(eq(dataDeletionRequests.id, req.id));
  });

  it('non-existent requestId → 404', async () => {
    const res = await request(app)
      .post(`/api/coppa/data-deletion/${crypto.randomUUID()}/process`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(404);
  });

  it('site admin can process a pending deletion request', async () => {
    // Create a fresh minor user for this test (will be soft-deleted by process)
    const processTs = `proc-${TS}`;
    const hashedPw = await bcrypt.hash(CORRECT_PASSWORD, BCRYPT_SALT_ROUNDS);
    const [processMinor] = await db.insert(users).values({
      username: `del-proc-minor-${processTs}`,
      firstName: 'Process',
      lastName: 'Minor',
      fullName: 'Process Minor',
      emails: [`del-proc-${processTs}@test.local`],
      password: hashedPw,
      isSiteAdmin: false,
      coppaStatus: 'consented',
      isMinor: true,
      parentEmail: `parent-proc-${processTs}@test.local`,
      isEmailVerified: true,
    }).returning({ id: users.id });

    const processMinorId = processMinor.id;

    // Insert consent record
    await insertConsentRecord({
      athleteUserId: processMinorId,
      parentEmail: `parent-proc-${processTs}@test.local`,
      status: 'confirmed',
    });

    // Insert a sample measurement so we can verify it gets deleted
    await db.insert(measurements).values({
      userId: processMinorId,
      submittedBy: siteAdminUserId,
      date: new Date().toISOString().split('T')[0],
      age: 12,
      metric: 'VERTICAL_JUMP',
      value: '24.5',
      units: 'in',
    });

    // Create deletion request
    const [req] = await db.insert(dataDeletionRequests).values({
      athleteUserId: processMinorId,
      requestedByEmail: `parent-proc-${processTs}@test.local`,
      status: 'pending',
    }).returning({ id: dataDeletionRequests.id });

    const res = await request(app)
      .post(`/api/coppa/data-deletion/${req.id}/process`)
      .set('Cookie', siteAdminCookie)
      .send({ notes: 'Processed by integration test' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deletedCategories).toBeDefined();
    expect(Array.isArray(res.body.deletedCategories)).toBe(true);

    // Verify user was soft-deleted (not hard-deleted)
    const [deletedUser] = await db.select({
      id: users.id,
      deletedAt: users.deletedAt,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, processMinorId))
    .limit(1);

    // User record should still exist (retained for audit) but marked as deleted
    expect(deletedUser).toBeDefined();
    expect(deletedUser.deletedAt).not.toBeNull();
    expect(deletedUser.isActive).toBe(false);

    // Verify measurements were deleted
    const remainingMeasurements = await db.select()
      .from(measurements)
      .where(eq(measurements.userId, processMinorId));
    expect(remainingMeasurements).toHaveLength(0);

    // [LEGAL] Verify COPPA audit log entry was written and NOT deleted
    const auditEntries = await db.select()
      .from(coppaAuditLog)
      .where(and(
        eq(coppaAuditLog.athleteUserId, processMinorId),
        eq(coppaAuditLog.action, 'coppa_data_deletion_completed'),
      ));
    expect(auditEntries.length).toBeGreaterThan(0);

    // Clean up — hard delete the soft-deleted user (test DB cleanup)
    await db.delete(dataDeletionRequests).where(eq(dataDeletionRequests.athleteUserId, processMinorId));
    await db.delete(parentAthleteLinks).where(eq(parentAthleteLinks.athleteUserId, processMinorId));
    await db.delete(parentalConsents).where(eq(parentalConsents.athleteUserId, processMinorId));
    await db.delete(users).where(eq(users.id, processMinorId));
  });

  it('processing an already-completed request → 409', async () => {
    const [req] = await db.insert(dataDeletionRequests).values({
      athleteUserId: minorAthlete2Id,
      requestedByEmail: `parent-del2-${TS}@test.local`,
      status: 'completed',
      processedAt: new Date(),
      processedBy: siteAdminUserId,
    }).returning({ id: dataDeletionRequests.id });

    const res = await request(app)
      .post(`/api/coppa/data-deletion/${req.id}/process`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(409);

    await db.delete(dataDeletionRequests).where(eq(dataDeletionRequests.id, req.id));
  });
});

// ============================================================================
// [LEGAL] Audit log retention invariants
// ============================================================================

describe('[LEGAL] Audit log is retained after data deletion', () => {
  it('COPPA audit log entries survive after athlete soft-delete', async () => {
    // Create a dedicated minor for audit retention test
    const auditTs = `audit-${TS}`;
    const hashedPw = await bcrypt.hash(CORRECT_PASSWORD, BCRYPT_SALT_ROUNDS);
    const [auditMinor] = await db.insert(users).values({
      username: `del-audit-minor-${auditTs}`,
      firstName: 'Audit',
      lastName: 'Minor',
      fullName: 'Audit Minor',
      emails: [`del-audit-${auditTs}@test.local`],
      password: hashedPw,
      isSiteAdmin: false,
      coppaStatus: 'consented',
      isMinor: true,
      parentEmail: `parent-audit-${auditTs}@test.local`,
      isEmailVerified: true,
    }).returning({ id: users.id });

    const auditMinorId = auditMinor.id;

    // Seed a COPPA audit log entry
    await db.insert(coppaAuditLog).values({
      action: 'coppa_consent_confirmed',
      athleteUserId: auditMinorId,
      actorEmail: `parent-audit-${auditTs}@test.local`,
      retainUntil: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000),
    });

    // Create consent record
    await insertConsentRecord({
      athleteUserId: auditMinorId,
      parentEmail: `parent-audit-${auditTs}@test.local`,
      status: 'confirmed',
    });

    // Create and process deletion request
    const [req] = await db.insert(dataDeletionRequests).values({
      athleteUserId: auditMinorId,
      requestedByEmail: `parent-audit-${auditTs}@test.local`,
      status: 'pending',
    }).returning({ id: dataDeletionRequests.id });

    const res = await request(app)
      .post(`/api/coppa/data-deletion/${req.id}/process`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(200);

    // [LEGAL] Audit log must still exist — COPPA requires 5-year retention
    const auditEntries = await db.select()
      .from(coppaAuditLog)
      .where(eq(coppaAuditLog.athleteUserId, auditMinorId));

    expect(auditEntries.length).toBeGreaterThan(0);

    // Test cleanup
    await db.delete(dataDeletionRequests).where(eq(dataDeletionRequests.athleteUserId, auditMinorId));
    await db.delete(parentAthleteLinks).where(eq(parentAthleteLinks.athleteUserId, auditMinorId));
    await db.delete(parentalConsents).where(eq(parentalConsents.athleteUserId, auditMinorId));
    await db.delete(users).where(eq(users.id, auditMinorId));
  });
});
