/**
 * Integration tests — /api/parent/* routes
 *
 * Covers:
 *  - GET /api/parent/children — list linked athletes (auth required)
 *  - GET /api/parent/children/:athleteId/profile — read-only profile
 *  - GET /api/parent/children/:athleteId/measurements — measurement history
 *  - GET /api/parent/children/:athleteId/reports — available reports
 *
 * Access control:
 *  - Unauthenticated requests → 401
 *  - Authenticated non-parent with no link → 403
 *  - Authenticated parent with active link → 200
 *  - Inactive link → 403
 *
 * Run:
 *   export $(cat .env | xargs) && npm run test:run -- tests/integration/parent-routes.test.ts
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
import { users } from '@shared/schema/tables/core';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
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
    sendWelcome: vi.fn().mockResolvedValue(true),
    sendParentInvitation: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn().mockImplementation(() => ({
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendParentInvitation: vi.fn().mockResolvedValue(true),
  })),
}));

import { registerRoutes } from '../../packages/api/routes';

// ============================================================================
// Helpers
// ============================================================================

const TEST_PREFIX = 'parentroutes_test_';
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
let parentUser: any;
let athleteUser: any;
let otherUser: any;
let activeLinkId: string;
const createdIds: string[] = [];

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  // Create test users
  parentUser = await createUser('parent', 'parent');
  athleteUser = await createUser('athlete', 'athlete');
  otherUser = await createUser('other', 'athlete');

  createdIds.push(parentUser.id, athleteUser.id, otherUser.id);

  // Create active parent-athlete link
  const [link] = await db.insert(parentAthleteLinks).values({
    parentEmail: parentUser.emails[0],
    parentUserId: parentUser.id,
    athleteUserId: athleteUser.id,
    isActive: true,
  }).returning();
  activeLinkId = link.id;
});

afterAll(async () => {
  await db.delete(parentAthleteLinks)
    .where(eq(parentAthleteLinks.parentUserId, parentUser?.id))
    .catch(() => {});
  for (const id of createdIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  await db.delete(users).where(like(users.username, `${TEST_PREFIX}%`)).catch(() => {});
});

// ============================================================================
// Tests
// ============================================================================

describe('GET /api/parent/children', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/parent/children');
    expect(res.status).toBe(401);
  });

  it('returns empty array when no links exist for other user', async () => {
    const cookie = await loginAs(app, otherUser);
    const res = await request(app)
      .get('/api/parent/children')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('returns linked athletes for authenticated parent', async () => {
    const cookie = await loginAs(app, parentUser);
    const res = await request(app)
      .get('/api/parent/children')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].athleteId).toBe(athleteUser.id);
  });
});

describe('GET /api/parent/children/:athleteId/profile', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .get(`/api/parent/children/${athleteUser.id}/profile`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user has no link to athlete', async () => {
    const cookie = await loginAs(app, otherUser);
    const res = await request(app)
      .get(`/api/parent/children/${athleteUser.id}/profile`)
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('returns athlete profile for linked parent', async () => {
    const cookie = await loginAs(app, parentUser);
    const res = await request(app)
      .get(`/api/parent/children/${athleteUser.id}/profile`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(athleteUser.id);
    expect(res.body.firstName).toBe(athleteUser.firstName);
    // Must NOT expose password
    expect(res.body.password).toBeUndefined();
  });

  it('returns 403 for inactive link', async () => {
    // Deactivate the link
    await db.delete(parentAthleteLinks).where(eq(parentAthleteLinks.id, activeLinkId));

    // Create inactive link
    const [inactiveLink] = await db.insert(parentAthleteLinks).values({
      parentEmail: parentUser.emails[0],
      parentUserId: parentUser.id,
      athleteUserId: athleteUser.id,
      isActive: false,
    }).returning();

    const cookie = await loginAs(app, parentUser);
    const res = await request(app)
      .get(`/api/parent/children/${athleteUser.id}/profile`)
      .set('Cookie', cookie);
    expect(res.status).toBe(403);

    // Restore active link for subsequent tests
    await db.delete(parentAthleteLinks).where(eq(parentAthleteLinks.id, inactiveLink.id));
    const [restored] = await db.insert(parentAthleteLinks).values({
      parentEmail: parentUser.emails[0],
      parentUserId: parentUser.id,
      athleteUserId: athleteUser.id,
      isActive: true,
    }).returning();
    activeLinkId = restored.id;
  });
});

describe('GET /api/parent/children/:athleteId/measurements', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .get(`/api/parent/children/${athleteUser.id}/measurements`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user has no link', async () => {
    const cookie = await loginAs(app, otherUser);
    const res = await request(app)
      .get(`/api/parent/children/${athleteUser.id}/measurements`)
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('returns measurements for linked parent', async () => {
    const cookie = await loginAs(app, parentUser);
    const res = await request(app)
      .get(`/api/parent/children/${athleteUser.id}/measurements`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/parent/children/:athleteId/reports', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .get(`/api/parent/children/${athleteUser.id}/reports`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user has no link', async () => {
    const cookie = await loginAs(app, otherUser);
    const res = await request(app)
      .get(`/api/parent/children/${athleteUser.id}/reports`)
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('returns reports for linked parent (empty if athlete has no org)', async () => {
    const cookie = await loginAs(app, parentUser);
    const res = await request(app)
      .get(`/api/parent/children/${athleteUser.id}/reports`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ============================================================================
// Email-only parent links (parentUserId IS NULL) — C3 coverage gap
// ============================================================================

describe('requireParentAccess — email-only links (parentUserId IS NULL) are denied', () => {
  /**
   * DESIGN NOTE (from parent-middleware.ts):
   * "Email-only links (parentUserId IS NULL) do NOT grant access until the
   *  parent registers an account via POST /api/auth/register/parent."
   *
   * The middleware queries parentAthleteLinks by parentUserId. When
   * parentUserId is NULL the row will never match a session user's id, so
   * the middleware correctly returns 403. This test pins that contract.
   */
  it('returns 403 when parent link exists with matching parentEmail but parentUserId IS NULL', async () => {
    // Create a fresh parent user and athlete user for this isolated test
    const emailOnlyParent = await createUser('emailonly_parent', 'parent');
    const emailOnlyAthlete = await createUser('emailonly_athlete', 'athlete');
    createdIds.push(emailOnlyParent.id, emailOnlyAthlete.id);

    // Insert an email-only link: parentEmail matches the user's email but
    // parentUserId is explicitly null (the parent has not yet registered).
    const [emailOnlyLink] = await db.insert(parentAthleteLinks).values({
      parentEmail: emailOnlyParent.emails[0],
      parentUserId: null,          // email-only — no account link
      athleteUserId: emailOnlyAthlete.id,
      isActive: true,
    }).returning();

    try {
      const cookie = await loginAs(app, emailOnlyParent);
      const res = await request(app)
        .get(`/api/parent/children/${emailOnlyAthlete.id}/profile`)
        .set('Cookie', cookie);

      // The middleware must reject because the link is email-only (parentUserId IS NULL)
      expect(res.status).toBe(403);
    } finally {
      // Clean up the email-only link regardless of test outcome
      await db.delete(parentAthleteLinks)
        .where(eq(parentAthleteLinks.id, emailOnlyLink.id))
        .catch(() => {});
    }
  });
});
