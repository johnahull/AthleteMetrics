/**
 * Integration tests — Parent Link Request endpoints
 *
 * Covers Phase 3 of the Link-a-Child workflow:
 *  1. POST /api/parent/link-requests          — parent initiates request
 *  2. GET  /api/parent/link-requests          — parent lists their requests
 *  3. DELETE /api/parent/link-requests/:id    — parent cancels a request
 *  4. GET  /api/coach/parent-link-requests    — coach views pending requests
 *  5. POST /api/coach/parent-link-requests/:id/approve — coach approves
 *  6. POST /api/coach/parent-link-requests/:id/deny    — coach denies
 *
 * Anti-enumeration:
 *  POST /api/parent/link-requests always returns 200 with a generic message
 *  regardless of whether the child username/email exists.
 *
 * Access control:
 *  - Unauthenticated → 401
 *  - Wrong role (e.g. athlete trying coach endpoint) → 403
 *  - Coach outside the request's org → 403
 *
 * Run:
 *   export $(cat .env | xargs) && npx vitest run --config vitest.integration.config.ts tests/integration/parent-link-requests.test.ts
 */

// Set env vars before any imports
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
import { parentAthleteLinks, parentLinkRequests } from '@shared/schema/tables/coppa';
import { eq, like, and, inArray } from 'drizzle-orm';
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
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendWelcome: vi.fn().mockResolvedValue(true),
    sendParentInvitation: vi.fn().mockResolvedValue(true),
    sendParentLinkRequestToCoach: vi.fn().mockResolvedValue(true),
    sendParentLinkRequestResult: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn().mockImplementation(() => ({
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendParentInvitation: vi.fn().mockResolvedValue(true),
    sendParentLinkRequestToCoach: vi.fn().mockResolvedValue(true),
    sendParentLinkRequestResult: vi.fn().mockResolvedValue(true),
  })),
}));

import { registerRoutes } from '../../packages/api/routes';

// ============================================================================
// Helpers
// ============================================================================

const TEST_PREFIX = 'plr_test_'; // parent link request
const VALID_PASSWORD = 'TestPassword1!';

function uniqueId() {
  return crypto.randomBytes(4).toString('hex');
}

async function createUser(
  suffix: string,
  role: 'parent' | 'athlete' | 'coach' | 'org_admin' = 'athlete',
  extra: Partial<{
    isMinor: boolean;
    isSiteAdmin: boolean;
  }> = {}
) {
  const id = uniqueId();
  const [user] = await db.insert(users).values({
    username: `${TEST_PREFIX}${suffix}_${id}`,
    firstName: 'Test',
    lastName: suffix.replace(/_/g, ' '),
    fullName: `Test ${suffix}`,
    emails: [`${TEST_PREFIX}${suffix}_${id}@example.com`],
    password: await bcrypt.hash(VALID_PASSWORD, BCRYPT_SALT_ROUNDS),
    role: role as any,
    isEmailVerified: true,
    isSiteAdmin: extra.isSiteAdmin ?? false,
    isMinor: extra.isMinor ?? false,
    coppaStatus: 'not_applicable',
  }).returning();
  return user;
}

async function createOrg(suffix: string) {
  const id = uniqueId();
  const [org] = await db.insert(organizations).values({
    name: `${TEST_PREFIX}org_${suffix}_${id}`,
    orgType: 'club',
    isActive: true,
  }).returning();
  return org;
}

async function addUserToOrg(userId: string, orgId: string, role: string) {
  const [membership] = await db.insert(userOrganizations).values({
    userId,
    organizationId: orgId,
    role,
  }).returning();
  return membership;
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

// Shared test fixtures
let parentUser: any;
let minorAthlete: any;
let coachUser: any;
let otherCoach: any;         // coach in a different org
let nonParentUser: any;      // an athlete trying parent endpoints
let testOrg: any;
let otherOrg: any;

// Track created IDs for cleanup
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];
const createdMembershipIds: string[] = [];

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  // Create two orgs
  testOrg = await createOrg('main');
  otherOrg = await createOrg('other');
  createdOrgIds.push(testOrg.id, otherOrg.id);

  // Create users
  parentUser = await createUser('parent', 'parent');
  minorAthlete = await createUser('minor', 'athlete', { isMinor: true });
  coachUser = await createUser('coach', 'coach');
  otherCoach = await createUser('othercoach', 'coach');
  nonParentUser = await createUser('athlete', 'athlete');

  createdUserIds.push(
    parentUser.id,
    minorAthlete.id,
    coachUser.id,
    otherCoach.id,
    nonParentUser.id,
  );

  // Put minor athlete, coach, and parent in testOrg; otherCoach in otherOrg
  const m1 = await addUserToOrg(minorAthlete.id, testOrg.id, 'athlete');
  const m2 = await addUserToOrg(coachUser.id, testOrg.id, 'coach');
  const m3 = await addUserToOrg(otherCoach.id, otherOrg.id, 'coach');
  const m4 = await addUserToOrg(parentUser.id, testOrg.id, 'parent');
  createdMembershipIds.push(m1.id, m2.id, m3.id, m4.id);
});

