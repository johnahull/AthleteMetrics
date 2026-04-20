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
  afterAll,
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

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

let app: Express;
let testOrg: any;
let otherOrg: any;
let testCoach: any;
let otherCoach: any;
let testAthlete: any;
let siteAdmin: any;
let coachAuthCookie: string;
let otherCoachAuthCookie: string;
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

  await db.insert(userOrganizations).values([
    { userId: testCoach.id, organizationId: testOrg.id, role: 'coach' },
    { userId: testAthlete.id, organizationId: testOrg.id, role: 'athlete' },
    { userId: otherCoach.id, organizationId: otherOrg.id, role: 'coach' },
  ]);

  const coachLogin = await request(app).post('/api/auth/login').send({
    username: testCoach.username,
    password: 'TestCoach123!',
  });
  coachAuthCookie = coachLogin.headers['set-cookie'][0];

  const otherCoachLogin = await request(app).post('/api/auth/login').send({
    username: otherCoach.username,
    password: 'TestCoach123!',
  });
  otherCoachAuthCookie = otherCoachLogin.headers['set-cookie'][0];

  const athleteLogin = await request(app).post('/api/auth/login').send({
    username: testAthlete.username,
    password: 'TestCoach123!',
  });
  athleteAuthCookie = athleteLogin.headers['set-cookie'][0];

  const siteAdminLogin = await request(app).post('/api/auth/login').send({
    username: siteAdmin.username,
    password: 'TestCoach123!',
  });
  siteAdminAuthCookie = siteAdminLogin.headers['set-cookie'][0];
});

afterEach(async () => {
  const userIds = [testCoach, otherCoach, testAthlete, siteAdmin]
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
  testAthlete = undefined;
  siteAdmin = undefined;
});

afterAll(async () => {
  // nothing — beforeEach/afterEach own their fixtures
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
