import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { AnalyticsService } from '../analytics-service';
import { db } from '../../db';
import { measurements, teams, organizations, users, userTeams } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;
  let testOrgId: string;
  let testTeamId: string;
  let testUserId1: string;
  let testUserId2: string;
  let testSubmitterId: string;

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl.includes('test') && !dbUrl.includes('localhost')) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety. Running tests against production is forbidden.');
    }
  });

  beforeEach(async () => {
    analyticsService = new AnalyticsService();

    // Create test organization with unique name to avoid race conditions
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const [org] = await db.insert(organizations).values({
      name: `Test Org ${uniqueSuffix}`,
      description: 'Test organization for analytics tests',
    }).returning();
    testOrgId = org.id;

    // Create test team
    const [team] = await db.insert(teams).values({
      name: 'Test Team',
      organizationId: testOrgId,
      level: 'College',
    }).returning();
    testTeamId = team.id;

    // Create test athletes
    const [athlete1] = await db.insert(users).values({
      username: `athlete1${uniqueSuffix}`,
      emails: ['athlete1@test.com'],
      password: 'hashedpassword',
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      birthYear: 2000,
      sports: ['Soccer'],
      isActive: true,
    }).returning();
    testUserId1 = athlete1.id;

    const [athlete2] = await db.insert(users).values({
      username: `athlete2${uniqueSuffix}`,
      emails: ['athlete2@test.com'],
      password: 'hashedpassword',
      firstName: 'Jane',
      lastName: 'Smith',
      fullName: 'Jane Smith',
      birthYear: 1999,
      sports: ['Soccer'],
      isActive: true,
    }).returning();
    testUserId2 = athlete2.id;

    // Create test submitter
    const [submitter] = await db.insert(users).values({
      username: `coach${uniqueSuffix}`,
      emails: ['coach@test.com'],
      password: 'hashedpassword',
      firstName: 'Coach',
      lastName: 'Test',
      fullName: 'Coach Test',
    }).returning();
    testSubmitterId = submitter.id;

    // Add athletes to team
    await db.insert(userTeams).values([
      { userId: testUserId1, teamId: testTeamId, isActive: true },
      { userId: testUserId2, teamId: testTeamId, isActive: true },
    ]);
  });

  afterEach(async () => {
    // Cleanup in reverse dependency order
    if (testOrgId) {
      await db.delete(measurements).where(eq(measurements.userId, testUserId1));
      await db.delete(measurements).where(eq(measurements.userId, testUserId2));
      await db.delete(userTeams).where(eq(userTeams.userId, testUserId1));
      await db.delete(userTeams).where(eq(userTeams.userId, testUserId2));
      await db.delete(teams).where(eq(teams.organizationId, testOrgId));
      await db.delete(users).where(eq(users.id, testUserId1));
      await db.delete(users).where(eq(users.id, testUserId2));
      await db.delete(users).where(eq(users.id, testSubmitterId));
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe('getAthleteStats', () => {
    it('should return athlete stats with best performances', async () => {
      // Create measurements for athlete
      await db.insert(measurements).values([
        {
          userId: testUserId1,
          submittedBy: testSubmitterId,
          date: new Date('2024-01-15').toISOString(),
          metric: 'FLY10_TIME',
          value: '1.45',
          units: 's',
          age: 24,
          isVerified: true,
        },
        {
          userId: testUserId1,
          submittedBy: testSubmitterId,
          date: new Date('2024-01-20').toISOString(),
          metric: 'FLY10_TIME',
          value: '1.40', // Best (lowest)
          units: 's',
          age: 24,
          isVerified: true,
        },
        {
          userId: testUserId1,
          submittedBy: testSubmitterId,
          date: new Date('2024-01-15').toISOString(),
          metric: 'VERTICAL_JUMP',
          value: '32.5',
          units: 'in',
          age: 24,
          isVerified: true,
        },
        {
          userId: testUserId1,
          submittedBy: testSubmitterId,
          date: new Date('2024-01-20').toISOString(),
          metric: 'VERTICAL_JUMP',
          value: '34.0', // Best (highest)
          units: 'in',
          age: 24,
          isVerified: true,
        },
      ]);

      const result = await analyticsService.getAthleteStats(testUserId1);

      expect(result.bestFly10).toBe(1.40);
      expect(result.bestVertical).toBe(34.0);
      expect(result.measurementCount).toBe(4);
    });

    it('should return undefined for metrics with no measurements', async () => {
      const result = await analyticsService.getAthleteStats(testUserId1);

      expect(result.bestFly10).toBeUndefined();
      expect(result.bestVertical).toBeUndefined();
      expect(result.measurementCount).toBe(0);
    });

    it('should exclude unverified measurements', async () => {
      await db.insert(measurements).values([
        {
          userId: testUserId1,
          submittedBy: testSubmitterId,
          date: new Date('2024-01-15').toISOString(),
          metric: 'FLY10_TIME',
          value: '1.45',
          units: 's',
          age: 24,
          isVerified: true,
        },
        {
          userId: testUserId1,
          submittedBy: testSubmitterId,
          date: new Date('2024-01-20').toISOString(),
          metric: 'FLY10_TIME',
          value: '1.30', // Better but unverified
          units: 's',
          age: 24,
          isVerified: false,
        },
      ]);

      const result = await analyticsService.getAthleteStats(testUserId1);

      expect(result.bestFly10).toBe(1.45); // Only verified measurement
      expect(result.measurementCount).toBe(1);
    });
  });

  describe('getTeamStats', () => {
    it('should return stats for all teams in organization', async () => {
      // Create measurements for both athletes
      await db.insert(measurements).values([
        {
          userId: testUserId1,
          submittedBy: testSubmitterId,
          date: new Date('2024-01-15').toISOString(),
          metric: 'FLY10_TIME',
          value: '1.45',
          units: 's',
          age: 24,
          teamId: testTeamId,
          isVerified: true,
        },
        {
          userId: testUserId2,
          submittedBy: testSubmitterId,
          date: new Date('2024-01-20').toISOString(),
          metric: 'FLY10_TIME',
          value: '1.50',
          units: 's',
          age: 25,
          teamId: testTeamId,
          isVerified: true,
        },
        {
          userId: testUserId1,
          submittedBy: testSubmitterId,
          date: new Date('2024-01-15').toISOString(),
          metric: 'VERTICAL_JUMP',
          value: '32.0',
          units: 'in',
          age: 24,
          teamId: testTeamId,
          isVerified: true,
        },
      ]);

      const result = await analyticsService.getTeamStats(testOrgId);

      expect(result).toHaveLength(1);
      expect(result[0].teamId).toBe(testTeamId);
      expect(result[0].teamName).toBe('Test Team');
      expect(result[0].organizationName).toContain('Test Org'); // Dynamic timestamp
      expect(result[0].athleteCount).toBe(2);
      expect(result[0].bestFly10).toBe(1.45); // Best (lowest)
      expect(result[0].bestVertical).toBe(32.0);
      expect(result[0].latestTest).toBeDefined();
    });

    it('should throw error when no organizationId provided', async () => {
      await expect(analyticsService.getTeamStats()).rejects.toThrow('organizationId is required for team statistics');
    });

    it('should exclude archived teams', async () => {
      // Archive the team
      await db.update(teams)
        .set({ isArchived: true, archivedAt: new Date() })
        .where(eq(teams.id, testTeamId));

      const result = await analyticsService.getTeamStats(testOrgId);

      // Should not include archived team
      expect(result).toHaveLength(0);
    });
  });

  describe('getDashboardStats', () => {
    beforeEach(async () => {
      // Create recent measurements (within last 30 days)
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5); // 5 days ago

      await db.insert(measurements).values([
        {
          userId: testUserId1,
          submittedBy: testSubmitterId,
          date: recentDate.toISOString(),
          metric: 'FLY10_TIME',
          value: '1.40',
          units: 's',
          age: 24,
          isVerified: true,
        },
        {
          userId: testUserId2,
          submittedBy: testSubmitterId,
          date: recentDate.toISOString(),
          metric: 'FLY10_TIME',
          value: '1.50',
          units: 's',
          age: 25,
          isVerified: true,
        },
        {
          userId: testUserId1,
          submittedBy: testSubmitterId,
          date: recentDate.toISOString(),
          metric: 'VERTICAL_JUMP',
          value: '34.0',
          units: 'in',
          age: 24,
          isVerified: true,
        },
        {
          userId: testUserId2,
          submittedBy: testSubmitterId,
          date: recentDate.toISOString(),
          metric: 'VERTICAL_JUMP',
          value: '32.0',
          units: 'in',
          age: 25,
          isVerified: true,
        },
      ]);
    });

    it('should return dashboard stats with athlete and team counts', async () => {
      const result = await analyticsService.getDashboardStats(testOrgId);

      expect(result.totalAthletes).toBe(2);
      expect(result.activeAthletes).toBe(2); // Both have real passwords
      expect(result.totalTeams).toBe(1);
    });

    it('should calculate best FLY10_TIME from last 30 days', async () => {
      const result = await analyticsService.getDashboardStats(testOrgId);

      expect(result.bestFLY10_TIMELast30Days).toBeDefined();
      expect(result.bestFLY10_TIMELast30Days?.value).toBe(1.40); // Best (lowest)
      expect(result.bestFLY10_TIMELast30Days?.userName).toBe('John Doe');
    });

    it('should calculate best VERTICAL_JUMP from last 30 days', async () => {
      const result = await analyticsService.getDashboardStats(testOrgId);

      expect(result.bestVERTICAL_JUMPLast30Days).toBeDefined();
      expect(result.bestVERTICAL_JUMPLast30Days?.value).toBe(34.0); // Best (highest)
      expect(result.bestVERTICAL_JUMPLast30Days?.userName).toBe('John Doe');
    });

    it('should not count athletes with INVITATION_PENDING as active', async () => {
      // Update one athlete to invitation pending
      await db.update(users)
        .set({ password: 'INVITATION_PENDING' })
        .where(eq(users.id, testUserId2));

      const result = await analyticsService.getDashboardStats(testOrgId);

      expect(result.totalAthletes).toBe(2);
      expect(result.activeAthletes).toBe(1); // Only athlete1
    });

    it('should exclude archived teams from count', async () => {
      // Archive the team
      await db.update(teams)
        .set({ isArchived: true, archivedAt: new Date() })
        .where(eq(teams.id, testTeamId));

      const result = await analyticsService.getDashboardStats(testOrgId);

      expect(result.totalTeams).toBe(0);
    });

    it('should not include measurements older than 30 days', async () => {
      // Clear recent measurements
      await db.delete(measurements).where(eq(measurements.userId, testUserId1));
      await db.delete(measurements).where(eq(measurements.userId, testUserId2));

      // Create old measurement (31 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);

      await db.insert(measurements).values({
        userId: testUserId1,
        submittedBy: testSubmitterId,
        date: oldDate.toISOString(),
        metric: 'FLY10_TIME',
        value: '1.30', // Better value but too old
        units: 's',
        age: 24,
        isVerified: true,
      });

      const result = await analyticsService.getDashboardStats(testOrgId);

      expect(result.bestFLY10_TIMELast30Days).toBeUndefined();
    });
  });

  describe('getUserStats (alias)', () => {
    it('should be an alias for getAthleteStats', async () => {
      await db.insert(measurements).values({
        userId: testUserId1,
        submittedBy: testSubmitterId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        age: 24,
        isVerified: true,
      });

      const athleteResult = await analyticsService.getAthleteStats(testUserId1);
      const userResult = await analyticsService.getUserStats(testUserId1);

      expect(userResult).toEqual(athleteResult);
    });
  });
});
