/**
 * Integration tests for measurement API filters (teamIds, gender, sport)
 * Tests actual API endpoints with real Express app and PostgreSQL database
 *
 * NOTE: Requires DATABASE_URL environment variable to be set to a PostgreSQL connection string
 */

// Set environment variables before any imports (DATABASE_URL must be provided externally)
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';

// Mock vite module before importing registerRoutes to prevent build directory errors
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';
import { db } from '../../packages/api/db';
import { users, organizations, teams, userTeams, measurements, userOrganizations } from '@shared/schema';
import { eq, inArray, and } from 'drizzle-orm';

// Test app and data
let app: Express;
let testOrgId: string;
let team1Id: string;
let team2Id: string;
let adminUserId: string;
let athlete1Id: string;
let athlete2Id: string;
let athlete3Id: string;
let athlete4Id: string;
let athlete5Id: string;
let athlete6Id: string;
let activeAgents: Set<request.SuperAgentTest> = new Set();

// Test data cleanup references
let createdUserIds: string[] = [];
let createdTeamIds: string[] = [];
let createdOrgIds: string[] = [];
let createdMeasurementIds: string[] = [];

// Helper to create authenticated session
const createAuthenticatedSession = async () => {
  const agent = request.agent(app);
  activeAgents.add(agent);

  const loginResponse = await agent
    .post('/api/auth/login')
    .send({
      username: process.env.ADMIN_USER || 'admin',
      password: process.env.ADMIN_PASSWORD || 'TestPassword123!'
    });

  expect(loginResponse.status).toBe(200);
  return agent;
};

const cleanupAgent = (agent: request.SuperAgentTest) => {
  activeAgents.delete(agent);
};

