import { describe, it, expect } from 'vitest';
import {
  insertSiteMetricSchema,
  updateSiteMetricSchema,
  siteMetrics,
  organizationTypeEnum
} from '../schema';

describe('Metric Organization Type Filtering', () => {
  describe('Site Metric Organization Type Filtering', () => {
    it('should accept valid available_org_types array', () => {
      const metricData = {
        code: 'YOUTH_AGILITY_TEST',
        label: 'Youth Agility Test',
        category: 'agility',
        unit: 's',
        lowerIsBetter: true,
        availableOrgTypes: ['youth', 'high_school']
      };

      const result = insertSiteMetricSchema.safeParse(metricData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.availableOrgTypes).toEqual(['youth', 'high_school']);
      }
    });

    it('should reject invalid organization types in available_org_types', () => {
      const metricData = {
        code: 'INVALID_METRIC',
        label: 'Invalid Metric',
        availableOrgTypes: ['youth', 'invalid_type']
      };

      const result = insertSiteMetricSchema.safeParse(metricData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('availableOrgTypes')
        )).toBe(true);
      }
    });

    it('should allow empty available_org_types array (available to all)', () => {
      const metricData = {
        code: 'UNIVERSAL_METRIC',
        label: 'Universal Metric',
        availableOrgTypes: []
      };

      const result = insertSiteMetricSchema.safeParse(metricData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.availableOrgTypes).toEqual([]);
      }
    });

    it('should allow null/undefined available_org_types (available to all)', () => {
      const metricData = {
        code: 'STANDARD_METRIC',
        label: 'Standard Metric'
        // availableOrgTypes not provided - should be available to all org types
      };

      const result = insertSiteMetricSchema.safeParse(metricData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.availableOrgTypes).toBeUndefined();
      }
    });

    it('should accept all valid organization types', () => {
      const metricData = {
        code: 'COMPREHENSIVE_METRIC',
        label: 'Comprehensive Metric',
        availableOrgTypes: [...organizationTypeEnum] // All organization types
      };

      const result = insertSiteMetricSchema.safeParse(metricData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.availableOrgTypes).toEqual(organizationTypeEnum);
      }
    });
  });

  describe('Site Metric Update Schema', () => {
    it('should allow updating available_org_types', () => {
      const updateData = {
        availableOrgTypes: ['college', 'elite_academy']
      };

      const result = updateSiteMetricSchema.safeParse(updateData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.availableOrgTypes).toEqual(['college', 'elite_academy']);
      }
    });

    it('should reject invalid org types in update', () => {
      const updateData = {
        availableOrgTypes: ['college', 'invalid_type']
      };

      const result = updateSiteMetricSchema.safeParse(updateData);

      expect(result.success).toBe(false);
    });
  });

  describe('Database Schema for Metric Organization Type Filtering', () => {
    it('should have available_org_types field in site_metrics table', () => {
      const tableSchema = siteMetrics;
      
      expect(tableSchema.availableOrgTypes).toBeDefined();
    });

    it('should have available_org_types as nullable array field', () => {
      const tableSchema = siteMetrics;
      
      // The field should be nullable (NULL means available to all org types)
      expect(tableSchema.availableOrgTypes.notNull).toBe(false);
    });
  });

  describe('Organization Type Specific Metric Use Cases', () => {
    it('should accept youth-specific metrics', () => {
      const youthMetric = {
        code: 'YOUTH_ENDURANCE_20M',
        label: '20m Youth Endurance Run',
        category: 'endurance',
        unit: 's',
        lowerIsBetter: true,
        availableOrgTypes: ['youth'],
        description: 'Age-appropriate endurance test for youth athletes',
        sportAssociations: ['SOCCER'] // Valid uppercase format
      };

      const result = insertSiteMetricSchema.safeParse(youthMetric);
      expect(result.success).toBe(true);
    });

    it('should accept sport associations with any valid uppercase format', () => {
      const metricWithCustomSport = {
        code: 'CUSTOM_SPORT_TEST',
        label: 'Custom Sport Test',
        category: 'agility',
        unit: 's',
        lowerIsBetter: true,
        availableOrgTypes: ['youth'],
        description: 'Test for dynamically created sports',
        sportAssociations: ['CUSTOM_SPORT_2024', 'ESPORTS', 'TRACK_100M']
      };

      const result = insertSiteMetricSchema.safeParse(metricWithCustomSport);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sportAssociations).toEqual(['CUSTOM_SPORT_2024', 'ESPORTS', 'TRACK_100M']);
      }
    });

    it('should reject sport associations with invalid format', () => {
      const metricWithInvalidSport = {
        code: 'INVALID_FORMAT_TEST',
        label: 'Invalid Format Test',
        sportAssociations: ['soccer', 'BASKETBALL-5v5', 'Track 100m']
      };

      const result = insertSiteMetricSchema.safeParse(metricWithInvalidSport);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('sportAssociations')
        )).toBe(true);
      }
    });

    it('should accept high school and college specific metrics', () => {
      const competitiveMetric = {
        code: 'COMPETITIVE_POWER_CLEAN',
        label: 'Power Clean 1RM',
        category: 'strength',
        unit: 'lbs',
        lowerIsBetter: false,
        availableOrgTypes: ['high_school', 'college'],
        description: 'Advanced strength assessment for competitive programs',
        validationMin: 45.0,
        validationMax: 500.0
      };

      const result = insertSiteMetricSchema.safeParse(competitiveMetric);
      expect(result.success).toBe(true);
    });

    it('should accept elite academy specific metrics', () => {
      const eliteMetric = {
        code: 'PRO_SPRINT_30M',
        label: 'Professional 30m Sprint',
        category: 'speed',
        unit: 's',
        lowerIsBetter: true,
        availableOrgTypes: ['elite_academy'],
        description: 'Professional-level sprint assessment',
        decimalPrecision: 4 // Higher precision for elite measurements
      };

      const result = insertSiteMetricSchema.safeParse(eliteMetric);
      expect(result.success).toBe(true);
    });

    it('should accept private facility and club metrics', () => {
      const facilityMetric = {
        code: 'FACILITY_BODY_COMP',
        label: 'Body Composition Analysis',
        category: 'body_composition',
        unit: '%',
        lowerIsBetter: false,
        availableOrgTypes: ['private_facility', 'club'],
        description: 'Comprehensive body composition for facility clients',
        validationMin: 5.0,
        validationMax: 40.0,
        decimalPrecision: 2
      };

      const result = insertSiteMetricSchema.safeParse(facilityMetric);
      expect(result.success).toBe(true);
    });

    it('should accept cross-category metrics available to multiple org types', () => {
      const crossMetric = {
        code: 'RECOVERY_HEART_RATE',
        label: 'Post-Exercise Heart Rate Recovery',
        category: 'recovery',
        unit: 'bpm',
        lowerIsBetter: true,
        availableOrgTypes: ['high_school', 'college', 'elite_academy', 'private_facility'],
        description: 'Cardiovascular recovery assessment',
        validationMin: 40.0,
        validationMax: 120.0
      };

      const result = insertSiteMetricSchema.safeParse(crossMetric);
      expect(result.success).toBe(true);
    });
  });
});