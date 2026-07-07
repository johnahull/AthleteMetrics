/**
 * Integration tests — parentEmail field on PUT /api/profile
 *
 * TDD Phase 3: RED — these tests are written before the implementation.
 * They should FAIL until Phase 3 GREEN is applied.
 *
 * Run:
 *   export $(cat .env | xargs) && npm run test:integration -- tests/integration/profile-parent-email.test.ts
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
import crypto from 'crypto';
import { db } from '../../packages/api/db';
import { users } from '@shared/schema/tables/core';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { eq, and, like } from 'drizzle-orm';
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
    sendParentNotification: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

// ============================================================================
// Helpers
// ============================================================================

const TEST_PREFIX = 'profilpe_test_';
const VALID_PASSWORD = 'TestPassword1!';

function uid() {
  return crypto.randomBytes(4).toString('hex');
}

/** Build a YYYY-MM-DD date string for someone exactly `years` years old today */
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

async function createAthlete(
  suffix: string,
  extra: Record<string, unknown> = {},
) {
  const id = uid();
  const [user] = await db
    .insert(users)
    .values({
      username: `${TEST_PREFIX}${suffix}_${id}`,
      firstName: 'Test',
      lastName: 'Athlete',
      fullName: 'Test Athlete',
      emails: [`${TEST_PREFIX}${suffix}_${id}@example.com`],
      password: await bcrypt.hash(VALID_PASSWORD, BCRYPT_SALT_ROUNDS),
      role: 'athlete' as any,
      isEmailVerified: true,
      isSiteAdmin: false,
      coppaStatus: 'not_applicable',
      ...extra,
    })
    .returning();
  return user;
}

async function loginAs(app: Express, username: string) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password: VALID_PASSWORD });
  const cookies = res.headers['set-cookie'];
  return Array.isArray(cookies) ? cookies[0] : cookies;
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
});

afterAll(async () => {
  // Clean up parentAthleteLinks by test prefix
  await db
    .delete(parentAthleteLinks)
    .where(like(parentAthleteLinks.parentEmail, `${TEST_PREFIX}%`))
    .catch(() => {});

  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  await db
    .delete(users)
    .where(like(users.username, `${TEST_PREFIX}%`))
    .catch(() => {});
});

// ============================================================================
// Tests
// ============================================================================

describe("PUT /api/profile — parentEmail field", () => {
  it("minor athlete sets parentEmail → 200, user record updated, link created", async () => {
    const athlete = await createAthlete('minor_link', {
      birthDate: exactlyAge(14),
      isMinor: true,
    });
    createdUserIds.push(athlete.id);

    const cookie = await loginAs(app, athlete.username);
    const parentEmail = `${TEST_PREFIX}parent_minor_${uid()}@example.com`;

    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ parentEmail });

    expect(res.status).toBe(200);

    // Verify the user record was updated
    const [updated] = await db
      .select({ parentEmail: users.parentEmail })
      .from(users)
      .where(eq(users.id, athlete.id))
      .limit(1);

    expect(updated.parentEmail).toBe(parentEmail);

    // Verify parentAthleteLinks row was created
    const links = await db
      .select()
      .from(parentAthleteLinks)
      .where(
        and(
          eq(parentAthleteLinks.athleteUserId, athlete.id),
          eq(parentAthleteLinks.parentEmail, parentEmail.toLowerCase()),
        ),
      );

    expect(links.length).toBe(1);
    expect(links[0].isActive).toBe(true);
  });

  it("adult athlete sets parentEmail → 200, stored but no link created", async () => {
    const athlete = await createAthlete('adult_nol', {
      birthDate: exactlyAge(25),
      isMinor: false,
    });
    createdUserIds.push(athlete.id);

    const cookie = await loginAs(app, athlete.username);
    const parentEmail = `${TEST_PREFIX}parent_adult_${uid()}@example.com`;

    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ parentEmail });

    expect(res.status).toBe(200);

    // Verify the user record was updated
    const [updated] = await db
      .select({ parentEmail: users.parentEmail })
      .from(users)
      .where(eq(users.id, athlete.id))
      .limit(1);

    expect(updated.parentEmail).toBe(parentEmail);

    // No parentAthleteLinks row should exist
    const links = await db
      .select()
      .from(parentAthleteLinks)
      .where(
        and(
          eq(parentAthleteLinks.athleteUserId, athlete.id),
          eq(parentAthleteLinks.parentEmail, parentEmail.toLowerCase()),
        ),
      );

    expect(links.length).toBe(0);
  });

  it("rejects invalid parentEmail format → 400", async () => {
    const athlete = await createAthlete('bad_email', {
      birthDate: exactlyAge(20),
    });
    createdUserIds.push(athlete.id);

    const cookie = await loginAs(app, athlete.username);

    const res = await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ parentEmail: 'not-a-valid-email' });

    expect(res.status).toBe(400);
  });
});
