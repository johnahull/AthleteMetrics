import { describe, it, expect } from 'vitest';
import {
  insertSiteBenchmarkSchema,
  insertCustomBenchmarkSchema
} from '../schema';

describe('Benchmark Schema', () => {
  describe('insertSiteBenchmarkSchema', () => {
    it('should accept valid site benchmark data', () => {
      const validBenchmark = {
        metricCode: 'FLY10_TIME',
        name: 'Elite Speed',
        description: 'Elite-level 10-yard fly time',
        benchmarkValue: 1.00,
        comparisonOperator: 'lte' as const,
        gender: 'Male' as const,
        ageMin: 18,
        ageMax: 22,
        position: 'Forward',
        level: 'College',
        isActive: true,
        displayOrder: 1,
        color: 'emerald',
        icon: 'Zap',
      };

      const result = insertSiteBenchmarkSchema.safeParse(validBenchmark);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metricCode).toBe('FLY10_TIME');
        expect(result.data.name).toBe('Elite Speed');
        expect(result.data.benchmarkValue).toBe(1.00);
        expect(result.data.comparisonOperator).toBe('lte');
      }
    });

    // Cycle 2: Schema validation rejects invalid comparison_operator
    it('should reject invalid comparison operator', () => {
      const invalidBenchmark = {
        metricCode: 'FLY10_TIME',
        name: 'Elite Speed',
        benchmarkValue: 1.00,
        comparisonOperator: 'invalid' as any,
      };

      const result = insertSiteBenchmarkSchema.safeParse(invalidBenchmark);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('comparisonOperator')
        )).toBe(true);
      }
    });

    // Cycle 5: Age validation rejects age_min > age_max
    it('should reject age_min greater than age_max', () => {
      const invalidAgeBenchmark = {
        metricCode: 'FLY10_TIME',
        name: 'Elite Speed',
        benchmarkValue: 1.00,
        ageMin: 25,
        ageMax: 18, // Invalid: min > max
      };

      const result = insertSiteBenchmarkSchema.safeParse(invalidAgeBenchmark);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.message.includes('Age minimum')
        )).toBe(true);
      }
    });

    it('should accept age_min equal to age_max', () => {
      const validAgeBenchmark = {
        metricCode: 'FLY10_TIME',
        name: 'Elite Speed',
        benchmarkValue: 1.00,
        ageMin: 20,
        ageMax: 20, // Valid: equal ages
      };

      const result = insertSiteBenchmarkSchema.safeParse(validAgeBenchmark);

      expect(result.success).toBe(true);
    });

    it('should accept when only age_min is provided', () => {
      const validBenchmark = {
        metricCode: 'FLY10_TIME',
        name: 'Elite Speed',
        benchmarkValue: 1.00,
        ageMin: 18,
      };

      const result = insertSiteBenchmarkSchema.safeParse(validBenchmark);

      expect(result.success).toBe(true);
    });

    it('should accept when only age_max is provided', () => {
      const validBenchmark = {
        metricCode: 'FLY10_TIME',
        name: 'Elite Speed',
        benchmarkValue: 1.00,
        ageMax: 22,
      };

      const result = insertSiteBenchmarkSchema.safeParse(validBenchmark);

      expect(result.success).toBe(true);
    });
  });

  // Cycle 3 & 4: Schema validation accepts valid custom benchmark with required organization_id
  describe('insertCustomBenchmarkSchema', () => {
    it('should accept valid custom benchmark data', () => {
      const validCustomBenchmark = {
        organizationId: '123e4567-e89b-12d3-a456-426614174000',
        metricCode: 'FLY10_TIME',
        name: 'Team Elite Speed',
        description: 'Our team standard for elite speed',
        benchmarkValue: 1.10,
        comparisonOperator: 'lte' as const,
        isActive: true,
      };

      const result = insertCustomBenchmarkSchema.safeParse(validCustomBenchmark);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.organizationId).toBe('123e4567-e89b-12d3-a456-426614174000');
        expect(result.data.metricCode).toBe('FLY10_TIME');
        expect(result.data.name).toBe('Team Elite Speed');
      }
    });

    // Cycle 4: Zod insert schema requires organization_id for custom benchmarks
    it('should require organization_id for custom benchmarks', () => {
      const benchmarkWithoutOrgId = {
        metricCode: 'FLY10_TIME',
        name: 'Team Elite Speed',
        benchmarkValue: 1.10,
        // Missing organizationId
      };

      const result = insertCustomBenchmarkSchema.safeParse(benchmarkWithoutOrgId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('organizationId')
        )).toBe(true);
      }
    });

    it('should reject empty organization_id', () => {
      const benchmarkWithEmptyOrgId = {
        organizationId: '',
        metricCode: 'FLY10_TIME',
        name: 'Team Elite Speed',
        benchmarkValue: 1.10,
      };

      const result = insertCustomBenchmarkSchema.safeParse(benchmarkWithEmptyOrgId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('organizationId')
        )).toBe(true);
      }
    });
  });
});
