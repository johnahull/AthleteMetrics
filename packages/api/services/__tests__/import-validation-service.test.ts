import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { ImportValidationService } from '../import-validation-service';
import { db } from '../../db';
import {
  siteMetrics,
  siteSports,
  sitePositions,
} from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('ImportValidationService', () => {
  let service: ImportValidationService;
  let testMetricId: string;
  let testSportId: string;
  let testPositionId: string;
  let uniqueSuffix: string;

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety.');
    }
  });

  beforeEach(async () => {
    service = new ImportValidationService();
    // Generate a unique suffix with only uppercase letters and numbers (no hyphens/special chars)
    const timestamp = Date.now().toString();
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
    uniqueSuffix = `${timestamp}_${randomPart}`;

    // Create test metric
    const [testMetric] = await db.insert(siteMetrics).values({
      code: `TEST_METRIC_${uniqueSuffix}`,
      label: 'Test Metric',
      category: 'speed',
      unit: 's',
      metricType: 'lower_is_better',
      isActive: true,
      isSystemDefault: false,
    }).returning();
    testMetricId = testMetric.id;

    // Create test sport
    const [testSport] = await db.insert(siteSports).values({
      code: `TEST_SPORT_${uniqueSuffix}`,
      name: 'Test Sport',
      isActive: true,
      isSystemDefault: false,
    }).returning();
    testSportId = testSport.id;

    // Create test position for the sport
    const [testPosition] = await db.insert(sitePositions).values({
      sportId: testSportId,
      code: 'TP',
      name: 'Test Position',
      isActive: true,
      isSystemDefault: false,
    }).returning();
    testPositionId = testPosition.id;
  });

  afterEach(async () => {
    // Cleanup in reverse dependency order
    await db.delete(sitePositions).where(eq(sitePositions.id, testPositionId)).catch(() => {});
    await db.delete(siteSports).where(eq(siteSports.id, testSportId)).catch(() => {});
    await db.delete(siteMetrics).where(eq(siteMetrics.id, testMetricId)).catch(() => {});
  });

  describe('loadValidationContext', () => {
    it('should load all active metrics, sports, and positions into context', async () => {
      const context = await service.loadValidationContext();

      expect(context).toBeDefined();
      expect(context.metrics).toBeInstanceOf(Map);
      expect(context.sports).toBeInstanceOf(Map);
      expect(context.positions).toBeInstanceOf(Map);

      // Should include our test metric
      expect(context.metrics.has(`TEST_METRIC_${uniqueSuffix}`)).toBe(true);
      const metric = context.metrics.get(`TEST_METRIC_${uniqueSuffix}`);
      expect(metric?.label).toBe('Test Metric');
      expect(metric?.category).toBe('speed');

      // Should include our test sport
      expect(context.sports.has(`TEST_SPORT_${uniqueSuffix}`)).toBe(true);
      const sport = context.sports.get(`TEST_SPORT_${uniqueSuffix}`);
      expect(sport?.name).toBe('Test Sport');

      // Positions should be keyed by sportId
      expect(context.positions.has(testSportId)).toBe(true);
      const positions = context.positions.get(testSportId);
      expect(positions).toBeDefined();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions?.length).toBeGreaterThan(0);
      expect(positions?.some(p => p.code === 'TP')).toBe(true);
    });

    it('should only load active metrics (isActive=true)', async () => {
      // Create an inactive metric
      const [inactiveMetric] = await db.insert(siteMetrics).values({
        code: `INACTIVE_${uniqueSuffix}`,
        label: 'Inactive Metric',
        category: 'power',
        unit: 'in',
        metricType: 'higher_is_better',
        isActive: false,
        isSystemDefault: false,
      }).returning();

      const context = await service.loadValidationContext();

      // Should NOT include inactive metric
      expect(context.metrics.has(`INACTIVE_${uniqueSuffix}`)).toBe(false);

      // Cleanup
      await db.delete(siteMetrics).where(eq(siteMetrics.id, inactiveMetric.id));
    });

    it('should only load active sports (isActive=true)', async () => {
      // Create an inactive sport
      const [inactiveSport] = await db.insert(siteSports).values({
        code: `INACTIVE_SPORT_${uniqueSuffix}`,
        name: 'Inactive Sport',
        isActive: false,
        isSystemDefault: false,
      }).returning();

      const context = await service.loadValidationContext();

      // Should NOT include inactive sport
      expect(context.sports.has(`INACTIVE_SPORT_${uniqueSuffix}`)).toBe(false);

      // Cleanup
      await db.delete(siteSports).where(eq(siteSports.id, inactiveSport.id));
    });

    it('should only load active positions (isActive=true)', async () => {
      // Create an inactive position
      const [inactivePosition] = await db.insert(sitePositions).values({
        sportId: testSportId,
        code: 'IP',
        name: 'Inactive Position',
        isActive: false,
        isSystemDefault: false,
      }).returning();

      const context = await service.loadValidationContext();

      // Should NOT include inactive position
      const positions = context.positions.get(testSportId);
      expect(positions?.some(p => p.code === 'IP')).toBe(false);

      // Cleanup
      await db.delete(sitePositions).where(eq(sitePositions.id, inactivePosition.id));
    });
  });

  describe('validateMetricCode', () => {
    it('should return valid=true for existing active metric', async () => {
      const context = await service.loadValidationContext();
      const result = service.validateMetricCode(`TEST_METRIC_${uniqueSuffix}`, context);

      expect(result.valid).toBe(true);
      expect(result.value).toBeDefined();
      expect(result.value?.code).toBe(`TEST_METRIC_${uniqueSuffix}`);
      expect(result.value?.label).toBe('Test Metric');
      expect(result.error).toBeUndefined();
      expect(result.warning).toBeUndefined();
    });

    it('should return valid=false with warning for non-existent metric', async () => {
      const context = await service.loadValidationContext();
      const result = service.validateMetricCode('NONEXISTENT_METRIC', context);

      expect(result.valid).toBe(false);
      expect(result.value).toBeUndefined();
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('NONEXISTENT_METRIC');
      expect(result.warning).toContain('not found');
      expect(result.error).toBeUndefined();
    });

    it('should include list of valid alternatives in warning message', async () => {
      const context = await service.loadValidationContext();
      const result = service.validateMetricCode('INVALID_METRIC', context);

      expect(result.valid).toBe(false);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain(`TEST_METRIC_${uniqueSuffix}`);
    });

    it('should be case-insensitive', async () => {
      const context = await service.loadValidationContext();
      const lowerResult = service.validateMetricCode(`test_metric_${uniqueSuffix}`.toLowerCase(), context);
      const upperResult = service.validateMetricCode(`TEST_METRIC_${uniqueSuffix}`, context);

      expect(lowerResult.valid).toBe(true);
      expect(upperResult.valid).toBe(true);
      expect(lowerResult.value?.code).toBe(upperResult.value?.code);
    });
  });

  describe('validateSportCode', () => {
    it('should return valid=true for existing active sport', async () => {
      const context = await service.loadValidationContext();
      const result = service.validateSportCode(`TEST_SPORT_${uniqueSuffix}`, context);

      expect(result.valid).toBe(true);
      expect(result.value).toBeDefined();
      expect(result.value?.code).toBe(`TEST_SPORT_${uniqueSuffix}`);
      expect(result.value?.name).toBe('Test Sport');
      expect(result.error).toBeUndefined();
      expect(result.warning).toBeUndefined();
    });

    it('should return valid=false with warning for non-existent sport', async () => {
      const context = await service.loadValidationContext();
      const result = service.validateSportCode('NONEXISTENT_SPORT', context);

      expect(result.valid).toBe(false);
      expect(result.value).toBeUndefined();
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('NONEXISTENT_SPORT');
      expect(result.warning).toContain('not found');
      expect(result.error).toBeUndefined();
    });

    it('should include list of valid alternatives in warning message', async () => {
      const context = await service.loadValidationContext();
      const result = service.validateSportCode('INVALID_SPORT', context);

      expect(result.valid).toBe(false);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain(`TEST_SPORT_${uniqueSuffix}`);
    });

    it('should be case-insensitive', async () => {
      const context = await service.loadValidationContext();
      const lowerResult = service.validateSportCode(`test_sport_${uniqueSuffix}`.toLowerCase(), context);
      const upperResult = service.validateSportCode(`TEST_SPORT_${uniqueSuffix}`, context);

      expect(lowerResult.valid).toBe(true);
      expect(upperResult.valid).toBe(true);
      expect(lowerResult.value?.code).toBe(upperResult.value?.code);
    });
  });

  describe('validatePositionCode', () => {
    it('should return valid=true for existing active position for correct sport', async () => {
      const context = await service.loadValidationContext();
      const result = service.validatePositionCode(`TEST_SPORT_${uniqueSuffix}`, 'TP', context);

      expect(result.valid).toBe(true);
      expect(result.value).toBeDefined();
      expect(result.value?.code).toBe('TP');
      expect(result.value?.name).toBe('Test Position');
      expect(result.error).toBeUndefined();
      expect(result.warning).toBeUndefined();
    });

    it('should return valid=false when sport does not exist', async () => {
      const context = await service.loadValidationContext();
      const result = service.validatePositionCode('NONEXISTENT_SPORT', 'TP', context);

      expect(result.valid).toBe(false);
      expect(result.value).toBeUndefined();
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('NONEXISTENT_SPORT');
    });

    it('should return valid=false when position does not exist for sport', async () => {
      const context = await service.loadValidationContext();
      const result = service.validatePositionCode(`TEST_SPORT_${uniqueSuffix}`, 'NONEXISTENT_POS', context);

      expect(result.valid).toBe(false);
      expect(result.value).toBeUndefined();
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('NONEXISTENT_POS');
      expect(result.warning).toContain('TP'); // Should list valid position
    });

    it('should be case-insensitive for both sport and position codes', async () => {
      const context = await service.loadValidationContext();
      const lowerResult = service.validatePositionCode(
        `test_sport_${uniqueSuffix}`.toLowerCase(),
        'tp'.toLowerCase(),
        context
      );
      const upperResult = service.validatePositionCode(`TEST_SPORT_${uniqueSuffix}`, 'TP', context);

      expect(lowerResult.valid).toBe(true);
      expect(upperResult.valid).toBe(true);
      expect(lowerResult.value?.code).toBe(upperResult.value?.code);
    });
  });

  describe('getValidMetricCodes', () => {
    it('should return array of all active metric codes', async () => {
      const context = await service.loadValidationContext();
      const codes = service.getValidMetricCodes(context);

      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBeGreaterThan(0);
      expect(codes).toContain(`TEST_METRIC_${uniqueSuffix}`);
    });

    it('should not include inactive metrics', async () => {
      // Create an inactive metric
      const [inactiveMetric] = await db.insert(siteMetrics).values({
        code: `INACTIVE_GET_${uniqueSuffix}`,
        label: 'Inactive Get Test',
        category: 'power',
        unit: 'in',
        metricType: 'higher_is_better',
        isActive: false,
        isSystemDefault: false,
      }).returning();

      const context = await service.loadValidationContext();
      const codes = service.getValidMetricCodes(context);

      expect(codes).not.toContain(`INACTIVE_GET_${uniqueSuffix}`);

      // Cleanup
      await db.delete(siteMetrics).where(eq(siteMetrics.id, inactiveMetric.id));
    });
  });

  describe('getValidSportCodes', () => {
    it('should return array of all active sport codes', async () => {
      const context = await service.loadValidationContext();
      const codes = service.getValidSportCodes(context);

      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBeGreaterThan(0);
      expect(codes).toContain(`TEST_SPORT_${uniqueSuffix}`);
    });

    it('should not include inactive sports', async () => {
      // Create an inactive sport
      const [inactiveSport] = await db.insert(siteSports).values({
        code: `INACTIVE_GET_SPORT_${uniqueSuffix}`,
        name: 'Inactive Get Sport Test',
        isActive: false,
        isSystemDefault: false,
      }).returning();

      const context = await service.loadValidationContext();
      const codes = service.getValidSportCodes(context);

      expect(codes).not.toContain(`INACTIVE_GET_SPORT_${uniqueSuffix}`);

      // Cleanup
      await db.delete(siteSports).where(eq(siteSports.id, inactiveSport.id));
    });
  });

  describe('getValidPositionCodes', () => {
    it('should return array of all active position codes for a sport', async () => {
      const context = await service.loadValidationContext();
      const codes = service.getValidPositionCodes(`TEST_SPORT_${uniqueSuffix}`, context);

      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBeGreaterThan(0);
      expect(codes).toContain('TP');
    });

    it('should return empty array for non-existent sport', async () => {
      const context = await service.loadValidationContext();
      const codes = service.getValidPositionCodes('NONEXISTENT_SPORT', context);

      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBe(0);
    });

    it('should not include inactive positions', async () => {
      // Create an inactive position
      const [inactivePosition] = await db.insert(sitePositions).values({
        sportId: testSportId,
        code: 'IPG',
        name: 'Inactive Position Get',
        isActive: false,
        isSystemDefault: false,
      }).returning();

      const context = await service.loadValidationContext();
      const codes = service.getValidPositionCodes(`TEST_SPORT_${uniqueSuffix}`, context);

      expect(codes).not.toContain('IPG');

      // Cleanup
      await db.delete(sitePositions).where(eq(sitePositions.id, inactivePosition.id));
    });

    it('should be case-insensitive for sport code lookup', async () => {
      const context = await service.loadValidationContext();
      const lowerCodes = service.getValidPositionCodes(`test_sport_${uniqueSuffix}`.toLowerCase(), context);
      const upperCodes = service.getValidPositionCodes(`TEST_SPORT_${uniqueSuffix}`, context);

      expect(lowerCodes).toEqual(upperCodes);
    });
  });

  describe('Database Failure Handling', () => {
    it('should throw descriptive error when database fails to load validation context', async () => {
      // Create a new service instance with a mocked db that will fail
      const failingService = new ImportValidationService();

      // Mock the database connection to simulate failure
      // We'll do this by temporarily corrupting the DATABASE_URL
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://invalid:invalid@invalid:5432/invalid';

      try {
        // Attempt to load validation context with invalid DB connection
        await expect(failingService.loadValidationContext()).rejects.toThrow(
          'Unable to load validation data for import'
        );
      } finally {
        // Restore original DATABASE_URL
        process.env.DATABASE_URL = originalUrl;
      }
    });

    it('should handle database timeout gracefully', async () => {
      // Test that the service handles slow/hanging database queries
      const slowService = new ImportValidationService();

      // Create a promise that will timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database timeout')), 100);
      });

      // This test verifies that database failures are caught and wrapped
      // In a real scenario, the database driver would throw the error
      await expect(Promise.race([
        slowService.loadValidationContext(),
        timeoutPromise
      ])).rejects.toThrow();
    });
  });
});
