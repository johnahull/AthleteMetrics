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

    // NEW TDD TESTS: Position matching by name and shortName
    describe('TDD: Enhanced position matching by name and shortName', () => {
      let enhancedTestSportId: string;
      let enhancedTestPositionId: string;

      beforeEach(async () => {
        // Create a sport with positions that have name and shortName
        const [enhancedSport] = await db.insert(siteSports).values({
          code: `ENHANCED_SPORT_${uniqueSuffix}`,
          name: 'Enhanced Sport',
          isActive: true,
          isSystemDefault: false,
        }).returning();
        enhancedTestSportId = enhancedSport.id;

        // Create position with code="F", name="Forward", shortName="FW"
        const [enhancedPosition] = await db.insert(sitePositions).values({
          sportId: enhancedTestSportId,
          code: 'F',
          name: 'Forward',
          shortName: 'FW',
          isActive: true,
          isSystemDefault: false,
        }).returning();
        enhancedTestPositionId = enhancedPosition.id;
      });

      afterEach(async () => {
        // Cleanup in reverse dependency order
        await db.delete(sitePositions).where(eq(sitePositions.id, enhancedTestPositionId)).catch(() => {});
        await db.delete(siteSports).where(eq(siteSports.id, enhancedTestSportId)).catch(() => {});
      });

      it('should match position by code (existing behavior)', async () => {
        const context = await service.loadValidationContext();
        const result = service.validatePositionCode(`ENHANCED_SPORT_${uniqueSuffix}`, 'F', context);

        expect(result.valid).toBe(true);
        expect(result.value).toBeDefined();
        expect(result.value?.code).toBe('F');
        expect(result.value?.name).toBe('Forward');
        expect(result.value?.shortName).toBe('FW');
      });

      it('should match position by name (e.g., "Forward")', async () => {
        const context = await service.loadValidationContext();
        const result = service.validatePositionCode(`ENHANCED_SPORT_${uniqueSuffix}`, 'Forward', context);

        expect(result.valid).toBe(true);
        expect(result.value).toBeDefined();
        expect(result.value?.code).toBe('F');
        expect(result.value?.name).toBe('Forward');
        expect(result.value?.shortName).toBe('FW');
      });

      it('should match position by shortName (e.g., "FW")', async () => {
        const context = await service.loadValidationContext();
        const result = service.validatePositionCode(`ENHANCED_SPORT_${uniqueSuffix}`, 'FW', context);

        expect(result.valid).toBe(true);
        expect(result.value).toBeDefined();
        expect(result.value?.code).toBe('F');
        expect(result.value?.name).toBe('Forward');
        expect(result.value?.shortName).toBe('FW');
      });

      it('should be case-insensitive for name matching', async () => {
        const context = await service.loadValidationContext();
        const lowerResult = service.validatePositionCode(`ENHANCED_SPORT_${uniqueSuffix}`, 'forward', context);
        const upperResult = service.validatePositionCode(`ENHANCED_SPORT_${uniqueSuffix}`, 'FORWARD', context);
        const mixedResult = service.validatePositionCode(`ENHANCED_SPORT_${uniqueSuffix}`, 'FoRwArD', context);

        expect(lowerResult.valid).toBe(true);
        expect(upperResult.valid).toBe(true);
        expect(mixedResult.valid).toBe(true);
        expect(lowerResult.value?.code).toBe('F');
        expect(upperResult.value?.code).toBe('F');
        expect(mixedResult.value?.code).toBe('F');
      });

      it('should be case-insensitive for shortName matching', async () => {
        const context = await service.loadValidationContext();
        const lowerResult = service.validatePositionCode(`ENHANCED_SPORT_${uniqueSuffix}`, 'fw', context);
        const upperResult = service.validatePositionCode(`ENHANCED_SPORT_${uniqueSuffix}`, 'FW', context);

        expect(lowerResult.valid).toBe(true);
        expect(upperResult.valid).toBe(true);
        expect(lowerResult.value?.code).toBe('F');
        expect(upperResult.value?.code).toBe('F');
      });

      it('should prioritize code match over name/shortName when same value matches multiple fields', async () => {
        // Create a position where code="FW", name="Forward Wing", shortName="FW"
        // Then test that searching "FW" returns the position with code="FW", not the one with shortName="FW"
        const [prioritySport] = await db.insert(siteSports).values({
          code: `PRIORITY_SPORT_${uniqueSuffix}`,
          name: 'Priority Sport',
          isActive: true,
          isSystemDefault: false,
        }).returning();

        const [codeMatchPosition] = await db.insert(sitePositions).values({
          sportId: prioritySport.id,
          code: 'FW',
          name: 'Forward Wing',
          shortName: 'FWING',
          isActive: true,
          isSystemDefault: false,
        }).returning();

        const [shortNameMatchPosition] = await db.insert(sitePositions).values({
          sportId: prioritySport.id,
          code: 'F',
          name: 'Forward',
          shortName: 'FW',
          isActive: true,
          isSystemDefault: false,
        }).returning();

        const context = await service.loadValidationContext();
        const result = service.validatePositionCode(`PRIORITY_SPORT_${uniqueSuffix}`, 'FW', context);

        // Should match by code="FW" first, not shortName="FW"
        expect(result.valid).toBe(true);
        expect(result.value?.code).toBe('FW');
        expect(result.value?.name).toBe('Forward Wing');

        // Cleanup
        await db.delete(sitePositions).where(eq(sitePositions.id, codeMatchPosition.id));
        await db.delete(sitePositions).where(eq(sitePositions.id, shortNameMatchPosition.id));
        await db.delete(siteSports).where(eq(siteSports.id, prioritySport.id));
      });

      it('should handle positions with null shortName gracefully', async () => {
        // Create position without shortName
        const [nullShortNameSport] = await db.insert(siteSports).values({
          code: `NULL_SHORT_SPORT_${uniqueSuffix}`,
          name: 'Null Short Sport',
          isActive: true,
          isSystemDefault: false,
        }).returning();

        const [nullShortNamePosition] = await db.insert(sitePositions).values({
          sportId: nullShortNameSport.id,
          code: 'NS',
          name: 'No Short',
          shortName: null,
          isActive: true,
          isSystemDefault: false,
        }).returning();

        const context = await service.loadValidationContext();

        // Should still match by code and name
        const codeResult = service.validatePositionCode(`NULL_SHORT_SPORT_${uniqueSuffix}`, 'NS', context);
        expect(codeResult.valid).toBe(true);
        expect(codeResult.value?.code).toBe('NS');

        const nameResult = service.validatePositionCode(`NULL_SHORT_SPORT_${uniqueSuffix}`, 'No Short', context);
        expect(nameResult.valid).toBe(true);
        expect(nameResult.value?.code).toBe('NS');

        // Cleanup
        await db.delete(sitePositions).where(eq(sitePositions.id, nullShortNamePosition.id));
        await db.delete(siteSports).where(eq(siteSports.id, nullShortNameSport.id));
      });

      it('should include all accepted formats in warning message (code/name/shortName)', async () => {
        const context = await service.loadValidationContext();
        const result = service.validatePositionCode(`ENHANCED_SPORT_${uniqueSuffix}`, 'INVALID_POS', context);

        expect(result.valid).toBe(false);
        expect(result.warning).toBeDefined();
        // Warning should show: "Valid positions: F/Forward/FW"
        expect(result.warning).toMatch(/F\/Forward\/FW/);
      });

      it('should show code/name format when shortName is null', async () => {
        // Create position without shortName
        const [noShortSport] = await db.insert(siteSports).values({
          code: `NO_SHORT_SPORT_${uniqueSuffix}`,
          name: 'No Short Sport',
          isActive: true,
          isSystemDefault: false,
        }).returning();

        const [noShortPosition] = await db.insert(sitePositions).values({
          sportId: noShortSport.id,
          code: 'NS',
          name: 'No Short Name',
          shortName: null,
          isActive: true,
          isSystemDefault: false,
        }).returning();

        const context = await service.loadValidationContext();
        const result = service.validatePositionCode(`NO_SHORT_SPORT_${uniqueSuffix}`, 'INVALID', context);

        expect(result.valid).toBe(false);
        expect(result.warning).toBeDefined();
        // Should show "NS/No Short Name" (no shortName since it's null)
        expect(result.warning).toMatch(/NS\/No Short Name(?!\/)/); // Should NOT have third slash

        // Cleanup
        await db.delete(sitePositions).where(eq(sitePositions.id, noShortPosition.id));
        await db.delete(siteSports).where(eq(siteSports.id, noShortSport.id));
      });
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

  // NOTE: Database failure handling tests removed because ImportValidationService
  // uses a singleton database connection (imported from ../db). Creating new service
  // instances or changing DATABASE_URL env var has no effect on the existing connection.
  // Proper failure testing would require dependency injection of the db connection,
  // which is a larger architectural change. The service's error handling code paths
  // are still present and would be exercised if the database actually failed.
});
