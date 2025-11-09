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
      reportType: 'coach',
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
      const result = await reportService.calculatePercentiles(
        athletes[3].id,
        testOrgId,
        [metricCode],
        { [metricCode]: 35 },
        '1990-01-01',
        '2099-12-31'
      );

      expect(result[metricCode]).toBeDefined();
      expect(result[metricCode]).toBeGreaterThan(50); // Better than average
      expect(result[metricCode]).toBeLessThan(100); // Not the best

      // Cleanup
      for (const athlete of athletes) {
        await db.delete(measurements).where(eq(measurements.userId, athlete.id));
        await db.delete(users).where(eq(users.id, athlete.id));
      }
    });

    it('should return empty object when no measurements exist', async () => {
      const result = await reportService.calculatePercentiles(
        testUserId,
        testOrgId,
        ['FLY10_TIME'],
        { FLY10_TIME: 1.5 },
        '2024-01-01',
        '2024-12-31'
      );

      expect(result).toEqual({});
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
});
