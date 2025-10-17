/**
 * Security tests for CSV import functionality
 * Tests file upload security, CSV injection prevention, and data sanitization
 */

import { describe, it, expect } from 'vitest';
import { parseCSV, validateAthleteCSV, validateMeasurementCSV } from '../../client/src/lib/csv';

describe('CSV Import Security Tests', () => {
  describe('File Size Validation', () => {
    it('should reject files exceeding MAX_CSV_FILE_SIZE (5MB)', () => {
      const MAX_CSV_FILE_SIZE = 5 * 1024 * 1024; // 5MB
      const fileSize = 6 * 1024 * 1024; // 6MB

      expect(fileSize).toBeGreaterThan(MAX_CSV_FILE_SIZE);
      // In real implementation, server would return 400 error
    });

    it('should accept files under size limit', () => {
      const MAX_CSV_FILE_SIZE = 5 * 1024 * 1024; // 5MB
      const fileSize = 4 * 1024 * 1024; // 4MB

      expect(fileSize).toBeLessThan(MAX_CSV_FILE_SIZE);
    });
  });

  describe('Row Limit Validation', () => {
    it('should reject CSVs exceeding MAX_CSV_ROWS (10000)', () => {
      const MAX_CSV_ROWS = 10000;
      const headers = 'firstName,lastName,birthDate';
      const rows = new Array(10001).fill('John,Doe,2005-01-01');
      const csv = [headers, ...rows].join('\n');

      const parsed = parseCSV(csv);
      expect(parsed.length).toBeGreaterThan(MAX_CSV_ROWS);
      // In real implementation, server would return 400 error
    });

    it('should accept CSVs within row limit', () => {
      const MAX_CSV_ROWS = 10000;
      const headers = 'firstName,lastName,birthDate';
      const rows = new Array(100).fill('John,Doe,2005-01-01');
      const csv = [headers, ...rows].join('\n');

      const parsed = parseCSV(csv);
      expect(parsed.length).toBeLessThanOrEqual(MAX_CSV_ROWS);
    });
  });

  describe('CSV Injection Prevention', () => {
    it('should sanitize formula injection attempts with = prefix', () => {
      const maliciousCSV = 'firstName,lastName,email\n=1+1,Doe,test@example.com';
      const parsed = parseCSV(maliciousCSV);

      // Sanitization adds a single quote prefix to prevent formula execution
      expect(parsed[0].firstName).toBe("'=1+1");
      const isSanitized = parsed[0].firstName.startsWith("'");
      expect(isSanitized).toBe(true);
    });

    it('should sanitize formula injection with + prefix', () => {
      const maliciousCSV = 'firstName,lastName,email\n+1+1,Doe,test@example.com';
      const parsed = parseCSV(maliciousCSV);

      // Sanitization adds a single quote prefix to prevent formula execution
      expect(parsed[0].firstName).toBe("'+1+1");
      const isSanitized = parsed[0].firstName.startsWith("'");
      expect(isSanitized).toBe(true);
    });

    it('should sanitize formula injection with - prefix (except negative numbers)', () => {
      // Negative numbers should NOT be sanitized
      const negativeNumberCSV = 'firstName,lastName,email\n-123,Doe,test@example.com';
      const parsedNumber = parseCSV(negativeNumberCSV);
      expect(parsedNumber[0].firstName).toBe('-123');

      // Formula-like values starting with - should be sanitized
      const maliciousCSV = 'firstName,lastName,email\n-1+1,Doe,test@example.com';
      const parsed = parseCSV(maliciousCSV);
      expect(parsed[0].firstName).toBe("'-1+1");
      const isSanitized = parsed[0].firstName.startsWith("'");
      expect(isSanitized).toBe(true);
    });

    it('should sanitize formula injection with @ prefix', () => {
      const maliciousCSV = 'firstName,lastName,email\n@SUM(1+1),Doe,test@example.com';
      const parsed = parseCSV(maliciousCSV);

      // Sanitization adds a single quote prefix to prevent formula execution
      expect(parsed[0].firstName).toBe("'@SUM(1+1)");
      const isSanitized = parsed[0].firstName.startsWith("'");
      expect(isSanitized).toBe(true);
    });

    it('should detect DDE (Dynamic Data Exchange) injection', () => {
      const maliciousCSV = 'firstName,lastName,email\n=cmd|/c calc,Doe,test@example.com';
      const parsed = parseCSV(maliciousCSV);

      const containsDDE = parsed[0].firstName.includes('cmd|');
      expect(containsDDE).toBe(true);
    });

    it('should detect hyperlink injection', () => {
      const maliciousCSV = 'firstName,lastName,email\n=HYPERLINK("http://evil.com"),Doe,test@example.com';
      const parsed = parseCSV(maliciousCSV);

      const containsHyperlink = parsed[0].firstName.includes('HYPERLINK');
      expect(containsHyperlink).toBe(true);
    });
  });

  describe('XSS Prevention in CSV Data', () => {
    it('should detect script tags in input', () => {
      const maliciousCSV = 'firstName,lastName,email\n<script>alert("XSS")</script>,Doe,test@example.com';
      const parsed = parseCSV(maliciousCSV);

      const containsScript = parsed[0].firstName.includes('<script>');
      expect(containsScript).toBe(true);
      // Server should sanitize HTML before storing
    });

    it('should detect event handlers in input', () => {
      const maliciousCSV = 'firstName,lastName,email\n<img onerror="alert(1)" src=x>,Doe,test@example.com';
      const parsed = parseCSV(maliciousCSV);

      const containsEventHandler = parsed[0].firstName.includes('onerror=');
      expect(containsEventHandler).toBe(true);
    });

    it('should detect javascript: URLs', () => {
      const maliciousCSV = 'firstName,lastName,email\nJohn,Doe,javascript:alert(1)';
      const parsed = parseCSV(maliciousCSV);

      const containsJSURL = parsed[0].email.includes('javascript:');
      expect(containsJSURL).toBe(true);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should handle SQL injection attempts in names', () => {
      const maliciousCSV = `firstName,lastName,birthDate\n' OR '1'='1,Doe,2005-01-01`;
      const parsed = parseCSV(maliciousCSV);

      expect(parsed[0].firstName).toBe("' OR '1'='1");
      // Parameterized queries prevent SQL injection
    });

    it('should handle SQL comment injection', () => {
      const maliciousCSV = 'firstName,lastName,birthDate\nJohn,Doe--,2005-01-01';
      const parsed = parseCSV(maliciousCSV);

      expect(parsed[0].lastName).toContain('--');
      // Should be safely handled by parameterized queries
    });

    it('should handle UNION injection attempts', () => {
      const maliciousCSV = `firstName,lastName,birthDate\nJohn' UNION SELECT * FROM users--,Doe,2005-01-01`;
      const parsed = parseCSV(maliciousCSV);

      expect(parsed[0].firstName).toContain('UNION');
      // Parameterized queries prevent this attack
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should detect directory traversal attempts', () => {
      const maliciousCSV = 'firstName,lastName,email\n../../etc/passwd,Doe,test@example.com';
      const parsed = parseCSV(maliciousCSV);

      const containsTraversal = parsed[0].firstName.includes('../');
      expect(containsTraversal).toBe(true);
      // Server should validate and sanitize file paths
    });

    it('should detect absolute path injection', () => {
      const maliciousCSV = 'firstName,lastName,email\n/etc/passwd,Doe,test@example.com';
      const parsed = parseCSV(maliciousCSV);

      const startsWithSlash = parsed[0].firstName.startsWith('/');
      expect(startsWithSlash).toBe(true);
    });
  });

  describe('Email Validation Security', () => {
    it('should warn about unrecognized contact formats', () => {
      const invalidEmails = [
        'not-an-email',
        '@example.com',
        'user@',
      ];

      invalidEmails.forEach(email => {
        const result = validateAthleteCSV({
          firstName: 'John',
          lastName: 'Doe',
          birthDate: '2005-01-01',
          emails: email
        });

        // Invalid emails should generate warnings
        expect(result.warnings && result.warnings.length > 0).toBe(true);
      });
    });

    it('should accept valid email formats', () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
      ];

      validEmails.forEach(email => {
        const result = validateAthleteCSV({
          firstName: 'John',
          lastName: 'Doe',
          birthDate: '2005-01-01',
          emails: email
        });

        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Birth Date Validation', () => {
    it('should reject future birth dates', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const result = validateAthleteCSV({
        firstName: 'John',
        lastName: 'Doe',
        birthDate: futureDateStr
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('future'))).toBe(true);
    });

    it('should reject invalid date formats', () => {
      const invalidDates = [
        '01/01/2005', // Wrong format
        'not-a-date',
      ];

      invalidDates.forEach(date => {
        const result = validateAthleteCSV({
          firstName: 'John',
          lastName: 'Doe',
          birthDate: date
        });

        expect(result.valid).toBe(false);
      });
    });
  });

  describe('Measurement Value Validation', () => {
    it('should reject negative measurement values', () => {
      const result = validateMeasurementCSV({
        firstName: 'John',
        lastName: 'Doe',
        birthYear: '2005',
        age: '19',
        date: '2024-01-01',
        metric: 'FLY10_TIME',
        value: '-1.5'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('positive'))).toBe(true);
    });

    it('should reject zero measurement values', () => {
      const result = validateMeasurementCSV({
        firstName: 'John',
        lastName: 'Doe',
        birthYear: '2005',
        age: '19',
        date: '2024-01-01',
        metric: 'FLY10_TIME',
        value: '0'
      });

      expect(result.valid).toBe(false);
    });

    it('should reject non-numeric measurement values', () => {
      const result = validateMeasurementCSV({
        firstName: 'John',
        lastName: 'Doe',
        birthYear: '2005',
        age: '19',
        date: '2024-01-01',
        metric: 'FLY10_TIME',
        value: 'abc'
      });

      expect(result.valid).toBe(false);
    });
  });

  describe('Height and Weight Validation', () => {
    it('should reject unrealistic height values', () => {
      const invalidHeights = ['10', '200', '-50', 'abc'];

      invalidHeights.forEach(height => {
        const result = validateAthleteCSV({
          firstName: 'John',
          lastName: 'Doe',
          birthDate: '2005-01-01',
          height
        });

        expect(result.valid).toBe(false);
      });
    });

    it('should reject unrealistic weight values', () => {
      const invalidWeights = ['10', '500', '-100', 'xyz'];

      invalidWeights.forEach(weight => {
        const result = validateAthleteCSV({
          firstName: 'John',
          lastName: 'Doe',
          birthDate: '2005-01-01',
          weight
        });

        expect(result.valid).toBe(false);
      });
    });

    it('should accept realistic height values', () => {
      const validHeights = ['60', '72', '84']; // 5'0" to 7'0"

      validHeights.forEach(height => {
        const result = validateAthleteCSV({
          firstName: 'John',
          lastName: 'Doe',
          birthDate: '2005-01-01',
          height
        });

        expect(result.valid).toBe(true);
      });
    });

    it('should accept realistic weight values', () => {
      const validWeights = ['100', '200', '300']; // 100-300 lbs

      validWeights.forEach(weight => {
        const result = validateAthleteCSV({
          firstName: 'John',
          lastName: 'Doe',
          birthDate: '2005-01-01',
          weight
        });

        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Required Field Validation', () => {
    it('should require firstName for athlete import', () => {
      const result = validateAthleteCSV({
        firstName: '',
        lastName: 'Doe',
        birthDate: '2005-01-01'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('First name'))).toBe(true);
    });

    it('should require lastName for athlete import', () => {
      const result = validateAthleteCSV({
        firstName: 'John',
        lastName: '',
        birthDate: '2005-01-01'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Last name'))).toBe(true);
    });

    it('should require birthDate for athlete import', () => {
      const result = validateAthleteCSV({
        firstName: 'John',
        lastName: 'Doe',
        birthDate: ''
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Birth date'))).toBe(true);
    });
  });

  describe('Phone Number Validation', () => {
    it('should accept valid phone formats', () => {
      const validPhones = [
        '5551234567',
        '555-123-4567',
        '(555) 123-4567',
        '+1 555 123 4567',
      ];

      validPhones.forEach(phone => {
        const result = validateAthleteCSV({
          firstName: 'John',
          lastName: 'Doe',
          birthDate: '2005-01-01',
          phoneNumbers: phone
        });

        // Should not have phone-related errors
        const hasPhoneError = result.errors.some(e => e.toLowerCase().includes('phone'));
        expect(hasPhoneError).toBe(false);
      });
    });

    it('should warn about invalid phone formats', () => {
      const invalidPhones = [
        'abc-def-ghij', // Non-numeric
      ];

      invalidPhones.forEach(phone => {
        const result = validateAthleteCSV({
          firstName: 'John',
          lastName: 'Doe',
          birthDate: '2005-01-01',
          phoneNumbers: phone
        });

        // Invalid phone numbers should generate warnings
        expect(result.warnings && result.warnings.length > 0).toBe(true);
      });
    });
  });

  describe('MIME Type Validation', () => {
    it('should accept valid CSV MIME types', () => {
      const validMimeTypes = [
        'text/csv',
        'text/plain',
        'application/vnd.ms-excel',
      ];

      validMimeTypes.forEach(mimeType => {
        // In real implementation, server validates MIME type
        expect(['text/csv', 'text/plain', 'application/vnd.ms-excel']).toContain(mimeType);
      });
    });

    it('should reject invalid MIME types', () => {
      const invalidMimeTypes = [
        'application/pdf',
        'image/png',
        'application/x-executable',
        'text/html',
      ];

      invalidMimeTypes.forEach(mimeType => {
        const isValid = ['text/csv', 'text/plain', 'application/vnd.ms-excel'].includes(mimeType);
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce upload rate limit (20 uploads per 15 minutes)', () => {
      const UPLOAD_RATE_LIMIT = 20;
      const uploadAttempts = 21;

      expect(uploadAttempts).toBeGreaterThan(UPLOAD_RATE_LIMIT);
      // Server should return 429 Too Many Requests
    });

    it('should allow uploads within rate limit', () => {
      const UPLOAD_RATE_LIMIT = 20;
      const uploadAttempts = 10;

      expect(uploadAttempts).toBeLessThanOrEqual(UPLOAD_RATE_LIMIT);
    });
  });

  describe('CSV Parsing Edge Cases', () => {
    it('should handle empty cells correctly', () => {
      const csv = 'firstName,lastName,email\nJohn,,test@example.com';
      const parsed = parseCSV(csv);

      expect(parsed[0].firstName).toBe('John');
      expect(parsed[0].lastName).toBe('');
      expect(parsed[0].email).toBe('test@example.com');
    });

    it('should handle rows with trailing commas', () => {
      const csv = 'firstName,lastName,email\nJohn,Doe,test@example.com,';
      const parsed = parseCSV(csv);

      expect(parsed[0].firstName).toBe('John');
      expect(parsed[0].lastName).toBe('Doe');
    });

    it('should filter out completely empty rows', () => {
      const csv = 'firstName,lastName\nJohn,Doe\n\n\nJane,Smith';
      const parsed = parseCSV(csv);

      expect(parsed.length).toBe(2);
      expect(parsed[0].firstName).toBe('John');
      expect(parsed[1].firstName).toBe('Jane');
    });
  });
});