afterAll(async () => {
  // Clean up link requests
  if (createdUserIds.length > 0) {
    await db.delete(parentLinkRequests)
      .where(inArray(parentLinkRequests.parentUserId, createdUserIds))
      .catch(() => {});
    await db.delete(parentAthleteLinks)
      .where(inArray(parentAthleteLinks.parentUserId, createdUserIds))
      .catch(() => {});
  }

  // Clean up memberships
  if (createdMembershipIds.length > 0) {
    await db.delete(userOrganizations)
      .where(inArray(userOrganizations.id, createdMembershipIds))
      .catch(() => {});
  }

  // Clean up users
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }

  // Clean up orgs
  for (const id of createdOrgIds) {
    await db.delete(organizations).where(eq(organizations.id, id)).catch(() => {});
  }

  // Catch-all prefix cleanup
  await db.delete(users).where(like(users.username, `${TEST_PREFIX}%`)).catch(() => {});
});

// ============================================================================
// POST /api/parent/link-requests
// ============================================================================

describe('POST /api/parent/link-requests', () => {
  it('returns 200 generic response for valid minor athlete child (by username)', async () => {
    const cookie = await loginAs(app, parentUser);
    const res = await request(app)
      .post('/api/parent/link-requests')
      .set('Cookie', cookie)
      .send({ childIdentifier: minorAthlete.username });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);

    // Verify a pending request was actually created
    const rows = await db.select()
      .from(parentLinkRequests)
      .where(and(
        eq(parentLinkRequests.parentUserId, parentUser.id),
        eq(parentLinkRequests.athleteUserId, minorAthlete.id),
      ));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].status).toBe('pending');

    // Clean up so subsequent tests start fresh
    await db.delete(parentLinkRequests)
      .where(and(
        eq(parentLinkRequests.parentUserId, parentUser.id),
        eq(parentLinkRequests.athleteUserId, minorAthlete.id),
      ));
  });

  it('returns 200 generic response for non-existent username (anti-enumeration)', async () => {
    const cookie = await loginAs(app, parentUser);
    const res = await request(app)
      .post('/api/parent/link-requests')
      .set('Cookie', cookie)
      .send({ childIdentifier: 'totally_non_existent_user_xyz_99999' });

    // Anti-enumeration: must be 200, not 404
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 generic but creates no duplicate when already linked', async () => {
    // Create an existing active link
    const [existingLink] = await db.insert(parentAthleteLinks).values({
      parentEmail: parentUser.emails[0],
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      isActive: true,
    }).returning();

    try {
      const cookie = await loginAs(app, parentUser);
      const res = await request(app)
        .post('/api/parent/link-requests')
        .set('Cookie', cookie)
        .send({ childIdentifier: minorAthlete.username });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Must NOT have created a new link request
      const rows = await db.select()
        .from(parentLinkRequests)
        .where(and(
          eq(parentLinkRequests.parentUserId, parentUser.id),
          eq(parentLinkRequests.athleteUserId, minorAthlete.id),
        ));
      expect(rows.length).toBe(0);
    } finally {
      await db.delete(parentAthleteLinks)
        .where(eq(parentAthleteLinks.id, existingLink.id))
        .catch(() => {});
    }
  });

  it('returns 200 generic but creates no duplicate when pending request exists', async () => {
    // Create an existing pending request
    const [existing] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    try {
      const cookie = await loginAs(app, parentUser);
      const res = await request(app)
        .post('/api/parent/link-requests')
        .set('Cookie', cookie)
        .send({ childIdentifier: minorAthlete.username });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Still only one pending request
      const rows = await db.select()
        .from(parentLinkRequests)
        .where(and(
          eq(parentLinkRequests.parentUserId, parentUser.id),
          eq(parentLinkRequests.athleteUserId, minorAthlete.id),
          eq(parentLinkRequests.status, 'pending'),
        ));
      expect(rows.length).toBe(1);
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, existing.id))
        .catch(() => {});
    }
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/parent/link-requests')
      .send({ childIdentifier: minorAthlete.username });
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// POST /api/parent/link-requests — non-parent role
// ============================================================================

