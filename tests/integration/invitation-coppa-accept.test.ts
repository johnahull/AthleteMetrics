/**
 * Integration tests — COPPA age gate on POST /api/invitations/:token/accept
 *
 * Spec: P0-11 (coppa-compliance-spec) — the invitation path must reach parity
 * with self-registration: an invited under-13 athlete must NOT receive a
 * session until Verifiable Parental Consent (VPC) is confirmed.
 *
 * LEGAL EXPOSURE items are marked with [LEGAL]. Failures here are ship blockers:
 * - Under-13 accept MUST NOT establish a session (no Set-Cookie header)
 * - Under-13 accept without parentEmail MUST be rejected (and not consume the invitation)
 * - A pending_consent user MUST NOT gain a session via the invite path (Path B bypass)
 *
 * Run:
 *   export $(cat .env | xargs) && npx vitest run --config vitest.integration.config.ts tests/integration/invitation-coppa-accept.test.ts
 */

// Set env vars before any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import crypto from 'crypto';
import { db } from '../../packages/api/db';
import { users, organizations } from '@shared/schema/tables/core';
import { invitations } from '@shared/schema/tables/membership';
import { parentAthleteLinks, parentalConsents } from '@shared/schema/tables/coppa';
import { eq, like, inArray } from 'drizzle-orm';

// Mock vite module before importing registerRoutes
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

// Mock email service to prevent real emails during testing.
// CoppaService constructs its own `new EmailService()`, so the class and the
// singleton must share the same mock fns for call assertions to work.
const emailMocks = vi.hoisted(() => ({
  sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
  sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
  sendParentNotification: vi.fn().mockResolvedValue(true),
  sendEmailVerification: vi.fn().mockResolvedValue(true),
  sendInvitation: vi.fn().mockResolvedValue(true),
  sendParentInvitation: vi.fn().mockResolvedValue(true),
  sendWelcome: vi.fn().mockResolvedValue(true),
  sendPasswordReset: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../packages/api/services/email-service', () => ({
  emailService: emailMocks,
  EmailService: vi.fn().mockImplementation(() => emailMocks),
}));

import { registerRoutes } from '../../packages/api/routes';

// ============================================================================
// Helpers
// ============================================================================

import { exactlyAge } from '../shared/age-helpers';

/** Birthday `daysOffset` days from now, born `years` ago. +1 → still (years-1). */
function ageWithOffset(years: number, daysOffset: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + daysOffset);
  // Format in LOCAL time — toISOString() (UTC) can shift a day across the
  // 13th-birthday boundary in non-UTC timezones (see tests/shared/age-helpers.ts).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Under-13 date of birth (12 years old — 13th birthday is tomorrow) */
function under13Dob(): string {
  return ageWithOffset(13, 1);
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function validLegalAcceptedAt(): string {
  return new Date().toISOString();
}

let testOrgId: string;
let inviterUserId: string;

/** Insert an invitation directly; returns the RAW token to accept with. */
async function seedInvitation(params: {
  email: string;
  role?: string;
  playerId?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  parentEmail?: string;
}): Promise<string> {
  const rawToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await db.insert(invitations).values({
    email: params.email,
    firstName: params.firstName ?? 'Invited',
    lastName: params.lastName ?? 'Athlete',
    organizationId: testOrgId,
    teamIds: [],
    role: params.role ?? 'athlete',
    invitedBy: inviterUserId,
    playerId: params.playerId,
    birthDate: params.birthDate,
    parentEmail: params.parentEmail,
    token: hashToken(rawToken),
    expiresAt,
  });

  return rawToken;
}

/** Base accept payload; birthDate/parentEmail supplied per-test. */
function acceptPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  return {
    firstName: 'Invited',
    lastName: 'Athlete',
    username: `invacc${ts}`,
    password: 'ValidPass1!!',
    legalAcceptedAt: validLegalAcceptedAt(),
    ...overrides,
  };
}

function hasSessionCookie(res: request.Response): boolean {
  const setCookieHeader = res.headers['set-cookie'];
  return Array.isArray(setCookieHeader)
    ? setCookieHeader.some((c: string) => c.startsWith('connect.sid'))
    : typeof setCookieHeader === 'string' && (setCookieHeader as string).startsWith('connect.sid');
}

async function getUserByUsername(username: string) {
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return user;
}

