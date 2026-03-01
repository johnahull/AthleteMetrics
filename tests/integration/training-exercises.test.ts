/**
 * Integration Tests: Training Exercises Routes
 *
 * Tests exercise CRUD, auth/permission enforcement, and cross-org isolation.
 *
 * Requires a real DB connection (Neon) and NODE_ENV=test.
 */

// Must be set BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import {
  organizations,
  users,
  userOrganizations,
  siteSettings,
  exercises,
  programWorkoutExercises,
  programWorkouts,
  trainingPrograms,
} from '@shared/schema';
import { eq } from 'drizzle-orm';

const TS = Date.now();

let app: express.Application;
let testOrg: any;
let secondOrg: any;
let siteAdmin: any;
let testCoach: any;
let testAthlete: any;
let secondCoach: any;
let createdExerciseId: string;

let siteAdminCookie: string;
let coachCookie: string;
let athleteCookie: string;
let secondCoachCookie: string;

async function enableTrainingForOrg(orgId: string) {
  await db.update(siteSettings).set({ trainingModuleEnabled: true });
  await db.update(organizations).set({ trainingEnabled: true }).where(eq(organizations.id, orgId));
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(
    session({
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
    })
  );

  app.post('/mock-login', async (req: any, res: any) => {
    const { userId, role } = req.body;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    req.session.user = {
      id: user.id,
      emails: user.emails,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      role: role || 'coach',
      isSiteAdmin: user.isSiteAdmin || false,
    };
    res.json({ success: true });
  });

  const { registerAllRoutes } = await import('../../packages/api/routes/index');
  registerAllRoutes(app);

  // Ensure site settings row exists with training enabled
  const existingSettings = await db.select().from(siteSettings).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(siteSettings).values({ aiModel: 'gpt-4o-mini', wellnessModuleEnabled: false, trainingModuleEnabled: true });
  } else {
    await db.update(siteSettings).set({ trainingModuleEnabled: true });
  }

  // Create test organization with training enabled
  const [org] = await db.insert(organizations).values({
    name: `Ex Integration Org ${TS}`,
    orgType: 'club',
    trainingEnabled: true,
  }).returning();
  testOrg = org;

  // Create second org for isolation tests
  const [org2] = await db.insert(organizations).values({
    name: `Ex Integration Org2 ${TS}`,
    orgType: 'club',
    trainingEnabled: true,
  }).returning();
  secondOrg = org2;

  // Create users
  const [admin] = await db.insert(users).values({
    username: `ex_int_admin_${TS}`,
    emails: [`ex_int_admin_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Ex', lastName: 'Admin', fullName: 'Ex Admin',
    isSiteAdmin: true,
  }).returning();
  siteAdmin = admin;

  const [coach] = await db.insert(users).values({
    username: `ex_int_coach_${TS}`,
    emails: [`ex_int_coach_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Ex', lastName: 'Coach', fullName: 'Ex Coach',
    isSiteAdmin: false,
  }).returning();
  testCoach = coach;
  await storage.addUserToOrganization(testCoach.id, testOrg.id, 'coach');

  const [athlete] = await db.insert(users).values({
    username: `ex_int_athlete_${TS}`,
    emails: [`ex_int_athlete_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Ex', lastName: 'Athlete', fullName: 'Ex Athlete',
    isSiteAdmin: false,
  }).returning();
  testAthlete = athlete;
  await storage.addUserToOrganization(testAthlete.id, testOrg.id, 'athlete');

  const [coach2] = await db.insert(users).values({
    username: `ex_int_coach2_${TS}`,
    emails: [`ex_int_coach2_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Ex', lastName: 'Coach2', fullName: 'Ex Coach2',
    isSiteAdmin: false,
  }).returning();
  secondCoach = coach2;
  await storage.addUserToOrganization(secondCoach.id, secondOrg.id, 'coach');

  // Obtain session cookies
  const adminRes = await request(app).post('/mock-login').send({ userId: siteAdmin.id, role: 'site_admin' });
  siteAdminCookie = adminRes.headers['set-cookie']?.[0] || '';

  const coachRes = await request(app).post('/mock-login').send({ userId: testCoach.id, role: 'coach' });
  coachCookie = coachRes.headers['set-cookie']?.[0] || '';

  const athleteRes = await request(app).post('/mock-login').send({ userId: testAthlete.id, role: 'athlete' });
  athleteCookie = athleteRes.headers['set-cookie']?.[0] || '';

  const coach2Res = await request(app).post('/mock-login').send({ userId: secondCoach.id, role: 'coach' });
  secondCoachCookie = coach2Res.headers['set-cookie']?.[0] || '';
});

afterAll(async () => {
  // Clean up in reverse FK order
  if (createdExerciseId) {
    await db.delete(exercises).where(eq(exercises.id, createdExerciseId)).catch(() => {});
  }
  // Delete any exercises created by the test coach
  await db.delete(exercises).where(eq(exercises.organizationId, testOrg.id)).catch(() => {});
  await db.delete(exercises).where(eq(exercises.organizationId, secondOrg.id)).catch(() => {});

  for (const u of [testCoach, testAthlete, secondCoach]) {
    if (!u) continue;
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, u.id)).catch(() => {});
    await db.delete(users).where(eq(users.id, u.id)).catch(() => {});
  }
  if (siteAdmin) await db.delete(users).where(eq(users.id, siteAdmin.id)).catch(() => {});
  if (secondOrg) await db.delete(organizations).where(eq(organizations.id, secondOrg.id)).catch(() => {});
  if (testOrg) await db.delete(organizations).where(eq(organizations.id, testOrg.id)).catch(() => {});
});

