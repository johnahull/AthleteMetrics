/**
 * Integration tests — COPPA validation on POST /api/invitations (invite-create)
 *
 * Spec: coppa-compliance-spec "Invitation flow modification" — when an org
 * admin/coach invites an athlete, the invitation may carry the athlete's
 * birthDate; if it classifies as under-13, a parentEmail is REQUIRED before
 * the invitation can be created (the VPC email must be able to fire at
 * accept time even if the athlete's form omits it).
 *
 * LEGAL EXPOSURE items are marked with [LEGAL].
 *
 * Run:
 *   export $(cat .env | xargs) && npx vitest run --config vitest.integration.config.ts tests/integration/invitation-create-coppa.test.ts
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../../packages/api/db';
import { users, organizations } from '@shared/schema/tables/core';
import { userOrganizations, invitations } from '@shared/schema/tables/membership';
import { eq, like } from 'drizzle-orm';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

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

const TEST_PREFIX = 'invcreatecoppa_';
const VALID_PASSWORD = 'TestPassword1!';

function uniqueId() {
  return crypto.randomBytes(4).toString('hex');
}

function ageWithOffset(years: number, daysOffset: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

/** Under-13 date of birth (12 years old — 13th birthday is tomorrow) */
function under13Dob(): string {
  return ageWithOffset(13, 1);
}

function adultDob(): string {
  return ageWithOffset(25, -1);
}

let app: Express;
let testOrg: { id: string };
let adminUser: { id: string; username: string };
let adminCookie: string;

async function loginAs(username: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password: VALID_PASSWORD });
  const cookies = res.headers['set-cookie'];
  return Array.isArray(cookies) ? cookies[0] : (cookies as unknown as string);
}

function invitePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = uniqueId();
  return {
    email: `${TEST_PREFIX}invitee_${id}@example.com`,
    firstName: 'Invited',
    lastName: 'Athlete',
    role: 'athlete',
    organizationId: testOrg.id,
    teamIds: [],
    ...overrides,
  };
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to run integration tests.');
  }

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const id = uniqueId();
  const [org] = await db.insert(organizations).values({
    name: `InvCreateCoppaOrg-${id}`,
    orgType: 'club',
  }).returning();
  testOrg = org;

  const [admin] = await db.insert(users).values({
    username: `${TEST_PREFIX}admin_${id}`,
    firstName: 'Org',
    lastName: 'Admin',
    fullName: 'Org Admin',
    emails: [`${TEST_PREFIX}admin_${id}@example.com`],
    password: await bcrypt.hash(VALID_PASSWORD, BCRYPT_SALT_ROUNDS),
    role: 'org_admin',
    isEmailVerified: true,
    coppaStatus: 'not_applicable',
  }).returning();
  adminUser = admin;

  await db.insert(userOrganizations).values({
    userId: admin.id,
    organizationId: org.id,
    role: 'org_admin',
  }).onConflictDoNothing();

  adminCookie = await loginAs(admin.username);
});

afterAll(async () => {
  try {
    await db.delete(invitations).where(eq(invitations.organizationId, testOrg.id));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrg.id));
    await db.delete(users).where(like(users.username, `${TEST_PREFIX}%`));
    await db.delete(organizations).where(eq(organizations.id, testOrg.id));
  } catch {
    // best-effort cleanup
  }
});

// ============================================================================
// Tests
// ============================================================================