// ============================================================================
// Setup / Teardown
// ============================================================================

let app: Express;
const createdUserIds: string[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to run integration tests.');
  }

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const ts = Date.now();

  const [org] = await db.insert(organizations).values({
    name: `InvCoppaTestOrg-${ts}`,
  }).returning({ id: organizations.id });
  testOrgId = org.id;

  const [inviter] = await db.insert(users).values({
    username: `invcoppainviter${ts}`,
    firstName: 'Inviter',
    lastName: 'Coach',
    fullName: 'Inviter Coach',
    emails: [`inviter-${ts}@testinvcoppa.local`],
    password: 'not-a-real-hash',
    role: 'coach',
  }).returning({ id: users.id });
  inviterUserId = inviter.id;
  createdUserIds.push(inviter.id);
});

afterAll(async () => {
  // Delete children first (FK order): consents/links → invitations → users → org
  try {
    const allUsers = await db.select({ id: users.id }).from(users)
      .where(like(users.username, 'invacc%'));
    const ids = [...createdUserIds, ...allUsers.map(u => u.id)];
    if (ids.length > 0) {
      await db.delete(parentalConsents).where(inArray(parentalConsents.athleteUserId, ids));
      await db.delete(parentAthleteLinks).where(inArray(parentAthleteLinks.athleteUserId, ids));
    }
    await db.delete(invitations).where(eq(invitations.organizationId, testOrgId));
    if (ids.length > 0) {
      await db.delete(users).where(inArray(users.id, ids));
    }
    await db.delete(users).where(like(users.username, 'invexist%'));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  } catch {
    // best-effort cleanup
  }
});

// ============================================================================
// Tests
// ============================================================================

