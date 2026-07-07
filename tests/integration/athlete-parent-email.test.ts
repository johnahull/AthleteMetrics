/**
 * Integration tests — parentEmail field on PUT /api/athletes/:id
 *
 * TDD Phase 2: RED — these tests are written before the implementation.
 * They should FAIL until Phase 2 GREEN is applied.
 *
 * Run:
 *   export $(cat .env | xargs) && npm run test:run -- tests/integration/athlete-parent-email.test.ts
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
import { users, organizations } from '@shared/schema/tables/core';
import { userOrganizations } from '@shared/schema/tables/membership';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { eq, and, like } from 'drizzle-orm';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

// Mock Vite and email service before importing registerRoutes
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

const TEST_PREFIX = 'paemail_test_';
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

/** Build a YYYY-MM-DD date string for a minor (14 years old by default) */
function minorBirthDate(): string {
  return exactlyAge(14);
}

/** Build a YYYY-MM-DD date string for an adult (25 years old) */
function adultBirthDate(): string {
  return exactlyAge(25);
}

async function createUser(
  suffix: string,
  role: string = 'athlete',
  extra: Record<string, unknown> = {},
) {
  const id = uid();
  const [user] = await db
    .insert(users)
    .values({
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
      ...extra,
    })
    .returning();
  return user;
}

async function createOrg(suffix: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name: `${TEST_PREFIX}org_${suffix}`, orgType: 'club' })
    .returning();
  return org;
}

async function addUserToOrg(userId: string, orgId: string, role: string) {
  await db
    .insert(userOrganizations)
    .values({ userId, organizationId: orgId, role })
    .onConflictDoNothing();
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
let coachUser: any;
let orgAdminUser: any;
let testOrg: any;
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to run integration tests.');
  }

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  testOrg = await createOrg(uid());
  createdOrgIds.push(testOrg.id);

  coachUser = await createUser('coach', 'coach');
  createdUserIds.push(coachUser.id);
  await addUserToOrg(coachUser.id, testOrg.id, 'coach');

  orgAdminUser = await createUser('orgadmin', 'org_admin');
  createdUserIds.push(orgAdminUser.id);
  await addUserToOrg(orgAdminUser.id, testOrg.id, 'org_admin');
});

afterAll(async () => {
  // Clean up parentAthleteLinks by test prefix
  await db
    .delete(parentAthleteLinks)
    .where(like(parentAthleteLinks.parentEmail, `${TEST_PREFIX}%`))
    .catch(() => {});

  // Clean up users
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  await db
    .delete(users)
    .where(like(users.username, `${TEST_PREFIX}%`))
    .catch(() => {});

  // Clean up orgs
  for (const id of createdOrgIds) {
    await db.delete(organizations).where(eq(organizations.id, id)).catch(() => {});
  }
});

// ============================================================================
// Tests
// ============================================================================