// ---------------------------------------------------------------------------
// Auth + permission tests
// ---------------------------------------------------------------------------

describe('GET /api/training/exercises — auth & permissions', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/training/exercises');
    expect(res.status).toBe(401);
  });

  it('returns 403 with Athlete role required message when athlete tries to list', async () => {
    const res = await request(app)
      .get('/api/training/exercises')
      .set('Cookie', athleteCookie);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/coach/i);
  });

  it('returns 200 with empty array for coach in org with no exercises', async () => {
    // Second org has no exercises yet
    const res = await request(app)
      .get('/api/training/exercises')
      .set('Cookie', secondCoachCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/training/exercises
// ---------------------------------------------------------------------------

describe('POST /api/training/exercises', () => {
  it('returns 400 when exerciseType is missing', async () => {
    const res = await request(app)
      .post('/api/training/exercises')
      .set('Cookie', coachCookie)
      .send({ name: 'Missing Type Exercise' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when exerciseType is invalid', async () => {
    const res = await request(app)
      .post('/api/training/exercises')
      .set('Cookie', coachCookie)
      .send({ name: 'Bad Type', exerciseType: 'cardio' });
    expect(res.status).toBe(400);
  });

  it('creates exercise with organizationId from session, not body', async () => {
    const res = await request(app)
      .post('/api/training/exercises')
      .set('Cookie', coachCookie)
      .send({
        name: `Squat ${TS}`,
        exerciseType: 'weighted',
        organizationId: 'should-be-ignored',  // Should be ignored
      });

    expect(res.status).toBe(201);
    expect(res.body.organizationId).toBe(testOrg.id);
    expect(res.body.organizationId).not.toBe('should-be-ignored');
    createdExerciseId = res.body.id;
  });

  it('returns 403 when athlete tries to create exercise', async () => {
    const res = await request(app)
      .post('/api/training/exercises')
      .set('Cookie', athleteCookie)
      .send({ name: 'Athlete Exercise', exerciseType: 'bodyweight' });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Cross-org isolation
// ---------------------------------------------------------------------------

describe('GET /api/training/exercises — cross-org isolation', () => {
  it('org-A coach only sees org-A exercises, not org-B exercises', async () => {
    // Create an exercise in secondOrg
    const res2 = await request(app)
      .post('/api/training/exercises')
      .set('Cookie', secondCoachCookie)
      .send({ name: `SecondOrg Exercise ${TS}`, exerciseType: 'bodyweight' });
    expect(res2.status).toBe(201);

    // Org-A coach lists exercises — should only see org-A exercises
    const listRes = await request(app)
      .get('/api/training/exercises')
      .set('Cookie', coachCookie);
    expect(listRes.status).toBe(200);

    const names = listRes.body.map((e: any) => e.name);
    expect(names).not.toContain(`SecondOrg Exercise ${TS}`);
    // But should contain own exercise
    if (createdExerciseId) {
      expect(names).toContain(`Squat ${TS}`);
    }
  });
});

// ---------------------------------------------------------------------------
// PATCH (update) exercise
// ---------------------------------------------------------------------------

describe('PUT /api/training/exercises/:id', () => {
  it('returns 200 and updated exercise when coach updates their org exercise', async () => {
    if (!createdExerciseId) return;

    const res = await request(app)
      .put(`/api/training/exercises/${createdExerciseId}`)
      .set('Cookie', coachCookie)
      .send({ description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Updated description');
  });

  it('returns 404 when updating exercise from different org', async () => {
    if (!createdExerciseId) return;

    const res = await request(app)
      .put(`/api/training/exercises/${createdExerciseId}`)
      .set('Cookie', secondCoachCookie)
      .send({ description: 'Cross-org hack attempt' });

    expect([403, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// DELETE exercise
// ---------------------------------------------------------------------------

describe('DELETE /api/training/exercises/:id', () => {
  it('returns 404 or 403 when deleting exercise from different org', async () => {
    if (!createdExerciseId) return;

    const res = await request(app)
      .delete(`/api/training/exercises/${createdExerciseId}`)
      .set('Cookie', secondCoachCookie);

    expect([403, 404]).toContain(res.status);
  });

  it('returns 200 when coach archives their own org exercise', async () => {
    // Create a fresh exercise to archive
    const createRes = await request(app)
      .post('/api/training/exercises')
      .set('Cookie', coachCookie)
      .send({ name: `ToDelete ${TS}`, exerciseType: 'plyometric' });
    expect(createRes.status).toBe(201);

    const res = await request(app)
      .delete(`/api/training/exercises/${createRes.body.id}`)
      .set('Cookie', coachCookie);

    // DELETE returns 200 with archived exercise body (soft-delete pattern)
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/archived/i);
  });
});
