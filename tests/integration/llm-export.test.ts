/**
 * Integration tests for the LLM export route.
 *
 * Verifies:
 *   - auth gate (401 without session)
 *   - cross-org access denial (403)
 *   - markdown + json format selection
 *   - Content-Type and Content-Disposition headers
 *   - missing-data resilience (athlete with no measurements still renders all sections)
 */

// Env must be set before any imports that read process.env.
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET =
  'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { db } from '../../packages/api/db';
import {
  organizations,
  users,
  userOrganizations,
} from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';
import { storage } from '../../packages/api/storage';

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

let app: Express;
let testOrg: any;
let otherOrg: any;
let testCoach: any;
let otherCoach: any;
let testOrgAdmin: any;
let testAthlete: any;
let siteAdmin: any;
let coachAuthCookie: string;
let otherCoachAuthCookie: string;
let orgAdminAuthCookie: string;
let athleteAuthCookie: string;
let siteAdminAuthCookie: string;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

beforeEach(async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  [testOrg] = await db
    .insert(organizations)
    .values({
      name: `LLM Export Org ${suffix}`,
      description: 'Test org for llm export integration tests',
      isActive: true,
    })
    .returning();

  [otherOrg] = await db
    .insert(organizations)
    .values({
      name: `Other Org ${suffix}`,
      description: 'Outside org',
      isActive: true,
    })
    .returning();

  const hashedPassword = await hashPassword('TestCoach123!');

  [testCoach] = await db
    .insert(users)
    .values({
      username: `llmexport_coach_${suffix}`,
      emails: [`llmexport_coach_${suffix}@test.com`],
      password: hashedPassword,
      firstName: 'Coach',
      lastName: 'One',
      fullName: 'Coach One',
    })
    .returning();

  [otherCoach] = await db
    .insert(users)
    .values({
      username: `llmexport_other_${suffix}`,
      emails: [`llmexport_other_${suffix}@test.com`],
      password: hashedPassword,
      firstName: 'Coach',
      lastName: 'Two',
      fullName: 'Coach Two',
    })
    .returning();

  [testOrgAdmin] = await db
    .insert(users)
    .values({
      username: `llmexport_orgadmin_${suffix}`,
      emails: [`llmexport_orgadmin_${suffix}@test.com`],
      password: hashedPassword,
      firstName: 'Org',
      lastName: 'Admin',
      fullName: 'Org Admin',
    })
    .returning();

  [testAthlete] = await db
    .insert(users)
    .values({
      username: `llmexport_athlete_${suffix}`,
      emails: [`llmexport_athlete_${suffix}@test.com`],
      password: hashedPassword,
      firstName: 'Jane',
      lastName: 'Doe',
      fullName: 'Jane Doe',
    })
    .returning();

  [siteAdmin] = await db
    .insert(users)
    .values({
      username: `llmexport_siteadmin_${suffix}`,
      emails: [`llmexport_siteadmin_${suffix}@test.com`],
      password: hashedPassword,
      firstName: 'Site',
      lastName: 'Admin',
      fullName: 'Site Admin',
      isSiteAdmin: true,
    })
    .returning();

  // These users have no `role` column set on `users` — it's only set on
  // `userOrganizations`. At login, `determineUserRoleAndContext` resolves
  // the session role from the first `userOrganizations` row for the user,
  // which is how `req.session.user.role` picks up 'coach' / 'org_admin' /
  // 'athlete' below. If that resolution ever moves back to `users.role`,
  // these fixtures would silently stop reflecting the intended role.
  await db.insert(userOrganizations).values([
    { userId: testCoach.id, organizationId: testOrg.id, role: 'coach' },
    { userId: testOrgAdmin.id, organizationId: testOrg.id, role: 'org_admin' },
    { userId: testAthlete.id, organizationId: testOrg.id, role: 'athlete' },
    { userId: otherCoach.id, organizationId: otherOrg.id, role: 'coach' },
  ]);

  // Assert login status on every fixture login. A silent 401 here would let
  // subsequent tests fail with a cryptic "Cannot read property '0' of undefined"
  // when they try to read set-cookie — hard to diagnose. Explicit assertions
  // fail the test at the actual point of fixture drift.
  const coachLogin = await request(app).post('/api/auth/login').send({
    username: testCoach.username,
    password: 'TestCoach123!',
  });
  expect(coachLogin.status).toBe(200);
  coachAuthCookie = coachLogin.headers['set-cookie'][0];

  const otherCoachLogin = await request(app).post('/api/auth/login').send({
    username: otherCoach.username,
    password: 'TestCoach123!',
  });
  expect(otherCoachLogin.status).toBe(200);
  otherCoachAuthCookie = otherCoachLogin.headers['set-cookie'][0];

  const orgAdminLogin = await request(app).post('/api/auth/login').send({
    username: testOrgAdmin.username,
    password: 'TestCoach123!',
  });
  expect(orgAdminLogin.status).toBe(200);
  orgAdminAuthCookie = orgAdminLogin.headers['set-cookie'][0];

  const athleteLogin = await request(app).post('/api/auth/login').send({
    username: testAthlete.username,
    password: 'TestCoach123!',
  });
  expect(athleteLogin.status).toBe(200);
  athleteAuthCookie = athleteLogin.headers['set-cookie'][0];

  const siteAdminLogin = await request(app).post('/api/auth/login').send({
    username: siteAdmin.username,
    password: 'TestCoach123!',
  });
  expect(siteAdminLogin.status).toBe(200);
  siteAdminAuthCookie = siteAdminLogin.headers['set-cookie'][0];
});