describe('POST /api/invitations/:token/accept — COPPA age gate', () => {
  it('[LEGAL] under-13 with parentEmail → 200 requiresParentalConsent, NO session, pending_consent, VPC initiated, no welcome email', async () => {
    const ts = Date.now();
    const token = await seedInvitation({ email: `u13-${ts}@testinvcoppa.local` });
    const payload = acceptPayload({
      birthDate: under13Dob(),
      parentEmail: `parent-${ts}@testinvcoppa.local`,
    });

    vi.mocked(emailMocks.sendWelcome).mockClear();
    vi.mocked(emailMocks.sendParentalConsentRequest).mockClear();

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requiresParentalConsent).toBe(true);

    // LEGAL: no session for under-13
    expect(hasSessionCookie(res)).toBe(false);

    // DB state
    const dbUser = await getUserByUsername(payload.username as string);
    expect(dbUser).toBeDefined();
    createdUserIds.push(dbUser.id);
    expect(dbUser.coppaStatus).toBe('pending_consent');
    expect(dbUser.isMinor).toBe(true);
    expect(dbUser.parentEmail).toBe(payload.parentEmail);

    // A pending consent record exists
    const consents = await db.select().from(parentalConsents)
      .where(eq(parentalConsents.athleteUserId, dbUser.id));
    expect(consents.length).toBeGreaterThanOrEqual(1);
    expect(consents.some(c => c.status === 'pending')).toBe(true);

    // Parent got the consent email; athlete did NOT get a welcome email
    expect(emailMocks.sendParentalConsentRequest).toHaveBeenCalled();
    expect(emailMocks.sendWelcome).not.toHaveBeenCalled();

    // Invitation is consumed
    const [inv] = await db.select().from(invitations)
      .where(eq(invitations.token, hashToken(token)));
    expect(inv.isUsed).toBe(true);
  });

  it('[LEGAL] under-13 without parentEmail → 400, no user created, invitation NOT consumed', async () => {
    const ts = Date.now();
    const token = await seedInvitation({ email: `u13nope-${ts}@testinvcoppa.local` });
    const payload = acceptPayload({ birthDate: under13Dob() });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.message?.toLowerCase()).toContain('parent');

    const dbUser = await getUserByUsername(payload.username as string);
    expect(dbUser).toBeUndefined();

    const [inv] = await db.select().from(invitations)
      .where(eq(invitations.token, hashToken(token)));
    expect(inv.isUsed).toBe(false);
  });

  it('[LEGAL] user created via under-13 accept cannot log in until consent confirmed', async () => {
    const ts = Date.now();
    const token = await seedInvitation({ email: `u13login-${ts}@testinvcoppa.local` });
    const payload = acceptPayload({
      birthDate: under13Dob(),
      parentEmail: `parent-login-${ts}@testinvcoppa.local`,
    });

    const acceptRes = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);
    expect(acceptRes.status).toBe(200);
    const dbUser = await getUserByUsername(payload.username as string);
    createdUserIds.push(dbUser.id);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: payload.username, password: payload.password });

    expect(loginRes.status).toBe(403);
    expect(hasSessionCookie(loginRes)).toBe(false);
  });

  it('teen minor (15) with parentEmail → session + parentAthleteLinks + parent notification + welcome email', async () => {
    const ts = Date.now();
    const token = await seedInvitation({ email: `teen-${ts}@testinvcoppa.local` });
    const parentEmail = `parent-teen-${ts}@testinvcoppa.local`;
    const payload = acceptPayload({ birthDate: exactlyAge(15), parentEmail });

    vi.mocked(emailMocks.sendWelcome).mockClear();
    vi.mocked(emailMocks.sendParentNotification).mockClear();

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requiresParentalConsent).toBeFalsy();
    expect(hasSessionCookie(res)).toBe(true);

    const dbUser = await getUserByUsername(payload.username as string);
    createdUserIds.push(dbUser.id);
    expect(dbUser.coppaStatus).toBe('not_applicable');
    expect(dbUser.isMinor).toBe(true);

    const links = await db.select().from(parentAthleteLinks)
      .where(eq(parentAthleteLinks.athleteUserId, dbUser.id));
    expect(links).toHaveLength(1);
    expect(links[0].parentEmail).toBe(parentEmail);
    expect(links[0].organizationId).toBe(testOrgId);

    expect(emailMocks.sendParentNotification).toHaveBeenCalled();
    expect(emailMocks.sendWelcome).toHaveBeenCalled();
  });

  it('teen minor (15) without parentEmail → normal session, no link row', async () => {
    const ts = Date.now();
    const token = await seedInvitation({ email: `teennope-${ts}@testinvcoppa.local` });
    const payload = acceptPayload({ birthDate: exactlyAge(15) });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(hasSessionCookie(res)).toBe(true);

    const dbUser = await getUserByUsername(payload.username as string);
    createdUserIds.push(dbUser.id);
    expect(dbUser.isMinor).toBe(true);

    const links = await db.select().from(parentAthleteLinks)
      .where(eq(parentAthleteLinks.athleteUserId, dbUser.id));
    expect(links).toHaveLength(0);
  });

  it('adult (25) → session, birthDate persisted, coppaStatus not_applicable', async () => {
    const ts = Date.now();
    const token = await seedInvitation({ email: `adult-${ts}@testinvcoppa.local` });
    const payload = acceptPayload({ birthDate: exactlyAge(25) });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requiresParentalConsent).toBeFalsy();
    expect(hasSessionCookie(res)).toBe(true);

    const dbUser = await getUserByUsername(payload.username as string);
    createdUserIds.push(dbUser.id);
    expect(dbUser.birthDate).toBeTruthy();
    expect(dbUser.coppaStatus).toBe('not_applicable');
    expect(dbUser.isMinor).toBe(false);
  });

  it('athlete accept without birthDate → 400', async () => {
    const ts = Date.now();
    const token = await seedInvitation({ email: `nodob-${ts}@testinvcoppa.local` });
    const payload = acceptPayload(); // no birthDate

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('athlete accept with malformed birthDate → 400', async () => {
    const ts = Date.now();
    const token = await seedInvitation({ email: `baddob-${ts}@testinvcoppa.local` });
    const payload = acceptPayload({ birthDate: 'not-a-date' });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('coach-role accept with under-13 birthDate → 400 (role requires an adult)', async () => {
    const ts = Date.now();
    const token = await seedInvitation({ email: `coachu13-${ts}@testinvcoppa.local`, role: 'coach' });
    const payload = acceptPayload({ birthDate: under13Dob(), parentEmail: `p-${ts}@testinvcoppa.local` });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('coach-role accept without birthDate → succeeds (birthDate only required for athletes)', async () => {
    const ts = Date.now();
    const token = await seedInvitation({ email: `coachok-${ts}@testinvcoppa.local`, role: 'coach' });
    const payload = acceptPayload();

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(hasSessionCookie(res)).toBe(true);
    const dbUser = await getUserByUsername(payload.username as string);
    createdUserIds.push(dbUser.id);
  });

  it('Path A: linked player with adult birthDate wins over under-13 form value → session', async () => {
    const ts = Date.now();
    // Coach-created athlete record with a known adult DOB
    const [player] = await db.insert(users).values({
      username: `invexistadult${ts}`,
      firstName: 'Existing',
      lastName: 'Adult',
      fullName: 'Existing Adult',
      password: 'placeholder-hash',
      emails: [`existadult-${ts}@testinvcoppa.local`],
      birthDate: exactlyAge(20),
      role: 'athlete',
      isActive: false,
    }).returning({ id: users.id });
    createdUserIds.push(player.id);

    const token = await seedInvitation({
      email: `existadult-${ts}@testinvcoppa.local`,
      playerId: player.id,
    });
    // Form lies: says under-13
    const payload = acceptPayload({
      birthDate: under13Dob(),
      parentEmail: `p-${ts}@testinvcoppa.local`,
    });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.requiresParentalConsent).toBeFalsy();
    expect(hasSessionCookie(res)).toBe(true);
  });

  it('[LEGAL] Path A: linked player with under-13 birthDate wins over adult form value → no session, VPC', async () => {
    const ts = Date.now();
    const [player] = await db.insert(users).values({
      username: `invexistu13${ts}`,
      firstName: 'Existing',
      lastName: 'Minor',
      fullName: 'Existing Minor',
      password: 'placeholder-hash',
      emails: [`existu13-${ts}@testinvcoppa.local`],
      birthDate: under13Dob(),
      role: 'athlete',
      isActive: false,
    }).returning({ id: users.id });
    createdUserIds.push(player.id);

    const token = await seedInvitation({
      email: `existu13-${ts}@testinvcoppa.local`,
      playerId: player.id,
    });
    // Form lies: says adult; parentEmail still provided
    const payload = acceptPayload({
      birthDate: exactlyAge(20),
      parentEmail: `p-u13-${ts}@testinvcoppa.local`,
    });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.requiresParentalConsent).toBe(true);
    expect(hasSessionCookie(res)).toBe(false);
  });

  it('[LEGAL] Path B: existing pending_consent user joining a new org gets NO session', async () => {
    const ts = Date.now();
    const email = `existpending-${ts}@testinvcoppa.local`;
    const [existing] = await db.insert(users).values({
      username: `invexistpend${ts}`,
      firstName: 'Pending',
      lastName: 'Minor',
      fullName: 'Pending Minor',
      emails: [email],
      password: 'some-hashed-password',
      birthDate: under13Dob(),
      coppaStatus: 'pending_consent',
      isMinor: true,
      parentEmail: `parent-pend-${ts}@testinvcoppa.local`,
      role: 'athlete',
    }).returning({ id: users.id });
    createdUserIds.push(existing.id);

    const token = await seedInvitation({ email });
    const payload = acceptPayload({
      birthDate: under13Dob(),
      parentEmail: `parent-pend-${ts}@testinvcoppa.local`,
    });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.requiresParentalConsent).toBe(true);
    // LEGAL: the login block must not be bypassable via invite accept
    expect(hasSessionCookie(res)).toBe(false);
  });

  it('Path B: existing adult user (birthDate set) + under-13 form value → existing wins → session', async () => {
    const ts = Date.now();
    const email = `existadultb-${ts}@testinvcoppa.local`;
    const [existing] = await db.insert(users).values({
      username: `invexistab${ts}`,
      firstName: 'Existing',
      lastName: 'AdultB',
      fullName: 'Existing AdultB',
      emails: [email],
      password: 'some-hashed-password',
      birthDate: exactlyAge(30),
      coppaStatus: 'not_applicable',
      role: 'athlete',
    }).returning({ id: users.id });
    createdUserIds.push(existing.id);

    const token = await seedInvitation({ email });
    const payload = acceptPayload({
      birthDate: under13Dob(),
      parentEmail: `p-ab-${ts}@testinvcoppa.local`,
    });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.requiresParentalConsent).toBeFalsy();
    expect(hasSessionCookie(res)).toBe(true);
  });

  it('under-13 with parentEmail equal to invitation email → 400', async () => {
    const ts = Date.now();
    const email = `sameemail-${ts}@testinvcoppa.local`;
    const token = await seedInvitation({ email });
    const payload = acceptPayload({ birthDate: under13Dob(), parentEmail: email });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(400);
  });
});

