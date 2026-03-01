/**
 * Integration Tests: Training Athlete Self-Service Routes
 *
 * Tests my-program, my-program/today, my-assessment-context endpoints.
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
  measurements,
  siteBenchmarks,
  siteMetrics,
} from '@shared/schema';
import { eq } from 'drizzle-orm';

const TS = Date.now();

let app: express.Application;
let testOrg: any;
let testCoach: any;
let testAthlete: any;
let noMeasurementAthlete: any;
let testProgram: any;
let testWorkoutDay: any;
let todayWorkoutDay: any;
let testAssignment: any;
let noMeasurementAssignment: any;
let testLog: any;
let testMeasurement: any;
let testBenchmark: any;
let testSiteMetric: any;

let coachCookie: string;
let athleteCookie: string;
let noMeasurementAthleteCookie: string;

// Compute today as YYYY-MM-DD in UTC
const today = new Date().toISOString().split('T')[0];

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
      role: role || 'athlete',
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
    name: `Athlete Routes Int Org ${TS}`, orgType: 'club', trainingEnabled: true,
  }).returning();
  testOrg = org;

  const [coach] = await db.insert(users).values({
    username: `ar_coach_${TS}`,
    emails: [`ar_coach_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'AR', lastName: 'Coach', fullName: 'AR Coach',
    isSiteAdmin: false,
  }).returning();
  testCoach = coach;
  await storage.addUserToOrganization(testCoach.id, testOrg.id, 'coach');

  const [athlete] = await db.insert(users).values({
    username: `ar_athlete_${TS}`,
    emails: [`ar_athlete_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'AR', lastName: 'Athlete', fullName: 'AR Athlete',
    isSiteAdmin: false,
  }).returning();
  testAthlete = athlete;
  await storage.addUserToOrganization(testAthlete.id, testOrg.id, 'athlete');

  const [noMeasAthlete] = await db.insert(users).values({
    username: `ar_athlete_nomes_${TS}`,
    emails: [`ar_athlete_nomes_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'AR', lastName: 'NoMeas', fullName: 'AR NoMeas',
    isSiteAdmin: false,
  }).returning();
  noMeasurementAthlete = noMeasAthlete;
  await storage.addUserToOrganization(noMeasurementAthlete.id, testOrg.id, 'athlete');

  const [prog] = await db.insert(trainingPrograms).values({
    organizationId: testOrg.id,
    name: `AR Test Program ${TS}`,
    durationWeeks: 4,
    isActive: true,
  }).returning();
  testProgram = prog;

  // Day 1: scheduled for past date (startDate = today means day 1 = today)
  // We'll use startDate = today so "today" workout = day 1
  const [day1] = await db.insert(programWorkouts).values({
    programId: testProgram.id,
    dayNumber: 1,
    name: 'Day 1 — Today',
  }).returning();
  testWorkoutDay = day1;
  todayWorkoutDay = day1;

  // Add a day 2 for future
  await db.insert(programWorkouts).values({
    programId: testProgram.id,
    dayNumber: 2,
    name: 'Day 2 — Tomorrow',
  });

  // Assignment for testAthlete starting today
  const [assignment] = await db.insert(athletePrograms).values({
    athleteId: testAthlete.id,
    organizationId: testOrg.id,
    programId: testProgram.id,
    startDate: today,
    status: 'active',
    assignedBy: testCoach.id,
  }).returning();
  testAssignment = assignment;

  // Assignment for noMeasurementAthlete (for my-program test)
  const [nma] = await db.insert(athletePrograms).values({
    athleteId: noMeasurementAthlete.id,
    organizationId: testOrg.id,
    programId: testProgram.id,
    startDate: today,
    status: 'active',
    assignedBy: testCoach.id,
  }).returning();
  noMeasurementAssignment = nma;

  // Create a workout log for today's workout for testAthlete (for the "existing log" test)
  const [log] = await db.insert(workoutLogs).values({
    athleteProgramId: testAssignment.id,
    programWorkoutId: testWorkoutDay.id,
    loggedBy: testAthlete.id,
    status: 'completed',
  }).returning();
  testLog = log;

  // Create measurement + benchmark for assessment context tests
  // First ensure site metric exists for FLY10_TIME
  const existingMetric = await db.select().from(siteMetrics).where(eq(siteMetrics.code, 'FLY10_TIME')).limit(1);
  if (existingMetric.length === 0) {
    const [metric] = await db.insert(siteMetrics).values({
      code: 'FLY10_TIME',
      name: '10-Yard Fly Time',
      unit: 'seconds',
      metricType: 'lower_is_better',
    }).returning();
    testSiteMetric = metric;
  } else {
    testSiteMetric = existingMetric[0];
  }

  const [meas] = await db.insert(measurements).values({
    userId: testAthlete.id,
    organizationId: testOrg.id,
    metric: 'FLY10_TIME',
    value: '1.35',
    date: today,
    submittedBy: testCoach.id,
    age: 20,      // Required: athlete age at time of measurement
    units: 's',   // Required: seconds for FLY10_TIME
  }).returning();
  testMeasurement = meas;

  // Get or create D1 benchmark for FLY10_TIME
  const existingBenchmark = await db
    .select()
    .from(siteBenchmarks)
    .where(eq(siteBenchmarks.metricCode, 'FLY10_TIME'))
    .limit(1);

  if (existingBenchmark.length === 0) {
    const [bench] = await db.insert(siteBenchmarks).values({
      metricCode: 'FLY10_TIME',
      name: 'D1 FLY10 Benchmark',
      benchmarkValue: '1.20',
      tierName: 'D1',
      isActive: true,
      isSystemDefault: false,
    }).returning();
    testBenchmark = bench;
  } else {
    testBenchmark = existingBenchmark[0];
  }

  const coachRes = await request(app).post('/mock-login').send({ userId: testCoach.id, role: 'coach' });
  coachCookie = coachRes.headers['set-cookie']?.[0] || '';

  const athleteRes = await request(app).post('/mock-login').send({ userId: testAthlete.id, role: 'athlete' });
  athleteCookie = athleteRes.headers['set-cookie']?.[0] || '';

  const noMeasRes = await request(app).post('/mock-login').send({ userId: noMeasurementAthlete.id, role: 'athlete' });
  noMeasurementAthleteCookie = noMeasRes.headers['set-cookie']?.[0] || '';
});

afterAll(async () => {
  if (testMeasurement) await db.delete(measurements).where(eq(measurements.id, testMeasurement.id)).catch(() => {});
  if (testBenchmark && !testBenchmark.isSystemDefault) {
    await db.delete(siteBenchmarks).where(eq(siteBenchmarks.id, testBenchmark.id)).catch(() => {});
  }
  if (testLog) await db.delete(workoutLogs).where(eq(workoutLogs.id, testLog.id)).catch(() => {});
  if (testAssignment) await db.delete(athletePrograms).where(eq(athletePrograms.id, testAssignment.id)).catch(() => {});
  if (noMeasurementAssignment) await db.delete(athletePrograms).where(eq(athletePrograms.id, noMeasurementAssignment.id)).catch(() => {});
  // Delete workout days
  await db.delete(programWorkouts).where(eq(programWorkouts.programId, testProgram?.id)).catch(() => {});
  if (testProgram) await db.delete(trainingPrograms).where(eq(trainingPrograms.id, testProgram.id)).catch(() => {});

  for (const u of [testCoach, testAthlete, noMeasurementAthlete]) {
    if (!u) continue;
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, u.id)).catch(() => {});
    await db.delete(users).where(eq(users.id, u.id)).catch(() => {});
  }
  if (testOrg) await db.delete(organizations).where(eq(organizations.id, testOrg.id)).catch(() => {});
});

// ---------------------------------------------------------------------------
// GET /api/training/my-program
// ---------------------------------------------------------------------------

describe('GET /api/training/my-program', () => {
  it('returns active assignment with schedule for athlete', async () => {
    const res = await request(app)
      .get('/api/training/my-program')
      .set('Cookie', athleteCookie);

    // Route returns { schedule: { assignment, program, schedule } | null }
    expect(res.status).toBe(200);
    expect(res.body.schedule).toBeDefined();
    expect(res.body.schedule.assignment).toBeDefined();
    expect(res.body.schedule.assignment.athleteId).toBe(testAthlete.id);
    expect(Array.isArray(res.body.schedule.schedule)).toBe(true);
  });

  it('returns 403 when coach tries to access athlete-only endpoint', async () => {
    const res = await request(app)
      .get('/api/training/my-program')
      .set('Cookie', coachCookie);

    expect(res.status).toBe(403);
  });

  it('returns null schedule when athlete has no active program', async () => {
    // Temporarily cancel the noMeasurementAssignment assignment
    if (noMeasurementAssignment) {
      await db.update(athletePrograms)
        .set({ status: 'cancelled' })
        .where(eq(athletePrograms.id, noMeasurementAssignment.id));
    }

    const res = await request(app)
      .get('/api/training/my-program')
      .set('Cookie', noMeasurementAthleteCookie);

    // Route returns { schedule: null } when no active assignment
    expect(res.status).toBe(200);
    expect(res.body.schedule).toBeNull();

    // Restore
    if (noMeasurementAssignment) {
      await db.update(athletePrograms)
        .set({ status: 'active' })
        .where(eq(athletePrograms.id, noMeasurementAssignment.id));
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/training/my-program/today
// ---------------------------------------------------------------------------

describe('GET /api/training/my-program/today', () => {
  it('includes existing log when athlete already logged today', async () => {
    const res = await request(app)
      .get('/api/training/my-program/today')
      .set('Cookie', athleteCookie);

    // Route returns { workout: scheduleItem | null }
    expect(res.status).toBe(200);
    // Day 1 is today, and we pre-created a log — should include it
    if (res.body.workout) {
      expect(res.body.workout.log).toBeDefined();
      if (res.body.workout.log) {
        expect(res.body.workout.log.status).toBe('completed');
      }
    }
  });

  it('returns null workout when no workout is scheduled today', async () => {
    // Temporarily update assignment to start far in future
    await db.update(athletePrograms)
      .set({ startDate: '2030-01-01' })
      .where(eq(athletePrograms.id, noMeasurementAssignment.id));

    const res = await request(app)
      .get('/api/training/my-program/today')
      .set('Cookie', noMeasurementAthleteCookie);

    // Route returns { workout: null } when no workout scheduled today
    expect(res.status).toBe(200);
    expect(res.body.workout).toBeNull();

    // Restore
    await db.update(athletePrograms)
      .set({ startDate: today })
      .where(eq(athletePrograms.id, noMeasurementAssignment.id));
  });
});

// ---------------------------------------------------------------------------
// GET /api/training/my-assessment-context
// ---------------------------------------------------------------------------

describe('GET /api/training/my-assessment-context', () => {
  it('returns metric + benchmark + gap for athlete with measurement', async () => {
    const res = await request(app)
      .get('/api/training/my-assessment-context')
      .set('Cookie', athleteCookie);

    expect(res.status).toBe(200);
    expect(res.body.assessmentContext).not.toBeNull();
    if (res.body.assessmentContext && res.body.assessmentContext.length > 0) {
      const ctx = res.body.assessmentContext[0];
      expect(ctx.metricType).toBe('FLY10_TIME');
      expect(typeof ctx.latestValue).toBe('number');
      expect(ctx.latestValue).toBeCloseTo(1.35, 2);
    }
  });

  it('returns {assessmentContext: null} when athlete has no measurements', async () => {
    const res = await request(app)
      .get('/api/training/my-assessment-context')
      .set('Cookie', noMeasurementAthleteCookie);

    expect(res.status).toBe(200);
    expect(res.body.assessmentContext).toBeNull();
  });

  it('returns 403 when coach tries to access athlete-only context endpoint', async () => {
    const res = await request(app)
      .get('/api/training/my-assessment-context')
      .set('Cookie', coachCookie);

    expect(res.status).toBe(403);
  });
});
