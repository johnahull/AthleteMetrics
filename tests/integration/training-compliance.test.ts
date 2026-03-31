/**
 * Integration Tests: Training Compliance Routes
 *
 * Tests compliance aggregation and cross-org isolation.
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
let secondOrg: any;
let testCoach: any;
let secondCoach: any;
let testAthlete: any;
let testProgram: any;
let testWorkoutDay: any;
let testAssignment: any;
let testLog: any;

let coachCookie: string;
let secondCoachCookie: string;
let athleteCookie: string;

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
    name: `Compliance Int Org ${TS}`, orgType: 'club', trainingEnabled: true,
  }).returning();
  testOrg = org;

  const [org2] = await db.insert(organizations).values({
    name: `Compliance Int Org2 ${TS}`, orgType: 'club', trainingEnabled: true,
  }).returning();
  secondOrg = org2;

  const [coach] = await db.insert(users).values({
    username: `comp_coach_${TS}`,
    emails: [`comp_coach_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Comp', lastName: 'Coach', fullName: 'Comp Coach',
    isSiteAdmin: false,
  }).returning();
  testCoach = coach;
  await storage.addUserToOrganization(testCoach.id, testOrg.id, 'coach');

  const [coach2] = await db.insert(users).values({
    username: `comp_coach2_${TS}`,
    emails: [`comp_coach2_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Comp', lastName: 'Coach2', fullName: 'Comp Coach2',
    isSiteAdmin: false,
  }).returning();
  secondCoach = coach2;
  await storage.addUserToOrganization(secondCoach.id, secondOrg.id, 'coach');

  const [athlete] = await db.insert(users).values({
    username: `comp_athlete_${TS}`,
    emails: [`comp_athlete_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Comp', lastName: 'Athlete', fullName: 'Comp Athlete',
    isSiteAdmin: false,
  }).returning();
  testAthlete = athlete;
  await storage.addUserToOrganization(testAthlete.id, testOrg.id, 'athlete');

  const [prog] = await db.insert(trainingPrograms).values({
    organizationId: testOrg.id,
    name: `Compliance Test Program ${TS}`,
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

  // Log a completed workout so compliance is non-zero
  const [log] = await db.insert(workoutLogs).values({
    athleteProgramId: testAssignment.id,
    programWorkoutId: testWorkoutDay.id,
    loggedBy: testAthlete.id,
    status: 'completed',
  }).returning();
  testLog = log;

  const coachRes = await request(app).post('/mock-login').send({ userId: testCoach.id, role: 'coach' });
  coachCookie = coachRes.headers['set-cookie']?.[0] || '';

  const coach2Res = await request(app).post('/mock-login').send({ userId: secondCoach.id, role: 'coach' });
  secondCoachCookie = coach2Res.headers['set-cookie']?.[0] || '';

  const athleteRes = await request(app).post('/mock-login').send({ userId: testAthlete.id, role: 'athlete' });
  athleteCookie = athleteRes.headers['set-cookie']?.[0] || '';
});

afterAll(async () => {
  if (testLog) await db.delete(workoutLogs).where(eq(workoutLogs.id, testLog.id)).catch(() => {});
  if (testAssignment) await db.delete(athletePrograms).where(eq(athletePrograms.id, testAssignment.id)).catch(() => {});
  if (testWorkoutDay) await db.delete(programWorkouts).where(eq(programWorkouts.id, testWorkoutDay.id)).catch(() => {});
  if (testProgram) await db.delete(trainingPrograms).where(eq(trainingPrograms.id, testProgram.id)).catch(() => {});

  for (const u of [testCoach, secondCoach, testAthlete]) {
    if (!u) continue;
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, u.id)).catch(() => {});
    await db.delete(users).where(eq(users.id, u.id)).catch(() => {});
  }
  if (secondOrg) await db.delete(organizations).where(eq(organizations.id, secondOrg.id)).catch(() => {});
  if (testOrg) await db.delete(organizations).where(eq(organizations.id, testOrg.id)).catch(() => {});
});

// ---------------------------------------------------------------------------
// Compliance stats
// ---------------------------------------------------------------------------

describe('GET /api/training/compliance', () => {
  it('returns 200 and array of athlete stats for coach', async () => {
    const res = await request(app)
      .get('/api/training/compliance')
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('compliance stats include the test athlete', async () => {
    const res = await request(app)
      .get('/api/training/compliance')
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    const athleteStats = res.body.find((s: any) => s.athleteId === testAthlete.id);
    expect(athleteStats).toBeDefined();
    expect(typeof athleteStats.compliancePercent).toBe('number');
    expect(typeof athleteStats.currentStreak).toBe('number');
  });

  it('returns 403 when athlete tries to access compliance overview', async () => {
    const res = await request(app)
      .get('/api/training/compliance')
      .set('Cookie', athleteCookie);

    expect(res.status).toBe(403);
  });

  it('cross-org isolation: second coach cannot see testOrg athletes', async () => {
    const res = await request(app)
      .get('/api/training/compliance')
      .set('Cookie', secondCoachCookie);

    expect(res.status).toBe(200);
    const athleteIds = res.body.map((s: any) => s.athleteId);
    // secondOrg coach should NOT see testOrg athlete
    expect(athleteIds).not.toContain(testAthlete.id);
  });
});

// ---------------------------------------------------------------------------
// GET /api/training/assignments — list assignments for org
// ---------------------------------------------------------------------------

describe('GET /api/training/assignments', () => {
  it('returns active assignments for coach in their org', async () => {
    const res = await request(app)
      .get('/api/training/assignments')
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const assignmentIds = res.body.map((a: any) => a.id);
    expect(assignmentIds).toContain(testAssignment.id);
  });

  it('does not return testOrg assignments to second org coach', async () => {
    const res = await request(app)
      .get('/api/training/assignments')
      .set('Cookie', secondCoachCookie);

    expect(res.status).toBe(200);
    const assignmentIds = res.body.map((a: any) => a.id);
    expect(assignmentIds).not.toContain(testAssignment.id);
  });
});