describe("PUT /api/athletes/:id — parentEmail field", () => {
  it("sets parentEmail on the user record", async () => {
    const athlete = await createUser('athlete_setpe', 'athlete', {
      birthDate: adultBirthDate(),
    });
    createdUserIds.push(athlete.id);
    await addUserToOrg(athlete.id, testOrg.id, 'athlete');

    const cookie = await loginAs(app, orgAdminUser.username);
    const parentEmail = `${TEST_PREFIX}parent_set_${uid()}@example.com`;

    const res = await request(app)
      .put(`/api/athletes/${athlete.id}`)
      .set('Cookie', cookie)
      .send({ parentEmail });

    expect(res.status).toBe(200);

    // Verify the users.parent_email column was updated in the DB
    const [updated] = await db
      .select({ parentEmail: users.parentEmail })
      .from(users)
      .where(eq(users.id, athlete.id))
      .limit(1);

    expect(updated.parentEmail).toBe(parentEmail);
  });

  it("creates a parentAthleteLinks row for a minor athlete", async () => {
    const athlete = await createUser('athlete_minorlink', 'athlete', {
      birthDate: minorBirthDate(),
      isMinor: true,
    });
    createdUserIds.push(athlete.id);
    await addUserToOrg(athlete.id, testOrg.id, 'athlete');

    const cookie = await loginAs(app, orgAdminUser.username);
    const parentEmail = `${TEST_PREFIX}parent_minor_${uid()}@example.com`;

    const res = await request(app)
      .put(`/api/athletes/${athlete.id}`)
      .set('Cookie', cookie)
      .send({ parentEmail });

    expect(res.status).toBe(200);

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

  it("scopes the parentAthleteLinks row to the authorizing org, not the alphabetically-first org", async () => {
    // Athlete belongs to two orgs. getUserOrganizations orders by name, so the
    // "apex" org sorts first — but the requester is org_admin only in the later
    // "zebra" org. The link must be attributed to the authorizing (zebra) org.
    const apexOrg = await createOrg(`aaa_${uid()}`);
    createdOrgIds.push(apexOrg.id);
    const zebraOrg = await createOrg(`zzz_${uid()}`);
    createdOrgIds.push(zebraOrg.id);

    const athlete = await createUser('athlete_multiorg', 'athlete', {
      birthDate: minorBirthDate(),
      isMinor: true,
    });
    createdUserIds.push(athlete.id);
    await addUserToOrg(athlete.id, apexOrg.id, 'athlete');
    await addUserToOrg(athlete.id, zebraOrg.id, 'athlete');

    const admin = await createUser('multiorg_admin', 'org_admin');
    createdUserIds.push(admin.id);
    await addUserToOrg(admin.id, zebraOrg.id, 'org_admin');

    const cookie = await loginAs(app, admin.username);
    const parentEmail = `${TEST_PREFIX}parent_multiorg_${uid()}@example.com`;

    const res = await request(app)
      .put(`/api/athletes/${athlete.id}`)
      .set('Cookie', cookie)
      .send({ parentEmail });

    expect(res.status).toBe(200);

    const links = await db
      .select({ organizationId: parentAthleteLinks.organizationId })
      .from(parentAthleteLinks)
      .where(
        and(
          eq(parentAthleteLinks.athleteUserId, athlete.id),
          eq(parentAthleteLinks.parentEmail, parentEmail.toLowerCase()),
        ),
      );

    expect(links.length).toBe(1);
    expect(links[0].organizationId).toBe(zebraOrg.id);
  });

  it("does NOT create a parentAthleteLinks row for an adult athlete", async () => {
    const athlete = await createUser('athlete_adult_nol', 'athlete', {
      birthDate: adultBirthDate(),
      isMinor: false,
    });
    createdUserIds.push(athlete.id);
    await addUserToOrg(athlete.id, testOrg.id, 'athlete');

    const cookie = await loginAs(app, orgAdminUser.username);
    const parentEmail = `${TEST_PREFIX}parent_adult_${uid()}@example.com`;

    const res = await request(app)
      .put(`/api/athletes/${athlete.id}`)
      .set('Cookie', cookie)
      .send({ parentEmail });

    expect(res.status).toBe(200);

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

  it("clears parentEmail when set to null", async () => {
    const athlete = await createUser('athlete_clearpe', 'athlete', {
      birthDate: adultBirthDate(),
      parentEmail: `${TEST_PREFIX}old_parent@example.com`,
    });
    createdUserIds.push(athlete.id);
    await addUserToOrg(athlete.id, testOrg.id, 'athlete');

    const cookie = await loginAs(app, orgAdminUser.username);

    const res = await request(app)
      .put(`/api/athletes/${athlete.id}`)
      .set('Cookie', cookie)
      .send({ parentEmail: null });

    expect(res.status).toBe(200);

    const [updated] = await db
      .select({ parentEmail: users.parentEmail })
      .from(users)
      .where(eq(users.id, athlete.id))
      .limit(1);

    expect(updated.parentEmail).toBeNull();
  });

  it("skips duplicate link if one already exists for the same parentEmail", async () => {
    const athlete = await createUser('athlete_nodup', 'athlete', {
      birthDate: minorBirthDate(),
      isMinor: true,
    });
    createdUserIds.push(athlete.id);
    await addUserToOrg(athlete.id, testOrg.id, 'athlete');

    const parentEmail = `${TEST_PREFIX}parent_nodup_${uid()}@example.com`;

    // Pre-create a link row so it's a "duplicate" scenario
    await db.insert(parentAthleteLinks).values({
      parentEmail: parentEmail.toLowerCase(),
      athleteUserId: athlete.id,
      isActive: true,
    });

    const cookie = await loginAs(app, orgAdminUser.username);

    const res = await request(app)
      .put(`/api/athletes/${athlete.id}`)
      .set('Cookie', cookie)
      .send({ parentEmail });

    expect(res.status).toBe(200);

    // Still only 1 link row (no duplicate)
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
  });

  it("rejects invalid email format in parentEmail → 400", async () => {
    const athlete = await createUser('athlete_bademail', 'athlete', {
      birthDate: adultBirthDate(),
    });
    createdUserIds.push(athlete.id);
    await addUserToOrg(athlete.id, testOrg.id, 'athlete');

    const cookie = await loginAs(app, orgAdminUser.username);

    const res = await request(app)
      .put(`/api/athletes/${athlete.id}`)
      .set('Cookie', cookie)
      .send({ parentEmail: 'not-a-valid-email' });

    expect(res.status).toBe(400);
  });

  // Security fix (issue #348): a coach could otherwise set parentEmail to any
  // address, creating a parentAthleteLinks row and sending that address a
  // notification containing the minor's name — with no org_admin approval.
  it("coach role → 403, parentEmail is not updated", async () => {
    const athlete = await createUser('athlete_coachdenied', 'athlete', {
      birthDate: adultBirthDate(),
    });
    createdUserIds.push(athlete.id);
    await addUserToOrg(athlete.id, testOrg.id, 'athlete');

    const cookie = await loginAs(app, coachUser.username);
    const parentEmail = `${TEST_PREFIX}parent_coachdenied_${uid()}@example.com`;

    const res = await request(app)
      .put(`/api/athletes/${athlete.id}`)
      .set('Cookie', cookie)
      .send({ parentEmail });

    expect(res.status).toBe(403);

    const [updated] = await db
      .select({ parentEmail: users.parentEmail })
      .from(users)
      .where(eq(users.id, athlete.id))
      .limit(1);

    expect(updated.parentEmail).toBeNull();
  });

  // A coach must still be able to update other athlete fields — only
  // parentEmail is gated to org_admin/site_admin.
  it("coach role → other fields still update successfully", async () => {
    const athlete = await createUser('athlete_coachother', 'athlete', {
      birthDate: adultBirthDate(),
    });
    createdUserIds.push(athlete.id);
    await addUserToOrg(athlete.id, testOrg.id, 'athlete');

    const cookie = await loginAs(app, coachUser.username);

    const res = await request(app)
      .put(`/api/athletes/${athlete.id}`)
      .set('Cookie', cookie)
      .send({ firstName: 'Updated' });

    expect(res.status).toBe(200);
  });

  // Security fix: org_admin status must be scoped to an org shared with the
  // target athlete. A user who is only a coach in the athlete's org, but
  // org_admin in a wholly unrelated org, must not be able to combine the two
  // memberships to bypass the parentEmail restriction.
  it("coach in athlete's org + org_admin in an unrelated org → 403", async () => {
    const otherOrg = await createOrg(uid());
    createdOrgIds.push(otherOrg.id);

    const confusedDeputy = await createUser('confused_deputy', 'coach');
    createdUserIds.push(confusedDeputy.id);
    await addUserToOrg(confusedDeputy.id, testOrg.id, 'coach');
    await addUserToOrg(confusedDeputy.id, otherOrg.id, 'org_admin');

    const athlete = await createUser('athlete_confuseddep', 'athlete', {
      birthDate: adultBirthDate(),
    });
    createdUserIds.push(athlete.id);
    await addUserToOrg(athlete.id, testOrg.id, 'athlete');

    const cookie = await loginAs(app, confusedDeputy.username);
    const parentEmail = `${TEST_PREFIX}parent_confuseddep_${uid()}@example.com`;

    const res = await request(app)
      .put(`/api/athletes/${athlete.id}`)
      .set('Cookie', cookie)
      .send({ parentEmail });

    expect(res.status).toBe(403);

    const [updated] = await db
      .select({ parentEmail: users.parentEmail })
      .from(users)
      .where(eq(users.id, athlete.id))
      .limit(1);

    expect(updated.parentEmail).toBeNull();
  });
});
