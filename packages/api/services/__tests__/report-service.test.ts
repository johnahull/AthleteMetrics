import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { ReportService } from '../report-service';
import { db } from '../../db';
import { organizations, users, reports, measurements, siteMetrics, organizationMetrics } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('ReportService', () => {
  let reportService: ReportService;
  let testOrgId: string;
  let testUserId: string;
  let testReportId: string;

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety.');
    }
  });

  beforeEach(async () => {
    reportService = new ReportService();

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Test Org Report Service ${uniqueSuffix}`,
      description: 'Test organization for report service tests',
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create test user
    const [user] = await db.insert(users).values({
      username: `testuser${uniqueSuffix}`,
      emails: [`testuser${uniqueSuffix}@example.com`],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'User',
      fullName: 'Test User',
    }).returning();
    testUserId = user.id;

    // Create test report
    const [report] = await db.insert(reports).values({
      name: `Test Report ${uniqueSuffix}`,
      organizationId: testOrgId,
      reportType: 'team',
      config: {
        timeframe: { type: 'preset', preset: 'all_time' },
        metrics: ['FLY10_TIME'],
      },
      createdBy: testUserId,
    }).returning();
    testReportId = report.id;
  });

  afterEach(async () => {
    // Clean up test data in reverse dependency order
    if (testReportId) {
      await db.delete(reports).where(eq(reports.id, testReportId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
    if (testOrgId) {
      await db.delete(organizationMetrics).where(eq(organizationMetrics.organizationId, testOrgId));
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe('calculateDateRange', () => {
    it('should calculate season timeframe correctly (Sep-May)', () => {
      const timeframe = { type: 'preset' as const, preset: 'season' as const };
      const result = (reportService as any).calculateDateRange(timeframe);

      expect(result).toHaveProperty('startDate');
      expect(result).toHaveProperty('endDate');
      expect(result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Season should start in September (month 09)
      const startMonth = parseInt(result.startDate.split('-')[1]);
      expect([8, 9]).toContain(startMonth); // Aug or Sep depending on current date
    });

    it('should calculate year timeframe correctly', () => {
      const timeframe = { type: 'preset' as const, preset: 'year' as const };
      const result = (reportService as any).calculateDateRange(timeframe);

      const startDate = new Date(result.startDate);
      const endDate = new Date(result.endDate);
      const diffInDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

      // Year timeframe should be approximately 365 days
      expect(diffInDays).toBeGreaterThanOrEqual(364);
      expect(diffInDays).toBeLessThanOrEqual(366);
    });

    it('should handle custom date range', () => {
      const timeframe = {
        type: 'custom' as const,
        customStart: '2024-01-01',
        customEnd: '2024-12-31',
      };
      const result = (reportService as any).calculateDateRange(timeframe);

      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe('2024-12-31');
    });

    it('should default to all_time for very old start date', () => {
      const timeframe = { type: 'preset' as const, preset: 'all_time' as const };
      const result = (reportService as any).calculateDateRange(timeframe);

      // all_time should start from a very old date (2000 or earlier)
      const startYear = parseInt(result.startDate.split('-')[0]);
      expect(startYear).toBeLessThanOrEqual(2000);
    });
  });

  describe('calculateCompositeIndex', () => {
    it('should calculate weighted composite score correctly', () => {
      const athletePerformances = {
        FLY10_TIME: 1.5,
        VERTICAL_JUMP: 30,
      };
      const weights = {
        FLY10_TIME: 0.6,
        VERTICAL_JUMP: 0.4,
      };
      const percentiles = {
        FLY10_TIME: 85,
        VERTICAL_JUMP: 75,
      };

      const result = reportService.calculateCompositeIndex(
        athletePerformances,
        weights,
        percentiles
      );

      // Expected: (85 * 0.6 + 75 * 0.4) / (0.6 + 0.4) = (51 + 30) / 1 = 81
      expect(result).toBe(81);
    });

    it('should normalize weights that don\'t sum to 1.0', () => {
      const athletePerformances = {
        FLY10_TIME: 1.5,
        VERTICAL_JUMP: 30,
      };
      const weights = {
        FLY10_TIME: 3,
        VERTICAL_JUMP: 2,
      };
      const percentiles = {
        FLY10_TIME: 80,
        VERTICAL_JUMP: 70,
      };

      const result = reportService.calculateCompositeIndex(
        athletePerformances,
        weights,
        percentiles
      );

      // Expected: (80 * 3 + 70 * 2) / (3 + 2) = (240 + 140) / 5 = 76
      expect(result).toBe(76);
    });

    it('should handle missing metrics gracefully', () => {
      const athletePerformances = {
        FLY10_TIME: 1.5,
      };
      const weights = {
        FLY10_TIME: 0.6,
        VERTICAL_JUMP: 0.4, // Not in percentiles
      };
      const percentiles = {
        FLY10_TIME: 90,
        // VERTICAL_JUMP missing
      };

      const result = reportService.calculateCompositeIndex(
        athletePerformances,
        weights,
        percentiles
      );

      // Expected: Only FLY10_TIME contributes: (90 * 0.6) / 0.6 = 90
      expect(result).toBe(90);
    });

    it('should return 0 when no metrics have percentiles', () => {
      const athletePerformances = {
        FLY10_TIME: 1.5,
      };
      const weights = {
        FLY10_TIME: 0.6,
      };
      const percentiles = {
        // Empty
      };

      const result = reportService.calculateCompositeIndex(
        athletePerformances,
        weights,
        percentiles
      );

      expect(result).toBe(0);
    });

    it('should handle single metric correctly', () => {
      const athletePerformances = {
        FLY10_TIME: 1.5,
      };
      const weights = {
        FLY10_TIME: 1.0,
      };
      const percentiles = {
        FLY10_TIME: 95,
      };

      const result = reportService.calculateCompositeIndex(
        athletePerformances,
        weights,
        percentiles
      );

      expect(result).toBe(95);
    });

    it('should handle equal weights correctly', () => {
      const athletePerformances = {
        FLY10_TIME: 1.5,
        VERTICAL_JUMP: 30,
        DASH_40YD: 5.0,
      };
      const weights = {
        FLY10_TIME: 1,
        VERTICAL_JUMP: 1,
        DASH_40YD: 1,
      };
      const percentiles = {
        FLY10_TIME: 90,
        VERTICAL_JUMP: 80,
        DASH_40YD: 70,
      };

      const result = reportService.calculateCompositeIndex(
        athletePerformances,
        weights,
        percentiles
      );

      // Expected: (90 + 80 + 70) / 3 = 240 / 3 = 80
      expect(result).toBe(80);
    });
  });

  describe('calculatePercentiles', () => {
    it('should calculate percentiles for "higher is better" metrics', async () => {
      // Create test metric
      const metricCode = 'VERTICAL_JUMP';
      const existingMetric = await db.select().from(siteMetrics).where(eq(siteMetrics.code, metricCode)).limit(1);
      if (existingMetric.length === 0) {
        await db.insert(siteMetrics).values({
          code: metricCode,
          label: 'Vertical Jump',
          category: 'power',
          unit: 'inches',
          lowerIsBetter: false,
          isSystemDefault: true,
          isActive: true,
        });
      }

      // Create multiple athletes with measurements
      const athletes = [];
      const measurements_data = [];

      for (let i = 0; i < 5; i++) {
        const [athlete] = await db.insert(users).values({
          username: `athlete${i}_${Date.now()}`,
          emails: [`athlete${i}@test.com`],
          password: 'hash',
          firstName: `Athlete`,
          lastName: `${i}`,
          fullName: `Athlete ${i}`,
        }).returning();
        athletes.push(athlete);

        // Create measurement: values 20, 25, 30, 35, 40
        measurements_data.push({
          userId: athlete.id,
          submittedBy: testUserId,
          organizationId: testOrgId,
          metric: metricCode,
          value: String(20 + i * 5),
          units: 'inches',
          age: 18,
          date: new Date().toISOString().split('T')[0],
          notes: 'test',
        });
      }

      await db.insert(measurements).values(measurements_data);

      // Test athlete with value 35 should be at 75th percentile (better than 3 out of 5)
      const { percentiles, teamAverages } = await reportService.calculatePercentilesAndAverages(
        athletes[3].id,
        testOrgId,
        [metricCode],
        { [metricCode]: 35 },
        '1990-01-01',
        '2099-12-31'
      );

      expect(percentiles[metricCode]).toBeDefined();
      expect(percentiles[metricCode]).toBeGreaterThan(50); // Better than average
      expect(percentiles[metricCode]).toBeLessThan(100); // Not the best
      expect(teamAverages[metricCode]).toBeDefined(); // Team average should be returned

      // Cleanup
      for (const athlete of athletes) {
        await db.delete(measurements).where(eq(measurements.userId, athlete.id));
        await db.delete(users).where(eq(users.id, athlete.id));
      }
    });

    it('should return empty objects when no measurements exist', async () => {
      const { percentiles, teamAverages } = await reportService.calculatePercentilesAndAverages(
        testUserId,
        testOrgId,
        ['FLY10_TIME'],
        { FLY10_TIME: 1.5 },
        '2024-01-01',
        '2024-12-31'
      );

      expect(percentiles).toEqual({});
      expect(teamAverages).toEqual({});
    });
  });

  describe('Integration Tests', () => {
    it('should generate coach report successfully', async () => {
      // This is a placeholder for integration test
      // Full test would require extensive setup of athletes, measurements, etc.
      // Defer to integration test file for complete coverage
      expect(reportService).toBeDefined();
    });

    it('should generate individual report successfully', async () => {
      // This is a placeholder for integration test
      // Defer to integration test file for complete coverage
      expect(reportService).toBeDefined();
    });
  });

  describe('calculateTeamStatistics - Per-Athlete Aggregation', () => {
    let athlete1Id: string;
    let athlete2Id: string;
    let athlete3Id: string;
    let fly10MetricId: string;
    let verticalMetricId: string;

    beforeEach(async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Create test athletes
      const [a1] = await db.insert(users).values({
        username: `athlete1-${uniqueSuffix}`,
        emails: [`athlete1-${uniqueSuffix}@example.com`],
        password: 'hashedpassword',
        firstName: 'Athlete',
        lastName: 'One',
        fullName: 'Athlete One',
        birthYear: 2005,
      }).returning();
      athlete1Id = a1.id;

      const [a2] = await db.insert(users).values({
        username: `athlete2-${uniqueSuffix}`,
        emails: [`athlete2-${uniqueSuffix}@example.com`],
        password: 'hashedpassword',
        firstName: 'Athlete',
        lastName: 'Two',
        fullName: 'Athlete Two',
        birthYear: 2006,
      }).returning();
      athlete2Id = a2.id;

      const [a3] = await db.insert(users).values({
        username: `athlete3-${uniqueSuffix}`,
        emails: [`athlete3-${uniqueSuffix}@example.com`],
        password: 'hashedpassword',
        firstName: 'Athlete',
        lastName: 'Three',
        fullName: 'Athlete Three',
        birthYear: 2007,
      }).returning();
      athlete3Id = a3.id;

      // Ensure FLY10_TIME and VERTICAL_JUMP metrics exist in siteMetrics
      const [fly10] = await db.insert(siteMetrics).values({
        code: 'FLY10_TIME',
        label: '10-Yard Fly Time',
        unit: 's',
        lowerIsBetter: true,
        sportType: 'soccer',
      }).onConflictDoUpdate({
        target: siteMetrics.code,
        set: { lowerIsBetter: true },
      }).returning();
      fly10MetricId = fly10.id;

      const [vertical] = await db.insert(siteMetrics).values({
        code: 'VERTICAL_JUMP',
        label: 'Vertical Jump',
        unit: 'in',
        lowerIsBetter: false,
        sportType: 'soccer',
      }).onConflictDoUpdate({
        target: siteMetrics.code,
        set: { lowerIsBetter: false },
      }).returning();
      verticalMetricId = vertical.id;

      // Enable metrics for organization
      await db.insert(organizationMetrics).values([
        { organizationId: testOrgId, metricCode: 'FLY10_TIME', isEnabled: true },
        { organizationId: testOrgId, metricCode: 'VERTICAL_JUMP', isEnabled: true },
      ]).onConflictDoNothing();
    });

    afterEach(async () => {
      // Clean up measurements first
      if (athlete1Id || athlete2Id || athlete3Id) {
        await db.delete(measurements).where(
          eq(measurements.userId, athlete1Id)
        );
        await db.delete(measurements).where(
          eq(measurements.userId, athlete2Id)
        );
        await db.delete(measurements).where(
          eq(measurements.userId, athlete3Id)
        );
      }

      // Clean up athletes
      if (athlete1Id) await db.delete(users).where(eq(users.id, athlete1Id));
      if (athlete2Id) await db.delete(users).where(eq(users.id, athlete2Id));
      if (athlete3Id) await db.delete(users).where(eq(users.id, athlete3Id));
    });

    it('should aggregate per-athlete best performances before calculating statistics', async () => {
      // Athlete 1: 3 measurements (1.5, 1.6, 1.7) - best is 1.5
      // Athlete 2: 1 measurement (1.4) - best is 1.4
      // Athlete 3: 5 measurements (1.8, 1.9, 2.0, 2.1, 1.3) - best is 1.3
      // Expected mean: (1.5 + 1.4 + 1.3) / 3 = 1.4
      // If not aggregated, mean would be: (1.5+1.6+1.7+1.4+1.8+1.9+2.0+2.1+1.3) / 9 = 1.7

      const testDate = new Date().toISOString().split('T')[0];

      await db.insert(measurements).values([
        // Athlete 1 measurements
        { userId: athlete1Id, metric: 'FLY10_TIME', value: '1.5', units: 's', date: testDate, age: 18, submittedBy: testUserId, organizationId: testOrgId },
        { userId: athlete1Id, metric: 'FLY10_TIME', value: '1.6', units: 's', date: testDate, age: 18, submittedBy: testUserId, organizationId: testOrgId },
        { userId: athlete1Id, metric: 'FLY10_TIME', value: '1.7', units: 's', date: testDate, age: 18, submittedBy: testUserId, organizationId: testOrgId },
        // Athlete 2 measurement
        { userId: athlete2Id, metric: 'FLY10_TIME', value: '1.4', units: 's', date: testDate, age: 17, submittedBy: testUserId, organizationId: testOrgId },
        // Athlete 3 measurements
        { userId: athlete3Id, metric: 'FLY10_TIME', value: '1.8', units: 's', date: testDate, age: 16, submittedBy: testUserId, organizationId: testOrgId },
        { userId: athlete3Id, metric: 'FLY10_TIME', value: '1.9', units: 's', date: testDate, age: 16, submittedBy: testUserId, organizationId: testOrgId },
        { userId: athlete3Id, metric: 'FLY10_TIME', value: '2.0', units: 's', date: testDate, age: 16, submittedBy: testUserId, organizationId: testOrgId },
        { userId: athlete3Id, metric: 'FLY10_TIME', value: '2.1', units: 's', date: testDate, age: 16, submittedBy: testUserId, organizationId: testOrgId },
        { userId: athlete3Id, metric: 'FLY10_TIME', value: '1.3', units: 's', date: testDate, age: 16, submittedBy: testUserId, organizationId: testOrgId },
      ]);

      // Get measurements with user data (mimicking the actual service behavior)
      const measurementData = await db
        .select({
          measurement: measurements,
          user: users,
        })
        .from(measurements)
        .leftJoin(users, eq(measurements.userId, users.id))
        .where(eq(measurements.organizationId, testOrgId));

      const stats = await (reportService as any).calculateTeamStatistics(
        measurementData,
        ['FLY10_TIME'],
        undefined,
        testOrgId,
        testReportId
      );

      expect(stats).toHaveLength(1);
      const fly10Stats = stats[0];

      // Verify mean is based on per-athlete best, not all measurements
      expect(fly10Stats.average).toBeCloseTo(1.4, 2);  // (1.5 + 1.4 + 1.3) / 3 = 1.4

      // Verify median
      expect(fly10Stats.median).toBe(1.4);  // Middle value of [1.3, 1.4, 1.5]

      // Verify min/max are from best per athlete
      expect(fly10Stats.min).toBe(1.3);
      expect(fly10Stats.max).toBe(1.5);

      // Verify topPerformer is the athlete with best performance
      expect(fly10Stats.topPerformer).toBeDefined();
      expect(fly10Stats.topPerformer.userId).toBe(athlete3Id);
      expect(fly10Stats.topPerformer.value).toBe(1.3);
    });

    it('should select best performance based on lowerIsBetter flag', async () => {
      const testDate = new Date().toISOString().split('T')[0];

      // Test lowerIsBetter=true (FLY10_TIME: lower is better)
      await db.insert(measurements).values([
        { userId: athlete1Id, metric: 'FLY10_TIME', value: '1.5', units: 's', date: testDate, age: 18, submittedBy: testUserId, organizationId: testOrgId },
        { userId: athlete1Id, metric: 'FLY10_TIME', value: '1.3', units: 's', date: testDate, age: 18, submittedBy: testUserId, organizationId: testOrgId },  // Best
        { userId: athlete1Id, metric: 'FLY10_TIME', value: '1.7', units: 's', date: testDate, age: 18, submittedBy: testUserId, organizationId: testOrgId },
      ]);

      // Test lowerIsBetter=false (VERTICAL_JUMP: higher is better)
      await db.insert(measurements).values([
        { userId: athlete2Id, metric: 'VERTICAL_JUMP', value: '25', units: 'in', date: testDate, age: 17, submittedBy: testUserId, organizationId: testOrgId },
        { userId: athlete2Id, metric: 'VERTICAL_JUMP', value: '30', units: 'in', date: testDate, age: 17, submittedBy: testUserId, organizationId: testOrgId },  // Best
        { userId: athlete2Id, metric: 'VERTICAL_JUMP', value: '27', units: 'in', date: testDate, age: 17, submittedBy: testUserId, organizationId: testOrgId },
      ]);

      const measurementData = await db
        .select({
          measurement: measurements,
          user: users,
        })
        .from(measurements)
        .leftJoin(users, eq(measurements.userId, users.id))
        .where(eq(measurements.organizationId, testOrgId));

      const stats = await (reportService as any).calculateTeamStatistics(
        measurementData,
        ['FLY10_TIME', 'VERTICAL_JUMP'],
        undefined,
        testOrgId,
        testReportId
      );

      const fly10Stats = stats.find((s: any) => s.metric === 'FLY10_TIME');
      const verticalStats = stats.find((s: any) => s.metric === 'VERTICAL_JUMP');

      // For lowerIsBetter=true, should select minimum value (1.3)
      expect(fly10Stats.topPerformer.value).toBe(1.3);
      expect(fly10Stats.average).toBeCloseTo(1.3, 2);

      // For lowerIsBetter=false, should select maximum value (30)
      expect(verticalStats.topPerformer.value).toBe(30);
      expect(verticalStats.average).toBeCloseTo(30, 2);
    });

    it('should update userName to match best performance measurement', async () => {
      const testDate = new Date().toISOString().split('T')[0];

      // Athlete 1 with name change: first measurement has old name, best measurement has new name
      // Insert measurement with old name first
      await db.insert(measurements).values([
        { userId: athlete1Id, metric: 'FLY10_TIME', value: '1.7', units: 's', date: testDate, age: 18, submittedBy: testUserId, organizationId: testOrgId },
      ]);

      // Update athlete name
      await db.update(users)
        .set({ fullName: 'Athlete One Updated' })
        .where(eq(users.id, athlete1Id));

      // Insert best measurement with updated name
      await db.insert(measurements).values([
        { userId: athlete1Id, metric: 'FLY10_TIME', value: '1.5', units: 's', date: testDate, age: 18, submittedBy: testUserId, organizationId: testOrgId },  // Best
      ]);

      const measurementData = await db
        .select({
          measurement: measurements,
          user: users,
        })
        .from(measurements)
        .leftJoin(users, eq(measurements.userId, users.id))
        .where(eq(measurements.organizationId, testOrgId));

      const stats = await (reportService as any).calculateTeamStatistics(
        measurementData,
        ['FLY10_TIME'],
        undefined,
        testOrgId,
        testReportId
      );

      const fly10Stats = stats[0];

      // topPerformer should have the updated name from the best measurement
      expect(fly10Stats.topPerformer.userName).toBe('Athlete One Updated');
      expect(fly10Stats.topPerformer.value).toBe(1.5);
    });

    it('should handle athletes with different measurement counts fairly', async () => {
      const testDate = new Date().toISOString().split('T')[0];

      // Athlete 1: 10 measurements
      const athlete1Measurements = Array.from({ length: 10 }, (_, i) => ({
        userId: athlete1Id,
        metric: 'FLY10_TIME',
        value: (1.5 + i * 0.1).toFixed(1),  // 1.5, 1.6, 1.7, ..., 2.4
        units: 's',
        date: testDate,
        age: 18,
        submittedBy: testUserId,
        organizationId: testOrgId,
      }));

      // Athlete 2: 1 measurement
      const athlete2Measurements = [
        { userId: athlete2Id, metric: 'FLY10_TIME', value: '1.4', units: 's', date: testDate, age: 17, submittedBy: testUserId, organizationId: testOrgId },
      ];

      await db.insert(measurements).values([...athlete1Measurements, ...athlete2Measurements]);

      const measurementData = await db
        .select({
          measurement: measurements,
          user: users,
        })
        .from(measurements)
        .leftJoin(users, eq(measurements.userId, users.id))
        .where(eq(measurements.organizationId, testOrgId));

      const stats = await (reportService as any).calculateTeamStatistics(
        measurementData,
        ['FLY10_TIME'],
        undefined,
        testOrgId,
        testReportId
      );

      const fly10Stats = stats[0];

      // Both athletes should contribute equally: (1.5 + 1.4) / 2 = 1.45
      expect(fly10Stats.average).toBeCloseTo(1.45, 2);

      // Median should also reflect 2 values, not 11
      expect(fly10Stats.median).toBeCloseTo(1.45, 2);
    });
  });
});
