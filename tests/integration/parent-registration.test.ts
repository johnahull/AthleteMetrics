/**
 * Integration tests — POST /api/auth/register/parent
 *
 * Covers:
 *  - Validation (missing fields, weak password, email conflict, username conflict)
 *  - Successful registration without consentId
 *  - Successful registration with valid consentId (email must match)
 *  - consentId validation (wrong email, non-existent consent)
 *  - linkParentAccount called when consentId matches
 *
 * Run:
 *   export $(cat .env | xargs) && npm run test:run -- tests/integration/parent-registration.test.ts
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
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { users } from '@shared/schema/tables/core';
import { parentalConsents, parentAthleteLinks } from '@shared/schema/tables/coppa';
import { eq, like } from 'drizzle-orm';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

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
    sendParentInvitation: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn().mockImplementation(() => ({
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendParentInvitation: vi.fn().mockResolvedValue(true),
  })),
}));

import { registerRoutes } from '../../packages/api/routes';

// ============================================================================
// Helpers
// ============================================================================

const VALID_PASSWORD = 'ValidParent1!';
const TEST_PREFIX = 'parentreg_test_';

function uniqueId() {
  return crypto.randomBytes(4).toString('hex');
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function createTestAthleteUser(prefix: string) {
  const id = uniqueId();
  const [athlete] = await db.insert(users).values({
    username: `${prefix}athlete_${id}`,
    firstName: 'Test',
    lastName: 'Athlete',
    emails: [`${prefix}athlete_${id}@example.com`],
    password: await bcrypt.hash('TestPassword1!', BCRYPT_SALT_ROUNDS),
    role: 'athlete',
    isEmailVerified: true,
    isSiteAdmin: false,
    coppaStatus: 'pending_consent',
    isMinor: true,
    parentEmail: `${prefix}parent_${id}@example.com`,
  }).returning();
  return { athlete, parentEmail: `${prefix}parent_${id}@example.com` };
}

async function createTestConsent(athleteId: string, parentEmail: string) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const [consent] = await db.insert(parentalConsents).values({
    athleteUserId: athleteId,
    parentEmail,
    tokenHash: hashToken(rawToken),
    status: 'pending',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }).returning();

  await db.insert(parentAthleteLinks).values({
    parentEmail,
    athleteUserId: athleteId,
    consentId: consent.id,
  }).onConflictDoNothing();

  return { consent, rawToken };
}

// ============================================================================
// Setup
// ============================================================================

let app: Express;
const createdUserIds: string[] = [];
const createdAthleteIds: string[] = [];
const createdConsentIds: string[] = [];

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

afterAll(async () => {
  // Clean up in reverse FK order
  if (createdConsentIds.length > 0) {
    for (const id of createdConsentIds) {
      await db.delete(parentalConsents).where(eq(parentalConsents.id, id)).catch(() => {});
    }
  }
  if (createdAthleteIds.length > 0) {
    for (const id of createdAthleteIds) {
      await db.delete(users).where(eq(users.id, id)).catch(() => {});
    }
  }
  if (createdUserIds.length > 0) {
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id)).catch(() => {});
    }
  }
  // Also sweep by username prefix
  await db.delete(users).where(like(users.username, `${TEST_PREFIX}%`)).catch(() => {});
});

// ============================================================================
// Tests
// ============================================================================

describe('POST /api/auth/register/parent', () => {
  describe('Validation', () => {
    it('rejects missing firstName', async () => {
      const res = await request(app)
        .post('/api/auth/register/parent')
        .send({
          lastName: 'Smith',
          email: 'parenttest@example.com',
          username: 'parenttest',
          password: VALID_PASSWORD,
          legalAcceptedAt: new Date().toISOString(),
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects weak password (no uppercase)', async () => {
      const res = await request(app)
        .post('/api/auth/register/parent')
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'parenttest@example.com',
          username: 'parenttest',
          password: 'weakpassword1!', // no uppercase
          legalAcceptedAt: new Date().toISOString(),
        });
      expect(res.status).toBe(400);
    });

    it('rejects missing legalAcceptedAt', async () => {
      const res = await request(app)
        .post('/api/auth/register/parent')
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'parenttest@example.com',
          username: 'parenttest',
          password: VALID_PASSWORD,
        });
      expect(res.status).toBe(400);
    });
  });

  describe('Successful registration (no consentId)', () => {
    it('creates a parent account and returns 201', async () => {
      const id = uniqueId();
      const email = `${TEST_PREFIX}parent_${id}@example.com`;
      const username = `${TEST_PREFIX}par${id}`;

      const res = await request(app)
        .post('/api/auth/register/parent')
        .send({
          firstName: 'Jane',
          lastName: 'Doe',
          email,
          username,
          password: VALID_PASSWORD,
          legalAcceptedAt: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify user was created with role 'parent'
      const [created] = await db.select().from(users).where(like(users.username, username));
      expect(created).toBeDefined();
      expect(created.role).toBe('parent');
      expect(created.isEmailVerified).toBe(false);
      createdUserIds.push(created.id);
    });
  });

  describe('Username/email uniqueness', () => {
    it('rejects duplicate username', async () => {
      const id = uniqueId();
      const email = `${TEST_PREFIX}parent_${id}@example.com`;
      const username = `${TEST_PREFIX}dup${id}`;

      // First registration
      const res1 = await request(app)
        .post('/api/auth/register/parent')
        .send({
          firstName: 'Jane',
          lastName: 'Doe',
          email,
          username,
          password: VALID_PASSWORD,
          legalAcceptedAt: new Date().toISOString(),
        });
      expect(res1.status).toBe(201);
      const [u1] = await db.select().from(users).where(like(users.username, username));
      if (u1) createdUserIds.push(u1.id);

      // Second registration with same username
      const res2 = await request(app)
        .post('/api/auth/register/parent')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: `${TEST_PREFIX}other_${id}@example.com`,
          username, // same username!
          password: VALID_PASSWORD,
          legalAcceptedAt: new Date().toISOString(),
        });
      expect(res2.status).toBe(409);
      expect(res2.body.field).toBe('username');
    });
  });

  describe('consentId validation', () => {
    it('rejects non-existent consentId', async () => {
      const id = uniqueId();
      const res = await request(app)
        .post('/api/auth/register/parent')
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          email: `${TEST_PREFIX}parent_${id}@example.com`,
          username: `${TEST_PREFIX}par${id}`,
          password: VALID_PASSWORD,
          legalAcceptedAt: new Date().toISOString(),
          consentId: 'nonexistent-consent-id-123',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects when email does not match consent record', async () => {
      const id = uniqueId();
      const { athlete, parentEmail } = await createTestAthleteUser(`${TEST_PREFIX}mis_`);
      createdAthleteIds.push(athlete.id);

      const { consent } = await createTestConsent(athlete.id, parentEmail);
      createdConsentIds.push(consent.id);

      const res = await request(app)
        .post('/api/auth/register/parent')
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          email: `${TEST_PREFIX}wrong_${id}@example.com`, // different email
          username: `${TEST_PREFIX}par${id}`,
          password: VALID_PASSWORD,
          legalAcceptedAt: new Date().toISOString(),
          consentId: consent.id,
        });
      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('email');
    });

    it('links parent to athletes when consentId matches parentEmail', async () => {
      const id = uniqueId();
      const { athlete, parentEmail } = await createTestAthleteUser(`${TEST_PREFIX}lnk_`);
      createdAthleteIds.push(athlete.id);

      const { consent } = await createTestConsent(athlete.id, parentEmail);
      createdConsentIds.push(consent.id);

      const username = `${TEST_PREFIX}lnk${id}`;

      const res = await request(app)
        .post('/api/auth/register/parent')
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          email: parentEmail,
          username,
          password: VALID_PASSWORD,
          legalAcceptedAt: new Date().toISOString(),
          consentId: consent.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.linkedAthletes).toBeGreaterThanOrEqual(1);

      // Verify parentAthleteLinks was updated with parentUserId
      const [link] = await db.select()
        .from(parentAthleteLinks)
        .where(eq(parentAthleteLinks.athleteUserId, athlete.id));

      expect(link).toBeDefined();
      expect(link.parentUserId).toBeTruthy();

      // Track created user for cleanup
      const [createdUser] = await db.select().from(users).where(like(users.username, username));
      if (createdUser) createdUserIds.push(createdUser.id);
    });
  });
});
