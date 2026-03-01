/**
 * Integration Tests: Training Programs Routes
 *
 * Tests program CRUD, workout day management, exercise prescription routes.
 */

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
  trainingPrograms,
  programWorkouts,
  programWorkoutExercises,
} from '@shared/schema';
import { eq } from 'drizzle-orm';

const TS = Date.now();

let app: express.Application;
let testOrg: any;
let secondOrg: any;
let testCoach: any;
let secondCoach: any;
let testExercise: any;
let createdProgramId: string;
let createdWorkoutDayId: string;

let coachCookie: string;
let secondCoachCookie: string;

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

  // Ensure training is globally enabled
  const existingSettings = await db.select().from(siteSettings).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(siteSettings).values({ aiModel: 'gpt-4o-mini', wellnessModuleEnabled: false, trainingModuleEnabled: true });
  } else {
    await db.update(siteSettings).set({ trainingModuleEnabled: true });
  }

  const [org] = await db.insert(organizations).values({
    name: `Prog Int Org ${TS}`, orgType: 'club', trainingEnabled: true,
  }).returning();
  testOrg = org;

  const [org2] = await db.insert(organizations).values({
    name: `Prog Int Org2 ${TS}`, orgType: 'club', trainingEnabled: true,
  }).returning();
  secondOrg = org2;

  const [coach] = await db.insert(users).values({
    username: `prog_int_coach_${TS}`,
    emails: [`prog_int_coach_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Prog', lastName: 'Coach', fullName: 'Prog Coach',
    isSiteAdmin: false,
  }).returning();
  testCoach = coach;
  await storage.addUserToOrganization(testCoach.id, testOrg.id, 'coach');

  const [coach2] = await db.insert(users).values({
    username: `prog_int_coach2_${TS}`,
    emails: [`prog_int_coach2_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Prog', lastName: 'Coach2', fullName: 'Prog Coach2',
    isSiteAdmin: false,
  }).returning();
  secondCoach = coach2;
  await storage.addUserToOrganization(secondCoach.id, secondOrg.id, 'coach');

  // Create a test exercise for prescription tests
  const [ex] = await db.insert(exercises).values({
    organizationId: testOrg.id,
    name: `Prog Test Exercise ${TS}`,
    exerciseType: 'weighted',
    isActive: true,
  }).returning();
  testExercise = ex;

  const coachRes = await request(app).post('/mock-login').send({ userId: testCoach.id, role: 'coach' });
  coachCookie = coachRes.headers['set-cookie']?.[0] || '';

  const coach2Res = await request(app).post('/mock-login').send({ userId: secondCoach.id, role: 'coach' });
  secondCoachCookie = coach2Res.headers['set-cookie']?.[0] || '';
});

afterAll(async () => {
  // Clean up prescriptions → workout days → programs → exercises → users → orgs
  await db.delete(programWorkoutExercises)
    .where(eq(programWorkoutExercises.exerciseId, testExercise?.id)).catch(() => {});

  if (createdProgramId) {
    await db.delete(programWorkouts).where(eq(programWorkouts.programId, createdProgramId)).catch(() => {});
    await db.delete(trainingPrograms).where(eq(trainingPrograms.id, createdProgramId)).catch(() => {});
  }
  // Delete any programs created in secondOrg
  await db.delete(trainingPrograms).where(eq(trainingPrograms.organizationId, secondOrg?.id)).catch(() => {});

  if (testExercise) await db.delete(exercises).where(eq(exercises.id, testExercise.id)).catch(() => {});

  for (const u of [testCoach, secondCoach]) {
    if (!u) continue;
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, u.id)).catch(() => {});
    await db.delete(users).where(eq(users.id, u.id)).catch(() => {});
  }
  if (secondOrg) await db.delete(organizations).where(eq(organizations.id, secondOrg.id)).catch(() => {});
  if (testOrg) await db.delete(organizations).where(eq(organizations.id, testOrg.id)).catch(() => {});
});

// ---------------------------------------------------------------------------
// Program CRUD
// ---------------------------------------------------------------------------

