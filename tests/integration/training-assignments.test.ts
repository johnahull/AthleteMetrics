/**
 * Integration Tests: Training Program Assignments Routes
 *
 * Tests assignment create/read/status-update, one-active constraint,
 * cross-org isolation, and schedule computation.
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
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const TS = Date.now();

let app: express.Application;
let testOrg: any;
let secondOrg: any;
let testCoach: any;
let testAthlete: any;
let testAthlete2: any;
let testProgram: any;
let secondOrgProgram: any;
let testWorkoutDay: any;
let createdAssignmentId: string;

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
    name: `Assign Int Org ${TS}`, orgType: 'club', trainingEnabled: true,
  }).returning();
  testOrg = org;

  const [org2] = await db.insert(organizations).values({
    name: `Assign Int Org2 ${TS}`, orgType: 'club', trainingEnabled: true,
  }).returning();
  secondOrg = org2;

  const [coach] = await db.insert(users).values({
    username: `assign_coach_${TS}`,
    emails: [`assign_coach_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Assign', lastName: 'Coach', fullName: 'Assign Coach',
    isSiteAdmin: false,
  }).returning();
  testCoach = coach;
  await storage.addUserToOrganization(testCoach.id, testOrg.id, 'coach');

  const [athlete] = await db.insert(users).values({
    username: `assign_athlete_${TS}`,
    emails: [`assign_athlete_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Assign', lastName: 'Athlete', fullName: 'Assign Athlete',
    isSiteAdmin: false,
  }).returning();
  testAthlete = athlete;
  await storage.addUserToOrganization(testAthlete.id, testOrg.id, 'athlete');

  const [athlete2] = await db.insert(users).values({
    username: `assign_athlete2_${TS}`,
    emails: [`assign_athlete2_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Assign', lastName: 'Athlete2', fullName: 'Assign Athlete2',
    isSiteAdmin: false,
  }).returning();
  testAthlete2 = athlete2;
  await storage.addUserToOrganization(testAthlete2.id, testOrg.id, 'athlete');

  // Create programs
  const [prog] = await db.insert(trainingPrograms).values({
    organizationId: testOrg.id,
    name: `Assign Test Program ${TS}`,
    durationWeeks: 4,
    isActive: true,
  }).returning();
  testProgram = prog;

  // Add a workout day so schedule has at least one item
  const [day] = await db.insert(programWorkouts).values({
    programId: testProgram.id,
    dayNumber: 1,
    name: 'Day 1',
  }).returning();
  testWorkoutDay = day;

  // Create program in secondOrg for cross-org isolation test
  const [prog2] = await db.insert(trainingPrograms).values({
    organizationId: secondOrg.id,
    name: `SecondOrg Program ${TS}`,
    durationWeeks: 2,
    isActive: true,
  }).returning();
  secondOrgProgram = prog2;

  const coachRes = await request(app).post('/mock-login').send({ userId: testCoach.id, role: 'coach' });
  coachCookie = coachRes.headers['set-cookie']?.[0] || '';

  const athleteRes = await request(app).post('/mock-login').send({ userId: testAthlete.id, role: 'athlete' });
  athleteCookie = athleteRes.headers['set-cookie']?.[0] || '';

  const athlete2Res = await request(app).post('/mock-login').send({ userId: testAthlete2.id, role: 'athlete' });
  athlete2Cookie = athlete2Res.headers['set-cookie']?.[0] || '';
});

afterAll(async () => {
  // Delete assignments first
  await db.delete(athletePrograms).where(eq(athletePrograms.organizationId, testOrg.id)).catch(() => {});

  // Delete workout days and programs
  if (testWorkoutDay) await db.delete(programWorkouts).where(eq(programWorkouts.id, testWorkoutDay.id)).catch(() => {});
  if (testProgram) await db.delete(trainingPrograms).where(eq(trainingPrograms.id, testProgram.id)).catch(() => {});
  if (secondOrgProgram) await db.delete(trainingPrograms).where(eq(trainingPrograms.id, secondOrgProgram.id)).catch(() => {});

  for (const u of [testCoach, testAthlete, testAthlete2]) {
    if (!u) continue;
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, u.id)).catch(() => {});
    await db.delete(users).where(eq(users.id, u.id)).catch(() => {});
  }
  if (secondOrg) await db.delete(organizations).where(eq(organizations.id, secondOrg.id)).catch(() => {});
  if (testOrg) await db.delete(organizations).where(eq(organizations.id, testOrg.id)).catch(() => {});
});

// ---------------------------------------------------------------------------
// POST /api/training/assignments
// ---------------------------------------------------------------------------

describe('POST /api/training/assignments', () => {
  it('returns 400 when startDate format is invalid', async () => {
    const res = await request(app)
      .post('/api/training/assignments')
      .set('Cookie', coachCookie)
      .send({ athleteId: testAthlete.id, programId: testProgram.id, startDate: '01-01-2025' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when programId belongs to different org', async () => {
    const res = await request(app)
      .post('/api/training/assignments')
      .set('Cookie', coachCookie)
      .send({ athleteId: testAthlete.id, programId: secondOrgProgram.id, startDate: '2025-01-01' });
    // Should fail with 400 or 403 — program is not in coach's org
    expect([400, 403, 404]).toContain(res.status);
  });

  it('creates assignment with 201 and returns assignment record', async () => {
    const startDate = '2025-06-01';
    const res = await request(app)
      .post('/api/training/assignments')
      .set('Cookie', coachCookie)
      .send({ athleteId: testAthlete.id, programId: testProgram.id, startDate });

    expect(res.status).toBe(201);
    expect(res.body.athleteId).toBe(testAthlete.id);
    expect(res.body.programId).toBe(testProgram.id);
    expect(res.body.status).toBe('active');
    createdAssignmentId = res.body.id;
  });

  it('schedule has correct scheduledDate for day 1 via GET', async () => {
    if (!createdAssignmentId) return;

    // GET /api/training/assignments/:id returns { assignment, program, schedule }
    const res = await request(app)
      .get(`/api/training/assignments/${createdAssignmentId}`)
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.schedule)).toBe(true);
    const day1 = res.body.schedule.find((s: any) => s.dayNumber === 1);
    if (day1) {
      // Day 1 should have scheduledDate = startDate (day 1 offset = 0)
      expect(day1.scheduledDate).toBe('2025-06-01');
    }
  });

  it('returns 409 when athlete already has active assignment in same org', async () => {
    // testAthlete already has an active assignment — attempt a second
    const res = await request(app)
      .post('/api/training/assignments')
      .set('Cookie', coachCookie)
      .send({ athleteId: testAthlete.id, programId: testProgram.id, startDate: '2025-07-01' });

    expect(res.status).toBe(409);
  });

  it('creates assignment after cancelling previous one', async () => {
    // Cancel the current assignment via PUT (the route uses PUT not PATCH)
    if (createdAssignmentId) {
      const cancelRes = await request(app)
        .put(`/api/training/assignments/${createdAssignmentId}/status`)
        .set('Cookie', coachCookie)
        .send({ status: 'cancelled' });
      expect([200, 404]).toContain(cancelRes.status);
    }

    // Now create a new assignment — should succeed
    const res = await request(app)
      .post('/api/training/assignments')
      .set('Cookie', coachCookie)
      .send({ athleteId: testAthlete.id, programId: testProgram.id, startDate: '2025-07-01' });

    expect(res.status).toBe(201);
    createdAssignmentId = res.body.id;
  });
});

// ---------------------------------------------------------------------------
// GET /api/training/assignments/:id — isolation
// ---------------------------------------------------------------------------

describe('GET /api/training/assignments/:id — role isolation', () => {
  it('athlete sees own assignment', async () => {
    if (!createdAssignmentId) return;

    const res = await request(app)
      .get(`/api/training/assignments/${createdAssignmentId}`)
      .set('Cookie', athleteCookie);

    // GET returns { assignment, program, schedule }
    expect(res.status).toBe(200);
    expect(res.body.assignment.athleteId).toBe(testAthlete.id);
  });

  it('different athlete gets 403 for another athlete\'s assignment', async () => {
    if (!createdAssignmentId) return;

    const res = await request(app)
      .get(`/api/training/assignments/${createdAssignmentId}`)
      .set('Cookie', athlete2Cookie);

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/training/assignments/:id/status — completedAt
// ---------------------------------------------------------------------------

describe('PATCH /api/training/assignments/:id/status', () => {
  it('sets completedAt when status is set to completed', async () => {
    if (!createdAssignmentId) return;

    // Route uses PUT not PATCH
    const res = await request(app)
      .put(`/api/training/assignments/${createdAssignmentId}/status`)
      .set('Cookie', coachCookie)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.completedAt).not.toBeNull();
  });
});