// ============================================================================
// Phase 2 — coach-provided birthDate/parentEmail on the invitation itself
// ============================================================================

describe('POST /api/invitations/:token/accept — coach-provided COPPA data', () => {
  it('[LEGAL] invitation carries under-13 DOB + parentEmail; form omits both → VPC to coach-provided email, no session', async () => {
    const ts = Date.now();
    const coachParentEmail = `coach-parent-${ts}@testinvcoppa.local`;
    const token = await seedInvitation({
      email: `invdata-${ts}@testinvcoppa.local`,
      birthDate: under13Dob(),
      parentEmail: coachParentEmail,
    });
    const payload = acceptPayload(); // no birthDate, no parentEmail

    vi.mocked(emailMocks.sendParentalConsentRequest).mockClear();

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.requiresParentalConsent).toBe(true);
    expect(hasSessionCookie(res)).toBe(false);

    const dbUser = await getUserByUsername(payload.username as string);
    expect(dbUser).toBeDefined();
    createdUserIds.push(dbUser.id);
    expect(dbUser.coppaStatus).toBe('pending_consent');

    // Consent email went to the coach-provided parent email
    expect(emailMocks.sendParentalConsentRequest).toHaveBeenCalledWith(
      coachParentEmail,
      expect.anything()
    );
  });

  it('invitation under-13 DOB wins over adult form DOB → VPC path', async () => {
    const ts = Date.now();
    const token = await seedInvitation({
      email: `invdob-${ts}@testinvcoppa.local`,
      birthDate: under13Dob(),
      parentEmail: `coach-parent2-${ts}@testinvcoppa.local`,
    });
    // Form lies: says adult
    const payload = acceptPayload({ birthDate: exactlyAge(20) });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.requiresParentalConsent).toBe(true);
    expect(hasSessionCookie(res)).toBe(false);
  });

  it('parent invitation is NOT age-classified by the linked child: parent of an under-13 athlete can accept', async () => {
    const ts = Date.now();
    // Under-13 athlete already in the system (the linked child)
    const [child] = await db.insert(users).values({
      username: `invexistchild${ts}`,
      firstName: 'Linked',
      lastName: 'Child',
      fullName: 'Linked Child',
      password: 'placeholder-hash',
      emails: [`child-${ts}@testinvcoppa.local`],
      birthDate: under13Dob(),
      isMinor: true,
      role: 'athlete',
      coppaStatus: 'pending_consent',
    }).returning({ id: users.id });
    createdUserIds.push(child.id);

    // Parent invitation: playerId stores the CHILD's id
    const token = await seedInvitation({
      email: `parent-role-${ts}@testinvcoppa.local`,
      role: 'parent',
      playerId: child.id,
    });
    // Parent enters their own adult DOB
    const payload = acceptPayload({ birthDate: exactlyAge(40) });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    // Must NOT be blocked as "role requires an adult" (child's DOB must not classify the parent)
    expect(res.status).toBe(200);
    expect(res.body.requiresParentalConsent).toBeFalsy();
    expect(hasSessionCookie(res)).toBe(true);

    // Parent's row must not have inherited the child's minor status
    const parentRow = await getUserByUsername(payload.username as string);
    // Parent-role invites with playerId reuse the parent-link path; the account row is new
    if (parentRow) {
      createdUserIds.push(parentRow.id);
      expect(parentRow.isMinor).toBe(false);
      expect(parentRow.coppaStatus).toBe('not_applicable');
    }
  });

  it('[LEGAL] email-matched under-13 row with default not_applicable status is blocked (no session, moved to pending_consent)', async () => {
    const ts = Date.now();
    const email = `backfill-${ts}@testinvcoppa.local`;
    // Server knows the DOB but the status was never classified (column default)
    const [existing] = await db.insert(users).values({
      username: `invexistbackfill${ts}`,
      firstName: 'Backfilled',
      lastName: 'Minor',
      fullName: 'Backfilled Minor',
      emails: [email],
      password: 'placeholder-hash',
      birthDate: under13Dob(),
      coppaStatus: 'not_applicable',
      isMinor: false,
      role: 'athlete',
    }).returning({ id: users.id });
    createdUserIds.push(existing.id);

    const token = await seedInvitation({ email });
    // The child lies with an adult DOB and provides no parent email
    const payload = acceptPayload({ birthDate: exactlyAge(20) });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    // Server-known DOB wins → under-13 → parent email required → 400 (no session either way)
    expect(res.status).toBe(400);
    expect(hasSessionCookie(res)).toBe(false);

    // With a parent email supplied, the accept completes but is gated
    const token2 = await seedInvitation({ email });
    const payload2 = acceptPayload({
      birthDate: exactlyAge(20),
      parentEmail: `parent-backfill-${ts}@testinvcoppa.local`,
    });
    const res2 = await request(app)
      .post(`/api/invitations/${token2}/accept`)
      .send(payload2);

    expect(res2.status).toBe(200);
    expect(res2.body.requiresParentalConsent).toBe(true);
    expect(hasSessionCookie(res2)).toBe(false);

    const [row] = await db.select().from(users).where(eq(users.id, existing.id));
    expect(row.coppaStatus).toBe('pending_consent');
  });

  it('[LEGAL] consent_revoked linked player → 403 BEFORE the invitation is consumed', async () => {
    const ts = Date.now();
    const [revoked] = await db.insert(users).values({
      username: `invexistrevoked${ts}`,
      firstName: 'Revoked',
      lastName: 'Minor',
      fullName: 'Revoked Minor',
      emails: [`revoked-${ts}@testinvcoppa.local`],
      password: 'placeholder-hash',
      birthDate: under13Dob(),
      isMinor: true,
      role: 'athlete',
      coppaStatus: 'consent_revoked',
    }).returning({ id: users.id });
    createdUserIds.push(revoked.id);

    const token = await seedInvitation({
      email: `revoked-${ts}@testinvcoppa.local`,
      playerId: revoked.id,
    });
    const payload = acceptPayload({
      birthDate: under13Dob(),
      parentEmail: `parent-revoked-${ts}@testinvcoppa.local`,
    });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(403);
    expect(hasSessionCookie(res)).toBe(false);

    // The invitation must remain usable (support can resolve, then retry)
    const [inv] = await db.select().from(invitations)
      .where(eq(invitations.token, hashToken(token)));
    expect(inv.isUsed).toBe(false);

    // Revocation must NOT be silently re-opened
    const [row] = await db.select().from(users).where(eq(users.id, revoked.id));
    expect(row.coppaStatus).toBe('consent_revoked');
  });

  it('[LEGAL] needs_parent_email user gets NO session via invite accept', async () => {
    const ts = Date.now();
    const email = `needsparent-${ts}@testinvcoppa.local`;
    const [existing] = await db.insert(users).values({
      username: `invexistneeds${ts}`,
      firstName: 'Needs',
      lastName: 'ParentEmail',
      fullName: 'Needs ParentEmail',
      emails: [email],
      password: 'placeholder-hash',
      birthDate: under13Dob(),
      isMinor: true,
      role: 'athlete',
      coppaStatus: 'needs_parent_email',
    }).returning({ id: users.id });
    createdUserIds.push(existing.id);

    const token = await seedInvitation({ email });
    const payload = acceptPayload({
      birthDate: under13Dob(),
      parentEmail: `parent-needs-${ts}@testinvcoppa.local`,
    });

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.requiresParentalConsent).toBe(true);
    // LEGAL: login blocks needs_parent_email; invite accept must not hand out a session
    expect(hasSessionCookie(res)).toBe(false);
  });

  it('form parentEmail differing from the invitation parentEmail → form value used for consent', async () => {
    const ts = Date.now();
    const formParentEmail = `form-parent-${ts}@testinvcoppa.local`;
    const token = await seedInvitation({
      email: `invpe-${ts}@testinvcoppa.local`,
      birthDate: under13Dob(),
      parentEmail: `coach-parent3-${ts}@testinvcoppa.local`,
    });
    const payload = acceptPayload({ birthDate: under13Dob(), parentEmail: formParentEmail });

    vi.mocked(emailMocks.sendParentalConsentRequest).mockClear();

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.requiresParentalConsent).toBe(true);

    const dbUser = await getUserByUsername(payload.username as string);
    createdUserIds.push(dbUser.id);

    // Fresher form value wins over the coach-provided one
    expect(emailMocks.sendParentalConsentRequest).toHaveBeenCalledWith(
      formParentEmail,
      expect.anything()
    );
  });
});
