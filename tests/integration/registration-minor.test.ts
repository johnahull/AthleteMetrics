/**
 * Integration tests — Minor (under-13) registration via POST /api/auth/register
 *
 * LEGAL EXPOSURE items are marked with [LEGAL]. Failures here are ship blockers:
 * - Under-13 registration MUST NOT establish a session (no Set-Cookie header)
 * - Missing parentEmail for under-13 MUST be rejected
 * - Same parentEmail as athlete email MUST be rejected
 * - Exactly-13-today users MUST NOT be treated as minors
 *
 * Run:
 *   export $(cat .env | xargs) && npm run test:run -- tests/integration/registration-minor.test.ts
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
import { db } from '../../packages/api/db';
import { users } from '@shared/schema/tables/core';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { eq, like } from 'drizzle-orm';

// Mock vite module before importing registerRoutes
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

// ============================================================================
// Helpers
// ============================================================================

/** Build a YYYY-MM-DD date string for someone who is exactly `years` years old today */
function exactlyAge(years: number): string {
  // Use LOCAL date components (not toISOString, which is UTC): calculateAge
  // parses YYYY-MM-DD as local midnight, so a UTC-formatted date shifts a day at
  // the boundary and makes an exactly-N-year-old read as N-1.
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Build a YYYY-MM-DD date string for someone whose birthday is `days` days from now,
 *  but was born `years` years ago minus those days.
 *  birthdayInDays=+1 → birthday tomorrow → still 12 (under 13)
 *  birthdayInDays=-1 → birthday was yesterday → already 13
 */
function ageWithOffset(years: number, daysOffset: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

/** A valid legal acceptance timestamp (within 15-minute window) */
function validLegalAcceptedAt(): string {
  return new Date().toISOString();
}

/** Base payload for a valid adult registration */
function adultPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const ts = Date.now();
  return {
    firstName: 'Adult',
    lastName: 'User',
    email: `adult-reg-${ts}@testcoppa.local`,
    username: `adultreg${ts}`,
    password: 'ValidPass1!!',
    legalAcceptedAt: validLegalAcceptedAt(),
    birthDate: exactlyAge(30),
    ...overrides,
  };
}

/** Base payload for an under-13 registration (includes parentEmail by default) */
function minorPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const ts = Date.now();
  return {
    firstName: 'Minor',
    lastName: 'Athlete',
    email: `minor-reg-${ts}@testcoppa.local`,
    username: `minorreg${ts}`,
    password: 'ValidPass1!!',
    legalAcceptedAt: validLegalAcceptedAt(),
    birthDate: ageWithOffset(13, 1), // birthday tomorrow → still 12 (under 13)
    parentEmail: `parent-${ts}@testcoppa.local`,
    ...overrides,
  };
}

/** Base payload for a teen minor (13-17) registration */
function teenPayload(ageYears: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const ts = Date.now();
  return {
    firstName: 'Teen',
    lastName: 'Athlete',
    email: `teen-reg-${ts}@testcoppa.local`,
    username: `teenreg${ts}`,
    password: 'ValidPass1!!',
    legalAcceptedAt: validLegalAcceptedAt(),
    birthDate: exactlyAge(ageYears),
    parentEmail: `parent-teen-${ts}@testcoppa.local`,
    ...overrides,
  };
}

// ============================================================================
// Setup / Teardown
// ============================================================================

let app: Express;
const createdUsernames: string[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to run integration tests.');
  }

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

afterAll(async () => {
  // Clean up any users created during these tests
  for (const username of createdUsernames) {
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      if (user) {
        await db.delete(users).where(eq(users.id, user.id));
      }
    } catch {
      // best-effort cleanup
    }
  }

  // Also sweep by email pattern used in tests
  try {
    await db.delete(users).where(like(users.username, 'minorreg%'));
    await db.delete(users).where(like(users.username, 'adultreg%'));
    await db.delete(users).where(like(users.username, 'exactly13%'));
    await db.delete(users).where(like(users.username, 'teenreg%'));
  } catch {
    // best-effort
  }
});

// ============================================================================
// Tests
// ============================================================================