describe('POST /api/parent/link-requests — role guard', () => {
  it('returns 403 when a non-parent user (coach role) submits a link request', async () => {
    const cookie = await loginAs(app, coachUser);
    const res = await request(app)
      .post('/api/parent/link-requests')
      .set('Cookie', cookie)
      .send({ childIdentifier: minorAthlete.username });

    expect(res.status).toBe(403);
  });

  it('returns 403 when a non-parent user (athlete role) submits a link request', async () => {
    const cookie = await loginAs(app, nonParentUser);
    const res = await request(app)
      .post('/api/parent/link-requests')
      .set('Cookie', cookie)
      .send({ childIdentifier: minorAthlete.username });

    expect(res.status).toBe(403);
  });
});

// ============================================================================
// GET /api/parent/link-requests
// ============================================================================

describe('GET /api/parent/link-requests', () => {
  it('returns list of parent link requests for authenticated parent', async () => {
    // Insert a known request
    const [req1] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    try {
      const cookie = await loginAs(app, parentUser);
      const res = await request(app)
        .get('/api/parent/link-requests')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const ids = res.body.map((r: any) => r.id);
      expect(ids).toContain(req1.id);
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id))
        .catch(() => {});
    }
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/parent/link-requests');
    expect(res.status).toBe(401);
  });

  it('only returns own requests — not those from a different parent', async () => {
    const parentB = await createUser('parent_b_isolation', 'parent');
    createdUserIds.push(parentB.id);

    // Give parentB a parent org membership so they can create requests
    const memberB = await addUserToOrg(parentB.id, testOrg.id, 'parent');
    createdMembershipIds.push(memberB.id);

    const [reqA] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    const [reqB] = await db.insert(parentLinkRequests).values({
      parentUserId: parentB.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    try {
      // Parent A should only see their own request
      const cookieA = await loginAs(app, parentUser);
      const resA = await request(app)
        .get('/api/parent/link-requests')
        .set('Cookie', cookieA);

      expect(resA.status).toBe(200);
      const idsA = resA.body.map((r: any) => r.id);
      expect(idsA).toContain(reqA.id);
      expect(idsA).not.toContain(reqB.id);

      // Parent B should only see their own request
      const cookieB = await loginAs(app, parentB);
      const resB = await request(app)
        .get('/api/parent/link-requests')
        .set('Cookie', cookieB);

      expect(resB.status).toBe(200);
      const idsB = resB.body.map((r: any) => r.id);
      expect(idsB).toContain(reqB.id);
      expect(idsB).not.toContain(reqA.id);
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, reqA.id))
        .catch(() => {});
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, reqB.id))
        .catch(() => {});
    }
  });
});

// ============================================================================
// DELETE /api/parent/link-requests/:id
// ============================================================================

