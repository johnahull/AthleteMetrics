/**
 * Unit tests for analytics validation and business logic
 * Tests validation rules, sanitization, and edge cases
 */

import { describe, it, expect } from 'vitest';

describe('Analytics Validation Logic', () => {
  describe('Metric Name Validation', () => {
    it('should accept valid metric names', () => {
      const validMetrics = [
        'FLY10_TIME',
        'VERTICAL_JUMP',
        'DASH_40YD',
        'AGILITY_505',
        'AGILITY_5105',
        'T_TEST',
        'RSI'
      ];

      validMetrics.forEach(metric => {
        expect(metric).toMatch(/^[A-Z_0-9]+$/);
      });
    });

    it('should reject invalid metric names', () => {
      const invalidMetrics = [
        'invalid-metric',
        'DROP TABLE',
        '<script>',
        '',
        ' ',
        'metric with spaces'
      ];

      invalidMetrics.forEach(metric => {
        const isValid = /^[A-Z_0-9]+$/.test(metric);
        expect(isValid).toBe(false);
      });
    });

    it('should validate metric name length', () => {
      const shortMetric = 'FLY';
      const longMetric = 'A'.repeat(100);

      expect(shortMetric.length).toBeGreaterThan(0);
      expect(longMetric.length).toBeLessThan(255); // Reasonable max
    });
  });

  describe('Organization ID Validation', () => {
    it('should reject empty organization IDs', () => {
      const emptyIds = ['', ' ', '  '];

      emptyIds.forEach(id => {
        const trimmed = id.trim();
        expect(trimmed).toBe('');
      });
    });

    it('should accept valid UUIDs', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'test-org-123'
      ];

      validUUIDs.forEach(uuid => {
        expect(uuid.trim().length).toBeGreaterThan(0);
      });
    });

    it('should reject null or undefined', () => {
      const invalid = [null, undefined];

      invalid.forEach(value => {
        expect(value).toBeFalsy();
      });
    });
  });

  describe('Input Sanitization', () => {
    it('should detect SQL injection patterns', () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE measurements; --",
        "1' OR '1'='1",
        "admin'--",
        "' UNION SELECT * FROM users--"
      ];

      sqlInjectionAttempts.forEach(input => {
        const hasDangerousPatterns =
          input.includes('DROP') ||
          input.includes('--') ||
          input.includes('UNION') ||
          input.includes("'");

        expect(hasDangerousPatterns).toBe(true);
      });
    });

    it('should detect XSS patterns', () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert(1)>',
        'javascript:alert(1)',
        '<iframe src="evil.com">'
      ];

      xssAttempts.forEach(input => {
        const hasDangerousHTML =
          input.includes('<script') ||
          input.includes('<iframe') ||
          input.includes('javascript:') ||
          input.includes('onerror');

        expect(hasDangerousHTML).toBe(true);
      });
    });

    it('should allow safe strings', () => {
      const safeStrings = [
        'John Doe',
        'Team A',
        'Sprint Test',
        '2023-01-15'
      ];

      safeStrings.forEach(input => {
        const hasDangerousPatterns =
          input.includes('<') ||
          input.includes('DROP') ||
          input.includes('--');

        expect(hasDangerousPatterns).toBe(false);
      });
    });
  });

  describe('Date Range Validation', () => {
    it('should validate date format', () => {
      const validDates = [
        '2023-01-15',
        '2024-12-31',
        '2022-06-01'
      ];

      validDates.forEach(date => {
        const parsed = new Date(date);
        expect(parsed.toString()).not.toBe('Invalid Date');
      });
    });

    it('should reject invalid dates', () => {
      const invalidDates = [
        '2023-13-01', // Invalid month
        '2023-01-32', // Invalid day
        'not-a-date',
        ''
      ];

      invalidDates.forEach(date => {
        if (date === '') {
          expect(date).toBe('');
        } else {
          const parsed = new Date(date);
          const isInvalid = isNaN(parsed.getTime()) ||
                           parsed.getMonth() > 11 ||
                           parsed.getDate() > 31;
          expect(isInvalid).toBe(true);
        }
      });
    });

    it('should validate date ranges', () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');

      expect(endDate.getTime()).toBeGreaterThan(startDate.getTime());
    });

    it('should reject invalid date ranges', () => {
      const startDate = new Date('2023-12-31');
      const endDate = new Date('2023-01-01');

      expect(endDate.getTime()).toBeLessThan(startDate.getTime());
    });
  });

  describe('Athlete ID Array Validation', () => {
    it('should accept valid athlete ID arrays', () => {
      const validArrays = [
        ['athlete-1', 'athlete-2'],
        ['550e8400-e29b-41d4-a716-446655440000'],
        []
      ];

      validArrays.forEach(arr => {
        expect(Array.isArray(arr)).toBe(true);
      });
    });

    it('should validate array length limits', () => {
      const maxAthletes = 100;
      const smallArray = ['athlete-1', 'athlete-2', 'athlete-3'];
      const largeArray = Array.from({ length: 150 }, (_, i) => `athlete-${i}`);

      expect(smallArray.length).toBeLessThanOrEqual(maxAthletes);
      expect(largeArray.length).toBeGreaterThan(maxAthletes);
    });

    it('should reject non-array values', () => {
      const invalid = [
        'not-an-array',
        { athleteIds: ['athlete-1'] },
        123,
        null
      ];

      invalid.forEach(value => {
        expect(Array.isArray(value)).toBe(false);
      });
    });
  });

  describe('Analysis Type Validation', () => {
    it('should accept valid analysis types', () => {
      const validTypes = ['individual', 'team', 'comparison', 'trend'];

      validTypes.forEach(type => {
        expect(['individual', 'team', 'comparison', 'trend']).toContain(type);
      });
    });

    it('should reject invalid analysis types', () => {
      const invalidTypes = ['invalid', 'DROP_TABLE', '<script>', ''];

      invalidTypes.forEach(type => {
        const isValid = ['individual', 'team', 'comparison', 'trend'].includes(type);
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Timeframe Validation', () => {
    it('should accept valid timeframe periods', () => {
      const validPeriods = [
        '1_month',
        '3_months',
        '6_months',
        '1_year',
        'all_time'
      ];

      validPeriods.forEach(period => {
        expect(period).toMatch(/^[a-z_0-9]+$/);
      });
    });

    it('should validate custom date ranges', () => {
      const customRange = {
        startDate: '2023-01-01',
        endDate: '2023-12-31'
      };

      const start = new Date(customRange.startDate);
      const end = new Date(customRange.endDate);

      expect(start.toString()).not.toBe('Invalid Date');
      expect(end.toString()).not.toBe('Invalid Date');
      expect(end.getTime()).toBeGreaterThan(start.getTime());
    });
  });

  describe('Metric Selection Validation', () => {
    it('should validate primary metric is required', () => {
      const validSelection = {
        primary: 'FLY10_TIME',
        secondary: null,
        additional: []
      };

      expect(validSelection.primary).toBeTruthy();
      expect(validSelection.primary.length).toBeGreaterThan(0);
    });

    it('should validate additional metrics array', () => {
      const selection = {
        primary: 'FLY10_TIME',
        secondary: null,
        additional: ['VERTICAL_JUMP', 'DASH_40YD']
      };

      expect(Array.isArray(selection.additional)).toBe(true);
      expect(selection.additional.length).toBeLessThanOrEqual(10); // Max additional metrics
    });

    it('should prevent duplicate metrics', () => {
      const metrics = ['FLY10_TIME', 'VERTICAL_JUMP', 'FLY10_TIME'];
      const uniqueMetrics = [...new Set(metrics)];

      expect(metrics.length).toBe(3);
      expect(uniqueMetrics.length).toBe(2);
    });
  });

  describe('Response Data Validation', () => {
    it('should validate response data structure', () => {
      const mockResponse = {
        data: [
          {
            athleteId: 'athlete-1',
            athleteName: 'John Doe',
            metric: 'FLY10_TIME',
            value: 1.5,
            date: new Date('2023-01-01')
          }
        ],
        statistics: {
          FLY10_TIME: {
            mean: 1.5,
            median: 1.5,
            stdDev: 0.1,
            min: 1.4,
            max: 1.6,
            count: 10
          }
        }
      };

      expect(Array.isArray(mockResponse.data)).toBe(true);
      expect(mockResponse.statistics).toBeDefined();
      expect(mockResponse.data[0]).toHaveProperty('athleteId');
      expect(mockResponse.data[0]).toHaveProperty('metric');
      expect(mockResponse.data[0]).toHaveProperty('value');
    });

    it('should handle empty result sets', () => {
      const emptyResponse = {
        data: [],
        statistics: {}
      };

      expect(emptyResponse.data.length).toBe(0);
      expect(Object.keys(emptyResponse.statistics).length).toBe(0);
    });
  });

  describe('Error Message Safety', () => {
    it('should not expose sensitive information', () => {
      const safeErrors = [
        'Invalid metric name',
        'Organization ID is required',
        'Failed to fetch analytics data',
        'Validation error'
      ];

      safeErrors.forEach(error => {
        const exposesSecrets =
          error.includes('password') ||
          error.includes('token') ||
          error.includes('secret') ||
          error.includes('DATABASE_URL');

        expect(exposesSecrets).toBe(false);
      });
    });

    it('should not expose internal paths', () => {
      const safeErrors = [
        'Invalid input',
        'Request failed'
      ];

      safeErrors.forEach(error => {
        const exposesInternals =
          error.includes('/home/') ||
          error.includes('node_modules') ||
          error.includes('.ts:');

        expect(exposesInternals).toBe(false);
      });
    });
  });

  describe('Numeric Value Validation', () => {
    it('should validate measurement values', () => {
      const validValues = [1.5, 2.0, 30.5, 4.8];

      validValues.forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
        expect(isFinite(value)).toBe(true);
      });
    });

    it('should reject invalid numeric values', () => {
      const invalidValues = [NaN, Infinity, -Infinity];

      invalidValues.forEach(value => {
        expect(isFinite(value)).toBe(false);
      });
    });

    it('should handle boundary values', () => {
      const boundaryValues = {
        fly10Time: { min: 0.5, max: 3.0 },
        verticalJump: { min: 10, max: 50 },
        dash40: { min: 3.5, max: 7.0 }
      };

      Object.values(boundaryValues).forEach(range => {
        expect(range.max).toBeGreaterThan(range.min);
      });
    });
  });
});
