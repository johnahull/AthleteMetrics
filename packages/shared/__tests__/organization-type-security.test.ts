/**
 * Security tests for organization type utilities
 * Tests SQL injection prevention and input validation
 */

import { describe, it, expect } from 'vitest';
import {
  getOrganizationTypeFilterSQL,
  isValidOrganizationType,
  parseOrganizationType,
  validateOrganizationTypesBulk,
  type OrganizationType,
} from '../organization-type-utils';

describe('Organization Type Security', () => {
  describe('SQL Injection Prevention', () => {
    it('should reject invalid column names to prevent SQL injection', () => {
      const validOrgType: OrganizationType = 'college';

      // Attempt SQL injection via column name
      const maliciousColumns = [
        'available_org_types; DROP TABLE users;--',
        "available_org_types' OR '1'='1",
        'available_org_types); DELETE FROM organizations;--',
        '../../../etc/passwd',
        'available_org_types" UNION SELECT * FROM users--',
      ];

      maliciousColumns.forEach(columnName => {
        expect(() => {
          getOrganizationTypeFilterSQL(validOrgType, columnName);
        }).toThrow(/Invalid column name/);
      });
    });

    it('should reject invalid org types to prevent SQL injection', () => {
      const validColumn = 'available_org_types';

      // Attempt SQL injection via org type
      const maliciousOrgTypes = [
        "college'; DROP TABLE users;--",
        "college' OR '1'='1",
        "college'; DELETE FROM organizations WHERE '1'='1",
        "college' UNION SELECT * FROM users--",
        "'; DROP TABLE measurements;--",
      ];

      maliciousOrgTypes.forEach(orgType => {
        expect(() => {
          getOrganizationTypeFilterSQL(orgType as any, validColumn);
        }).toThrow(/Invalid organization type/);
      });
    });

    it('should only accept whitelisted column names', () => {
      const validOrgType: OrganizationType = 'college';
      const validColumns = ['available_org_types', 'applicable_org_types'];
      const invalidColumns = [
        'users',
        'organizations',
        'measurements',
        'random_column',
        'org_type',
      ];

      // Valid columns should work
      validColumns.forEach(columnName => {
        expect(() => {
          getOrganizationTypeFilterSQL(validOrgType, columnName);
        }).not.toThrow();
      });

      // Invalid columns should be rejected
      invalidColumns.forEach(columnName => {
        expect(() => {
          getOrganizationTypeFilterSQL(validOrgType, columnName);
        }).toThrow(/Invalid column name/);
      });
    });

    it('should validate org type against enum values', () => {
      const validColumn = 'available_org_types';
      const validOrgTypes: OrganizationType[] = [
        'youth',
        'high_school',
        'college',
        'club',
        'private_facility',
        'elite_academy',
      ];

      const invalidOrgTypes = [
        'COLLEGE', // wrong case
        'College',
        'high-school', // wrong separator
        'highschool',
        'university',
        'professional',
        '',
        null,
        undefined,
        123,
        true,
        {},
        [],
      ];

      // Valid org types should work
      validOrgTypes.forEach(orgType => {
        expect(() => {
          getOrganizationTypeFilterSQL(orgType, validColumn);
        }).not.toThrow();
      });

      // Invalid org types should be rejected
      invalidOrgTypes.forEach(orgType => {
        expect(() => {
          getOrganizationTypeFilterSQL(orgType as any, validColumn);
        }).toThrow(/Invalid organization type/);
      });
    });

    it('should generate safe SQL with validated inputs', () => {
      const orgType: OrganizationType = 'college';
      const columnName = 'available_org_types';

      const sql = getOrganizationTypeFilterSQL(orgType, columnName);

      // SQL should contain the org type properly escaped
      expect(sql).toContain('college');
      expect(sql).toContain('available_org_types');

      // Should use array containment operator
      expect(sql).toContain('&&');
      expect(sql).toContain('ARRAY');

      // Should not contain SQL injection patterns
      expect(sql).not.toContain('DROP');
      expect(sql).not.toContain('DELETE');
      expect(sql).not.toContain('UNION');
      expect(sql).not.toContain('--');
      expect(sql).not.toContain(';');
    });

    it('should use default column name safely', () => {
      const orgType: OrganizationType = 'high_school';

      // Should use default column without throwing
      const sql = getOrganizationTypeFilterSQL(orgType);

      expect(sql).toContain('available_org_types'); // Default column
      expect(sql).toContain('high_school');
    });
  });

  describe('Input Validation', () => {
    it('should validate organization type correctly', () => {
      const validTypes: OrganizationType[] = [
        'youth',
        'high_school',
        'college',
        'club',
        'private_facility',
        'elite_academy',
      ];

      validTypes.forEach(type => {
        expect(isValidOrganizationType(type)).toBe(true);
      });

      const invalidTypes = [
        'COLLEGE',
        'College',
        'high-school',
        'university',
        '',
        null,
        undefined,
        123,
        true,
        {},
        [],
      ];

      invalidTypes.forEach(type => {
        expect(isValidOrganizationType(type)).toBe(false);
      });
    });

    it('should parse organization type with fallback', () => {
      // Valid types should parse correctly
      expect(parseOrganizationType('college')).toBe('college');
      expect(parseOrganizationType('high_school')).toBe('high_school');

      // Invalid types should use fallback
      expect(parseOrganizationType('invalid')).toBe('club'); // Default fallback
      expect(parseOrganizationType('COLLEGE')).toBe('club');
      expect(parseOrganizationType(null)).toBe('club');
      expect(parseOrganizationType(undefined)).toBe('club');

      // Custom fallback
      expect(parseOrganizationType('invalid', 'youth')).toBe('youth');
    });

    it('should validate bulk organization types', () => {
      const validData = [
        { id: 1, orgType: 'college' },
        { id: 2, orgType: 'high_school' },
        { id: 3, orgType: 'club' },
      ];

      const result = validateOrganizationTypesBulk(validData);
      expect(result).toHaveLength(3);
      expect(result[0].orgType).toBe('college');
    });

    it('should reject bulk data with invalid org types', () => {
      const invalidData = [
        { id: 1, orgType: 'college' },
        { id: 2, orgType: 'INVALID' },
        { id: 3, orgType: 'club' },
      ];

      expect(() => {
        validateOrganizationTypesBulk(invalidData);
      }).toThrow(/Invalid organization types found/);
    });

    it('should handle null org types in bulk validation', () => {
      const dataWithNull = [
        { id: 1, orgType: 'college' },
        { id: 2, orgType: null },
        { id: 3, orgType: 'club' },
      ];

      // Null should be normalized to default
      const result = validateOrganizationTypesBulk(dataWithNull);
      expect(result[1].orgType).toBe('club'); // Default
    });
  });

  describe('XSS Prevention', () => {
    it('should not allow script tags in org type values', () => {
      const xssAttempts = [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert("xss")>',
        'javascript:alert("xss")',
        '<iframe src="evil.com"></iframe>',
      ];

      xssAttempts.forEach(attempt => {
        expect(isValidOrganizationType(attempt)).toBe(false);
      });
    });

    it('should sanitize org type before database operations', () => {
      const maliciousInput = '<script>alert("xss")</script>';

      // Should parse to safe default, not execute script
      const parsed = parseOrganizationType(maliciousInput);
      expect(parsed).toBe('club');
      expect(parsed).not.toContain('<script>');
    });
  });

  describe('Type Coercion Attacks', () => {
    it('should reject type coercion attempts', () => {
      const coercionAttempts = [
        { toString: () => 'college' }, // Object with toString
        { valueOf: () => 'college' }, // Object with valueOf
        new String('college'), // String object
        ['college'], // Array
        true, // Boolean
        1, // Number
      ];

      coercionAttempts.forEach(attempt => {
        expect(isValidOrganizationType(attempt)).toBe(false);
      });
    });

    it('should only accept primitive string values', () => {
      // Primitive string - valid
      expect(isValidOrganizationType('college')).toBe(true);

      // String object - invalid
      expect(isValidOrganizationType(new String('college'))).toBe(false);

      // String from template literal - valid (primitive)
      const orgType = `college`;
      expect(isValidOrganizationType(orgType)).toBe(true);
    });
  });

  describe('Unicode and Special Characters', () => {
    it('should reject org types with unicode injection attempts', () => {
      const unicodeAttempts = [
        'college\u0000', // Null byte
        'college\u202e', // Right-to-left override
        'college\ufeff', // Zero-width no-break space
        'college\u200b', // Zero-width space
      ];

      unicodeAttempts.forEach(attempt => {
        expect(isValidOrganizationType(attempt)).toBe(false);
      });
    });

    it('should reject org types with special SQL characters', () => {
      const specialCharAttempts = [
        'college;',
        'college--',
        'college/*',
        'college*/',
        'college\\',
        "college'",
        'college"',
        'college`',
      ];

      specialCharAttempts.forEach(attempt => {
        expect(isValidOrganizationType(attempt)).toBe(false);
      });
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should reject path traversal attempts in column names', () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        './../../sensitive_data',
        'available_org_types/../users',
      ];

      pathTraversalAttempts.forEach(attempt => {
        expect(() => {
          getOrganizationTypeFilterSQL('college', attempt);
        }).toThrow(/Invalid column name/);
      });
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle empty strings', () => {
      expect(isValidOrganizationType('')).toBe(false);
      expect(parseOrganizationType('')).toBe('club');

      expect(() => {
        getOrganizationTypeFilterSQL('' as any, 'available_org_types');
      }).toThrow();
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);

      expect(isValidOrganizationType(longString)).toBe(false);
      expect(() => {
        getOrganizationTypeFilterSQL(longString as any, 'available_org_types');
      }).toThrow();
    });

    it('should handle whitespace variations', () => {
      const whitespaceVariations = [
        ' college',
        'college ',
        ' college ',
        'col lege',
        'college\n',
        'college\t',
      ];

      whitespaceVariations.forEach(variation => {
        expect(isValidOrganizationType(variation)).toBe(false);
      });
    });
  });

  describe('Bulk Validation Edge Cases', () => {
    it('should handle empty array', () => {
      const result = validateOrganizationTypesBulk([]);
      expect(result).toEqual([]);
    });

    it('should provide detailed error messages for bulk validation', () => {
      const invalidData = [
        { id: 1, orgType: 'INVALID' },
        { id: 5, orgType: 'ALSO_INVALID' },
      ];

      try {
        validateOrganizationTypesBulk(invalidData);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('0');
        expect(error.message).toContain('1');
        expect(error.message).toContain('INVALID');
        expect(error.message).toContain('ALSO_INVALID');
      }
    });

    it('should handle custom field names in bulk validation', () => {
      const data = [
        { id: 1, organizationType: 'college' },
        { id: 2, organizationType: 'high_school' },
      ];

      const result = validateOrganizationTypesBulk(data, 'organizationType');
      expect(result[0].organizationType).toBe('college');
      expect(result[1].organizationType).toBe('high_school');
    });
  });
});