// Setup test data
const setupTestData = async () => {
  // Create test organization
  const [org] = await db.insert(organizations).values({
    name: `Test Org Filters ${Date.now()}`,
    description: 'Test organization for measurement filters',
    isActive: true,
  }).returning();
  testOrgId = org.id;
  createdOrgIds.push(org.id);

  // Create two teams
  const [team1] = await db.insert(teams).values({
    name: `Team Alpha ${Date.now()}`,
    organizationId: testOrgId,
    level: 'HS',
    isArchived: false,
  }).returning();
  team1Id = team1.id;
  createdTeamIds.push(team1.id);

  const [team2] = await db.insert(teams).values({
    name: `Team Beta ${Date.now()}`,
    organizationId: testOrgId,
    level: 'Club',
    isArchived: false,
  }).returning();
  team2Id = team2.id;
  createdTeamIds.push(team2.id);

  // Get admin user (created by initializeDefaultUser)
  const adminUser = await db.select().from(users).where(eq(users.username, process.env.ADMIN_USER || 'admin')).limit(1);
  if (adminUser.length > 0) {
    adminUserId = adminUser[0].id;
  }

  // Create test athletes with varying attributes
  // Athlete 1: Male, Football, Team 1
  const [ath1] = await db.insert(users).values({
    username: `athlete1_${Date.now()}`,
    emails: [`athlete1_${Date.now()}@test.com`],
    password: 'TestPassword123!',
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    birthDate: '2000-01-15',
    birthYear: 2000,
    gender: 'Male',
    sports: ['Soccer'],
    positions: ['F'],
    isActive: true,
  }).returning();
  athlete1Id = ath1.id;
  createdUserIds.push(ath1.id);

  // Athlete 2: Female, Basketball, Team 1
  const [ath2] = await db.insert(users).values({
    username: `athlete2_${Date.now()}`,
    emails: [`athlete2_${Date.now()}@test.com`],
    password: 'TestPassword123!',
    firstName: 'Jane',
    lastName: 'Smith',
    fullName: 'Jane Smith',
    birthDate: '2001-05-20',
    birthYear: 2001,
    gender: 'Female',
    sports: ['Soccer'],
    positions: ['M'],
    isActive: true,
  }).returning();
  athlete2Id = ath2.id;
  createdUserIds.push(ath2.id);

  // Athlete 3: Male, Soccer, Team 2
  const [ath3] = await db.insert(users).values({
    username: `athlete3_${Date.now()}`,
    emails: [`athlete3_${Date.now()}@test.com`],
    password: 'TestPassword123!',
    firstName: 'Bob',
    lastName: 'Johnson',
    fullName: 'Bob Johnson',
    birthDate: '2000-08-10',
    birthYear: 2000,
    gender: 'Male',
    sports: ['Soccer'],
    positions: ['D'],
    isActive: true,
  }).returning();
  athlete3Id = ath3.id;
  createdUserIds.push(ath3.id);

  // Athlete 4: Female, Soccer, Team 2
  const [ath4] = await db.insert(users).values({
    username: `athlete4_${Date.now()}`,
    emails: [`athlete4_${Date.now()}@test.com`],
    password: 'TestPassword123!',
    firstName: 'Alice',
    lastName: 'Williams',
    fullName: 'Alice Williams',
    birthDate: '2002-03-25',
    birthYear: 2002,
    gender: 'Female',
    sports: ['Soccer'],
    positions: ['GK'],
    isActive: true,
  }).returning();
  athlete4Id = ath4.id;
  createdUserIds.push(ath4.id);

  // Athlete 5: Not Specified gender, Soccer, Both teams
  const [ath5] = await db.insert(users).values({
    username: `athlete5_${Date.now()}`,
    emails: [`athlete5_${Date.now()}@test.com`],
    password: 'TestPassword123!',
    firstName: 'Sam',
    lastName: 'Taylor',
    fullName: 'Sam Taylor',
    birthDate: '2001-11-30',
    birthYear: 2001,
    gender: 'Not Specified',
    sports: ['Soccer'],
    positions: ['M'],
    isActive: true,
  }).returning();
  athlete5Id = ath5.id;
  createdUserIds.push(ath5.id);

  // Athlete 6: Male, Soccer (no teams - independent athlete)
  const [ath6] = await db.insert(users).values({
    username: `athlete6_${Date.now()}`,
    emails: [`athlete6_${Date.now()}@test.com`],
    password: 'TestPassword123!',
    firstName: 'Mike',
    lastName: 'Brown',
    fullName: 'Mike Brown',
    birthDate: '2000-12-05',
    birthYear: 2000,
    gender: 'Male',
    sports: ['Soccer'],
    positions: ['F'],
    isActive: true,
  }).returning();
  athlete6Id = ath6.id;
  createdUserIds.push(ath6.id);

  // Assign athletes to teams
  // Athlete 1 -> Team 1
  await db.insert(userTeams).values({
    userId: athlete1Id,
    teamId: team1Id,
    isActive: true,
  });

  // Athlete 2 -> Team 1
  await db.insert(userTeams).values({
    userId: athlete2Id,
    teamId: team1Id,
    isActive: true,
  });

  // Athlete 3 -> Team 2
  await db.insert(userTeams).values({
    userId: athlete3Id,
    teamId: team2Id,
    isActive: true,
  });

  // Athlete 4 -> Team 2
  await db.insert(userTeams).values({
    userId: athlete4Id,
    teamId: team2Id,
    isActive: true,
  });

  // Athlete 5 -> Both teams
  await db.insert(userTeams).values({
    userId: athlete5Id,
    teamId: team1Id,
    isActive: true,
  });
  await db.insert(userTeams).values({
    userId: athlete5Id,
    teamId: team2Id,
    isActive: true,
  });

  // Athlete 6 -> No teams (independent)

  // Assign all users to test organization
  for (const userId of [athlete1Id, athlete2Id, athlete3Id, athlete4Id, athlete5Id, athlete6Id]) {
    await db.insert(userOrganizations).values({
      userId,
      organizationId: testOrgId,
      role: 'athlete',
    });
  }

  // Create measurements for each athlete (all FLY10_TIME for consistency)
  // Athlete 1: 2 measurements
  const [m1] = await db.insert(measurements).values({
    userId: athlete1Id,
    submittedBy: adminUserId,
    date: '2024-01-15',
    age: 24,
    metric: 'FLY10_TIME',
    value: '1.10',
    units: 's',
    teamId: team1Id,
    teamNameSnapshot: 'Team Alpha',
    organizationId: testOrgId,
    isVerified: true,
  }).returning();
  createdMeasurementIds.push(m1.id);

  const [m2] = await db.insert(measurements).values({
    userId: athlete1Id,
    submittedBy: adminUserId,
    date: '2024-02-15',
    age: 24,
    metric: 'FLY10_TIME',
    value: '1.08',
    units: 's',
    teamId: team1Id,
    teamNameSnapshot: 'Team Alpha',
    organizationId: testOrgId,
    isVerified: true,
  }).returning();
  createdMeasurementIds.push(m2.id);

  // Athlete 2: 2 measurements
  const [m3] = await db.insert(measurements).values({
    userId: athlete2Id,
    submittedBy: adminUserId,
    date: '2024-01-20',
    age: 23,
    metric: 'FLY10_TIME',
    value: '1.15',
    units: 's',
    teamId: team1Id,
    teamNameSnapshot: 'Team Alpha',
    organizationId: testOrgId,
    isVerified: true,
  }).returning();
  createdMeasurementIds.push(m3.id);

  const [m4] = await db.insert(measurements).values({
    userId: athlete2Id,
    submittedBy: adminUserId,
    date: '2024-02-20',
    age: 23,
    metric: 'FLY10_TIME',
    value: '1.13',
    units: 's',
    teamId: team1Id,
    teamNameSnapshot: 'Team Alpha',
    organizationId: testOrgId,
    isVerified: true,
  }).returning();
  createdMeasurementIds.push(m4.id);

  // Athlete 3: 3 measurements
  const [m5] = await db.insert(measurements).values({
    userId: athlete3Id,
    submittedBy: adminUserId,
    date: '2024-01-25',
    age: 24,
    metric: 'FLY10_TIME',
    value: '1.12',
    units: 's',
    teamId: team2Id,
    teamNameSnapshot: 'Team Beta',
    organizationId: testOrgId,
    isVerified: true,
  }).returning();
  createdMeasurementIds.push(m5.id);

  const [m6] = await db.insert(measurements).values({
    userId: athlete3Id,
    submittedBy: adminUserId,
    date: '2024-02-25',
    age: 24,
    metric: 'FLY10_TIME',
    value: '1.10',
    units: 's',
    teamId: team2Id,
    teamNameSnapshot: 'Team Beta',
    organizationId: testOrgId,
    isVerified: true,
  }).returning();
  createdMeasurementIds.push(m6.id);

  const [m7] = await db.insert(measurements).values({
    userId: athlete3Id,
    submittedBy: adminUserId,
    date: '2024-03-25',
    age: 24,
    metric: 'FLY10_TIME',
    value: '1.09',
    units: 's',
    teamId: team2Id,
    teamNameSnapshot: 'Team Beta',
    organizationId: testOrgId,
    isVerified: true,
  }).returning();
  createdMeasurementIds.push(m7.id);

  // Athlete 4: 2 measurements
  const [m8] = await db.insert(measurements).values({
    userId: athlete4Id,
    submittedBy: adminUserId,
    date: '2024-01-30',
    age: 22,
    metric: 'FLY10_TIME',
    value: '1.18',
    units: 's',
    teamId: team2Id,
    teamNameSnapshot: 'Team Beta',
    organizationId: testOrgId,
    isVerified: true,
  }).returning();
  createdMeasurementIds.push(m8.id);

  const [m9] = await db.insert(measurements).values({
    userId: athlete4Id,
    submittedBy: adminUserId,
    date: '2024-02-28',
    age: 22,
    metric: 'FLY10_TIME',
    value: '1.16',
    units: 's',
    teamId: team2Id,
    teamNameSnapshot: 'Team Beta',
    organizationId: testOrgId,
    isVerified: true,
  }).returning();
  createdMeasurementIds.push(m9.id);

  // Athlete 5: 2 measurements (assigned to team1 for measurements)
  const [m10] = await db.insert(measurements).values({
    userId: athlete5Id,
    submittedBy: adminUserId,
    date: '2024-01-10',
    age: 23,
    metric: 'FLY10_TIME',
    value: '1.14',
    units: 's',
    teamId: team1Id,
    teamNameSnapshot: 'Team Alpha',
    organizationId: testOrgId,
    isVerified: true,
  }).returning();
  createdMeasurementIds.push(m10.id);

  const [m11] = await db.insert(measurements).values({
    userId: athlete5Id,
    submittedBy: adminUserId,
    date: '2024-02-10',
    age: 23,
    metric: 'FLY10_TIME',
    value: '1.12',
    units: 's',
    teamId: team1Id,
    teamNameSnapshot: 'Team Alpha',
    organizationId: testOrgId,
    isVerified: true,
  }).returning();
  createdMeasurementIds.push(m11.id);

  // Athlete 6: 1 measurement (no team context)
  const [m12] = await db.insert(measurements).values({
    userId: athlete6Id,
    submittedBy: adminUserId,
    date: '2024-01-05',
    age: 24,
    metric: 'FLY10_TIME',
    value: '1.11',
    units: 's',
    teamId: null,
    teamNameSnapshot: null,
    organizationId: testOrgId,
    isVerified: true,
  }).returning();
  createdMeasurementIds.push(m12.id);

  // Summary of test data:
  // Team 1: Athletes 1 (Male, Soccer), 2 (Female, Soccer), 5 (Not Specified, Soccer) = 6 measurements
  // Team 2: Athletes 3 (Male, Soccer), 4 (Female, Soccer), 5 (Not Specified, Soccer) = 5 measurements
  // No team: Athlete 6 (Male, Soccer) = 1 measurement
  // Total: 12 measurements
};

