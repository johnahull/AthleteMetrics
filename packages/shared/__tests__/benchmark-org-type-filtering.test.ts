import { describe, it, expect } from 'vitest';
import {
  insertSiteBenchmarkSchema,
  updateSiteBenchmarkSchema,
  siteBenchmarks,
  organizationTypeEnum
} from '../schema';

describe('Benchmark Organization Type Filtering', () => {
  describe('Site Benchmark Organization Type Filtering', () => {
    it('should accept valid applicable_org_types array', () => {
      const benchmarkData = {
        metricCode: 'FLY10_TIME',
        name: 'Youth Elite Speed',
        benchmarkValue: 1.20,
        applicableOrgTypes: ['youth', 'high_school']
      };

      const result = insertSiteBenchmarkSchema.safeParse(benchmarkData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.applicableOrgTypes).toEqual(['youth', 'high_school']);
      }
    });

    it('should reject invalid organization types in applicable_org_types', () => {
      const benchmarkData = {
        metricCode: 'FLY10_TIME',
        name: 'Invalid Type Benchmark',
        benchmarkValue: 1.20,
        applicableOrgTypes: ['youth', 'invalid_type']
      };

      const result = insertSiteBenchmarkSchema.safeParse(benchmarkData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('applicableOrgTypes')
        )).toBe(true);
      }
    });

    it('should allow empty applicable_org_types array (applies to all)', () => {
      const benchmarkData = {
        metricCode: 'FLY10_TIME',
        name: 'Universal Benchmark',
        benchmarkValue: 1.20,
        applicableOrgTypes: []
      };

      const result = insertSiteBenchmarkSchema.safeParse(benchmarkData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.applicableOrgTypes).toEqual([]);
      }
    });

    it('should allow null/undefined applicable_org_types (applies to all)', () => {
      const benchmarkData = {
        metricCode: 'FLY10_TIME',
        name: 'Universal Benchmark',
        benchmarkValue: 1.20
        // applicableOrgTypes not provided - should apply to all org types
      };

      const result = insertSiteBenchmarkSchema.safeParse(benchmarkData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.applicableOrgTypes).toBeUndefined();
      }
    });

    it('should accept all valid organization types', () => {
      const benchmarkData = {
        metricCode: 'FLY10_TIME',
        name: 'All Types Benchmark',
        benchmarkValue: 1.20,
        applicableOrgTypes: [...organizationTypeEnum] // All organization types
      };

      const result = insertSiteBenchmarkSchema.safeParse(benchmarkData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.applicableOrgTypes).toEqual(organizationTypeEnum);
      }
    });
  });

  describe('Site Benchmark Update Schema', () => {
    it('should allow updating applicable_org_types', () => {
      const updateData = {
        applicableOrgTypes: ['college', 'elite_academy']
      };

      const result = updateSiteBenchmarkSchema.safeParse(updateData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.applicableOrgTypes).toEqual(['college', 'elite_academy']);
      }
    });

    it('should reject invalid org types in update', () => {
      const updateData = {
        applicableOrgTypes: ['college', 'invalid_type']
      };

      const result = updateSiteBenchmarkSchema.safeParse(updateData);

      expect(result.success).toBe(false);
    });
  });

  describe('Database Schema for Organization Type Filtering', () => {
    it('should have applicable_org_types field in site_benchmarks table', () => {
      const tableSchema = siteBenchmarks;
      
      expect(tableSchema.applicableOrgTypes).toBeDefined();
    });

    it('should have applicable_org_types as nullable array field', () => {
      const tableSchema = siteBenchmarks;
      
      // The field should be nullable (NULL means applies to all org types)
      expect(tableSchema.applicableOrgTypes.notNull).toBe(false);
    });
  });

  describe('Organization Type Specific Use Cases', () => {
    it('should accept youth-specific benchmarks', () => {
      const youthBenchmark = {
        metricCode: 'FLY10_TIME',
        name: 'Youth Development Standard',
        description: 'Age-appropriate speed benchmark for youth athletes',
        benchmarkValue: 1.50,
        applicableOrgTypes: ['youth'],
        ageMin: 6,
        ageMax: 14
      };

      const result = insertSiteBenchmarkSchema.safeParse(youthBenchmark);
      expect(result.success).toBe(true);
    });

    it('should accept high school and college benchmarks', () => {
      const competitiveBenchmark = {
        metricCode: 'VERTICAL_JUMP',
        name: 'Competitive Level Standard',
        description: 'Standard for competitive high school and college programs',
        benchmarkValue: 24.0,
        applicableOrgTypes: ['high_school', 'college'],
        ageMin: 14,
        ageMax: 22
      };

      const result = insertSiteBenchmarkSchema.safeParse(competitiveBenchmark);
      expect(result.success).toBe(true);
    });

    it('should accept elite academy specific benchmarks', () => {
      const eliteBenchmark = {
        metricCode: 'DASH_40YD',
        name: 'Elite Development Standard',
        description: 'Professional pathway benchmark for elite academies',
        benchmarkValue: 4.40,
        applicableOrgTypes: ['elite_academy'],
        level: 'Elite'
      };

      const result = insertSiteBenchmarkSchema.safeParse(eliteBenchmark);
      expect(result.success).toBe(true);
    });

    it('should accept private facility multi-client benchmarks', () => {
      const facilityBenchmark = {
        metricCode: 'T_TEST',
        name: 'Facility Standard',
        description: 'Multi-client management benchmark for private facilities',
        benchmarkValue: 9.50,
        applicableOrgTypes: ['private_facility', 'club'],
        gender: 'Male'
      };

      const result = insertSiteBenchmarkSchema.safeParse(facilityBenchmark);
      expect(result.success).toBe(true);
    });
  });
});