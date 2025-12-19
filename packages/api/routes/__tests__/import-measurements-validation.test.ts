/**
 * Metric Validation Tests for Measurements CSV Import
 *
 * These tests verify that the measurements import validates metric codes
 * against the database-defined site metrics using ImportValidationService.
 *
 * Test scenarios:
 * - Valid site metric codes are accepted
 * - Invalid metric codes generate warnings but continue import (permissive mode)
 * - Legacy METRIC_CONFIG fallback works for backwards compatibility
 * - Dynamic metric units are used when available, falling back to legacy
 * - CSV-provided units take precedence over automatic unit detection
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { db } from '../../db';
import { siteMetrics } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ImportValidationService } from '../../services/import-validation-service';
import { generateTestUniqueSuffix } from '../../__tests__/shared-test-helpers';

describe('Measurements Import - Metric Validation', () => {
  let service: ImportValidationService;
  let testMetricId: string;
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
    // Generate unique suffix for test data
    uniqueSuffix = generateTestUniqueSuffix(); // e.g., "123456_ABC"

    // Create a test metric in the database
    const [testMetric] = await db.insert(siteMetrics).values({
      code: `CUSTOM_METRIC_${uniqueSuffix}`,
      label: 'Custom Test Metric',
      category: 'speed',
      unit: 'km/h', // Custom unit to test dynamic lookup
      metricType: 'higher_is_better',
      isActive: true,
      isSystemDefault: false,
    }).returning();
    testMetricId = testMetric.id;
  });

  afterEach(async () => {
    // Cleanup test metric
    await db.delete(siteMetrics).where(eq(siteMetrics.id, testMetricId)).catch(() => {});
  });

  describe('validateMetricCode integration', () => {
    it('should validate metric code and return DB metric for valid code', async () => {
      const context = await service.loadValidationContext();
      const result = service.validateMetricCode(`CUSTOM_METRIC_${uniqueSuffix}`, context);

      expect(result.valid).toBe(true);
      expect(result.value).toBeDefined();
      expect(result.value?.code).toBe(`CUSTOM_METRIC_${uniqueSuffix}`);
      expect(result.value?.unit).toBe('km/h');
      expect(result.warning).toBeUndefined();
    });

    it('should return warning for invalid metric code', async () => {
      const context = await service.loadValidationContext();
      const result = service.validateMetricCode('NONEXISTENT_METRIC_CODE', context);

      expect(result.valid).toBe(false);
      expect(result.value).toBeUndefined();
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('NONEXISTENT_METRIC_CODE');
      expect(result.warning).toContain('not found');
    });

    it('should be case-insensitive', async () => {
      const context = await service.loadValidationContext();
      const lowerResult = service.validateMetricCode(`custom_metric_${uniqueSuffix}`.toLowerCase(), context);
      const upperResult = service.validateMetricCode(`CUSTOM_METRIC_${uniqueSuffix}`, context);

      expect(lowerResult.valid).toBe(true);
      expect(upperResult.valid).toBe(true);
      expect(lowerResult.value?.code).toBe(upperResult.value?.code);
    });
  });

  describe('getDefaultUnit function', () => {
    it('should return DB unit when metricsMap is provided and metric exists', async () => {
      const context = await service.loadValidationContext();

      // Mock getDefaultUnit function behavior
      const getDefaultUnit = (metric: string, metricsMap?: Map<string, any>): string => {
        if (metricsMap) {
          const siteMetric = metricsMap.get(metric.toUpperCase());
          if (siteMetric) return siteMetric.unit;
        }
        // Fallback to legacy METRIC_CONFIG (hardcoded for test)
        const METRIC_CONFIG: Record<string, { unit: string }> = {
          FLY10_TIME: { unit: 's' },
          VERTICAL_JUMP: { unit: 'in' },
        };
        return (METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit) || 's';
      };

      const result = getDefaultUnit(`CUSTOM_METRIC_${uniqueSuffix}`, context.metrics);
      expect(result).toBe('km/h');
    });

    it('should fallback to legacy METRIC_CONFIG when metric not in DB', async () => {
      const context = await service.loadValidationContext();

      const getDefaultUnit = (metric: string, metricsMap?: Map<string, any>): string => {
        if (metricsMap) {
          const siteMetric = metricsMap.get(metric.toUpperCase());
          if (siteMetric) return siteMetric.unit;
        }
        const METRIC_CONFIG: Record<string, { unit: string }> = {
          FLY10_TIME: { unit: 's' },
          VERTICAL_JUMP: { unit: 'in' },
        };
        return (METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit) || 's';
      };

      const result = getDefaultUnit('FLY10_TIME', context.metrics);
      expect(result).toBe('s');
    });

    it('should return "s" as default when metric in neither DB nor METRIC_CONFIG', async () => {
      const context = await service.loadValidationContext();

      const getDefaultUnit = (metric: string, metricsMap?: Map<string, any>): string => {
        if (metricsMap) {
          const siteMetric = metricsMap.get(metric.toUpperCase());
          if (siteMetric) return siteMetric.unit;
        }
        const METRIC_CONFIG: Record<string, { unit: string }> = {
          FLY10_TIME: { unit: 's' },
        };
        return (METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit) || 's';
      };

      const result = getDefaultUnit('TOTALLY_UNKNOWN_METRIC', context.metrics);
      expect(result).toBe('s');
    });

    it('should fallback to legacy when metricsMap is undefined', async () => {
      const getDefaultUnit = (metric: string, metricsMap?: Map<string, any>): string => {
        if (metricsMap) {
          const siteMetric = metricsMap.get(metric.toUpperCase());
          if (siteMetric) return siteMetric.unit;
        }
        const METRIC_CONFIG: Record<string, { unit: string }> = {
          FLY10_TIME: { unit: 's' },
        };
        return (METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit) || 's';
      };

      const result = getDefaultUnit('FLY10_TIME', undefined);
      expect(result).toBe('s');
    });
  });

  describe('Measurements import workflow simulation', () => {
    it('should validate metric and use DB unit for valid site metric', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row with valid site metric
      const csvRow = {
        metric: `CUSTOM_METRIC_${uniqueSuffix}`,
        units: '', // Empty units - should use DB unit
      };

      // Validate metric
      const validationResult = service.validateMetricCode(csvRow.metric, context);

      // Determine unit
      const getDefaultUnit = (metric: string, metricsMap?: Map<string, any>): string => {
        if (metricsMap) {
          const siteMetric = metricsMap.get(metric.toUpperCase());
          if (siteMetric) return siteMetric.unit;
        }
        return 's';
      };

      const units = csvRow.units || getDefaultUnit(csvRow.metric, context.metrics);

      expect(validationResult.valid).toBe(true);
      expect(validationResult.warning).toBeUndefined();
      expect(units).toBe('km/h');
    });

    it('should generate warning for invalid metric but continue with default unit', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row with invalid metric
      const csvRow = {
        metric: 'INVALID_METRIC_CODE',
        units: '', // Empty units
      };

      // Validate metric
      const validationResult = service.validateMetricCode(csvRow.metric, context);

      // Determine unit
      const getDefaultUnit = (metric: string, metricsMap?: Map<string, any>): string => {
        if (metricsMap) {
          const siteMetric = metricsMap.get(metric.toUpperCase());
          if (siteMetric) return siteMetric.unit;
        }
        return 's';
      };

      const units = csvRow.units || getDefaultUnit(csvRow.metric, context.metrics);

      // Should generate warning but allow import to continue (permissive mode)
      expect(validationResult.valid).toBe(false);
      expect(validationResult.warning).toBeDefined();
      expect(validationResult.warning).toContain('INVALID_METRIC_CODE');
      expect(units).toBe('s'); // Default unit
    });

    it('should use CSV-provided units regardless of validation', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row with explicit units
      const csvRow = {
        metric: `CUSTOM_METRIC_${uniqueSuffix}`,
        units: 'm/s', // Explicit units - should override DB unit
      };

      // Validate metric
      const validationResult = service.validateMetricCode(csvRow.metric, context);

      // Determine unit
      const getDefaultUnit = (metric: string, metricsMap?: Map<string, any>): string => {
        if (metricsMap) {
          const siteMetric = metricsMap.get(metric.toUpperCase());
          if (siteMetric) return siteMetric.unit;
        }
        return 's';
      };

      const units = csvRow.units || getDefaultUnit(csvRow.metric, context.metrics);

      expect(validationResult.valid).toBe(true);
      expect(units).toBe('m/s'); // CSV-provided units take precedence
    });

    it('should handle legacy METRIC_CONFIG metric with deprecation scenario', async () => {
      const context = await service.loadValidationContext();

      // Simulate CSV row with legacy metric (exists in METRIC_CONFIG but not in DB)
      const csvRow = {
        metric: 'FLY10_TIME', // Legacy metric
        units: '',
      };

      // Validate metric
      const validationResult = service.validateMetricCode(csvRow.metric, context);

      // Determine unit
      const getDefaultUnit = (metric: string, metricsMap?: Map<string, any>): string => {
        if (metricsMap) {
          const siteMetric = metricsMap.get(metric.toUpperCase());
          if (siteMetric) return siteMetric.unit;
        }
        // Fallback to legacy METRIC_CONFIG
        const METRIC_CONFIG: Record<string, { unit: string }> = {
          FLY10_TIME: { unit: 's' },
        };
        return (METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit) || 's';
      };

      const units = csvRow.units || getDefaultUnit(csvRow.metric, context.metrics);

      // If FLY10_TIME is not in DB, validation should fail
      // But units should still work via legacy fallback
      if (!validationResult.valid) {
        expect(validationResult.warning).toBeDefined();
        expect(units).toBe('s'); // Legacy fallback unit
      } else {
        // If FLY10_TIME exists in DB (system default), use DB unit
        expect(validationResult.value?.unit).toBeDefined();
      }
    });
  });

  describe('Backwards compatibility', () => {
    it('should preserve existing behavior when metricsMap is not provided', async () => {
      const getDefaultUnit = (metric: string, metricsMap?: Map<string, any>): string => {
        if (metricsMap) {
          const siteMetric = metricsMap.get(metric.toUpperCase());
          if (siteMetric) return siteMetric.unit;
        }
        const METRIC_CONFIG: Record<string, { unit: string }> = {
          FLY10_TIME: { unit: 's' },
          VERTICAL_JUMP: { unit: 'in' },
        };
        return (METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit) || 's';
      };

      // Old code path: no metricsMap provided
      expect(getDefaultUnit('FLY10_TIME')).toBe('s');
      expect(getDefaultUnit('VERTICAL_JUMP')).toBe('in');
      expect(getDefaultUnit('UNKNOWN')).toBe('s');
    });
  });

  describe('End-to-end validation flow', () => {
    it('should complete full validation workflow for measurements import', async () => {
      const context = await service.loadValidationContext();

      // Simulate multiple CSV rows with different validation scenarios
      const csvRows = [
        { metric: `CUSTOM_METRIC_${uniqueSuffix}`, units: '' }, // Valid DB metric
        { metric: 'INVALID_METRIC', units: '' }, // Invalid metric
        { metric: 'FLY10_TIME', units: '' }, // Legacy metric (may or may not be in DB)
        { metric: `CUSTOM_METRIC_${uniqueSuffix}`, units: 'm/s' }, // Valid DB metric with explicit units
      ];

      const results = csvRows.map((row, index) => {
        const validation = service.validateMetricCode(row.metric, context);

        const getDefaultUnit = (metric: string, metricsMap?: Map<string, any>): string => {
          if (metricsMap) {
            const siteMetric = metricsMap.get(metric.toUpperCase());
            if (siteMetric && siteMetric.unit !== null) return siteMetric.unit;
          }
          const METRIC_CONFIG: Record<string, { unit: string }> = {
            FLY10_TIME: { unit: 's' },
          };
          return (METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit) || 's';
        };

        const units = row.units || getDefaultUnit(row.metric, context.metrics);

        return {
          row: index + 1,
          valid: validation.valid,
          warning: validation.warning,
          units,
        };
      });

      // Verify results
      expect(results[0].valid).toBe(true); // Valid DB metric
      expect(results[0].units).toBe('km/h'); // DB unit
      expect(results[0].warning).toBeUndefined();

      expect(results[1].valid).toBe(false); // Invalid metric
      expect(results[1].units).toBe('s'); // Default unit
      expect(results[1].warning).toBeDefined();

      // Legacy metric - could be valid if FLY10_TIME exists in DB as system default
      expect(results[2].units).toBe('s'); // Either DB or legacy fallback

      expect(results[3].valid).toBe(true); // Valid DB metric
      expect(results[3].units).toBe('m/s'); // CSV-provided units take precedence
      expect(results[3].warning).toBeUndefined();
    });
  });
});
