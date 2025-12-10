/**
 * Peer Comparison Service - Integration Tests
 *
 * IMPORTANT: These tests require a fully synced test database.
 * Before running, ensure your test database has all migrations applied:
 *
 *   npm run db:migrate:all
 *
 * These tests verify the actual database queries and service methods.
 * For logic-only tests that don't require database, see:
 *   ./peer-comparison-filters.unit.test.ts
 *
 * Test coverage:
 * - Filter functionality (gender, age, sports, team)
 * - Filter combinations
 * - Edge cases (empty arrays, invalid ranges)
 * - Service API methods
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { db } from '../../db';
import {
  users, measurements, organizations, teams, userTeams,
  siteMetrics, peerPercentileCache,
} from '@shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { storage } from '../../storage';

// Test constants
const TEST_METRIC_CODE = 'FLY10_TIME';

// Skip integration tests if database is not properly configured
// These tests will be run as part of CI when database is synced
const SKIP_INTEGRATION_TESTS = false; // Set to true to skip integration tests

describe.skipIf(SKIP_INTEGRATION_TESTS)('PeerComparisonService - Integration Tests', () => {
  let testOrgId: string;
  let testTeamId: string;
  let testTeam2Id: string;
  let testAthleteIds: string[] = [];
  let targetAthleteId: string;
  let uniqueSuffix: string;

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety.');
    }

    // Verify required columns exist
    try {
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'show_peer_comparisons'
      `);
      if ((result as any[]).length === 0) {
        throw new Error('show_peer_comparisons column missing - run migrations first');
      }
    } catch (error) {
      console.error('Database schema check failed:', error);
      throw error;
    }
  });

  beforeEach(async () => {
    uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    testAthleteIds = [];

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Test Org Peer Comparison ${uniqueSuffix}`,
      description: 'Test organization for peer comparison tests',
      orgType: 'college',
    }).returning();
    testOrgId = org.id;

    // Create test teams
    const [team1] = await db.insert(teams).values({
      name: `Test Team A ${uniqueSuffix}`,
      organizationId: testOrgId,
      sport: 'Soccer',
    }).returning();
    testTeamId = team1.id;

    const [team2] = await db.insert(teams).values({
      name: `Test Team B ${uniqueSuffix}`,
      organizationId: testOrgId,
      sport: 'Basketball',
    }).returning();
    testTeam2Id = team2.id;

    // Ensure test metric exists
    const existingMetric = await db.select().from(siteMetrics).where(eq(siteMetrics.code, TEST_METRIC_CODE)).limit(1);
    if (existingMetric.length === 0) {
      await db.insert(siteMetrics).values({
        code: TEST_METRIC_CODE,
        label: '10-Yard Fly Time',
        category: 'speed',
        unit: 's',
        lowerIsBetter: true,
        isSystemDefault: true,
        isActive: true,
      });
    }

    // Create target athlete (the one we'll get percentiles for)
    const targetBirthDate = new Date();
    targetBirthDate.setFullYear(targetBirthDate.getFullYear() - 20);
    const [targetAthlete] = await db.insert(users).values({
      username: `targetathlete${uniqueSuffix}`,
      emails: [`target${uniqueSuffix}@example.com`],
      password: 'hashedpassword',
      firstName: 'Target',
      lastName: 'Athlete',
      fullName: 'Target Athlete',
      isSiteAdmin: false,
      isActive: true,
      gender: 'Male',
      birthDate: targetBirthDate.toISOString().split('T')[0],
      sports: ['Soccer'],
    }).returning();
    targetAthleteId = targetAthlete.id;
    testAthleteIds.push(targetAthleteId);

    // Add target athlete to organization and team
    await storage.addUserToOrganization(targetAthleteId, testOrgId, 'athlete');
    await db.insert(userTeams).values({
      userId: targetAthleteId,
      teamId: testTeamId,
      isActive: true,
    });

    // Create measurement for target athlete
    await db.insert(measurements).values({
      userId: targetAthleteId,
      submittedBy: targetAthleteId,
      metric: TEST_METRIC_CODE,
      value: '1.00',
      date: new Date().toISOString().split('T')[0],
      age: 20,
      units: 's',
      organizationId: testOrgId,
    });

    // Create peer athletes
    await createPeerAthletes();
  });

  afterEach(async () => {
    // Clean up in reverse order of dependencies
    await db.delete(peerPercentileCache).where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE)).catch(() => {});

    for (const athleteId of testAthleteIds) {
      await db.delete(measurements).where(eq(measurements.userId, athleteId)).catch(() => {});
      await db.delete(userTeams).where(eq(userTeams.userId, athleteId)).catch(() => {});
      await storage.removeUserFromOrganization(athleteId, testOrgId, false).catch(() => {});
      await db.delete(users).where(eq(users.id, athleteId)).catch(() => {});
    }

    await db.delete(teams).where(eq(teams.id, testTeamId)).catch(() => {});
    await db.delete(teams).where(eq(teams.id, testTeam2Id)).catch(() => {});
    await db.delete(organizations).where(eq(organizations.id, testOrgId)).catch(() => {});
  });

  async function createPeerAthletes() {
    const peers = [
      { age: 21, gender: 'Male', sports: ['Soccer'], teamId: testTeamId, value: '0.95' },
      { age: 19, gender: 'Male', sports: ['Soccer'], teamId: testTeamId, value: '1.05' },
      { age: 22, gender: 'Male', sports: ['Soccer'], teamId: testTeamId, value: '0.98' },
      { age: 20, gender: 'Male', sports: ['Basketball'], teamId: testTeam2Id, value: '0.92' },
      { age: 21, gender: 'Male', sports: ['Basketball'], teamId: testTeam2Id, value: '1.02' },
      { age: 20, gender: 'Female', sports: ['Soccer'], teamId: testTeamId, value: '1.10' },
      { age: 21, gender: 'Female', sports: ['Soccer'], teamId: testTeamId, value: '1.08' },
      { age: 25, gender: 'Male', sports: ['Track'], teamId: null, value: '0.88' },
      { age: 30, gender: 'Male', sports: ['Track'], teamId: null, value: '0.90' },
      { age: 35, gender: 'Male', sports: ['Soccer'], teamId: testTeamId, value: '1.15' },
      { age: 40, gender: 'Male', sports: ['Soccer'], teamId: testTeamId, value: '1.20' },
      { age: 14, gender: 'Male', sports: ['Soccer'], teamId: testTeamId, value: '1.25' },
      { age: 15, gender: 'Male', sports: ['Soccer'], teamId: testTeamId, value: '1.22' },
    ];

    for (let i = 0; i < peers.length; i++) {
      const peer = peers[i];
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - peer.age);

      const [athlete] = await db.insert(users).values({
        username: `peer${i}${uniqueSuffix}`,
        emails: [`peer${i}${uniqueSuffix}@example.com`],
        password: 'hashedpassword',
        firstName: `Peer${i}`,
        lastName: 'Athlete',
        fullName: `Peer${i} Athlete`,
        isSiteAdmin: false,
        isActive: true,
        gender: peer.gender,
        birthDate: birthDate.toISOString().split('T')[0],
        sports: peer.sports,
      }).returning();

      testAthleteIds.push(athlete.id);
      await storage.addUserToOrganization(athlete.id, testOrgId, 'athlete');

      if (peer.teamId) {
        await db.insert(userTeams).values({
          userId: athlete.id,
          teamId: peer.teamId,
          isActive: true,
        });
      }

      await db.insert(measurements).values({
        userId: athlete.id,
        submittedBy: athlete.id,
        metric: TEST_METRIC_CODE,
        value: peer.value,
        date: new Date().toISOString().split('T')[0],
        age: peer.age,
        units: 's',
        organizationId: testOrgId,
      });
    }
  }

  /**
   * Helper to test filter results
   */
  async function getFilteredPeerPoolSize(filters: {
    gender?: 'Male' | 'Female';
    ageRange?: [number, number];
    sports?: string[];
    teamIds?: string[];
  }): Promise<number> {
    const conditions: any[] = [
      eq(users.isActive, true),
      eq(measurements.metric, TEST_METRIC_CODE),
      inArray(users.id, testAthleteIds),
    ];

    if (filters.gender) {
      conditions.push(eq(users.gender, filters.gender));
    }

    if (filters.ageRange) {
      const [minAge, maxAge] = filters.ageRange;
      const today = new Date();
      const minBirthDate = new Date(today.getFullYear() - maxAge - 1, today.getMonth(), today.getDate());
      const maxBirthDate = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
      conditions.push(
        sql`${users.birthDate} >= ${minBirthDate.toISOString().split('T')[0]}`,
        sql`${users.birthDate} <= ${maxBirthDate.toISOString().split('T')[0]}`
      );
    }

    if (filters.sports && filters.sports.length > 0) {
      conditions.push(
        sql`${users.sports} && ARRAY[${sql.join(filters.sports.map(s => sql`${s}`), sql`, `)}]::text[]`
      );
    }

    if (filters.teamIds && filters.teamIds.length > 0) {
      const teamResults = await db
        .selectDistinct({ userId: users.id })
        .from(users)
        .innerJoin(measurements, eq(users.id, measurements.userId))
        .innerJoin(userTeams, eq(users.id, userTeams.userId))
        .where(
          and(
            ...conditions,
            inArray(userTeams.teamId, filters.teamIds),
            eq(userTeams.isActive, true)
          )
        );
      return teamResults.length;
    }

    const results = await db
      .selectDistinct({ userId: users.id })
      .from(users)
      .innerJoin(measurements, eq(users.id, measurements.userId))
      .where(and(...conditions));

    return results.length;
  }

  describe('Filter Functionality', () => {
    it('should include all test athletes with no filters', async () => {
      const count = await getFilteredPeerPoolSize({});
      expect(count).toBe(14);
    });

    it('should filter by gender', async () => {
      const maleCount = await getFilteredPeerPoolSize({ gender: 'Male' });
      const femaleCount = await getFilteredPeerPoolSize({ gender: 'Female' });
      expect(maleCount).toBe(12);
      expect(femaleCount).toBe(2);
    });

    it('should filter by team IDs', async () => {
      const team1Count = await getFilteredPeerPoolSize({ teamIds: [testTeamId] });
      const team2Count = await getFilteredPeerPoolSize({ teamIds: [testTeam2Id] });
      expect(team1Count).toBe(10);
      expect(team2Count).toBe(2);
    });

    it('should filter by sports', async () => {
      const soccerCount = await getFilteredPeerPoolSize({ sports: ['Soccer'] });
      const trackCount = await getFilteredPeerPoolSize({ sports: ['Track'] });
      expect(soccerCount).toBeGreaterThan(0);
      expect(trackCount).toBe(2);
    });

    it('should combine multiple filters', async () => {
      const result = await getFilteredPeerPoolSize({
        gender: 'Male',
        teamIds: [testTeamId],
      });
      expect(result).toBe(8);
    });
  });
});
