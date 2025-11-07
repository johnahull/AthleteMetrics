/**
 * Integration tests for measurement gender filtering
 * Tests that the gender query parameter correctly filters measurements by athlete gender
 *
 * NOTE: Requires DATABASE_URL environment variable to be set to a PostgreSQL connection string
 */

// Set environment variables before any imports
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';
import { randomUUID } from 'crypto';

// Mock vite module
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';
import { db } from '../../packages/api/db';
import { users, organizations, teams, userTeams, measurements } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

let app: Express;
let adminAgent: request.SuperAgentTest;
let testOrgId: string;
let testTeamId: string;
let maleAthleteId: string;
let femaleAthleteId: string;
let notSpecifiedAthleteId: string;
let maleMeasurementId: string;
let femaleMeasurementId: string;
let notSpecifiedMeasurementId: string;

const TEST_DATE = '2024-01-15T00:00:00.000Z';

describe('Measurement Gender Filter Integration Tests', () => {
  beforeAll(async () => {
    // Validate DATABASE_URL
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

    // Create authenticated admin session
    adminAgent = request.agent(app);
    const loginResponse = await adminAgent
      .post('/api/auth/login')
      .send({
        username: process.env.ADMIN_USER || 'admin',
        password: process.env.ADMIN_PASSWORD || 'TestPassword123!'
      });

    expect(loginResponse.status).toBe(200);

    // Create test organization
    const [testOrg] = await db.insert(organizations).values({
      id: randomUUID(),
      name: `Gender Filter Test Org ${Date.now()}`,
      type: 'club',
      isActive: true,
    }).returning();
    testOrgId = testOrg.id;

    // Create test team
    const [testTeam] = await db.insert(teams).values({
      id: randomUUID(),
      name: `Gender Filter Test Team ${Date.now()}`,
      organizationId: testOrgId,
      sport: 'Track',
      isArchived: false,
    }).returning();
    testTeamId = testTeam.id;

    // Create male athlete
    const [maleAthlete] = await db.insert(users).values({
      id: randomUUID(),
      username: `maleathlete_${Date.now()}`,
      email: `maleathlete_${Date.now()}@test.com`,
      password: 'Test123!@',  // Required field
      role: 'athlete',
      firstName: 'John',
      lastName: 'Male',
      fullName: 'John Male',
      birthDate: '2005-06-15',
      birthYear: 2005,
      gender: 'Male',
      sports: ['Track'],
      primaryOrganizationId: testOrgId,
      isActive: true,
    }).returning();
    maleAthleteId = maleAthlete.id;

    // Create female athlete
    const [femaleAthlete] = await db.insert(users).values({
      id: randomUUID(),
      username: `femaleathlete_${Date.now()}`,
      email: `femaleathlete_${Date.now()}@test.com`,
      password: 'Test123!@',  // Required field
      role: 'athlete',
      firstName: 'Jane',
      lastName: 'Female',
      fullName: 'Jane Female',
      birthDate: '2006-03-20',
      birthYear: 2006,
      gender: 'Female',
      sports: ['Track'],
      primaryOrganizationId: testOrgId,
      isActive: true,
    }).returning();
    femaleAthleteId = femaleAthlete.id;

    // Create athlete with gender not specified
    const [notSpecifiedAthlete] = await db.insert(users).values({
      id: randomUUID(),
      username: `notspecifiedathlete_${Date.now()}`,
      email: `notspecifiedathlete_${Date.now()}@test.com`,
      password: 'Test123!@',  // Required field
      role: 'athlete',
      firstName: 'Alex',
      lastName: 'NotSpecified',
      fullName: 'Alex NotSpecified',
      birthDate: '2004-09-10',
      birthYear: 2004,
      gender: 'Not Specified',
      sports: ['Track'],
      primaryOrganizationId: testOrgId,
      isActive: true,
    }).returning();
    notSpecifiedAthleteId = notSpecifiedAthlete.id;

    // Add all athletes to team
    await db.insert(userTeams).values([
      {
        id: randomUUID(),
        userId: maleAthleteId,
        teamId: testTeamId,
        isActive: true,
        joinedAt: new Date('2024-01-01'),
      },
      {
        id: randomUUID(),
        userId: femaleAthleteId,
        teamId: testTeamId,
        isActive: true,
        joinedAt: new Date('2024-01-01'),
      },
      {
        id: randomUUID(),
        userId: notSpecifiedAthleteId,
        teamId: testTeamId,
        isActive: true,
        joinedAt: new Date('2024-01-01'),
      },
    ]);

    // Create measurements for each athlete
    const [maleMeasurement] = await db.insert(measurements).values({
      id: randomUUID(),
      userId: maleAthleteId,
      submittedBy: maleAthleteId,
      date: TEST_DATE,
      metric: 'DASH_40YD',
      value: '4.50',
      units: 's',
      age: 18,
      teamId: testTeamId,
      organizationId: testOrgId,
      isVerified: true,
    }).returning();
    maleMeasurementId = maleMeasurement.id;

    const [femaleMeasurement] = await db.insert(measurements).values({
      id: randomUUID(),
      userId: femaleAthleteId,
      submittedBy: femaleAthleteId,
      date: TEST_DATE,
      metric: 'DASH_40YD',
      value: '5.20',
      units: 's',
      age: 17,
      teamId: testTeamId,
      organizationId: testOrgId,
      isVerified: true,
    }).returning();
    femaleMeasurementId = femaleMeasurement.id;

    const [notSpecifiedMeasurement] = await db.insert(measurements).values({
      id: randomUUID(),
      userId: notSpecifiedAthleteId,
      submittedBy: notSpecifiedAthleteId,
      date: TEST_DATE,
      metric: 'DASH_40YD',
      value: '4.85',
      units: 's',
      age: 19,
      teamId: testTeamId,
      organizationId: testOrgId,
      isVerified: true,
    }).returning();
    notSpecifiedMeasurementId = notSpecifiedMeasurement.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (maleMeasurementId || femaleMeasurementId || notSpecifiedMeasurementId) {
      const ids = [maleMeasurementId, femaleMeasurementId, notSpecifiedMeasurementId].filter(Boolean);
      if (ids.length > 0) {
        await db.delete(measurements).where(inArray(measurements.id, ids));
      }
    }

    if (maleAthleteId || femaleAthleteId || notSpecifiedAthleteId) {
      const ids = [maleAthleteId, femaleAthleteId, notSpecifiedAthleteId].filter(Boolean);
      if (ids.length > 0) {
        await db.delete(userTeams).where(inArray(userTeams.userId, ids));
        await db.delete(users).where(inArray(users.id, ids));
      }
    }

    if (testTeamId) {
      await db.delete(teams).where(eq(teams.id, testTeamId));
    }

    if (testOrgId) {
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe('GET /api/measurements with gender filter', () => {
    it('should return only male athletes when gender=Male', async () => {
      const response = await adminAgent
        .get('/api/measurements')
        .query({
          metric: 'DASH_40YD',
          gender: 'Male',
          organizationId: testOrgId,
        });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(1);
      expect(response.body[0].user.gender).toBe('Male');
      expect(response.body[0].user.fullName).toBe('John Male');
      expect(response.body[0].id).toBe(maleMeasurementId);
    });

    it('should return only female athletes when gender=Female', async () => {
      const response = await adminAgent
        .get('/api/measurements')
        .query({
          metric: 'DASH_40YD',
          gender: 'Female',
          organizationId: testOrgId,
        });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(1);
      expect(response.body[0].user.gender).toBe('Female');
      expect(response.body[0].user.fullName).toBe('Jane Female');
      expect(response.body[0].id).toBe(femaleMeasurementId);
    });

    it('should return only "Not Specified" athletes when gender=Not Specified', async () => {
      const response = await adminAgent
        .get('/api/measurements')
        .query({
          metric: 'DASH_40YD',
          gender: 'Not Specified',
          organizationId: testOrgId,
        });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(1);
      expect(response.body[0].user.gender).toBe('Not Specified');
      expect(response.body[0].user.fullName).toBe('Alex NotSpecified');
      expect(response.body[0].id).toBe(notSpecifiedMeasurementId);
    });

    it('should return all measurements when no gender filter is applied', async () => {
      const response = await adminAgent
        .get('/api/measurements')
        .query({
          metric: 'DASH_40YD',
          organizationId: testOrgId,
        });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(3);

      const genders = response.body.map((m: any) => m.user.gender).sort();
      expect(genders).toEqual(['Female', 'Male', 'Not Specified']);
    });

    it('should return 400 for invalid gender value', async () => {
      const response = await adminAgent
        .get('/api/measurements')
        .query({
          metric: 'DASH_40YD',
          gender: 'InvalidGender',
          organizationId: testOrgId,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid query parameters');
    });

    it('should combine gender filter with other filters correctly', async () => {
      // Test gender + birthYearFrom filter
      const response = await adminAgent
        .get('/api/measurements')
        .query({
          metric: 'DASH_40YD',
          gender: 'Male',
          birthYearFrom: 2005,
          organizationId: testOrgId,
        });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(1);
      expect(response.body[0].user.gender).toBe('Male');
      expect(response.body[0].user.birthYear).toBeGreaterThanOrEqual(2005);
    });

    it('should work with gender filter and date range', async () => {
      const response = await adminAgent
        .get('/api/measurements')
        .query({
          metric: 'DASH_40YD',
          gender: 'Female',
          dateFrom: '2024-01-01T00:00:00.000Z',
          dateTo: '2024-12-31T23:59:59.999Z',
          organizationId: testOrgId,
        });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(1);
      expect(response.body[0].user.gender).toBe('Female');
    });
  });

  describe('Gender filter case sensitivity', () => {
    it('should be case-sensitive and reject lowercase "male"', async () => {
      const response = await adminAgent
        .get('/api/measurements')
        .query({
          metric: 'DASH_40YD',
          gender: 'male',
          organizationId: testOrgId,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid query parameters');
    });

    it('should be case-sensitive and reject "FEMALE" in all caps', async () => {
      const response = await adminAgent
        .get('/api/measurements')
        .query({
          metric: 'DASH_40YD',
          gender: 'FEMALE',
          organizationId: testOrgId,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid query parameters');
    });
  });
});
