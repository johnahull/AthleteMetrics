/**
 * Integration tests — COPPA data export endpoints (Phase A2)
 *
 * Covers both export endpoints:
 *  1. POST /api/coppa/data-export/request   — Initiate export (token-gated or org_admin)
 *  2. GET  /api/coppa/data-export/download/:downloadToken — One-time download
 *
 * TDD: These tests are written before implementation and should FAIL initially.
 *
 * Security invariants:
 *  - Download token is one-time use — second attempt returns 410 Gone
 *  - Token is SHA-256 hashed in DB, raw token in URL
 *  - Expired tokens return 410
 *  - Only the requesting parent/org-admin can request export
 *
 * Run:
 *   export $(cat .env | xargs) && npm run test:run -- tests/integration/coppa-export.test.ts
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
import { parentalConsents, dataExportRequests } from '@shared/schema/tables/coppa';
import { userOrganizations } from '@shared/schema/tables/membership';
import { eq, like, and } from 'drizzle-orm';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

// ============================================================================
// Mocks — must be declared before registerRoutes import
// ============================================================================

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

// Mock email service to prevent real emails during testing
vi.mock('../../packages/api/services/email-service', () => ({
  emailService: {
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendInvitation: vi.fn().mockResolvedValue(true),
    sendWelcome: vi.fn().mockResolvedValue(true),
    sendPasswordReset: vi.fn().mockResolvedValue(true),
    sendExportReadyNotification: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn().mockImplementation(() => ({
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendExportReadyNotification: vi.fn().mockResolvedValue(true),
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

/** Insert a parental consent record for test athletes */
async function insertConsentRecord(params: {
  athleteUserId: string;
  parentEmail: string;
  status?: 'pending' | 'confirmed' | 'revoked' | 'expired';
}): Promise<{ rawToken: string; consentId: string }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [consent] = await db.insert(parentalConsents).values({
    athleteUserId: params.athleteUserId,
    parentEmail: params.parentEmail,
    tokenHash,
    status: params.status ?? 'pending',
    expiresAt,
  }).returning({ id: parentalConsents.id });

  return { rawToken, consentId: consent.id };
}

/**
 * Insert a data export request directly with a known download token.
 * Used to test the download endpoint with pre-seeded state.
 */
async function insertExportRequest(params: {
  athleteUserId: string;
  requestedByEmail: string;
  status?: 'pending' | 'processing' | 'ready' | 'delivered' | 'expired';
  downloadExpiresAt?: Date;
  consentId?: string;
}): Promise<{ rawDownloadToken: string; exportRequestId: string }> {
  const rawDownloadToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawDownloadToken);
  const downloadExpiresAt = params.downloadExpiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [exportReq] = await db.insert(dataExportRequests).values({
    athleteUserId: params.athleteUserId,
    requestedByEmail: params.requestedByEmail,
    consentId: params.consentId ?? null,
    status: params.status ?? 'ready',
    downloadToken: tokenHash,
    downloadExpiresAt,
    processedAt: new Date(),
  }).returning({ id: dataExportRequests.id });

  return { rawDownloadToken, exportRequestId: exportReq.id };
}

// ============================================================================
// Setup / Teardown
// ============================================================================

let app: Express;
let siteAdminCookie: string;
let siteAdminUserId: string;

