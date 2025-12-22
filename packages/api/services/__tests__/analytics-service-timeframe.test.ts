/**
 * Unit tests for AnalyticsService.getDashboardStats() with date range filtering
 *
 * Test coverage:
 * - Filters measurements by provided start/end date
 * - Defaults to last 30 days when no dates provided (backward compatibility)
 * - Works with existing teamId/athleteId filters alongside date range
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { AnalyticsService } from '../analytics-service';
import { db } from '../../db';
import { measurements, teams, organizations, users, userTeams, organizationMetrics } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('AnalyticsService - Date Range Filtering', () => {
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
      name: `Test Org Timeframe ${uniqueSuffix}`,
      description: 'Test organization for timeframe analytics tests',
    }).returning();
    testOrgId = org.id;

    // Create test team
    const [team] = await db.insert(teams).values({
      name: 'Test Team Timeframe',
      organizationId: testOrgId,
      level: 'College',
    }).returning();
    testTeamId = team.id;

    // Create test athletes
    const [athlete1] = await db.insert(users).values({
      username: `athlete1_timeframe_${uniqueSuffix}`,
      emails: ['athlete1_timeframe@test.com'],
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
      username: `athlete2_timeframe_${uniqueSuffix}`,
      emails: ['athlete2_timeframe@test.com'],
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
      username: `coach_timeframe_${uniqueSuffix}`,
      emails: ['coach_timeframe@test.com'],
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

    // Enable metrics for this organization (required for getDashboardStats to return metric stats)
    await db.insert(organizationMetrics).values([
      { organizationId: testOrgId, metricCode: 'FLY10_TIME', isEnabled: true },
      { organizationId: testOrgId, metricCode: 'VERTICAL_JUMP', isEnabled: true },
    ]).onConflictDoNothing();
  });

  afterEach(async () => {
    // Cleanup in reverse dependency order
    if (testOrgId) {
      await db.delete(measurements).where(eq(measurements.userId, testUserId1));
      await db.delete(measurements).where(eq(measurements.userId, testUserId2));
      await db.delete(userTeams).where(eq(userTeams.userId, testUserId1));
      await db.delete(userTeams).where(eq(userTeams.userId, testUserId2));
      await db.delete(organizationMetrics).where(eq(organizationMetrics.organizationId, testOrgId));
      await db.delete(teams).where(eq(teams.organizationId, testOrgId));
      await db.delete(users).where(eq(users.id, testUserId1));
      await db.delete(users).where(eq(users.id, testUserId2));
      await db.delete(users).where(eq(users.id, testSubmitterId));
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe('getDashboardStats with date range', () => {
    beforeEach(async () => {
      const today = new Date();

      // Create measurements at specific dates
      // Recent (5 days ago): within custom range
      const date5DaysAgo = new Date(today);
      date5DaysAgo.setDate(date5DaysAgo.getDate() - 5);

      await db.insert(measurements).values([
        {
          userId: testUserId1,
          submittedBy: testSubmitterId,
          date: date5DaysAgo.toISOString(),
          metric: 'FLY10_TIME',
          value: '1.40',
          units: 's',
          age: 24,
          isVerified: true,
        },
        {
          userId: testUserId2,
          submittedBy: testSubmitterId,
          date: date5DaysAgo.toISOString(),
          metric: 'VERTICAL_JUMP',
          value: '34.0',
          units: 'in',
          age: 25,
          isVerified: true,
        },
      ]);

      // Older (35 days ago): outside last 30 days but might be in custom range
      const date35DaysAgo = new Date(today);
      date35DaysAgo.setDate(date35DaysAgo.getDate() - 35);

      await db.insert(measurements).values([
        {
          userId: testUserId1,
          submittedBy: testSubmitterId,
          date: date35DaysAgo.toISOString(),
          metric: 'FLY10_TIME',
          value: '1.50',
          units: 's',
          age: 24,
          isVerified: true,
        },
        {
          userId: testUserId2,
          submittedBy: testSubmitterId,
          date: date35DaysAgo.toISOString(),
          metric: 'VERTICAL_JUMP',
          value: '32.0',
          units: 'in',
          age: 25,
          isVerified: true,
        },
      ]);
    });

    it('should filter measurements by provided date range', async () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7); // Last 7 days
      const endDate = today;

      const result = await analyticsService.getDashboardStats(testOrgId, {
        startDate,
        endDate,
      });

      // Should only include measurements from last 7 days (5 days ago)
      expect(result.bestFLY10_TIMELast30Days).toBeDefined();
      expect(result.bestFLY10_TIMELast30Days?.value).toBe(1.40);
      expect(result.bestVERTICAL_JUMPLast30Days).toBeDefined();
      expect(result.bestVERTICAL_JUMPLast30Days?.value).toBe(34.0);
    });

    it('should default to last 30 days when no dates provided (backward compatibility)', async () => {
      const result = await analyticsService.getDashboardStats(testOrgId);

      // Should include measurements from last 30 days (5 days ago) but not older ones (35 days ago)
      expect(result.bestFLY10_TIMELast30Days).toBeDefined();
      expect(result.bestFLY10_TIMELast30Days?.value).toBe(1.40);
      expect(result.bestVERTICAL_JUMPLast30Days).toBeDefined();
      expect(result.bestVERTICAL_JUMPLast30Days?.value).toBe(34.0);
    });

    it('should include older measurements when custom range is wider', async () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 40); // Last 40 days
      const endDate = today;

      const result = await analyticsService.getDashboardStats(testOrgId, {
        startDate,
        endDate,
      });

      // Should include both recent (5 days ago) and older (35 days ago) measurements
      // For FLY10_TIME, best is 1.40 (lower is better)
      expect(result.bestFLY10_TIMELast30Days).toBeDefined();
      expect(result.bestFLY10_TIMELast30Days?.value).toBe(1.40);
      // For VERTICAL_JUMP, best is 34.0 (higher is better)
      expect(result.bestVERTICAL_JUMPLast30Days).toBeDefined();
      expect(result.bestVERTICAL_JUMPLast30Days?.value).toBe(34.0);
    });

    it('should work with teamId filter alongside date range', async () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7);
      const endDate = today;

      const result = await analyticsService.getDashboardStats(testOrgId, {
        teamId: testTeamId,
        startDate,
        endDate,
      });

      expect(result.totalAthletes).toBe(2);
      expect(result.bestFLY10_TIMELast30Days).toBeDefined();
    });

    it('should work with athleteId filter alongside date range', async () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7);
      const endDate = today;

      const result = await analyticsService.getDashboardStats(testOrgId, {
        athleteId: testUserId1,
        startDate,
        endDate,
      });

      expect(result.totalAthletes).toBe(1);
      expect(result.bestFLY10_TIMELast30Days).toBeDefined();
      expect(result.bestFLY10_TIMELast30Days?.value).toBe(1.40);
    });

    it('should return undefined for metrics when no measurements in date range', async () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 50); // 50 days ago
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() - 10); // 60 days ago to 50 days ago (no measurements)

      const result = await analyticsService.getDashboardStats(testOrgId, {
        startDate,
        endDate,
      });

      // No measurements in this range
      expect(result.bestFLY10_TIMELast30Days).toBeUndefined();
      expect(result.bestVERTICAL_JUMPLast30Days).toBeUndefined();
    });
  });
});
