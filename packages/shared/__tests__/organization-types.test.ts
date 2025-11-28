import { describe, it, expect } from 'vitest';
import {
  insertOrganizationSchema,
  updateOrganizationSchema,
  organizations
} from '../schema';
import { z } from 'zod';

describe('Organization Types Schema', () => {
  describe('Organization Type Enum', () => {
    it('should accept valid organization types', () => {
      const validTypes = [
        'youth',
        'high_school', 
        'college',
        'club',
        'private_facility',
        'elite_academy'
      ];

      validTypes.forEach(orgType => {
        const orgData = {
          name: 'Test Organization',
          orgType: orgType
        };

        const result = insertOrganizationSchema.safeParse(orgData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.orgType).toBe(orgType);
        }
      });
    });

    it('should reject invalid organization types', () => {
      const invalidTypes = [
        'invalid_type',
        'HIGH_SCHOOL', // wrong case
        'Youth', // wrong case  
        '',
        123 // number type
      ];

      invalidTypes.forEach(orgType => {
        const orgData = {
          name: 'Test Organization',
          orgType: orgType
        };

        const result = insertOrganizationSchema.safeParse(orgData);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.some(issue =>
            issue.path.includes('orgType')
          )).toBe(true);
        }
      });
    });

    it('should default to club when orgType is not provided', () => {
      const orgData = {
        name: 'Test Organization'
        // orgType not provided, should default to 'club'
      };

      const result = insertOrganizationSchema.parse(orgData);

      expect(result.orgType).toBe('club');
    });

    it('should allow orgType updates via updateOrganizationSchema', () => {
      const updateData = {
        orgType: 'college'
      };

      const result = updateOrganizationSchema.safeParse(updateData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.orgType).toBe('college');
      }
    });
  });

  describe('Organization Type Database Schema', () => {
    it('should have orgType field in organizations table schema', () => {
      // This tests that the database schema includes the orgType field
      const tableSchema = organizations;
      
      // Check if orgType field exists in the table definition
      expect(tableSchema.orgType).toBeDefined();
    });

    it('should have proper enum constraint for orgType field', () => {
      // This will test that the enum constraint is properly defined
      const tableSchema = organizations;
      
      // Verify the field type includes the proper enum values
      expect(tableSchema.orgType.enumValues).toEqual([
        'youth',
        'high_school',
        'college', 
        'club',
        'private_facility',
        'elite_academy'
      ]);
    });

    it('should have default value of club for orgType', () => {
      const tableSchema = organizations;
      
      expect(tableSchema.orgType.hasDefault).toBe(true);
    });
  });
});