/**
 * Integration tests for POST /api/measurements/bulk-delete
 *
 * Covers:
 *   - Org admin bulk-deletes measurements in their own org (200)
 *   - Partial failure: cross-org measurement is rejected, in-org succeeds (207)
 *   - Site admin bulk-deletes across organizations (200)
 *   - Athlete is rejected (403) — bulk delete is admin-only
 *   - Unauthenticated (401)
 *   - Body validation: empty array, oversized, non-uuid (400)
 *   - Idempotency: missing IDs reported in errors[], not crash
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { eq, inArray, and } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import {
  organizations,
  users,
  userOrganizations,
  measurements,
} from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

let app: Express;

let orgA: any;
let orgB: any;
let athleteA: any;
let athleteB: any;
let orgAdmin: any;
let siteAdmin: any;
let coachUser: any;
let guestUser: any;
let athleteUser: any;
let measurementInOrgA: any;
let measurementInOrgB: any;
let athleteOwnMeasurement: any;

let orgAdminCookie: string;
let siteAdminCookie: string;
let coachCookie: string;
let guestCookie: string;
let athleteCookie: string;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

beforeAll(async () => {
  app = express();
  // Trust X-Forwarded-For so each test can claim a unique source IP and
  // avoid sharing the per-route rate-limit bucket (BATCH limit is 10/15min,
  // we run more than 10 cases against this endpoint in this file).
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

// Unique source IP per test to keep each one in its own rate-limit bucket.
let nextTestIp = 1;
function uniqueIp() {
  // 10.0.0.x range is private and won't collide with anything real
  const octet = nextTestIp++;
  return `10.0.0.${octet}`;
}

beforeEach(async () => {
  const ts = Date.now();

  [orgA] = await db.insert(organizations).values({
    name: `Bulk Delete Org A ${ts}`,
    description: 'orgA',
    isActive: true,
  }).returning();

  [orgB] = await db.insert(organizations).values({
    name: `Bulk Delete Org B ${ts}`,
    description: 'orgB',
    isActive: true,
  }).returning();

  const hashed = await hashPassword('TestPass123!');

  [athleteA] = await db.insert(users).values({
    username: `bd_athleteA_${ts}`,
    emails: [`bd_athleteA_${ts}@test.com`],
    password: hashed,
    firstName: 'Athlete',
    lastName: 'A',
    fullName: 'Athlete A',
  }).returning();
  await db.insert(userOrganizations).values({
    userId: athleteA.id,
    organizationId: orgA.id,
    role: 'athlete',
  });

  [athleteB] = await db.insert(users).values({
    username: `bd_athleteB_${ts}`,
    emails: [`bd_athleteB_${ts}@test.com`],
    password: hashed,
    firstName: 'Athlete',
    lastName: 'B',
    fullName: 'Athlete B',
  }).returning();
  await db.insert(userOrganizations).values({
    userId: athleteB.id,
    organizationId: orgB.id,
    role: 'athlete',
  });

  // NOTE: users table has no 'role' column — role is per-organization
  // via userOrganizations.role. Site admin is the only role expressed
  // directly on users via isSiteAdmin: true.
  [orgAdmin] = await db.insert(users).values({
    username: `bd_orgadmin_${ts}`,
    emails: [`bd_orgadmin_${ts}@test.com`],
    password: hashed,
    firstName: 'Org',
    lastName: 'Admin',
    fullName: 'Org Admin',
  }).returning();
  await db.insert(userOrganizations).values({
    userId: orgAdmin.id,
    organizationId: orgA.id,
    role: 'org_admin',
  });

  [siteAdmin] = await db.insert(users).values({
    username: `bd_siteadmin_${ts}`,
    emails: [`bd_siteadmin_${ts}@test.com`],
    password: hashed,
    firstName: 'Site',
    lastName: 'Admin',
    fullName: 'Site Admin',
    isSiteAdmin: true,
  }).returning();

  [coachUser] = await db.insert(users).values({
    username: `bd_coach_${ts}`,
    emails: [`bd_coach_${ts}@test.com`],
    password: hashed,
    firstName: 'Coach',
    lastName: 'User',
    fullName: 'Coach User',
  }).returning();
  await db.insert(userOrganizations).values({
    userId: coachUser.id,
    organizationId: orgA.id,
    role: 'coach',
  });

  [guestUser] = await db.insert(users).values({
    username: `bd_guest_${ts}`,
    emails: [`bd_guest_${ts}@test.com`],
    password: hashed,
    firstName: 'Guest',
    lastName: 'User',
    fullName: 'Guest User',
  }).returning();
  await db.insert(userOrganizations).values({
    userId: guestUser.id,
    organizationId: orgA.id,
    role: 'guest',
  });

  [athleteUser] = await db.insert(users).values({
    username: `bd_loneathlete_${ts}`,
    emails: [`bd_loneathlete_${ts}@test.com`],
    password: hashed,
    firstName: 'Lone',
    lastName: 'Athlete',
    fullName: 'Lone Athlete',
  }).returning();
  await db.insert(userOrganizations).values({
    userId: athleteUser.id,
    organizationId: orgA.id,
    role: 'athlete',
  });

  // Seed one measurement in each org plus one owned by lone athlete
  [measurementInOrgA] = await db.insert(measurements).values({
    userId: athleteA.id,
    organizationId: orgA.id,
    metric: 'VERTICAL_JUMP',
    value: '28',
    units: 'in',
    age: 18,
    date: '2025-03-01',
    submittedBy: orgAdmin.id,
  }).returning();

  [measurementInOrgB] = await db.insert(measurements).values({
    userId: athleteB.id,
    organizationId: orgB.id,
    metric: 'VERTICAL_JUMP',
    value: '30',
    units: 'in',
    age: 19,
    date: '2025-03-01',
    submittedBy: siteAdmin.id,
  }).returning();

  [athleteOwnMeasurement] = await db.insert(measurements).values({
    userId: athleteUser.id,
    organizationId: orgA.id,
    metric: 'VERTICAL_JUMP',
    value: '22',
    units: 'in',
    age: 17,
    date: '2025-03-01',
    submittedBy: athleteUser.id,
  }).returning();

  orgAdminCookie = (await request(app).post('/api/auth/login')
    .send({ username: orgAdmin.username, password: 'TestPass123!' })).headers['set-cookie'][0];
  siteAdminCookie = (await request(app).post('/api/auth/login')
    .send({ username: siteAdmin.username, password: 'TestPass123!' })).headers['set-cookie'][0];
  coachCookie = (await request(app).post('/api/auth/login')
    .send({ username: coachUser.username, password: 'TestPass123!' })).headers['set-cookie'][0];
  guestCookie = (await request(app).post('/api/auth/login')
    .send({ username: guestUser.username, password: 'TestPass123!' })).headers['set-cookie'][0];
  athleteCookie = (await request(app).post('/api/auth/login')
    .send({ username: athleteUser.username, password: 'TestPass123!' })).headers['set-cookie'][0];
});

afterEach(async () => {
  const seededIds = [measurementInOrgA?.id, measurementInOrgB?.id, athleteOwnMeasurement?.id].filter(Boolean);
  if (seededIds.length) {
    await db.delete(measurements).where(inArray(measurements.id, seededIds));
  }
  // Clean up any other measurements created during tests
  await db.delete(measurements).where(inArray(measurements.userId,
    [athleteA?.id, athleteB?.id, athleteUser?.id].filter(Boolean) as string[]));

  await db.delete(userOrganizations).where(inArray(userOrganizations.userId,
    [athleteA?.id, athleteB?.id, orgAdmin?.id, coachUser?.id, guestUser?.id, athleteUser?.id].filter(Boolean) as string[]));
  await db.delete(users).where(inArray(users.id,
    [athleteA?.id, athleteB?.id, orgAdmin?.id, siteAdmin?.id, coachUser?.id, guestUser?.id, athleteUser?.id].filter(Boolean) as string[]));
  await db.delete(organizations).where(inArray(organizations.id,
    [orgA?.id, orgB?.id].filter(Boolean) as string[]));
});

describe('POST /api/measurements/bulk-delete', () => {
  it('401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .send({ measurementIds: [measurementInOrgA.id] });
    expect(res.status).toBe(401);
  });

  it('403 when athlete attempts bulk delete (admin-only endpoint)', async () => {
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', athleteCookie)
      .send({ measurementIds: [athleteOwnMeasurement.id] });
    expect(res.status).toBe(403);
  });

  it('403 when guest with org membership attempts bulk delete', async () => {
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', guestCookie)
      .send({ measurementIds: [measurementInOrgA.id] });
    expect(res.status).toBe(403);

    // Defense-in-depth: measurement must still exist
    const remaining = await db.select().from(measurements)
      .where(eq(measurements.id, measurementInOrgA.id));
    expect(remaining.length).toBe(1);
  });

  it('200 when coach deletes measurements within own org', async () => {
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', coachCookie)
      .send({ measurementIds: [measurementInOrgA.id] });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);
    expect(res.body.failed).toBe(0);

    const remaining = await db.select().from(measurements)
      .where(eq(measurements.id, measurementInOrgA.id));
    expect(remaining.length).toBe(0);
  });

  it('207 when coach attempts cross-org delete (other-org rejected)', async () => {
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', coachCookie)
      .send({ measurementIds: [measurementInOrgB.id] });

    expect(res.status).toBe(207);
    expect(res.body.deleted).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors[0].id).toBe(measurementInOrgB.id);
    expect(res.body.errors[0].message).toMatch(/different organization/i);
    // Enriched message hints at the bulk-delete scoping limitation
    expect(res.body.errors[0].message).toMatch(/scoped to your primary organization/i);

    // Cross-org measurement still exists
    const remaining = await db.select().from(measurements)
      .where(eq(measurements.id, measurementInOrgB.id));
    expect(remaining.length).toBe(1);
  });

  it('207 with deleted=0 when org admin posts only cross-org IDs', async () => {
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', orgAdminCookie)
      .send({ measurementIds: [measurementInOrgB.id] });

    expect(res.status).toBe(207);
    expect(res.body.deleted).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.message).toMatch(/all measurements failed/i);
  });

  it('400 when measurementIds is empty', async () => {
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', orgAdminCookie)
      .send({ measurementIds: [] });
    expect(res.status).toBe(400);
  });

  it('400 when measurementIds contains non-uuid', async () => {
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', orgAdminCookie)
      .send({ measurementIds: ['not-a-uuid'] });
    expect(res.status).toBe(400);
  });

  it('400 when measurementIds exceeds the 100-id cap', async () => {
    // Generate 101 valid UUIDs to exercise the Zod max(100) constraint
    const overSized = Array.from({ length: 101 }, (_, i) => {
      const hex = i.toString(16).padStart(12, '0');
      return `00000000-0000-0000-0000-${hex}`;
    });
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', orgAdminCookie)
      .send({ measurementIds: overSized });
    expect(res.status).toBe(400);
  });

  it('200 when org admin deletes measurements within own org', async () => {
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', orgAdminCookie)
      .send({ measurementIds: [measurementInOrgA.id] });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);
    expect(res.body.failed).toBe(0);
    expect(res.body.errors).toEqual([]);

    const remaining = await db.select().from(measurements)
      .where(eq(measurements.id, measurementInOrgA.id));
    expect(remaining.length).toBe(0);
  });

  it('207 partial success when some measurements belong to different org', async () => {
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', orgAdminCookie)
      .send({ measurementIds: [measurementInOrgA.id, measurementInOrgB.id] });

    expect(res.status).toBe(207);
    expect(res.body.deleted).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors.length).toBe(1);
    expect(res.body.errors[0].id).toBe(measurementInOrgB.id);

    // OrgA measurement should be gone, OrgB measurement should remain
    const orgARemaining = await db.select().from(measurements)
      .where(eq(measurements.id, measurementInOrgA.id));
    const orgBRemaining = await db.select().from(measurements)
      .where(eq(measurements.id, measurementInOrgB.id));
    expect(orgARemaining.length).toBe(0);
    expect(orgBRemaining.length).toBe(1);
  });

  it('200 when site admin deletes measurements across organizations', async () => {
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', siteAdminCookie)
      .send({ measurementIds: [measurementInOrgA.id, measurementInOrgB.id] });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);
    expect(res.body.failed).toBe(0);

    const remaining = await db.select().from(measurements)
      .where(inArray(measurements.id, [measurementInOrgA.id, measurementInOrgB.id]));
    expect(remaining.length).toBe(0);
  });

  it('403 when authenticated user has no organization membership', async () => {
    const ts = Date.now();
    const hashed = await hashPassword('TestPass123!');
    const [orphanUser] = await db.insert(users).values({
      username: `bd_orphan_${ts}`,
      emails: [`bd_orphan_${ts}@test.com`],
      password: hashed,
      firstName: 'Orphan',
      lastName: 'User',
      fullName: 'Orphan User',
    }).returning();

    try {
      // No userOrganizations row inserted — user has no membership.
      // Login still works because session.user.role falls back to 'athlete',
      // but we want to specifically exercise the empty-orgs branch.
      // Promote to coach via a temporary org to log in, then delete the membership.
      const [tempOrg] = await db.insert(organizations).values({
        name: `Bulk Delete Orphan Bridge ${ts}`,
        description: 'temporary',
        isActive: true,
      }).returning();
      await db.insert(userOrganizations).values({
        userId: orphanUser.id,
        organizationId: tempOrg.id,
        role: 'coach',
      });
      const orphanCookie = (await request(app).post('/api/auth/login')
        .send({ username: orphanUser.username, password: 'TestPass123!' })).headers['set-cookie'][0];
      // Drop the membership AFTER login so the session role is 'coach' but the
      // route's storage.getUserOrganizations returns an empty array.
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, orphanUser.id));
      await db.delete(organizations).where(eq(organizations.id, tempOrg.id));

      const res = await request(app)
        .post('/api/measurements/bulk-delete')
        .set('X-Forwarded-For', uniqueIp())
        .set('Cookie', orphanCookie)
        .send({ measurementIds: [measurementInOrgA.id] });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/organization membership/i);

      // Defense-in-depth: targeted measurement still exists
      const remaining = await db.select().from(measurements)
        .where(eq(measurements.id, measurementInOrgA.id));
      expect(remaining.length).toBe(1);
    } finally {
      await db.delete(users).where(eq(users.id, orphanUser.id));
    }
  });

  it('reports missing IDs in errors[] without crashing', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .post('/api/measurements/bulk-delete')
      .set('X-Forwarded-For', uniqueIp())
      .set('Cookie', siteAdminCookie)
      .send({ measurementIds: [measurementInOrgA.id, fakeId] });

    expect(res.status).toBe(207);
    expect(res.body.deleted).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors[0].id).toBe(fakeId);
    expect(res.body.errors[0].message).toMatch(/not found/i);
  });
});