describe('POST /api/invitations — COPPA invite-create validation', () => {
  it('[LEGAL] athlete invite with under-13 birthDate and no parentEmail → 400, no invitation row', async () => {
    const payload = invitePayload({ birthDate: under13Dob() });

    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', adminCookie)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.message?.toLowerCase()).toContain('parent');

    const rows = await db.select().from(invitations)
      .where(eq(invitations.email, payload.email as string));
    expect(rows).toHaveLength(0);
  });

  it('athlete invite with under-13 birthDate and parentEmail → 201, both fields stored', async () => {
    const parentEmail = `${TEST_PREFIX}parent_${uniqueId()}@example.com`;
    const payload = invitePayload({ birthDate: under13Dob(), parentEmail });

    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', adminCookie)
      .send(payload);

    expect(res.status).toBe(201);

    const [row] = await db.select().from(invitations)
      .where(eq(invitations.email, payload.email as string));
    expect(row).toBeDefined();
    expect(row.birthDate).toBe(payload.birthDate);
    expect(row.parentEmail).toBe(parentEmail);
  });

  it('parentEmail equal to invitee email → 400', async () => {
    const email = `${TEST_PREFIX}same_${uniqueId()}@example.com`;
    const payload = invitePayload({ email, birthDate: under13Dob(), parentEmail: email });

    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', adminCookie)
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('coach-role invite with under-13 birthDate → 400 (role requires an adult)', async () => {
    const payload = invitePayload({ role: 'coach', birthDate: under13Dob() });

    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', adminCookie)
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('athlete invite with adult birthDate and no parentEmail → 201', async () => {
    const payload = invitePayload({ birthDate: adultDob() });

    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', adminCookie)
      .send(payload);

    expect(res.status).toBe(201);
  });

  it('malformed birthDate → 400', async () => {
    const payload = invitePayload({ birthDate: '13-01-2015' });

    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', adminCookie)
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('[LEGAL] athlete-record invite (athleteId) for a linked under-13 athlete without any parentEmail → 400', async () => {
    const id = uniqueId();
    const [athlete] = await db.insert(users).values({
      username: `${TEST_PREFIX}u13athlete_${id}`,
      firstName: 'Young',
      lastName: 'Athlete',
      fullName: 'Young Athlete',
      emails: [`${TEST_PREFIX}u13athlete_${id}@example.com`],
      password: await bcrypt.hash(VALID_PASSWORD, BCRYPT_SALT_ROUNDS),
      birthDate: under13Dob(),
      role: 'athlete',
      coppaStatus: 'not_applicable',
    }).returning();

    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', adminCookie)
      .send({
        athleteId: athlete.id,
        role: 'athlete',
        organizationId: testOrg.id,
        teamIds: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.message?.toLowerCase()).toContain('parent');
  });

  it('athlete-record invite for a linked under-13 athlete WITH request parentEmail → 201, stored on invitation', async () => {
    const id = uniqueId();
    const [athlete] = await db.insert(users).values({
      username: `${TEST_PREFIX}u13athlete2_${id}`,
      firstName: 'Young',
      lastName: 'Athlete',
      fullName: 'Young Athlete',
      emails: [`${TEST_PREFIX}u13athlete2_${id}@example.com`],
      password: await bcrypt.hash(VALID_PASSWORD, BCRYPT_SALT_ROUNDS),
      birthDate: under13Dob(),
      role: 'athlete',
      coppaStatus: 'not_applicable',
    }).returning();

    const parentEmail = `${TEST_PREFIX}parent2_${id}@example.com`;
    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', adminCookie)
      .send({
        athleteId: athlete.id,
        role: 'athlete',
        organizationId: testOrg.id,
        teamIds: [],
        parentEmail,
      });

    expect(res.status).toBe(201);

    const rows = await db.select().from(invitations)
      .where(eq(invitations.playerId, athlete.id));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].parentEmail).toBe(parentEmail);
  });

  it('GET /api/invitations/:token returns birthDate and parentEmail for prefill', async () => {
    const parentEmail = `${TEST_PREFIX}parent3_${uniqueId()}@example.com`;
    const payload = invitePayload({ birthDate: under13Dob(), parentEmail });

    const createRes = await request(app)
      .post('/api/invitations')
      .set('Cookie', adminCookie)
      .send(payload);
    expect(createRes.status).toBe(201);

    // Raw token only appears in the invite link
    const token = (createRes.body.inviteLink as string).split('token=')[1];
    expect(token).toBeTruthy();

    const getRes = await request(app).get(`/api/invitations/${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.birthDate).toBe(payload.birthDate);
    expect(getRes.body.parentEmail).toBe(parentEmail);
  });
});