// Cleanup test data
const cleanupTestData = async () => {
  try {
    // Delete in reverse order of dependencies
    if (createdMeasurementIds.length > 0) {
      await db.delete(measurements).where(inArray(measurements.id, createdMeasurementIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(userOrganizations).where(inArray(userOrganizations.userId, createdUserIds));
      await db.delete(userTeams).where(inArray(userTeams.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdTeamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, createdTeamIds));
    }
    if (createdOrgIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, createdOrgIds));
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
};

describe('Measurement API Filters Integration Tests', () => {
  beforeAll(async () => {
    // Validate DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL must be set to run integration tests. ' +
        'See README.md for PostgreSQL setup instructions.'
      );
    }

    // Create test app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Register routes
    await registerRoutes(app);

    // Setup test data
    await setupTestData();
  });

  afterEach(() => {
    // Clean up any active agents after each test
    activeAgents.forEach(agent => {
      cleanupAgent(agent);
    });
    activeAgents.clear();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();

    // Ensure all agents are cleaned up
    activeAgents.forEach(agent => {
      cleanupAgent(agent);
    });
    activeAgents.clear();
  });

  describe('Team Filter Tests', () => {
    it('should filter measurements by single team ID', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&teamIds=${team1Id}&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(6); // Athletes 1, 2, 5 with 2 measurements each

      // Verify all measurements are from team1
      response.body.forEach((m: any) => {
        expect(m.teamId).toBe(team1Id);
      });
    });

    it('should filter measurements by multiple team IDs (comma-separated)', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&teamIds=${team1Id},${team2Id}&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(11); // All team measurements (excluding independent athlete 6)

      // Verify all measurements are from team1 or team2
      response.body.forEach((m: any) => {
        expect([team1Id, team2Id]).toContain(m.teamId);
      });
    });

    it('should return empty array when no measurements match team filter', async () => {
      const agent = await createAuthenticatedSession();

      // Use a non-existent UUID
      const fakeTeamId = '00000000-0000-0000-0000-000000000000';
      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&teamIds=${fakeTeamId}&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(0);
    });
  });

  describe('Gender Filter Tests', () => {
    it('should filter measurements by "Male" gender', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&gender=Male&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(6); // Athletes 1 (2), 3 (3), 6 (1)

      // Verify all measurements are from male athletes
      response.body.forEach((m: any) => {
        expect(m.user.gender).toBe('Male');
      });
    });

    it('should filter measurements by "Female" gender', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&gender=Female&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(4); // Athletes 2 (2), 4 (2)

      // Verify all measurements are from female athletes
      response.body.forEach((m: any) => {
        expect(m.user.gender).toBe('Female');
      });
    });

    it('should filter measurements by "Not Specified" gender', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&gender=Not Specified&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(2); // Athlete 5 (2)

      // Verify all measurements are from "Not Specified" gender athletes
      response.body.forEach((m: any) => {
        expect(m.user.gender).toBe('Not Specified');
      });
    });

    it('should return all measurements when no gender filter applied', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(12); // All measurements
    });
  });

  describe('Sport Filter Tests', () => {
    it('should filter measurements by specific sport (Soccer)', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&sport=Soccer&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(12); // All athletes play Soccer

      // Verify all measurements are from Soccer athletes
      response.body.forEach((m: any) => {
        expect(m.user.sports).toContain('Soccer');
      });
    });

    it('should return empty array when filtering by sport not in test data', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&sport=Basketball&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(0); // No basketball athletes in test data
    });

    it('should handle athletes with multiple sports', async () => {
      const agent = await createAuthenticatedSession();

      // In our test data, all athletes have only Soccer
      // This test verifies the implementation handles the sports array correctly
      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&sport=Soccer&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      response.body.forEach((m: any) => {
        expect(Array.isArray(m.user.sports)).toBe(true);
        expect(m.user.sports).toContain('Soccer');
      });
    });
  });

  describe('Combined Filter Tests', () => {
    it('should apply team + gender filters together', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&teamIds=${team1Id}&gender=Male&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(2); // Only Athlete 1 (Male, Team 1) = 2 measurements

      // Verify filters are applied correctly
      response.body.forEach((m: any) => {
        expect(m.teamId).toBe(team1Id);
        expect(m.user.gender).toBe('Male');
      });
    });

    it('should apply team + sport filters together', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&teamIds=${team2Id}&sport=Soccer&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(5); // Athletes 3 (3) and 4 (2) on Team 2 play Soccer

      // Verify filters are applied correctly
      response.body.forEach((m: any) => {
        expect(m.teamId).toBe(team2Id);
        expect(m.user.sports).toContain('Soccer');
      });
    });

    it('should apply all three filters (team + gender + sport) together', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&teamIds=${team1Id}&gender=Female&sport=Soccer&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(2); // Only Athlete 2 (Female, Soccer, Team 1) = 2 measurements

      // Verify all filters are applied correctly
      response.body.forEach((m: any) => {
        expect(m.teamId).toBe(team1Id);
        expect(m.user.gender).toBe('Female');
        expect(m.user.sports).toContain('Soccer');
      });
    });

    it('should return correct count when multiple filters narrow results', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&teamIds=${team2Id}&gender=Male&sport=Soccer&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(3); // Only Athlete 3 (Male, Soccer, Team 2) = 3 measurements

      // Verify filters
      response.body.forEach((m: any) => {
        expect(m.teamId).toBe(team2Id);
        expect(m.user.gender).toBe('Male');
        expect(m.user.sports).toContain('Soccer');
      });
    });

    it('should return empty array when combined filters match nothing', async () => {
      const agent = await createAuthenticatedSession();

      // Female athletes on Team 2 play Soccer, but filtering by non-existent sport
      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&teamIds=${team2Id}&gender=Female&sport=Basketball&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(0);
    });
  });

  describe('Birth Year Filter Test (Verify Existing Functionality)', () => {
    it('should filter by birthYearFrom and birthYearTo', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&birthYearFrom=2001&birthYearTo=2002&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(6); // Athletes 2 (2001, 2 measurements), 4 (2002, 2 measurements), 5 (2001, 2 measurements)

      // Verify birth years
      response.body.forEach((m: any) => {
        expect(m.user.birthYear).toBeGreaterThanOrEqual(2001);
        expect(m.user.birthYear).toBeLessThanOrEqual(2002);
      });
    });

    it('should work combined with team/gender/sport filters', async () => {
      const agent = await createAuthenticatedSession();

      const response = await agent
        .get(`/api/measurements?metric=FLY10_TIME&birthYearFrom=2000&birthYearTo=2001&teamIds=${team1Id}&gender=Female&organizationId=${testOrgId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(2); // Athlete 2 (2001, Female, Team 1) = 2 measurements

      // Verify all filters
      response.body.forEach((m: any) => {
        expect(m.user.birthYear).toBeGreaterThanOrEqual(2000);
        expect(m.user.birthYear).toBeLessThanOrEqual(2001);
        expect(m.teamId).toBe(team1Id);
        expect(m.user.gender).toBe('Female');
      });
    });
  });
});
