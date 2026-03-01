/**
 * Integration tests — COPPA login blocks via POST /api/auth/login
 *
 * LEGAL EXPOSURE items are marked with [LEGAL]. Failures here are ship blockers:
 * - pending_consent user with correct password MUST get 403, not 200
 * - consent_revoked user MUST get 403
 * - Wrong password MUST get 401 (not 403) — COPPA check must run AFTER auth check
 *   to prevent revealing that an account exists via different error codes
 * - NO Set-Cookie session header on COPPA-blocked responses
 *
 * Run:
 *   export $(cat .env | xargs) && npm run test:run -- tests/integration/auth-coppa.test.ts
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
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { users } from '@shared/schema/tables/core';
import { eq } from 'drizzle-orm';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

// ============================================================================
// Setup / Teardown
// ============================================================================

let app: Express;

// Users created for each test scenario
let pendingConsentUserId: string;
let pendingConsentUsername: string;
const CORRECT_PASSWORD = 'ValidPass1!';

let consentRevokedUserId: string;
let consentRevokedUsername: string;

let consentedUserId: string;
let consentedUsername: string;

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

  // ----------------------------------------------------------------
  // 1. pending_consent user — correct password still blocked by COPPA
  // ----------------------------------------------------------------
  pendingConsentUsername = `coppa-pending-${ts}`;
  const [pendingUser] = await db.insert(users).values({
    username: pendingConsentUsername,
    firstName: 'Pending',
    lastName: 'Consent',
    fullName: 'Pending Consent',
    emails: [`coppa-pending-${ts}@testcoppa.local`],
    password: hashedPassword,
    isSiteAdmin: false,
    coppaStatus: 'pending_consent',
    isMinor: true,
    parentEmail: `parent-pending-${ts}@testcoppa.local`,
    isEmailVerified: true,
  }).returning({ id: users.id });
  pendingConsentUserId = pendingUser.id;

  // ----------------------------------------------------------------
  // 2. consent_revoked user
  // ----------------------------------------------------------------
  consentRevokedUsername = `coppa-revoked-${ts}`;
  const [revokedUser] = await db.insert(users).values({
    username: consentRevokedUsername,
    firstName: 'Revoked',
    lastName: 'Consent',
    fullName: 'Revoked Consent',
    emails: [`coppa-revoked-${ts}@testcoppa.local`],
    password: hashedPassword,
    isSiteAdmin: false,
    coppaStatus: 'consent_revoked',
    isMinor: true,
    isEmailVerified: true,
  }).returning({ id: users.id });
  consentRevokedUserId = revokedUser.id;

  // ----------------------------------------------------------------
  // 3. fully consented user — login should succeed normally
  // ----------------------------------------------------------------
  consentedUsername = `coppa-consented-${ts}`;
  const [consentedUser] = await db.insert(users).values({
    username: consentedUsername,
    firstName: 'Consented',
    lastName: 'Minor',
    fullName: 'Consented Minor',
    emails: [`coppa-consented-${ts}@testcoppa.local`],
    password: hashedPassword,
    isSiteAdmin: false,
    coppaStatus: 'consented',
    isMinor: true,
    isEmailVerified: true,
  }).returning({ id: users.id });
  consentedUserId = consentedUser.id;
});

afterAll(async () => {
  const idsToDelete = [pendingConsentUserId, consentRevokedUserId, consentedUserId].filter(Boolean);
  for (const id of idsToDelete) {
    try {
      await db.delete(users).where(eq(users.id, id));
    } catch {
      // best-effort
    }
  }
});

// ============================================================================
// Tests
// ============================================================================

describe('POST /api/auth/login — COPPA blocks', () => {
  /**
   * SHIP BLOCKER: A user in pending_consent state with the correct password MUST
   * receive 403 with code 'coppa_pending_consent'. No session cookie must be set.
   */
  it('[LEGAL] pending_consent + correct password → 403, code: coppa_pending_consent, NO Set-Cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: pendingConsentUsername, password: CORRECT_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('coppa_pending_consent');
    expect(res.body.coppaStatus).toBe('pending_consent');

    // LEGAL: No session cookie must be established
    const setCookieHeader = res.headers['set-cookie'];
    const hasSessionCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader.some((c: string) => c.startsWith('connect.sid'))
      : typeof setCookieHeader === 'string' && setCookieHeader.startsWith('connect.sid');
    expect(hasSessionCookie).toBe(false);
  });

  it('[LEGAL] consent_revoked + correct password → 403, code: coppa_consent_revoked, NO Set-Cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: consentRevokedUsername, password: CORRECT_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('coppa_consent_revoked');
    expect(res.body.coppaStatus).toBe('consent_revoked');

    const setCookieHeader = res.headers['set-cookie'];
    const hasSessionCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader.some((c: string) => c.startsWith('connect.sid'))
      : typeof setCookieHeader === 'string' && setCookieHeader.startsWith('connect.sid');
    expect(hasSessionCookie).toBe(false);
  });

  /**
   * SHIP BLOCKER: Wrong password on a COPPA-blocked account MUST return 401, not 403.
   * The COPPA check must run AFTER password validation.
   *
   * If this returned 403 (COPPA code) for wrong passwords, an attacker could determine
   * that an account with that username exists — information leakage.
   */
  it('[LEGAL] pending_consent + WRONG password → 401 (auth error comes first, not COPPA 403)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: pendingConsentUsername, password: 'WrongPassword99!' });

    // Must be 401 (invalid credentials), NOT 403 (COPPA block)
    expect(res.status).toBe(401);
    expect(res.body.code).toBeUndefined(); // No COPPA code
  });

  it('[LEGAL] consent_revoked + WRONG password → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: consentRevokedUsername, password: 'WrongPassword99!' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBeUndefined();
  });

  it('[LEGAL] non-existent username + any password → 401 (not 403)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'this-user-does-not-exist-xyz', password: 'AnyPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBeUndefined();
  });

  it('fully consented minor + correct password → 200 with session cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: consentedUsername, password: CORRECT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();

    // A session cookie should be set for consented users
    const setCookieHeader = res.headers['set-cookie'];
    const hasSessionCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader.some((c: string) => c.startsWith('connect.sid'))
      : typeof setCookieHeader === 'string' && setCookieHeader.startsWith('connect.sid');
    expect(hasSessionCookie).toBe(true);
  });

  it('pending_consent response body includes coppaStatus field', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: pendingConsentUsername, password: CORRECT_PASSWORD });

    expect(res.body.coppaStatus).toBe('pending_consent');
  });

  it('consent_revoked response body includes coppaStatus field', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: consentRevokedUsername, password: CORRECT_PASSWORD });

    expect(res.body.coppaStatus).toBe('consent_revoked');
  });

  it('login with missing username field → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: CORRECT_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('login with missing password field → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: pendingConsentUsername });

    expect(res.status).toBe(401);
  });
});