describe('DELETE /api/parent/link-requests/:id', () => {
  it('cancels pending request owned by parent', async () => {
    const [req1] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    try {
      const cookie = await loginAs(app, parentUser);
      const res = await request(app)
        .delete(`/api/parent/link-requests/${req1.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(200);

      // Verify status updated to cancelled
      const [updated] = await db.select({ status: parentLinkRequests.status })
        .from(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id));
      expect(updated?.status).toBe('cancelled');
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id))
        .catch(() => {});
    }
  });

  it('returns 403 when request belongs to a different parent', async () => {
    const [req1] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    const otherParent = await createUser('other_parent_del', 'parent');
    createdUserIds.push(otherParent.id);

    try {
      const cookie = await loginAs(app, otherParent);
      const res = await request(app)
        .delete(`/api/parent/link-requests/${req1.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(403);
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id))
        .catch(() => {});
    }
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).delete('/api/parent/link-requests/nonexistent-id');
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// GET /api/coach/parent-link-requests
// ============================================================================

describe('GET /api/coach/parent-link-requests', () => {
  it('returns pending requests for coach in their org (not expired)', async () => {
    const [req1] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    try {
      const cookie = await loginAs(app, coachUser);
      const res = await request(app)
        .get('/api/coach/parent-link-requests')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const ids = res.body.map((r: any) => r.id);
      expect(ids).toContain(req1.id);
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id))
        .catch(() => {});
    }
  });

  it('does NOT return requests from a different org to coach', async () => {
    const [req1] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    try {
      const cookie = await loginAs(app, otherCoach);
      const res = await request(app)
        .get('/api/coach/parent-link-requests')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      const ids = res.body.map((r: any) => r.id);
      expect(ids).not.toContain(req1.id);
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id))
        .catch(() => {});
    }
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/coach/parent-link-requests');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-coach user (athlete role)', async () => {
    const cookie = await loginAs(app, nonParentUser);
    const res = await request(app)
      .get('/api/coach/parent-link-requests')
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('excludes expired requests from the list', async () => {
    // Insert an expired (past expiresAt) pending request
    const [expiredReq] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
    }).returning();

    // Insert a non-expired pending request
    const [activeReq] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    try {
      const cookie = await loginAs(app, coachUser);
      const res = await request(app)
        .get('/api/coach/parent-link-requests')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      const ids = res.body.map((r: any) => r.id);
      expect(ids).toContain(activeReq.id);
      expect(ids).not.toContain(expiredReq.id);
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, expiredReq.id))
        .catch(() => {});
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, activeReq.id))
        .catch(() => {});
    }
  });
});

// ============================================================================
// POST /api/coach/parent-link-requests/:id/approve
// ============================================================================

describe('POST /api/coach/parent-link-requests/:id/approve', () => {
  it('approves request → status=approved, parentAthleteLinks row created', async () => {
    const [req1] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    try {
      const cookie = await loginAs(app, coachUser);
      const res = await request(app)
        .post(`/api/coach/parent-link-requests/${req1.id}/approve`)
        .set('Cookie', cookie);

      expect(res.status).toBe(200);

      // Verify request status updated
      const [updated] = await db.select()
        .from(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id));
      expect(updated?.status).toBe('approved');
      expect(updated?.processedBy).toBe(coachUser.id);
      expect(updated?.processedAt).not.toBeNull();

      // Verify parentAthleteLinks row created
      const links = await db.select()
        .from(parentAthleteLinks)
        .where(and(
          eq(parentAthleteLinks.parentUserId, parentUser.id),
          eq(parentAthleteLinks.athleteUserId, minorAthlete.id),
          eq(parentAthleteLinks.isActive, true),
        ));
      expect(links.length).toBeGreaterThanOrEqual(1);
    } finally {
      await db.delete(parentAthleteLinks)
        .where(and(
          eq(parentAthleteLinks.parentUserId, parentUser.id),
          eq(parentAthleteLinks.athleteUserId, minorAthlete.id),
        ))
        .catch(() => {});
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id))
        .catch(() => {});
    }
  });

  it('returns 403 for coach outside the requests org', async () => {
    const [req1] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    try {
      const cookie = await loginAs(app, otherCoach);
      const res = await request(app)
        .post(`/api/coach/parent-link-requests/${req1.id}/approve`)
        .set('Cookie', cookie);

      expect(res.status).toBe(403);

      // Status must still be pending
      const [check] = await db.select({ status: parentLinkRequests.status })
        .from(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id));
      expect(check?.status).toBe('pending');
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id))
        .catch(() => {});
    }
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/coach/parent-link-requests/some-id/approve');
    expect(res.status).toBe(401);
  });

  it('returns 400 for an expired request', async () => {
    const [expiredReq] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
    }).returning();

    try {
      const cookie = await loginAs(app, coachUser);
      const res = await request(app)
        .post(`/api/coach/parent-link-requests/${expiredReq.id}/approve`)
        .set('Cookie', cookie);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/expired/i);

      // Status must remain unchanged
      const [check] = await db.select({ status: parentLinkRequests.status })
        .from(parentLinkRequests)
        .where(eq(parentLinkRequests.id, expiredReq.id));
      expect(check?.status).toBe('pending');
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, expiredReq.id))
        .catch(() => {});
    }
  });

  it('second approve returns 400 when request already processed (race condition guard)', async () => {
    const [req1] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    try {
      const cookie = await loginAs(app, coachUser);

      // First approve should succeed
      const first = await request(app)
        .post(`/api/coach/parent-link-requests/${req1.id}/approve`)
        .set('Cookie', cookie);
      expect(first.status).toBe(200);

      // Second approve should fail — request is no longer pending
      const second = await request(app)
        .post(`/api/coach/parent-link-requests/${req1.id}/approve`)
        .set('Cookie', cookie);
      expect(second.status).toBe(400);
      expect(second.body.message).toMatch(/no longer pending/i);
    } finally {
      await db.delete(parentAthleteLinks)
        .where(and(
          eq(parentAthleteLinks.parentUserId, parentUser.id),
          eq(parentAthleteLinks.athleteUserId, minorAthlete.id),
        ))
        .catch(() => {});
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id))
        .catch(() => {});
    }
  });
});

