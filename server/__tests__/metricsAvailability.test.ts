/**
 * Tests for Metrics Availability Feature
 * Ensures that metric data indicators work correctly
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AnalyticsService } from '../analytics-simple';
import { db } from '../db';
import { measurements, users, userOrganizations, teams, userTeams, organizations } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { METRIC_CONFIG } from '@shared/analytics-types';

describe('Metrics Availability', () => {
  let analyticsService: AnalyticsService;
  let testOrgId: string;
  let testUserId: string;
  let testTeamId: string;

  beforeAll(async () => {
    analyticsService = new AnalyticsService();

    // Create test organization
    const testOrg = await db.insert(organizations).values({
      name: 'Test Organization ' + Date.now(),
      description: 'Test organization for metrics availability tests'
    }).returning();
    testOrgId = testOrg[0].id;

    // Create test user
    const testUser = await db.insert(users).values({
      username: 'test-metrics-user-' + Date.now(),
      password: 'test',
      firstName: 'Test',
      lastName: 'User',
      fullName: 'Test User',
      emails: ['test@test.com'],
      gender: 'Male',
      birthYear: 2000,
      isSiteAdmin: false
    }).returning();
    testUserId = testUser[0].id;

    // Add user to organization
    await db.insert(userOrganizations).values({
      userId: testUserId,
      organizationId: testOrgId,
      role: 'athlete'
    });

    // Create test team
    const testTeam = await db.insert(teams).values({
      name: 'Test Team',
      organizationId: testOrgId
    }).returning();
    testTeamId = testTeam[0].id;

    // Add user to team
    await db.insert(userTeams).values({
      userId: testUserId,
      teamId: testTeamId,
      isActive: true
    });

    // Insert test measurements for different metrics
    const today = new Date();
    const measurementsToInsert = [
      { metric: 'FLY10_TIME', count: 10 },
      { metric: 'VERTICAL_JUMP', count: 5 },
      { metric: 'DASH_40YD', count: 3 },
      // RSI, AGILITY_505, AGILITY_5105, T_TEST, TOP_SPEED will have 0
    ];

    for (const m of measurementsToInsert) {
      for (let i = 0; i < m.count; i++) {
        const measurementDate = new Date(today.getTime() - (i * 86400000));
        await db.insert(measurements).values({
          userId: testUserId,
          submittedBy: testUserId,
          teamId: testTeamId,
          metric: m.metric,
          value: (1.0 + (i * 0.1)).toString(),
          date: measurementDate.toISOString().split('T')[0],
          age: 24, // Calculate based on birth year if needed
          units: 's',
          isVerified: true
        });
      }
    }
  });

  afterAll(async () => {
    // Cleanup test data in correct order (foreign key constraints)
    if (testUserId) {
      await db.delete(measurements).where(eq(measurements.userId, testUserId));
      await db.delete(userTeams).where(eq(userTeams.userId, testUserId));
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    if (testTeamId) {
      await db.delete(teams).where(eq(teams.id, testTeamId));
    }
    if (testOrgId) {
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  it('should return correct counts for all metrics', async () => {
    const availability = await analyticsService.getMetricsAvailability(testOrgId);

    // Check that all metrics are present
    const allMetrics = Object.keys(METRIC_CONFIG);
    allMetrics.forEach(metric => {
      expect(availability).toHaveProperty(metric);
      expect(typeof availability[metric]).toBe('number');
    });

    // Check specific counts
    expect(availability.FLY10_TIME).toBe(10);
    expect(availability.VERTICAL_JUMP).toBe(5);
    expect(availability.DASH_40YD).toBe(3);
    expect(availability.RSI).toBe(0);
    expect(availability.AGILITY_505).toBe(0);
    expect(availability.AGILITY_5105).toBe(0);
    expect(availability.T_TEST).toBe(0);
    expect(availability.TOP_SPEED).toBe(0);
  });

  it('should filter by team correctly', async () => {
    const availability = await analyticsService.getMetricsAvailability(
      testOrgId,
      [testTeamId]
    );

    expect(availability.FLY10_TIME).toBe(10);
    expect(availability.VERTICAL_JUMP).toBe(5);
  });

  it('should filter by athlete correctly', async () => {
    const availability = await analyticsService.getMetricsAvailability(
      testOrgId,
      undefined,
      [testUserId]
    );

    expect(availability.FLY10_TIME).toBe(10);
    expect(availability.VERTICAL_JUMP).toBe(5);
  });

  it('should filter by date range correctly', async () => {
    const today = new Date();
    const threeDaysAgo = new Date(today.getTime() - (3 * 86400000));

    const availability = await analyticsService.getMetricsAvailability(
      testOrgId,
      undefined,
      undefined,
      { start: threeDaysAgo }
    );

    // Should only get measurements from last 3 days (0, 1, 2, 3 = 4 measurements)
    expect(availability.FLY10_TIME).toBeLessThanOrEqual(4);
    expect(availability.FLY10_TIME).toBeGreaterThan(0);
  });

  it('should return zeros for organization with no data', async () => {
    const availability = await analyticsService.getMetricsAvailability('nonexistent-org');

    Object.keys(METRIC_CONFIG).forEach(metric => {
      expect(availability[metric]).toBe(0);
    });
  });

  it('should be included in analytics response', async () => {
    const response = await analyticsService.getAnalyticsData({
      analysisType: 'individual',
      filters: {
        organizationId: testOrgId,
        athleteIds: [testUserId]
      },
      metrics: {
        primary: 'FLY10_TIME',
        additional: []
      },
      timeframe: {
        type: 'best',
        period: 'all_time'
      },
      athleteId: testUserId
    });

    expect(response.metricsAvailability).toBeDefined();
    expect(response.metricsAvailability!.FLY10_TIME).toBe(10);
    expect(response.metricsAvailability!.VERTICAL_JUMP).toBe(5);
    expect(response.metricsAvailability!.RSI).toBe(0);
  });
});
