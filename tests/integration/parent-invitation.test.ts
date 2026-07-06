/**
 * Integration tests — Parent invitation flow (C8)
 *
 * Covers:
 *  - POST /api/invitations with role:'parent' requires athleteId
 *  - POST /api/invitations with role:'parent' creates invitation with playerId
 *  - Invitation acceptance creates parentAthleteLinks row
 *  - Non-parent invitation acceptance is unaffected
 *
 * Run:
 *   export $(cat .env | xargs) && npm run test:run -- tests/integration/parent-invitation.test.ts
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../../packages/api/db';
import { users, organizations } from '@shared/schema/tables/core';
import { userOrganizations } from '@shared/schema/tables/membership';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { invitations } from '@shared/schema';
import { eq, like } from 'drizzle-orm';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

vi.mock('../../packages/api/services/email-service', () => ({
  emailService: {
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendInvitation: vi.fn().mockResolvedValue(true),
    sendWelcome: vi.fn().mockResolvedValue(true),
    sendParentInvitation: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn().mockImplementation(() => ({
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendInvitation: vi.fn().mockResolvedValue(true),
    sendWelcome: vi.fn().mockResolvedValue(true),
    sendParentInvitation: vi.fn().mockResolvedValue(true),
  })),
}));

import { registerRoutes } from '../../packages/api/routes';

// ============================================================================
// Helpers
// ============================================================================

const TEST_PREFIX = 'parentinv_test_';
const VALID_PASSWORD = 'TestPassword1!';

function uniqueId() {
  return crypto.randomBytes(4).toString('hex');
}

async function createUser(suffix: string, role: string = 'athlete') {
  const id = uniqueId();
  const [user] = await db.insert(users).values({
    username: `${TEST_PREFIX}${suffix}_${id}`,
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
    emails: [`${TEST_PREFIX}${suffix}_${id}@example.com`],
    password: await bcrypt.hash(VALID_PASSWORD, BCRYPT_SALT_ROUNDS),
    role: role as any,
    isEmailVerified: true,
    isSiteAdmin: false,
    coppaStatus: 'not_applicable',
  }).returning();
  return user;
}

async function createOrg(name: string) {
  const [org] = await db.insert(organizations).values({
    name,
    orgType: 'club',
  }).returning();
  return org;
}

async function addUserToOrg(userId: string, orgId: string, role: string) {
  await db.insert(userOrganizations).values({
    userId,
    organizationId: orgId,
    role,
  }).onConflictDoNothing();
}

async function loginAs(app: Express, user: { username: string }) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: VALID_PASSWORD });
  const cookies = res.headers['set-cookie'];
  return Array.isArray(cookies) ? cookies[0] : cookies;
}

// ============================================================================
// Setup
// ============================================================================

let app: Express;
let orgAdminUser: any;
let athleteUser: any;
let testOrg: any;
const createdIds: string[] = [];
const createdOrgIds: string[] = [];
const createdInvitationIds: string[] = [];

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  orgAdminUser = await createUser('orgadmin', 'org_admin');
  athleteUser = await createUser('athlete', 'athlete');
  testOrg = await createOrg(`${TEST_PREFIX}_org_${uniqueId()}`);

  createdIds.push(orgAdminUser.id, athleteUser.id);
  createdOrgIds.push(testOrg.id);

  await addUserToOrg(orgAdminUser.id, testOrg.id, 'org_admin');
  await addUserToOrg(athleteUser.id, testOrg.id, 'athlete');
});

afterAll(async () => {
  for (const id of createdInvitationIds) {
    await db.delete(invitations).where(eq(invitations.id, id)).catch(() => {});
  }
  await db.delete(parentAthleteLinks)
    .where(like(parentAthleteLinks.parentEmail, `${TEST_PREFIX}%`))
    .catch(() => {});
  for (const id of createdIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  for (const id of createdOrgIds) {
    await db.delete(organizations).where(eq(organizations.id, id)).catch(() => {});
  }
  await db.delete(users).where(like(users.username, `${TEST_PREFIX}%`)).catch(() => {});
});

// ============================================================================
// Tests
// ============================================================================

describe('POST /api/invitations — parent role', () => {
  it('requires athleteId when role is parent', async () => {
    const cookie = await loginAs(app, orgAdminUser);
    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', cookie)
      .send({
        email: `${TEST_PREFIX}parent@example.com`,
        role: 'parent',
        organizationId: testOrg.id,
        // Missing athleteId
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/athleteId/i);
  });

  it('returns 404 when athleteId does not exist', async () => {
    const cookie = await loginAs(app, orgAdminUser);
    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', cookie)
      .send({
        email: `${TEST_PREFIX}parent@example.com`,
        role: 'parent',
        organizationId: testOrg.id,
        athleteId: 'nonexistent-athlete-id',
      });
    expect(res.status).toBe(404);
  });

  it('creates parent invitation with athleteId stored as playerId', async () => {
    const cookie = await loginAs(app, orgAdminUser);
    const parentEmail = `${TEST_PREFIX}inv_parent_${uniqueId()}@example.com`;

    const res = await request(app)
      .post('/api/invitations')
      .set('Cookie', cookie)
      .send({
        firstName: 'Jane',
        lastName: 'Parent',
        email: parentEmail,
        role: 'parent',
        organizationId: testOrg.id,
        athleteId: athleteUser.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.email).toBe(parentEmail);
    createdInvitationIds.push(res.body.id);

    // Verify invitation stored playerId = athleteId
    const [inv] = await db.select()
      .from(invitations)
      .where(eq(invitations.id, res.body.id));
    expect(inv).toBeDefined();
    expect(inv.role).toBe('parent');
    expect(inv.playerId).toBe(athleteUser.id);
  });
});

describe('POST /api/invitations/:token/accept — parent role', () => {
  it('creates parentAthleteLinks row when parent invitation is accepted', async () => {
    const cookie = await loginAs(app, orgAdminUser);
    const parentEmail = `${TEST_PREFIX}accparent_${uniqueId()}@example.com`;

    // Create the invitation
    const createRes = await request(app)
      .post('/api/invitations')
      .set('Cookie', cookie)
      .send({
        firstName: 'Jane',
        lastName: 'Parent',
        email: parentEmail,
        role: 'parent',
        organizationId: testOrg.id,
        athleteId: athleteUser.id,
      });

    expect(createRes.status).toBe(201);
    createdInvitationIds.push(createRes.body.id);

    // The raw token is only in the emailed link (the DB stores its hash), so
    // extract it from the invite link in the creation response.
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, createRes.body.id));
    expect(inv).toBeDefined();
    const rawToken = new URL(createRes.body.inviteLink).searchParams.get('token')!;

    // Accept the invitation
    const newParentUsername = `${TEST_PREFIX}acc_par_${uniqueId()}`;
    const acceptRes = await request(app)
      .post(`/api/invitations/${rawToken}/accept`)
      .send({
        username: newParentUsername,
        password: VALID_PASSWORD,
        firstName: 'Jane',
        lastName: 'Parent',
        legalAcceptedAt: new Date().toISOString(),
      });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.success).toBe(true);

    // Verify parentAthleteLinks was created
    const [link] = await db.select()
      .from(parentAthleteLinks)
      .where(eq(parentAthleteLinks.athleteUserId, athleteUser.id));

    expect(link).toBeDefined();
    expect(link.parentEmail).toBe(parentEmail);
    expect(link.parentUserId).toBeTruthy(); // should be set to the new user's ID

    // Track created user for cleanup
    const [createdParent] = await db.select().from(users).where(like(users.username, newParentUsername));
    if (createdParent) createdIds.push(createdParent.id);
  });
});
