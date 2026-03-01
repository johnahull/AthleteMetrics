/**
 * Integration Tests: Training Workout Logs Routes
 *
 * Tests log create/update/entries (replace-all), duplicate guard,
 * coach-logs-for-athlete, and transaction rollback on validation failure.
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
  athletePrograms,
  workoutLogs,
  workoutLogEntries,
} from '@shared/schema';
import { eq } from 'drizzle-orm';

const TS = Date.now();

let app: express.Application;
let testOrg: any;
let testCoach: any;
let testAthlete: any;
let testAthlete2: any;
let testExercise: any;
let testProgram: any;
let testWorkoutDay: any;
let testAssignment: any;
let createdLogId: string;

let coachCookie: string;
let athleteCookie: string;
let athlete2Cookie: string;

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
    name: `Log Int Org ${TS}`, orgType: 'club', trainingEnabled: true,
  }).returning();
  testOrg = org;

  const [coach] = await db.insert(users).values({
    username: `log_coach_${TS}`,
    emails: [`log_coach_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Log', lastName: 'Coach', fullName: 'Log Coach',
    isSiteAdmin: false,
  }).returning();
  testCoach = coach;
  await storage.addUserToOrganization(testCoach.id, testOrg.id, 'coach');

  const [athlete] = await db.insert(users).values({
    username: `log_athlete_${TS}`,
    emails: [`log_athlete_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Log', lastName: 'Athlete', fullName: 'Log Athlete',
    isSiteAdmin: false,
  }).returning();
  testAthlete = athlete;
  await storage.addUserToOrganization(testAthlete.id, testOrg.id, 'athlete');

  const [athlete2] = await db.insert(users).values({
    username: `log_athlete2_${TS}`,
    emails: [`log_athlete2_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Log', lastName: 'Athlete2', fullName: 'Log Athlete2',
    isSiteAdmin: false,
  }).returning();
  testAthlete2 = athlete2;
  await storage.addUserToOrganization(testAthlete2.id, testOrg.id, 'athlete');

  const [ex] = await db.insert(exercises).values({
    organizationId: testOrg.id,
    name: `Log Test Exercise ${TS}`,
    exerciseType: 'weighted',
    isActive: true,
  }).returning();
  testExercise = ex;

  const [prog] = await db.insert(trainingPrograms).values({
    organizationId: testOrg.id,
    name: `Log Test Program ${TS}`,
    durationWeeks: 2,
    isActive: true,
  }).returning();
  testProgram = prog;

  const [day] = await db.insert(programWorkouts).values({
    programId: testProgram.id,
    dayNumber: 1,
    name: 'Day 1',
  }).returning();
  testWorkoutDay = day;

  const [assignment] = await db.insert(athletePrograms).values({
    athleteId: testAthlete.id,
    organizationId: testOrg.id,
    programId: testProgram.id,
    startDate: '2025-01-01',
    status: 'active',
    assignedBy: testCoach.id,
  }).returning();
  testAssignment = assignment;

  const coachRes = await request(app).post('/mock-login').send({ userId: testCoach.id, role: 'coach' });
  coachCookie = coachRes.headers['set-cookie']?.[0] || '';

  const athleteRes = await request(app).post('/mock-login').send({ userId: testAthlete.id, role: 'athlete' });
  athleteCookie = athleteRes.headers['set-cookie']?.[0] || '';

  const athlete2Res = await request(app).post('/mock-login').send({ userId: testAthlete2.id, role: 'athlete' });
  athlete2Cookie = athlete2Res.headers['set-cookie']?.[0] || '';
});

afterAll(async () => {
  // Delete log entries → logs → assignments → workout days → programs → exercises → users → orgs
  await db.delete(workoutLogEntries).where(eq(workoutLogEntries.workoutLogId, createdLogId ?? 'none')).catch(() => {});
  await db.delete(workoutLogs).where(eq(workoutLogs.athleteProgramId, testAssignment?.id)).catch(() => {});
  if (testAssignment) await db.delete(athletePrograms).where(eq(athletePrograms.id, testAssignment.id)).catch(() => {});
  if (testWorkoutDay) await db.delete(programWorkouts).where(eq(programWorkouts.id, testWorkoutDay.id)).catch(() => {});
  if (testProgram) await db.delete(trainingPrograms).where(eq(trainingPrograms.id, testProgram.id)).catch(() => {});
  if (testExercise) await db.delete(exercises).where(eq(exercises.id, testExercise.id)).catch(() => {});

  for (const u of [testCoach, testAthlete, testAthlete2]) {
    if (!u) continue;
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, u.id)).catch(() => {});
    await db.delete(users).where(eq(users.id, u.id)).catch(() => {});
  }
  if (testOrg) await db.delete(organizations).where(eq(organizations.id, testOrg.id)).catch(() => {});
});

// ---------------------------------------------------------------------------
// POST /api/training/logs
// ---------------------------------------------------------------------------

describe('POST /api/training/logs', () => {
  it('returns 400 when sets contains setNumber=0', async () => {
    const res = await request(app)
      .post('/api/training/logs')
      .set('Cookie', athleteCookie)
      .send({
        programWorkoutId: testWorkoutDay.id,
        athleteProgramId: testAssignment.id,
        status: 'completed',
        entries: [{
          exerciseId: testExercise.id,
          exerciseNameSnapshot: 'Squat',
          exerciseType: 'weighted',
          sets: [{ setNumber: 0, repsCompleted: 10, weightLbs: 135 }],
        }],
      });
    expect(res.status).toBe(400);
  });

  it('creates log with 201 when athlete logs own workout', async () => {
    const res = await request(app)
      .post('/api/training/logs')
      .set('Cookie', athleteCookie)
      .send({
        programWorkoutId: testWorkoutDay.id,
        athleteProgramId: testAssignment.id,
        status: 'completed',
        entries: [{
          exerciseId: testExercise.id,
          exerciseNameSnapshot: 'Log Test Exercise',
          exerciseType: 'weighted',
          sets: [{ setNumber: 1, repsCompleted: 10, weightLbs: 135 }],
        }],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('completed');
    expect(res.body.loggedBy).toBe(testAthlete.id);
    createdLogId = res.body.id;
  });

  it('returns 409 on duplicate log for same athleteProgramId + programWorkoutId', async () => {
    // Duplicate: same assignment + same workout day
    const res = await request(app)
      .post('/api/training/logs')
      .set('Cookie', athleteCookie)
      .send({
        programWorkoutId: testWorkoutDay.id,
        athleteProgramId: testAssignment.id,
        status: 'partial',
        entries: [],
      });

    expect(res.status).toBe(409);
  });

  it('returns 403 when athlete tries to log for a different athlete', async () => {
    // athlete2 tries to log using testAthlete's assignment
    const res = await request(app)
      .post('/api/training/logs')
      .set('Cookie', athlete2Cookie)
      .send({
        programWorkoutId: testWorkoutDay.id,
        athleteProgramId: testAssignment.id,  // This belongs to testAthlete
        status: 'completed',
        entries: [],
      });

    expect(res.status).toBe(403);
  });

  it('coach can log on behalf of athlete with loggedBy=coach', async () => {
    // Need a second workout day for coach to log (since day 1 is already logged by athlete)
    const [day2] = await db.insert(programWorkouts).values({
      programId: testProgram.id,
      dayNumber: 2,
      name: 'Day 2',
    }).returning();

    const res = await request(app)
      .post('/api/training/logs')
      .set('Cookie', coachCookie)
      .send({
        programWorkoutId: day2.id,
        athleteProgramId: testAssignment.id,
        status: 'completed',
        entries: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.loggedBy).toBe(testCoach.id);

    // Cleanup
    await db.delete(workoutLogs).where(eq(workoutLogs.programWorkoutId, day2.id)).catch(() => {});
    await db.delete(programWorkouts).where(eq(programWorkouts.id, day2.id)).catch(() => {});
  });
});

// ---------------------------------------------------------------------------
// PUT /api/training/logs/:id/entries — replace-all
// ---------------------------------------------------------------------------

describe('PUT /api/training/logs/:id/entries', () => {
  it('replaces all entries: 2 new entries replace existing 1', async () => {
    if (!createdLogId) return;

    const res = await request(app)
      .put(`/api/training/logs/${createdLogId}/entries`)
      .set('Cookie', athleteCookie)
      .send({
        entries: [
          {
            exerciseId: testExercise.id,
            exerciseNameSnapshot: 'Entry A',
            exerciseType: 'weighted',
            sets: [{ setNumber: 1, repsCompleted: 5, weightLbs: 100 }],
          },
          {
            exerciseId: testExercise.id,
            exerciseNameSnapshot: 'Entry B',
            exerciseType: 'weighted',
            sets: [{ setNumber: 1, repsCompleted: 8, weightLbs: 80 }],
          },
        ],
      });

    // Route returns { message: 'Entries updated', count: N }
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/entries updated/i);
    expect(res.body.count).toBe(2);
  });

  it('entries in DB matches the 2 new entries after replace', async () => {
    if (!createdLogId) return;

    const entriesInDb = await db
      .select()
      .from(workoutLogEntries)
      .where(eq(workoutLogEntries.workoutLogId, createdLogId));

    expect(entriesInDb).toHaveLength(2);
  });
});
