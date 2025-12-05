import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerAnalyticsRoutes } from '../analytics-routes';
import { registerDashboardTrendsRoutes } from '../dashboard-trends';
import { registerAuthRoutes } from '../auth-routes';
import { db } from '../../db';
import { users, teams, measurements, userTeams, organizations } from '@shared/schema';
import { eq } from 'drizzle-orm';

const app = express();

// Session configuration (matches production)
app.use(express.json());
app.use(
  session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// Register routes
registerAuthRoutes(app);
registerAnalyticsRoutes(app);
registerDashboardTrendsRoutes(app);

// Test data IDs
let orgId: string;
let team1Id: string;
let team2Id: string;
let athlete1Id: string;
let athlete2Id: string;
let athlete3Id: string;
let coachUserId: string;
let sessionCookie: string;

describe('Dashboard Filtering - Backend Integration', () => {
  beforeAll(async () => {
    // Create test organization
    const [org] = await db
      .insert(organizations)
      .values({
        name: 'Test Organization',
        slug: 'test-org-filtering',
        type: 'COLLEGE',
      })
      .returning();
    orgId = org.id;

    // Create coach user
    const [coach] = await db
      .insert(users)
      .values({
        username: 'coach-filtering',
        password: 'password',
        firstName: 'Coach',
        lastName: 'User',
        fullName: 'Coach User',
        role: 'coach',
        primaryOrganizationId: orgId,
        isActive: true,
        isSiteAdmin: false,
      })
      .returning();
    coachUserId = coach.id;

    // Create teams
    const [team1, team2] = await db
      .insert(teams)
      .values([
        {
          name: 'Team A',
          organizationId: orgId,
          isArchived: false,
        },
        {
          name: 'Team B',
          organizationId: orgId,
          isArchived: false,
        },
      ])
      .returning();
    team1Id = team1.id;
    team2Id = team2.id;

    // Create athletes
    const [ath1, ath2, ath3] = await db
      .insert(users)
      .values([
        {
          username: 'athlete1-filtering',
          password: 'password',
          firstName: 'Athlete',
          lastName: 'One',
          fullName: 'Athlete One',
          role: 'athlete',
          primaryOrganizationId: orgId,
          isActive: true,
        },
        {
          username: 'athlete2-filtering',
          password: 'password',
          firstName: 'Athlete',
          lastName: 'Two',
          fullName: 'Athlete Two',
          role: 'athlete',
          primaryOrganizationId: orgId,
          isActive: true,
        },
        {
          username: 'athlete3-filtering',
          password: 'password',
          firstName: 'Athlete',
          lastName: 'Three',
          fullName: 'Athlete Three',
          role: 'athlete',
          primaryOrganizationId: orgId,
          isActive: true,
        },
      ])
      .returning();
    athlete1Id = ath1.id;
    athlete2Id = ath2.id;
    athlete3Id = ath3.id;

    // Assign athletes to teams
    // Team A: Athlete 1, Athlete 2
    // Team B: Athlete 3
    await db.insert(userTeams).values([
      { userId: athlete1Id, teamId: team1Id, isActive: true },
      { userId: athlete2Id, teamId: team1Id, isActive: true },
      { userId: athlete3Id, teamId: team2Id, isActive: true },
    ]);

    // Create measurements
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    await db.insert(measurements).values([
      // Team A measurements
      {
        userId: athlete1Id,
        teamId: team1Id,
        metric: 'FLY10_TIME',
        value: '1.00',
        date: today,
        age: 20,
        units: 's',
        isVerified: true,
        submittedBy: coachUserId,
      },
      {
        userId: athlete2Id,
        teamId: team1Id,
        metric: 'VERTICAL_JUMP',
        value: '30',
        date: today,
        age: 19,
        units: 'in',
        isVerified: true,
        submittedBy: coachUserId,
      },
      // Team B measurements
      {
        userId: athlete3Id,
        teamId: team2Id,
        metric: 'FLY10_TIME',
        value: '1.10',
        date: yesterday,
        age: 21,
        units: 's',
        isVerified: true,
        submittedBy: coachUserId,
      },
    ]);

    // Get session cookie
    const loginRes = await request(app).post('/api/auth/login').send({
      username: 'coach-filtering',
      password: 'password',
    });

    sessionCookie = loginRes.headers['set-cookie'][0];
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(measurements).where(eq(measurements.userId, athlete1Id));
    await db.delete(measurements).where(eq(measurements.userId, athlete2Id));
    await db.delete(measurements).where(eq(measurements.userId, athlete3Id));
    await db.delete(userTeams).where(eq(userTeams.userId, athlete1Id));
    await db.delete(userTeams).where(eq(userTeams.userId, athlete2Id));
    await db.delete(userTeams).where(eq(userTeams.userId, athlete3Id));
    await db.delete(users).where(eq(users.id, athlete1Id));
    await db.delete(users).where(eq(users.id, athlete2Id));
    await db.delete(users).where(eq(users.id, athlete3Id));
    await db.delete(users).where(eq(users.id, coachUserId));
    await db.delete(teams).where(eq(teams.id, team1Id));
    await db.delete(teams).where(eq(teams.id, team2Id));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  describe('GET /api/analytics/dashboard - Organization Scope', () => {
    it('should return stats for entire organization (no filters)', async () => {
      const res = await request(app)
        .get(`/api/analytics/dashboard?organizationId=${orgId}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(res.body).toHaveProperty('totalAthletes');
      expect(res.body.totalAthletes).toBe(3); // All 3 athletes
      expect(res.body).toHaveProperty('totalTeams');
      expect(res.body.totalTeams).toBe(2); // Both teams
    });
  });

  describe('GET /api/analytics/dashboard - Team Scope', () => {
    it('should return stats filtered by teamId', async () => {
      const res = await request(app)
        .get(`/api/analytics/dashboard?organizationId=${orgId}&teamId=${team1Id}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(res.body).toHaveProperty('totalAthletes');
      expect(res.body.totalAthletes).toBe(2); // Only Team A athletes
      expect(res.body).toHaveProperty('totalTeams');
      expect(res.body.totalTeams).toBe(1); // Only Team A
    });

    it('should return best performances from filtered team', async () => {
      const res = await request(app)
        .get(`/api/analytics/dashboard?organizationId=${orgId}&teamId=${team1Id}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      // Team A has FLY10_TIME: 1.00 and VERTICAL_JUMP: 30
      expect(res.body).toHaveProperty('bestFLY10_TIMELast30Days');
      expect(res.body.bestFLY10_TIMELast30Days.value).toBe(1.0);
      expect(res.body).toHaveProperty('bestVERTICAL_JUMPLast30Days');
      expect(res.body.bestVERTICAL_JUMPLast30Days.value).toBe(30);
    });

    it('should not return measurements from other teams', async () => {
      const res = await request(app)
        .get(`/api/analytics/dashboard?organizationId=${orgId}&teamId=${team2Id}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      // Team B only has FLY10_TIME measurement
      expect(res.body).toHaveProperty('bestFLY10_TIMELast30Days');
      expect(res.body.bestFLY10_TIMELast30Days.value).toBe(1.1);

      // Team B has no VERTICAL_JUMP measurement
      expect(res.body.bestVERTICAL_JUMPLast30Days).toBeUndefined();
    });
  });

  describe('GET /api/analytics/dashboard - Athlete Scope', () => {
    it('should return stats filtered by athleteId', async () => {
      const res = await request(app)
        .get(`/api/analytics/dashboard?organizationId=${orgId}&athleteId=${athlete1Id}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(res.body).toHaveProperty('totalAthletes');
      expect(res.body.totalAthletes).toBe(1); // Only selected athlete

      // Should have FLY10_TIME measurement
      expect(res.body).toHaveProperty('bestFLY10_TIMELast30Days');
      expect(res.body.bestFLY10_TIMELast30Days.value).toBe(1.0);
      expect(res.body.bestFLY10_TIMELast30Days.userName).toBe('Athlete One');
    });

    it('should not return measurements from other athletes', async () => {
      const res = await request(app)
        .get(`/api/analytics/dashboard?organizationId=${orgId}&athleteId=${athlete2Id}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      // Athlete 2 only has VERTICAL_JUMP
      expect(res.body.bestFLY10_TIMELast30Days).toBeUndefined();
      expect(res.body).toHaveProperty('bestVERTICAL_JUMPLast30Days');
      expect(res.body.bestVERTICAL_JUMPLast30Days.userName).toBe('Athlete Two');
    });

    it('should filter by both teamId and athleteId when both provided', async () => {
      const res = await request(app)
        .get(`/api/analytics/dashboard?organizationId=${orgId}&teamId=${team1Id}&athleteId=${athlete1Id}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(res.body.totalAthletes).toBe(1);
      expect(res.body.bestFLY10_TIMELast30Days.userName).toBe('Athlete One');
    });
  });

  describe('GET /api/dashboard/trends - Organization Scope', () => {
    it('should return trends for entire organization', async () => {
      const res = await request(app)
        .get(`/api/dashboard/trends?organizationId=${orgId}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(res.body).toHaveProperty('athletes');
      expect(res.body).toHaveProperty('measurements');
      expect(res.body).toHaveProperty('teams');
    });
  });

  describe('GET /api/dashboard/trends - Team Scope', () => {
    it('should return trends filtered by teamId', async () => {
      const res = await request(app)
        .get(`/api/dashboard/trends?organizationId=${orgId}&teamId=${team1Id}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(res.body).toHaveProperty('athletes');
      expect(res.body).toHaveProperty('measurements');

      // Trends should only include Team A data
      expect(res.body.teams.current).toBe(1); // Only Team A
    });
  });

  describe('GET /api/dashboard/trends - Athlete Scope', () => {
    it('should return trends filtered by athleteId', async () => {
      const res = await request(app)
        .get(`/api/dashboard/trends?organizationId=${orgId}&athleteId=${athlete1Id}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(res.body).toHaveProperty('athletes');
      expect(res.body).toHaveProperty('measurements');

      // Trends should only include selected athlete
      expect(res.body.athletes.current).toBe(1);
    });
  });

  describe('Authorization', () => {
    it('should reject requests without authentication', async () => {
      await request(app)
        .get(`/api/analytics/dashboard?organizationId=${orgId}`)
        .expect(401);
    });

    it('should reject requests for teams outside coach organization', async () => {
      // Create another organization
      const [otherOrg] = await db
        .insert(organizations)
        .values({
          name: 'Other Organization',
          slug: 'other-org-filtering',
          type: 'COLLEGE',
        })
        .returning();

      const [otherTeam] = await db
        .insert(teams)
        .values({
          name: 'Other Team',
          organizationId: otherOrg.id,
          isArchived: false,
        })
        .returning();

      // Try to access other organization's team
      await request(app)
        .get(`/api/analytics/dashboard?organizationId=${otherOrg.id}&teamId=${otherTeam.id}`)
        .set('Cookie', sessionCookie)
        .expect(403);

      // Cleanup
      await db.delete(teams).where(eq(teams.id, otherTeam.id));
      await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid teamId format', async () => {
      await request(app)
        .get(`/api/analytics/dashboard?organizationId=${orgId}&teamId=invalid-uuid`)
        .set('Cookie', sessionCookie)
        .expect(400);
    });

    it('should return 400 for invalid athleteId format', async () => {
      await request(app)
        .get(`/api/analytics/dashboard?organizationId=${orgId}&athleteId=invalid-uuid`)
        .set('Cookie', sessionCookie)
        .expect(400);
    });

    it('should handle missing organizationId gracefully', async () => {
      await request(app)
        .get('/api/analytics/dashboard')
        .set('Cookie', sessionCookie)
        .expect(400);
    });
  });
});