describe('POST /api/auth/register — minor (COPPA) registration', () => {
  /**
   * SHIP BLOCKER: Under-13 registration must return 201, flag requiresParentalConsent,
   * and MUST NOT set a session cookie.
   */
  it('[LEGAL] under-13 with valid parentEmail → 201, requiresParentalConsent:true, NO session cookie', async () => {
    const payload = minorPayload();
    createdUsernames.push(payload.username as string);

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.requiresParentalConsent).toBe(true);

    // LEGAL: No session cookie must be set for minors
    const setCookieHeader = res.headers['set-cookie'];
    const hasSessionCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader.some((c: string) => c.startsWith('connect.sid'))
      : typeof setCookieHeader === 'string' && setCookieHeader.startsWith('connect.sid');

    expect(hasSessionCookie).toBe(false);
  });

  it('[LEGAL] under-13 without parentEmail → 400 validation error', async () => {
    const payload = minorPayload({ parentEmail: undefined });
    // Do NOT track username — user should not be created

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(400);
    // The error should reference parentEmail
    const body = res.body;
    const hasParentEmailError =
      body.errors?.some((e: { field: string }) => e.field === 'parentEmail') ||
      body.message?.toLowerCase().includes('parent');
    expect(hasParentEmailError).toBe(true);

    // No session cookie
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('[LEGAL] under-13 where parentEmail equals athleteEmail → 400', async () => {
    const ts = Date.now();
    const sharedEmail = `shared-${ts}@testcoppa.local`;
    const payload = minorPayload({
      email: sharedEmail,
      parentEmail: sharedEmail, // same — must be rejected
      username: `samemail${ts}`,
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(400);
    const body = res.body;
    const hasParentEmailError =
      body.errors?.some((e: { field: string }) => e.field === 'parentEmail') ||
      body.message?.toLowerCase().includes('parent') ||
      body.message?.toLowerCase().includes('different');
    expect(hasParentEmailError).toBe(true);
  });

  it('registration without birthDate → 400 (birthDate is required for COPPA age checks)', async () => {
    // birthDate is required in the schema to enforce COPPA age checks.
    // Registration without it should be rejected with a validation error.
    const ts = Date.now();
    const payload = {
      firstName: 'NoBirth',
      lastName: 'Date',
      email: `nobirth-${ts}@testcoppa.local`,
      username: `nobirth${ts}`,
      password: 'ValidPass1!!',
      legalAcceptedAt: validLegalAcceptedAt(),
      // no birthDate
    };

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    // Without birthDate the registration should be rejected
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  /**
   * SHIP BLOCKER: A person whose birthday is today (exactly 13) is NOT under 13.
   * Their registration should proceed without triggering the COPPA/VPC flow.
   */
  it('[LEGAL] exactly age 13 today → 201 without requiresParentalConsent', async () => {
    const ts = Date.now();
    const payload = {
      firstName: 'Exactly',
      lastName: 'Thirteen',
      email: `exactly13-${ts}@testcoppa.local`,
      username: `exactly13${ts}`,
      password: 'ValidPass1!!',
      legalAcceptedAt: validLegalAcceptedAt(),
      birthDate: exactlyAge(13), // birthday is exactly today → age 13 → not under 13
    };
    createdUsernames.push(payload.username);

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.requiresParentalConsent).toBeFalsy();
    // A session IS allowed (or at minimum, the COPPA gate is NOT triggered)
  });

  it('adult registration (30 years old) → 201 without COPPA flags (regression)', async () => {
    const payload = adultPayload();
    createdUsernames.push(payload.username as string);

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.requiresParentalConsent).toBeFalsy();
  });

  it('missing required field (no firstName) → 400', async () => {
    const payload = minorPayload({ firstName: undefined });

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('missing password → 400', async () => {
    const payload = minorPayload({ password: undefined });

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('weak password (no special char) → 400', async () => {
    const payload = minorPayload({ password: 'ValidPass123' }); // missing special char

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('duplicate email → 409', async () => {
    const ts = Date.now();
    const email = `dup-email-${ts}@testcoppa.local`;

    const firstPayload = adultPayload({ email, username: `dupemail1${ts}` });
    const secondPayload = adultPayload({ email, username: `dupemail2${ts}` });

    createdUsernames.push(firstPayload.username as string);

    // First registration succeeds
    const first = await request(app)
      .post('/api/auth/register')
      .send(firstPayload);
    expect(first.status).toBe(201);

    // Second with same email fails
    const second = await request(app)
      .post('/api/auth/register')
      .send(secondPayload);
    expect(second.status).toBe(409);
  });

  it('duplicate username → 409', async () => {
    const ts = Date.now();
    const username = `dupuser${ts}`;

    const firstPayload = adultPayload({ username, email: `dup-user1-${ts}@testcoppa.local` });
    const secondPayload = adultPayload({ username, email: `dup-user2-${ts}@testcoppa.local` });

    createdUsernames.push(username);

    const first = await request(app)
      .post('/api/auth/register')
      .send(firstPayload);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/auth/register')
      .send(secondPayload);
    expect(second.status).toBe(409);
  });
});

// ============================================================================
// 13-17 Teen Minor Registration
// ============================================================================

describe('13-17 minor registration (teen minor path)', () => {
  /**
   * A 15-year-old who provides a parentEmail should get a session (can log in
   * immediately). isMinor must be true. coppaStatus stays 'not_applicable' —
   * the VPC consent flow is NOT triggered for teen minors.
   */
  it('15-year-old with parentEmail → 201, session cookie present, isMinor=true', async () => {
    const payload = teenPayload(15);
    createdUsernames.push(payload.username as string);

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // Teen minor should NOT be redirected to consent flow
    expect(res.body.requiresParentalConsent).toBeFalsy();

    // A session MUST be set — teen minor can log in immediately
    const setCookieHeader = res.headers['set-cookie'];
    const hasSessionCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader.some((c: string) => c.startsWith('connect.sid'))
      : typeof setCookieHeader === 'string' && setCookieHeader.startsWith('connect.sid');
    expect(hasSessionCookie).toBe(true);

    // Verify DB: isMinor=true, coppaStatus=not_applicable
    const [dbUser] = await db
      .select({ isMinor: users.isMinor, coppaStatus: users.coppaStatus })
      .from(users)
      .where(eq(users.username, payload.username as string))
      .limit(1);

    expect(dbUser).toBeDefined();
    expect(dbUser.isMinor).toBe(true);
    expect(dbUser.coppaStatus).toBe('not_applicable');
  });

  /**
   * The same 15-year-old registration should also create a parentAthleteLinks
   * row linking the provided parentEmail to the new athlete account.
   * consentId must be null because no VPC consent is involved.
   */
  it('15-year-old with parentEmail → parentAthleteLinks row created', async () => {
    const payload = teenPayload(15);
    createdUsernames.push(payload.username as string);

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(201);

    // Fetch the newly created user
    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, payload.username as string))
      .limit(1);

    expect(dbUser).toBeDefined();

    // A parentAthleteLinks row must exist for this athlete
    const links = await db
      .select()
      .from(parentAthleteLinks)
      .where(eq(parentAthleteLinks.athleteUserId, dbUser.id));

    expect(links).toHaveLength(1);
    expect(links[0].parentEmail).toBe(payload.parentEmail as string);
    expect(links[0].athleteUserId).toBe(dbUser.id);
    // No VPC consent involved — consentId must be null
    expect(links[0].consentId).toBeNull();
  });

  /**
   * A 15-year-old who omits parentEmail should register normally.
   * isMinor is still true (they are a minor), but no parentAthleteLinks row
   * is created and no notification email is sent.
   */
  it('15-year-old without parentEmail → 201, normal registration, no parent linking', async () => {
    const payload = teenPayload(15, { parentEmail: undefined });
    createdUsernames.push(payload.username as string);

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.requiresParentalConsent).toBeFalsy();

    // Session must be present
    const setCookieHeader = res.headers['set-cookie'];
    const hasSessionCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader.some((c: string) => c.startsWith('connect.sid'))
      : typeof setCookieHeader === 'string' && setCookieHeader.startsWith('connect.sid');
    expect(hasSessionCookie).toBe(true);

    // DB: isMinor=true even without parentEmail
    const [dbUser] = await db
      .select({ id: users.id, isMinor: users.isMinor })
      .from(users)
      .where(eq(users.username, payload.username as string))
      .limit(1);

    expect(dbUser).toBeDefined();
    expect(dbUser.isMinor).toBe(true);

    // No parentAthleteLinks row should exist
    const links = await db
      .select()
      .from(parentAthleteLinks)
      .where(eq(parentAthleteLinks.athleteUserId, dbUser.id));

    expect(links).toHaveLength(0);
  });

  /**
   * A 19-year-old (adult) who provides a parentEmail should be treated as a
   * normal adult registration. parentEmail is ignored for 18+ users.
   * isMinor must be false and no parentAthleteLinks row is created.
   */
  it('19-year-old with parentEmail → 201, parentEmail ignored, isMinor=false', async () => {
    const payload = teenPayload(19); // 19 years old — adult
    createdUsernames.push(payload.username as string);

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.requiresParentalConsent).toBeFalsy();

    // DB: isMinor=false for adults
    const [dbUser] = await db
      .select({ id: users.id, isMinor: users.isMinor })
      .from(users)
      .where(eq(users.username, payload.username as string))
      .limit(1);

    expect(dbUser).toBeDefined();
    expect(dbUser.isMinor).toBe(false);

    // No parentAthleteLinks row should exist for adults
    const links = await db
      .select()
      .from(parentAthleteLinks)
      .where(eq(parentAthleteLinks.athleteUserId, dbUser.id));

    expect(links).toHaveLength(0);
  });

  /**
   * Regression: under-13 COPPA flow must remain completely unchanged.
   * A 10-year-old gets: no session cookie, coppaStatus=pending_consent, isMinor=true.
   */
  it('under-13 COPPA flow unchanged — login blocked, coppaStatus=pending_consent', async () => {
    const payload = minorPayload(); // uses ageWithOffset(13, 1) = 12 years old
    createdUsernames.push(payload.username as string);

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.requiresParentalConsent).toBe(true);

    // NO session cookie — under-13 cannot log in
    const setCookieHeader = res.headers['set-cookie'];
    const hasSessionCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader.some((c: string) => c.startsWith('connect.sid'))
      : typeof setCookieHeader === 'string' && setCookieHeader.startsWith('connect.sid');
    expect(hasSessionCookie).toBe(false);

    // DB: isMinor=true, coppaStatus=pending_consent
    const [dbUser] = await db
      .select({ isMinor: users.isMinor, coppaStatus: users.coppaStatus })
      .from(users)
      .where(eq(users.username, payload.username as string))
      .limit(1);

    expect(dbUser).toBeDefined();
    expect(dbUser.isMinor).toBe(true);
    expect(dbUser.coppaStatus).toBe('pending_consent');
  });
});