describe('POST /api/training/programs', () => {
  it('returns 400 when durationWeeks is missing', async () => {
    const res = await request(app)
      .post('/api/training/programs')
      .set('Cookie', coachCookie)
      .send({ name: 'No Duration' });
    expect(res.status).toBe(400);
  });

  it('creates program with organizationId from session', async () => {
    const res = await request(app)
      .post('/api/training/programs')
      .set('Cookie', coachCookie)
      .send({ name: `Test Program ${TS}`, durationWeeks: 4 });

    expect(res.status).toBe(201);
    expect(res.body.organizationId).toBe(testOrg.id);
    expect(res.body.durationWeeks).toBe(4);
    createdProgramId = res.body.id;
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/training/programs')
      .set('Cookie', coachCookie)
      .send({ durationWeeks: 2 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/training/programs', () => {
  it('returns programs list for coach', async () => {
    const res = await request(app)
      .get('/api/training/programs')
      .set('Cookie', coachCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const names = res.body.map((p: any) => p.name);
    expect(names).toContain(`Test Program ${TS}`);
  });

  it('does not return programs from other org to second coach', async () => {
    const res = await request(app)
      .get('/api/training/programs')
      .set('Cookie', secondCoachCookie);
    expect(res.status).toBe(200);
    const names = res.body.map((p: any) => p.name);
    expect(names).not.toContain(`Test Program ${TS}`);
  });
});

// ---------------------------------------------------------------------------
// Workout Day management
// ---------------------------------------------------------------------------

describe('POST /api/training/programs/:id/workouts', () => {
  it('adds a workout day to the program', async () => {
    if (!createdProgramId) return;

    const res = await request(app)
      .post(`/api/training/programs/${createdProgramId}/workouts`)
      .set('Cookie', coachCookie)
      .send({ name: 'Day 1 — Upper Body' });

    expect(res.status).toBe(201);
    expect(res.body.programId).toBe(createdProgramId);
    expect(res.body.dayNumber).toBeGreaterThanOrEqual(1);
    createdWorkoutDayId = res.body.id;
  });

  it('returns 403 or 404 when coach from other org tries to add day', async () => {
    if (!createdProgramId) return;

    const res = await request(app)
      .post(`/api/training/programs/${createdProgramId}/workouts`)
      .set('Cookie', secondCoachCookie)
      .send({ name: 'Unauthorized Day' });

    expect([403, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Exercise prescription
// ---------------------------------------------------------------------------

describe('POST /api/training/programs/:programId/workouts/:workoutId/exercises', () => {
  it('adds exercise to workout day', async () => {
    if (!createdProgramId || !createdWorkoutDayId || !testExercise) return;

    const res = await request(app)
      .post(`/api/training/programs/${createdProgramId}/workouts/${createdWorkoutDayId}/exercises`)
      .set('Cookie', coachCookie)
      .send({
        exerciseId: testExercise.id,
        prescribedSets: 3,
        prescribedReps: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.exerciseId).toBe(testExercise.id);
    expect(res.body.prescribedSets).toBe(3);
  });

  it('returns 400 when exerciseId is missing', async () => {
    if (!createdProgramId || !createdWorkoutDayId) return;

    const res = await request(app)
      .post(`/api/training/programs/${createdProgramId}/workouts/${createdWorkoutDayId}/exercises`)
      .set('Cookie', coachCookie)
      .send({ prescribedSets: 3 });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET program with nested workout days
// ---------------------------------------------------------------------------

describe('GET /api/training/programs/:id', () => {
  it('returns program with nested workout days and exercises', async () => {
    if (!createdProgramId) return;

    const res = await request(app)
      .get(`/api/training/programs/${createdProgramId}`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdProgramId);
    // Service returns { ...program, workouts: [...] }
    expect(Array.isArray(res.body.workouts)).toBe(true);
    if (res.body.workouts.length > 0) {
      expect(Array.isArray(res.body.workouts[0].exercises)).toBe(true);
    }
  });

  it('returns 404 or 403 when program from other org is requested', async () => {
    if (!createdProgramId) return;

    const res = await request(app)
      .get(`/api/training/programs/${createdProgramId}`)
      .set('Cookie', secondCoachCookie);

    expect([403, 404]).toContain(res.status);
  });
});