let minorAthleteId: string;
let minorAthleteUsername: string;
let orgAdminId: string;
let orgAdminUsername: string;
let orgAdminCookie: string;
let exportConsentId: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to run integration tests.');
  }

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const ts = Date.now();
  const hashedPassword = await bcrypt.hash(CORRECT_PASSWORD, BCRYPT_SALT_ROUNDS);

  // 1. Site admin login
  const adminRows = await db.select().from(users).where(eq(users.username, process.env.ADMIN_USER || 'admin')).limit(1);
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
    throw new Error(`Admin login failed (status: ${adminLogin.status}).`);
  }
  siteAdminCookie = adminLogin.headers['set-cookie'][0];

  // 2. Create a minor athlete (consented, so can log in)
  minorAthleteUsername = `export-minor-${ts}`;
  const [minorAthlete] = await db.insert(users).values({
    username: minorAthleteUsername,
    firstName: 'Export',
    lastName: 'Minor',
    fullName: 'Export Minor',
    emails: [`export-minor-${ts}@testcoppaexport.local`],
    password: hashedPassword,
    isSiteAdmin: false,
    coppaStatus: 'consented',
    isMinor: true,
    parentEmail: `parent-export-${ts}@testcoppaexport.local`,
    isEmailVerified: true,
  }).returning({ id: users.id });
  minorAthleteId = minorAthlete.id;

  // Create a confirmed consent record for the minor
  const { consentId } = await insertConsentRecord({
    athleteUserId: minorAthleteId,
    parentEmail: `parent-export-${ts}@testcoppaexport.local`,
    status: 'confirmed',
  });
  exportConsentId = consentId;

  // 3. Org admin for auth-gated export requests
  orgAdminUsername = `export-orgadmin-${ts}`;
  const [orgAdmin] = await db.insert(users).values({
    username: orgAdminUsername,
    firstName: 'Export',
    lastName: 'OrgAdmin',
    fullName: 'Export OrgAdmin',
    emails: [`export-orgadmin-${ts}@testcoppaexport.local`],
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
  const idsToDelete = [minorAthleteId, orgAdminId].filter(Boolean);

  // Clean up export requests before deleting users
  for (const id of idsToDelete) {
    try {
      await db.delete(dataExportRequests).where(eq(dataExportRequests.athleteUserId, id));
      await db.delete(parentalConsents).where(eq(parentalConsents.athleteUserId, id));
    } catch { /* best-effort */ }
  }

  for (const id of idsToDelete) {
    try {
      await db.delete(users).where(eq(users.id, id));
    } catch { /* best-effort */ }
  }

  // Sweep by username patterns
  try {
    const sweepPatterns = ['export-minor-%', 'export-orgadmin-%'];
    for (const pattern of sweepPatterns) {
      await db.delete(users).where(like(users.username, pattern));
    }
  } catch { /* best-effort */ }
});

// ============================================================================
// 1. POST /api/coppa/data-export/request
// ============================================================================

