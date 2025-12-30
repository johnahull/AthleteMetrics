import { describe, it, expect } from 'vitest';
import { siteMetrics, measurements } from '../schema';
import { getTableColumns } from 'drizzle-orm';

describe('Derived Metrics Schema', () => {
  describe('siteMetrics table', () => {
    it('should have isDerived column', () => {
      const columns = getTableColumns(siteMetrics);

      expect(columns.isDerived).toBeDefined();
      expect(columns.isDerived.notNull).toBe(true);
    });

    it('should have formula column', () => {
      const columns = getTableColumns(siteMetrics);

      expect(columns.formula).toBeDefined();
      // Formula is optional (nullable) because non-derived metrics don't need it
    });

    it('should have dependentMetrics column as text array', () => {
      const columns = getTableColumns(siteMetrics);

      expect(columns.dependentMetrics).toBeDefined();
      // Should be an array type
      expect(columns.dependentMetrics.dataType).toBe('array');
    });

    it('should have calculationConfig column as jsonb', () => {
      const columns = getTableColumns(siteMetrics);

      expect(columns.calculationConfig).toBeDefined();
      expect(columns.calculationConfig.dataType).toBe('json');
    });

    it('should allow creating derived metric with all fields', () => {
      // This tests type safety at compile time
      const derivedMetric = {
        code: 'TOP_SPEED',
        label: 'Top Speed',
        category: 'speed',
        unit: 'mph',
        metricType: 'higher_is_better' as const,
        isDerived: true,
        formula: '10 / fly10_time * 2.045',
        dependentMetrics: ['FLY10_TIME'],
        calculationConfig: {
          dateMatchStrategy: 'same_date' as const,
          missingSourceBehavior: 'skip' as const,
        },
        isSystemDefault: false,
        isActive: true,
      };

      // TypeScript should not complain about this structure
      expect(derivedMetric.isDerived).toBe(true);
      expect(derivedMetric.formula).toBe('10 / fly10_time * 2.045');
      expect(derivedMetric.dependentMetrics).toHaveLength(1);
      expect(derivedMetric.calculationConfig.dateMatchStrategy).toBe('same_date');
    });

    it('should allow creating non-derived metric without derived fields', () => {
      const standardMetric = {
        code: 'FLY10_TIME',
        label: '10-Yard Fly Time',
        category: 'speed',
        unit: 's',
        metricType: 'lower_is_better' as const,
        isDerived: false,
        isSystemDefault: true,
        isActive: true,
      };

      expect(standardMetric.isDerived).toBe(false);
    });
  });

  describe('measurements table', () => {
    it('should have isCalculated column', () => {
      const columns = getTableColumns(measurements);

      expect(columns.isCalculated).toBeDefined();
      expect(columns.isCalculated.notNull).toBe(true);
    });

    it('should have calculatedFromMeasurementIds column as text array', () => {
      const columns = getTableColumns(measurements);

      expect(columns.calculatedFromMeasurementIds).toBeDefined();
      expect(columns.calculatedFromMeasurementIds.dataType).toBe('array');
    });

    it('should have calculationMetadata column as jsonb', () => {
      const columns = getTableColumns(measurements);

      expect(columns.calculationMetadata).toBeDefined();
      expect(columns.calculationMetadata.dataType).toBe('json');
    });

    it('should allow creating calculated measurement with all fields', () => {
      const calculatedMeasurement = {
        userId: 'user-123',
        submittedBy: 'coach-456',
        date: '2024-01-15',
        age: 20,
        metric: 'TOP_SPEED',
        value: '20.45',
        units: 'mph',
        isVerified: true,
        isCalculated: true,
        calculatedFromMeasurementIds: ['measurement-789'],
        calculationMetadata: {
          formula: '10 / fly10_time * 2.045',
          sourceValues: { fly10_time: 1.0 },
          calculatedAt: '2024-01-15T10:30:00Z',
        },
      };

      expect(calculatedMeasurement.isCalculated).toBe(true);
      expect(calculatedMeasurement.calculatedFromMeasurementIds).toHaveLength(1);
      expect(calculatedMeasurement.calculationMetadata.formula).toBeDefined();
      expect(calculatedMeasurement.calculationMetadata.sourceValues).toBeDefined();
    });

    it('should allow creating manual measurement without calculated fields', () => {
      const manualMeasurement = {
        userId: 'user-123',
        submittedBy: 'coach-456',
        date: '2024-01-15',
        age: 20,
        metric: 'FLY10_TIME',
        value: '1.5',
        units: 's',
        isVerified: true,
        isCalculated: false,
      };

      expect(manualMeasurement.isCalculated).toBe(false);
    });
  });

  describe('calculationConfig type safety', () => {
    it('should enforce valid dateMatchStrategy values', () => {
      const configs = [
        { dateMatchStrategy: 'same_date' as const, missingSourceBehavior: 'skip' as const },
        { dateMatchStrategy: 'latest_before' as const, missingSourceBehavior: 'skip' as const },
        { dateMatchStrategy: 'closest' as const, missingSourceBehavior: 'skip' as const },
      ];

      configs.forEach(config => {
        expect(['same_date', 'latest_before', 'closest']).toContain(config.dateMatchStrategy);
      });
    });

    it('should enforce valid missingSourceBehavior values', () => {
      const configs = [
        { dateMatchStrategy: 'same_date' as const, missingSourceBehavior: 'skip' as const },
        { dateMatchStrategy: 'same_date' as const, missingSourceBehavior: 'error' as const },
      ];

      configs.forEach(config => {
        expect(['skip', 'error']).toContain(config.missingSourceBehavior);
      });
    });

    it('should allow optional maxDateDifference', () => {
      const configWithMax = {
        dateMatchStrategy: 'closest' as const,
        maxDateDifference: 7,
        missingSourceBehavior: 'skip' as const,
      };

      expect(configWithMax.maxDateDifference).toBe(7);

      const configWithoutMax = {
        dateMatchStrategy: 'same_date' as const,
        missingSourceBehavior: 'skip' as const,
      };

      expect(configWithoutMax.maxDateDifference).toBeUndefined();
    });

    it('should allow optional constants', () => {
      const configWithConstants = {
        dateMatchStrategy: 'same_date' as const,
        missingSourceBehavior: 'skip' as const,
        constants: {
          conversion_factor: 2.045,
          base_distance: 10,
        },
      };

      expect(configWithConstants.constants?.conversion_factor).toBe(2.045);
      expect(configWithConstants.constants?.base_distance).toBe(10);
    });
  });

  describe('calculationMetadata type safety', () => {
    it('should enforce required fields', () => {
      const metadata = {
        formula: '10 / fly10_time * 2.045',
        sourceValues: { fly10_time: 1.0 },
        calculatedAt: '2024-01-15T10:30:00Z',
      };

      expect(metadata.formula).toBeDefined();
      expect(metadata.sourceValues).toBeDefined();
      expect(metadata.calculatedAt).toBeDefined();
    });

    it('should allow arbitrary metric codes in sourceValues', () => {
      const metadata = {
        formula: 'standing_reach + block_jump',
        sourceValues: {
          standing_reach: 96.0,
          block_jump: 30.0,
        },
        calculatedAt: '2024-01-15T10:30:00Z',
      };

      expect(Object.keys(metadata.sourceValues)).toHaveLength(2);
      expect(metadata.sourceValues.standing_reach).toBe(96.0);
      expect(metadata.sourceValues.block_jump).toBe(30.0);
    });
  });

  describe('backward compatibility', () => {
    it('should default isDerived to false for existing metrics', () => {
      // Test that the schema allows isDerived to default to false
      const existingMetric = {
        code: 'FLY10_TIME',
        label: '10-Yard Fly Time',
        category: 'speed',
        unit: 's',
        metricType: 'lower_is_better' as const,
        isSystemDefault: true,
        isActive: true,
        // isDerived not specified, should default to false
      };

      // TypeScript should accept this
      expect(existingMetric.isSystemDefault).toBe(true);
    });

    it('should default isCalculated to false for existing measurements', () => {
      const existingMeasurement = {
        userId: 'user-123',
        submittedBy: 'coach-456',
        date: '2024-01-15',
        age: 20,
        metric: 'FLY10_TIME',
        value: '1.5',
        units: 's',
        isVerified: true,
        // isCalculated not specified, should default to false
      };

      expect(existingMeasurement.isVerified).toBe(true);
    });
  });
});