afterEach(async () => {
  const userIds = [testCoach, otherCoach, testOrgAdmin, testAthlete, siteAdmin]
    .filter(Boolean)
    .map((u) => u.id);
  if (userIds.length > 0) {
    for (const id of userIds) {
      await db
        .delete(userOrganizations)
        .where(eq(userOrganizations.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  }
  for (const org of [testOrg, otherOrg].filter(Boolean)) {
    await db.delete(organizations).where(eq(organizations.id, org.id));
  }
  testOrg = undefined;
  otherOrg = undefined;
  testCoach = undefined;
  otherCoach = undefined;
  testOrgAdmin = undefined;
  testAthlete = undefined;
  siteAdmin = undefined;
});

describe('GET /api/athletes/:id/llm-export', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get(
      `/api/athletes/${testAthlete.id}/llm-export`,
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 markdown by default', async () => {
    const res = await request(app)
      .get(`/api/athletes/${testAthlete.id}/llm-export`)
      .set('Cookie', coachAuthCookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/markdown/);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="jane-doe-\d{4}-\d{2}-\d{2}\.md"/,
    );
    expect(res.text).toMatch(/^# Athlete Performance Export — Jane Doe/m);
  });

  it('returns 200 JSON when format=json', async () => {
    const res = await request(app)
      .get(`/api/athletes/${testAthlete.id}/llm-export?format=json`)
      .set('Cookie', coachAuthCookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="jane-doe-\d{4}-\d{2}-\d{2}\.json"/,
    );

    const body = JSON.parse(res.text);
    expect(body.athlete.fullName).toBe('Jane Doe');
    expect(body.athlete.id).toBe(testAthlete.id);
    // Empty-athlete safety: sections exist, arrays/maps are empty, no crash.
    expect(body.currentSnapshot).toEqual([]);
    expect(body.measurementHistory).toEqual({});
    expect(body.sprintFv).toBeNull();
    expect(body.activeGoals).toEqual([]);
    expect(body.recentWellness).toEqual([]);
  });

  it('returns 400 for an unsupported format', async () => {
    const res = await request(app)
      .get(`/api/athletes/${testAthlete.id}/llm-export?format=pdf`)
      .set('Cookie', coachAuthCookie);
    expect(res.status).toBe(400);
  });

  it('returns 404 (not 500) for a non-UUID athlete id', async () => {
    // Regression: without an up-front UUID guard, postgres raises
    // "invalid input syntax for type uuid" when the route-level
    // `storage.getAthlete(athleteId)` hits a UUID column with garbage
    // input. That error is not caught by the `AthleteNotFoundError`
    // branch and surfaces as a generic 500, which is both a poor UX and
    // a weak signal (a deliberate 404 is harder to distinguish from
    // "athlete exists but you can't read it" — consistent with the
    // existing role-check-before-lookup design).
    const res = await request(app)
      .get('/api/athletes/not-a-uuid/llm-export')
      .set('Cookie', coachAuthCookie);
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/athlete not found/i);
  });

  it('returns 403 when a coach has lost all org memberships since login (userOrgs.length === 0)', async () => {
    // Simulate a session that persists past a permission revocation: the coach
    // logged in while a member of testOrg, then had that membership removed
    // (e.g. offboarded from the org). Their session still carries role='coach'
    // but getCachedUserOrganizations now returns empty. The route should
    // short-circuit on that lookup, not fall through to the shared-org check.
    //
    // Security-audit requirement: a revoked coach probing the endpoint must
    // leave an authorization_failed event in the audit log so the pattern is
    // detectable (repeated probes from a deactivated account is a signal).
    await db
      .delete(userOrganizations)
      .where(
        and(
          eq(userOrganizations.userId, testCoach.id),
          eq(userOrganizations.organizationId, testOrg.id),
        ),
      );

    const createSecurityEventSpy = vi
      .spyOn(storage, 'createSecurityEvent')
      .mockResolvedValue(undefined as any);

    const res = await request(app)
      .get(`/api/athletes/${testAthlete.id}/llm-export`)
      .set('Cookie', coachAuthCookie);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/no organization access/i);

    expect(createSecurityEventSpy).toHaveBeenCalledTimes(1);
    const [securityEvent] = createSecurityEventSpy.mock.calls[0];
    expect(securityEvent.eventType).toBe('authorization_failed');
    expect(securityEvent.userId).toBe(testCoach.id);
    expect(securityEvent.eventData).toContain('"resource":"athlete"');
    expect(securityEvent.eventData).toContain('"action":"read"');

    createSecurityEventSpy.mockRestore();
  });

  it('returns 403 when a coach from another org requests the athlete', async () => {
    const res = await request(app)
      .get(`/api/athletes/${testAthlete.id}/llm-export`)
      .set('Cookie', otherCoachAuthCookie);
    expect(res.status).toBe(403);
  });

  it('returns 403 for an athlete attempting to export their own profile (policy denial — coaching tool only)', async () => {
    const res = await request(app)
      .get(`/api/athletes/${testAthlete.id}/llm-export`)
      .set('Cookie', athleteAuthCookie);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/coaches and organization admins/i);
  });

  it('returns 200 for an org_admin exporting an in-org athlete', async () => {
    const res = await request(app)
      .get(`/api/athletes/${testAthlete.id}/llm-export`)
      .set('Cookie', orgAdminAuthCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/markdown/);
    expect(res.text).toMatch(/^# Athlete Performance Export — Jane Doe/m);
  });

  it('returns 200 for a site admin exporting any athlete', async () => {
    const res = await request(app)
      .get(`/api/athletes/${testAthlete.id}/llm-export`)
      .set('Cookie', siteAdminAuthCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/markdown/);
  });

  it('returns 404 for a non-existent athlete id', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .get(`/api/athletes/${fakeId}/llm-export`)
      .set('Cookie', coachAuthCookie);
    expect(res.status).toBe(404);
  });

  it('returns 403 (not 404) when a role-denied user probes a non-existent athlete id', async () => {
    // An athlete-role caller must not be able to use 404 vs 403 as an
    // existence oracle. Role denial should take precedence over resource
    // lookup, so a caller without permission sees the same 403 whether the
    // target exists or not.
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .get(`/api/athletes/${fakeId}/llm-export`)
      .set('Cookie', athleteAuthCookie);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/coaches and organization admins/i);
  });

  it('renders every H2 section placeholder even when athlete has no data', async () => {
    const res = await request(app)
      .get(`/api/athletes/${testAthlete.id}/llm-export`)
      .set('Cookie', coachAuthCookie);
    expect(res.status).toBe(200);
    for (const section of [
      '## Athlete Profile',
      '## Current Performance Snapshot',
      '## 12-Month Measurement History',
      '## Sprint Force-Velocity Profile',
      '## Active Goals',
      '## Recent Wellness',
      '## Medical & Coach Notes',
      '## Metric Glossary',
    ]) {
      expect(res.text).toContain(section);
    }
  });
});