describe('POST /api/coppa/data-export/request', () => {
  it('unauthenticated with no body → 400 (missing required fields)', async () => {
    // Public endpoint requires either a consentId+parentEmail (token-gated) OR auth
    const res = await request(app)
      .post('/api/coppa/data-export/request')
      .send({});

    // No auth and no consentId/parentEmail → validation error
    expect([400, 401]).toContain(res.status);
  });

  it('site admin can request export for any athlete by userId', async () => {
    const res = await request(app)
      .post('/api/coppa/data-export/request')
      .set('Cookie', siteAdminCookie)
      .send({
        athleteUserId: minorAthleteId,
        requestedByEmail: 'admin@test.com',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.exportRequestId).toBeTruthy();
    expect(typeof res.body.exportRequestId).toBe('string');
  });

  it('site admin requesting export for non-existent athlete → 404', async () => {
    const res = await request(app)
      .post('/api/coppa/data-export/request')
      .set('Cookie', siteAdminCookie)
      .send({
        athleteUserId: crypto.randomUUID(),
        requestedByEmail: 'admin@test.com',
      });

    expect(res.status).toBe(404);
  });

  // Security fix: on the authenticated path, requestedByEmail must come from
  // the session, not the request body — the download-ready notification (a
  // one-time link to the athlete's full data export) must not be redirectable
  // to an address the client controls.
  it('authenticated request ignores body-supplied requestedByEmail, uses session user email', async () => {
    const res = await request(app)
      .post('/api/coppa/data-export/request')
      .set('Cookie', siteAdminCookie)
      .send({
        athleteUserId: minorAthleteId,
        requestedByEmail: 'attacker@evil.example',
      });

    expect(res.status).toBe(200);

    const stored = await db.select({ requestedByEmail: dataExportRequests.requestedByEmail })
      .from(dataExportRequests)
      .where(eq(dataExportRequests.id, res.body.exportRequestId))
      .then((rows) => rows[0]);

    expect(stored?.requestedByEmail).toBe(process.env.ADMIN_EMAIL);
    expect(stored?.requestedByEmail).not.toBe('attacker@evil.example');
  });

  it('token-gated: valid consentId + matching parentEmail → 200', async () => {
    const parentEmail = `parent-export-${Date.now()}@testcoppaexport.local`;

    // Create a new minor for this test to avoid interference
    const ts2 = Date.now() + 1;
    const hashedPassword = await bcrypt.hash(CORRECT_PASSWORD, BCRYPT_SALT_ROUNDS);
    const [newMinor] = await db.insert(users).values({
      username: `export-minor2-${ts2}`,
      firstName: 'Export2',
      lastName: 'Minor2',
      fullName: 'Export2 Minor2',
      emails: [`export-minor2-${ts2}@testcoppaexport.local`],
      password: hashedPassword,
      isSiteAdmin: false,
      coppaStatus: 'consented',
      isMinor: true,
      parentEmail,
      isEmailVerified: true,
    }).returning({ id: users.id });

    const { consentId } = await insertConsentRecord({
      athleteUserId: newMinor.id,
      parentEmail,
      status: 'confirmed',
    });

    const res = await request(app)
      .post('/api/coppa/data-export/request')
      .send({
        consentId,
        parentEmail,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.exportRequestId).toBeTruthy();

    // Cleanup
    await db.delete(dataExportRequests).where(eq(dataExportRequests.athleteUserId, newMinor.id));
    await db.delete(parentalConsents).where(eq(parentalConsents.athleteUserId, newMinor.id));
    await db.delete(users).where(eq(users.id, newMinor.id));
  });

  it('token-gated: consentId + wrong parentEmail → 403', async () => {
    const res = await request(app)
      .post('/api/coppa/data-export/request')
      .send({
        consentId: exportConsentId,
        parentEmail: 'wrong-parent@example.com',
      });

    expect(res.status).toBe(403);
  });

  it('token-gated: non-existent consentId → 404', async () => {
    const res = await request(app)
      .post('/api/coppa/data-export/request')
      .send({
        consentId: crypto.randomUUID(),
        parentEmail: 'parent@example.com',
      });

    expect(res.status).toBe(404);
  });

  it('missing athleteUserId when authenticated → 400', async () => {
    const res = await request(app)
      .post('/api/coppa/data-export/request')
      .set('Cookie', siteAdminCookie)
      .send({
        requestedByEmail: 'admin@test.com',
        // athleteUserId deliberately omitted
      });

    expect(res.status).toBe(400);
  });
});

// ============================================================================
// 2. GET /api/coppa/data-export/download/:downloadToken
// ============================================================================

describe('GET /api/coppa/data-export/download/:downloadToken', () => {
  it('valid ready token → 200 with JSON bundle and CSV summary', async () => {
    const { rawDownloadToken } = await insertExportRequest({
      athleteUserId: minorAthleteId,
      requestedByEmail: `parent-export-dl-${Date.now()}@testcoppaexport.local`,
      status: 'ready',
    });

    const res = await request(app)
      .get(`/api/coppa/data-export/download/${rawDownloadToken}`);

    expect(res.status).toBe(200);
    // Should return JSON bundle (default) or respond with export data
    expect(res.headers['content-type']).toMatch(/json/);
    // Export bundle must contain athlete profile
    expect(res.body).toHaveProperty('athlete');
    expect(res.body.athlete).toHaveProperty('id', minorAthleteId);
    expect(res.body).toHaveProperty('measurements');
    expect(res.body).toHaveProperty('wellnessResponses');
    expect(res.body).toHaveProperty('eventParticipations');
    expect(res.body).toHaveProperty('reportSnapshots');
    expect(res.body).toHaveProperty('exportedAt');
  });

  it('status is marked delivered after first download', async () => {
    const { rawDownloadToken, exportRequestId } = await insertExportRequest({
      athleteUserId: minorAthleteId,
      requestedByEmail: `parent-export-dl2-${Date.now()}@testcoppaexport.local`,
      status: 'ready',
    });

    await request(app)
      .get(`/api/coppa/data-export/download/${rawDownloadToken}`);

    // Verify status updated to 'delivered'
    const [updated] = await db.select({ status: dataExportRequests.status, deliveredAt: dataExportRequests.deliveredAt })
      .from(dataExportRequests)
      .where(eq(dataExportRequests.id, exportRequestId));

    expect(updated.status).toBe('delivered');
    expect(updated.deliveredAt).not.toBeNull();
  });

  it('[SECURITY] second download of same token → 410 Gone (one-time use)', async () => {
    const { rawDownloadToken } = await insertExportRequest({
      athleteUserId: minorAthleteId,
      requestedByEmail: `parent-export-dup-${Date.now()}@testcoppaexport.local`,
      status: 'ready',
    });

    // First download should succeed
    const first = await request(app)
      .get(`/api/coppa/data-export/download/${rawDownloadToken}`);
    expect(first.status).toBe(200);

    // Second download must be rejected — token was consumed
    const second = await request(app)
      .get(`/api/coppa/data-export/download/${rawDownloadToken}`);
    expect(second.status).toBe(410);
  });

  it('expired token → 410 Gone', async () => {
    const pastDate = new Date(Date.now() - 1000); // 1 second ago
    const { rawDownloadToken } = await insertExportRequest({
      athleteUserId: minorAthleteId,
      requestedByEmail: `parent-export-exp-${Date.now()}@testcoppaexport.local`,
      status: 'ready',
      downloadExpiresAt: pastDate,
    });

    const res = await request(app)
      .get(`/api/coppa/data-export/download/${rawDownloadToken}`);

    expect(res.status).toBe(410);
  });

  it('invalid / non-existent token → 404', async () => {
    const fakeToken = crypto.randomBytes(32).toString('hex');

    const res = await request(app)
      .get(`/api/coppa/data-export/download/${fakeToken}`);

    expect(res.status).toBe(404);
  });

  it('token longer than 128 characters → 400', async () => {
    const longToken = 'a'.repeat(129);

    const res = await request(app)
      .get(`/api/coppa/data-export/download/${longToken}`);

    expect(res.status).toBe(400);
  });

  it('already-delivered token → 410 Gone', async () => {
    const { rawDownloadToken } = await insertExportRequest({
      athleteUserId: minorAthleteId,
      requestedByEmail: `parent-export-delivered-${Date.now()}@testcoppaexport.local`,
      status: 'delivered', // Already delivered
    });

    const res = await request(app)
      .get(`/api/coppa/data-export/download/${rawDownloadToken}`);

    expect(res.status).toBe(410);
  });

  // NTH-4: Pending/processing export status download
  it('export in pending status → 400 not ready', async () => {
    const { rawDownloadToken } = await insertExportRequest({
      athleteUserId: minorAthleteId,
      requestedByEmail: `parent-export-pending-${Date.now()}@testcoppaexport.local`,
      status: 'pending',
    });

    const res = await request(app)
      .get(`/api/coppa/data-export/download/${rawDownloadToken}`);

    // pending status is not 'ready', not 'delivered', and not expired —
    // the service returns 400 "Export is not ready for download."
    expect(res.status).toBe(400);
  });

  it('export in processing status → 400 not ready', async () => {
    const { rawDownloadToken } = await insertExportRequest({
      athleteUserId: minorAthleteId,
      requestedByEmail: `parent-export-processing-${Date.now()}@testcoppaexport.local`,
      status: 'processing',
    });

    const res = await request(app)
      .get(`/api/coppa/data-export/download/${rawDownloadToken}`);

    // processing status is not 'ready', not 'delivered', and not expired —
    // the service returns 400 "Export is not ready for download."
    expect(res.status).toBe(400);
  });

  it('export bundle includes athlete profile with key PII fields', async () => {
    const { rawDownloadToken } = await insertExportRequest({
      athleteUserId: minorAthleteId,
      requestedByEmail: `parent-export-pii-${Date.now()}@testcoppaexport.local`,
      status: 'ready',
    });

    const res = await request(app)
      .get(`/api/coppa/data-export/download/${rawDownloadToken}`);

    expect(res.status).toBe(200);
    expect(res.body.athlete).toHaveProperty('firstName');
    expect(res.body.athlete).toHaveProperty('lastName');
    expect(res.body.athlete).toHaveProperty('emails');
    expect(Array.isArray(res.body.measurements)).toBe(true);
    expect(Array.isArray(res.body.wellnessResponses)).toBe(true);
    expect(Array.isArray(res.body.eventParticipations)).toBe(true);
    expect(Array.isArray(res.body.reportSnapshots)).toBe(true);
  });
});

// ============================================================================
// 3. Audit log written for export operations
// ============================================================================

describe('COPPA audit log for export operations', () => {
  it('requesting an export writes a DATA_EXPORT_REQUESTED audit entry', async () => {
    const { coppaAuditLog } = await import('@shared/schema/tables/coppa');

    const before = new Date();

    await request(app)
      .post('/api/coppa/data-export/request')
      .set('Cookie', siteAdminCookie)
      .send({
        athleteUserId: minorAthleteId,
        requestedByEmail: 'admin@test.com',
      });

    const auditEntries = await db.select()
      .from(coppaAuditLog)
      .where(eq(coppaAuditLog.action, 'coppa_data_export_requested'));

    const recent = auditEntries.find(e => e.createdAt >= before);
    expect(recent).toBeDefined();
  });

  it('downloading export writes a DATA_EXPORT_DELIVERED audit entry', async () => {
    const { default: coppaModule } = await import('@shared/schema/tables/coppa').catch(() => ({ default: null }));
    // Dynamic import for audit log access
    const { coppaAuditLog } = await import('@shared/schema/tables/coppa');

    const { rawDownloadToken } = await insertExportRequest({
      athleteUserId: minorAthleteId,
      requestedByEmail: `parent-export-audit-${Date.now()}@testcoppaexport.local`,
      status: 'ready',
    });

    const before = new Date();

    await request(app)
      .get(`/api/coppa/data-export/download/${rawDownloadToken}`);

    const auditEntries = await db.select()
      .from(coppaAuditLog)
      .where(eq(coppaAuditLog.action, 'coppa_data_export_delivered'));

    const recent = auditEntries.find(e => e.createdAt >= before);
    expect(recent).toBeDefined();
  });
});

// ============================================================================
// NTH-3: Org admin with shared org can request export
// ============================================================================

describe('Org admin with shared org — export happy path', () => {
  let sharedExportOrgId: string;
  let sharedExportOrgAdminId: string;
  let sharedExportOrgAdminCookie: string;
  let sharedExportMinorId: string;

  beforeAll(async () => {
    const orgTs = `exportorg-${Date.now()}`;
    const hashedPw = await bcrypt.hash(CORRECT_PASSWORD, BCRYPT_SALT_ROUNDS);

    // Create the shared organization
    const [org] = await db.insert(organizations).values({
      name: `export-shared-org-${orgTs}`,
    }).returning({ id: organizations.id });
    sharedExportOrgId = org.id;

    // Create an org admin user
    const [orgAdminUser] = await db.insert(users).values({
      username: `export-orgadmin-shared-${orgTs}`,
      firstName: 'ExportShared',
      lastName: 'OrgAdmin',
      fullName: 'ExportShared OrgAdmin',
      emails: [`export-orgadmin-shared-${orgTs}@testcoppaexport.local`],
      password: hashedPw,
      isSiteAdmin: false,
      isEmailVerified: true,
      coppaStatus: 'not_applicable',
    }).returning({ id: users.id });
    sharedExportOrgAdminId = orgAdminUser.id;

    // Enroll org admin as org_admin of the shared org
    await db.insert(userOrganizations).values({
      userId: sharedExportOrgAdminId,
      organizationId: sharedExportOrgId,
      role: 'org_admin',
    });

    // Create the minor athlete who is also a member of the same org
    const [sharedMinor] = await db.insert(users).values({
      username: `export-sharedminor-${orgTs}`,
      firstName: 'ExportShared',
      lastName: 'Minor',
      fullName: 'ExportShared Minor',
      emails: [`export-sharedminor-${orgTs}@testcoppaexport.local`],
      password: hashedPw,
      isSiteAdmin: false,
      coppaStatus: 'consented',
      isMinor: true,
      parentEmail: `parent-export-shared-${orgTs}@testcoppaexport.local`,
      isEmailVerified: true,
    }).returning({ id: users.id });
    sharedExportMinorId = sharedMinor.id;

    // Enroll the minor in the same org
    await db.insert(userOrganizations).values({
      userId: sharedExportMinorId,
      organizationId: sharedExportOrgId,
      role: 'athlete',
    });

    // Insert a confirmed consent record for the minor
    await insertConsentRecord({
      athleteUserId: sharedExportMinorId,
      parentEmail: `parent-export-shared-${orgTs}@testcoppaexport.local`,
      status: 'confirmed',
    });

    // Log in as the org admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: `export-orgadmin-shared-${orgTs}`, password: CORRECT_PASSWORD });

    if (loginRes.status === 200 && loginRes.headers['set-cookie']) {
      sharedExportOrgAdminCookie = loginRes.headers['set-cookie'][0];
    }
  });

  afterAll(async () => {
    const idsToClean = [sharedExportOrgAdminId, sharedExportMinorId].filter(Boolean);

    for (const id of idsToClean) {
      try {
        await db.delete(dataExportRequests).where(eq(dataExportRequests.athleteUserId, id));
        await db.delete(userOrganizations).where(eq(userOrganizations.userId, id));
        await db.delete(parentalConsents).where(eq(parentalConsents.athleteUserId, id));
        await db.delete(users).where(eq(users.id, id));
      } catch { /* best-effort */ }
    }

    if (sharedExportOrgId) {
      try {
        await db.delete(organizations).where(eq(organizations.id, sharedExportOrgId));
      } catch { /* best-effort */ }
    }
  });

  it('org admin with shared org can request export for athlete → 200', async () => {
    const orgTs = `exportorg-${Date.now()}`;

    const res = await request(app)
      .post('/api/coppa/data-export/request')
      .set('Cookie', sharedExportOrgAdminCookie)
      .send({
        athleteUserId: sharedExportMinorId,
        requestedByEmail: `export-orgadmin-shared-${orgTs}@testcoppaexport.local`,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.exportRequestId).toBeTruthy();
  });
});