// ============================================================================
// POST /api/coach/parent-link-requests/:id/deny
// ============================================================================

describe('POST /api/coach/parent-link-requests/:id/deny', () => {
  it('denies request with reason → status=denied, no link row created', async () => {
    const [req1] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    try {
      const cookie = await loginAs(app, coachUser);
      const res = await request(app)
        .post(`/api/coach/parent-link-requests/${req1.id}/deny`)
        .set('Cookie', cookie)
        .send({ reason: 'Could not verify parental relationship' });

      expect(res.status).toBe(200);

      // Verify status updated
      const [updated] = await db.select()
        .from(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id));
      expect(updated?.status).toBe('denied');
      expect(updated?.processedBy).toBe(coachUser.id);
      expect(updated?.denialReason).toBe('Could not verify parental relationship');

      // Must NOT have created a link
      const links = await db.select()
        .from(parentAthleteLinks)
        .where(and(
          eq(parentAthleteLinks.parentUserId, parentUser.id),
          eq(parentAthleteLinks.athleteUserId, minorAthlete.id),
        ));
      expect(links.length).toBe(0);
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id))
        .catch(() => {});
    }
  });

  it('returns 403 for coach outside the requests org', async () => {
    const [req1] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    try {
      const cookie = await loginAs(app, otherCoach);
      const res = await request(app)
        .post(`/api/coach/parent-link-requests/${req1.id}/deny`)
        .set('Cookie', cookie)
        .send({ reason: 'Unauthorized attempt' });

      expect(res.status).toBe(403);
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id))
        .catch(() => {});
    }
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/coach/parent-link-requests/some-id/deny')
      .send({ reason: 'test' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an expired request', async () => {
    const [expiredReq] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
    }).returning();

    try {
      const cookie = await loginAs(app, coachUser);
      const res = await request(app)
        .post(`/api/coach/parent-link-requests/${expiredReq.id}/deny`)
        .set('Cookie', cookie)
        .send({ reason: 'Expired test' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/expired/i);

      // Status must remain unchanged
      const [check] = await db.select({ status: parentLinkRequests.status })
        .from(parentLinkRequests)
        .where(eq(parentLinkRequests.id, expiredReq.id));
      expect(check?.status).toBe('pending');
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, expiredReq.id))
        .catch(() => {});
    }
  });

  it('truncates denial reason to 500 characters', async () => {
    const [req1] = await db.insert(parentLinkRequests).values({
      parentUserId: parentUser.id,
      athleteUserId: minorAthlete.id,
      organizationId: testOrg.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();

    // Build a 1000-character reason string
    const longReason = 'A'.repeat(1000);

    try {
      const cookie = await loginAs(app, coachUser);
      const res = await request(app)
        .post(`/api/coach/parent-link-requests/${req1.id}/deny`)
        .set('Cookie', cookie)
        .send({ reason: longReason });

      expect(res.status).toBe(200);

      // Verify stored denialReason is capped at 500 characters
      const [updated] = await db.select({ denialReason: parentLinkRequests.denialReason })
        .from(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id));
      expect(updated?.denialReason).not.toBeNull();
      expect(updated!.denialReason!.length).toBe(500);
    } finally {
      await db.delete(parentLinkRequests)
        .where(eq(parentLinkRequests.id, req1.id))
        .catch(() => {});
    }
  });
});
