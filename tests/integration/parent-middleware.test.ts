/**
 * Integration tests — requireParentAccess middleware branches (GAP 2)
 *
 * Covers the branches in packages/api/permissions/parent-middleware.ts that
 * were not exercised by parent-routes.test.ts:
 *  - Site admin bypasses the parent-link check (isSiteAdmin fast-path)
 *  - Missing athleteId route parameter → 400
 *
 * Note: The DB-error → 500 branch is omitted here because supertest runs
 * against a live test database and reliably injecting a mid-request DB
 * failure would require test-specific seam hooks not present in this app.
 * That branch is covered by the unit test for the middleware factory.
 *
 * Run:
 *   export $(cat .env | xargs) && npm run test:run -- tests/integration/parent-middleware.test.ts
 */

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

const TEST_PREFIX = 'parentmw_test_';
const VALID_PASSWORD = 'TestPassword1!';

function uniqueId() {
  return crypto.randomBytes(4).toString('hex');
}

async function createUser(suffix: string, opts: { isSiteAdmin?: boolean; role?: string } = {}) {
  const id = uniqueId();
  const [user] = await db.insert(users).values({
    username: `${TEST_PREFIX}${suffix}_${id}`,
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
    emails: [`${TEST_PREFIX}${suffix}_${id}@example.com`],
    password: await bcrypt.hash(VALID_PASSWORD, BCRYPT_SALT_ROUNDS),
    role: (opts.role ?? 'athlete') as any,
    isEmailVerified: true,
    isSiteAdmin: opts.isSiteAdmin ?? false,
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
let siteAdminUser: any;
let athleteUser: any;
const createdIds: string[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to run integration tests.');
  }

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  // Create a dedicated site-admin user (not the env admin, so cleanup is safe)
  siteAdminUser = await createUser('siteadmin', { isSiteAdmin: true });
  athleteUser = await createUser('athlete', { role: 'athlete' });

  createdIds.push(siteAdminUser.id, athleteUser.id);
});

afterAll(async () => {
  await db.delete(parentAthleteLinks)
    .where(eq(parentAthleteLinks.parentUserId, siteAdminUser?.id))
    .catch(() => {});
  for (const id of createdIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  await db.delete(users).where(like(users.username, `${TEST_PREFIX}%`)).catch(() => {});
});

// ============================================================================
// GAP 2a — Site admin bypasses requireParentAccess
// ============================================================================

describe('requireParentAccess — site admin bypass', () => {
  /**
   * The middleware has an early-exit path:
   *   if (isSiteAdmin(user)) return next();
   *
   * A site admin should reach the underlying handler even when there is no
   * parentAthleteLinks row linking them to the requested athlete.
   */
  it('site admin reaches the handler without a parent link (200 or 404, not 403)', async () => {
    const cookie = await loginAs(app, siteAdminUser);

    // There is no link between siteAdminUser and athleteUser — a normal user
    // would get 403. A site admin must be allowed through.
    const res = await request(app)
      .get(`/api/parent/children/${athleteUser.id}/profile`)
      .set('Cookie', cookie);

    // 200 (found) or 404 (athlete not found via getUser) are both valid here.
    // What MUST NOT happen is 403 (access denied) or 401 (unauthenticated).
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('site admin can list children endpoint without having any parent links', async () => {
    const cookie = await loginAs(app, siteAdminUser);

    const res = await request(app)
      .get('/api/parent/children')
      .set('Cookie', cookie);

    // The list endpoint uses requireAuth (not requireParentAccess), so 200 is expected.
    // Included here for completeness — ensures admin can reach all parent routes.
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ============================================================================
// GAP 2b — Missing athleteId parameter → 400
// ============================================================================

describe('requireParentAccess — missing athleteId parameter', () => {
  /**
   * The middleware guards:
   *   const athleteId = req.params[athleteIdParam];
   *   if (!athleteId) return res.status(400).json({ message: 'Athlete ID is required' });
   *
   * This path is triggered only if a route uses requireParentAccess but the
   * URL pattern does not include the expected param name. We test it indirectly
   * by registering a minimal test route on a fresh Express instance.
   *
   * We cannot easily trigger it via the production routes (they always include
   * :athleteId in the URL pattern), so we mount a one-off route here.
   */
  it('returns 400 when the route param is absent', async () => {
    // Build a minimal app with a route that calls requireParentAccess but whose
    // URL does not supply the :athleteId segment.
    const { requireParentAccess } = await import('../../packages/api/permissions/parent-middleware');

    // We need session middleware so req.session.user is populated.
    // Simulate the session by hand using a simple middleware stub.
    const testApp = express();
    testApp.use(express.json());

    // Inject a fake authenticated parent session
    testApp.use((req: any, _res: any, next: any) => {
      req.session = { user: { id: siteAdminUser.id, isSiteAdmin: false, role: 'parent', emailVerified: true } };
      next();
    });

    // Mount a route with NO :athleteId param — middleware will find athleteId === undefined
    testApp.get('/no-param-route', requireParentAccess('athleteId'), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await request(testApp).get('/no-param-route');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/athlete id is required/i);
  });
});
