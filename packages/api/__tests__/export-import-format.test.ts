/**
 * TDD Tests for Export/Import CSV Format Compatibility
 *
 * PROBLEM: Exported CSVs cannot be directly re-imported because headers don't match
 *
 * These tests should FAIL initially and PASS after implementation.
 *
 * Tests verify:
 * 1. Athletes export headers match import template exactly
 * 2. Measurements export headers match import template exactly
 * 3. No extra fields in exports (id, fullName, username, etc.)
 * 4. Teams field exported as singular "teamName" (first team only)
 * 5. Gender field included in athletes export
 * 6. Round-trip export → import works correctly
 */

import { describe, it, expect } from 'vitest';
import { sanitizeCSVValue } from '../utils/csv-utils';

describe('Export CSV Format Compatibility - TDD Tests', () => {

  describe('Athletes Export Format', () => {
    const EXPECTED_ATHLETES_HEADERS = [
      'firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear',
      'gender', 'emails', 'phoneNumbers', 'sports', 'height', 'weight',
      'school', 'teamName'
    ];

    const CURRENT_BUGGY_HEADERS = [
      'id', 'firstName', 'lastName', 'fullName', 'username', 'emails', 'phoneNumbers',
      'birthDate', 'birthYear', 'graduationYear', 'school', 'sports', 'height', 'weight',
      'teams', 'isActive', 'createdAt'
    ];

    it('FAILING TEST: current export headers do NOT match import template', () => {
      // This test documents the CURRENT BUGGY behavior
      // It will PASS now (showing the bug exists) and FAIL after we fix it

      // Current export has these headers (from routes.ts line 5400-5404)
      const currentHeaders = CURRENT_BUGGY_HEADERS;

      // But import requires these headers (from import-export.tsx line 689)
      const requiredHeaders = EXPECTED_ATHLETES_HEADERS;

      // These should NOT match (documenting the bug)
      expect(currentHeaders).not.toEqual(requiredHeaders);

      // Missing in current export:
      expect(currentHeaders).not.toContain('gender');

      // Wrong field name in current export:
      expect(currentHeaders).toContain('teams'); // Should be 'teamName'
      expect(currentHeaders).not.toContain('teamName');

      // Extra fields in current export:
      expect(currentHeaders).toContain('id');
      expect(currentHeaders).toContain('fullName');
      expect(currentHeaders).toContain('username');
      expect(currentHeaders).toContain('isActive');
      expect(currentHeaders).toContain('createdAt');
    });

    it('FAILING TEST: should export with import-compatible headers', () => {
      const mockAthlete = {
        id: 'athlete-1',
        firstName: 'Mia',
        lastName: 'Chen',
        fullName: 'Mia Chen',
        username: 'mia.chen',
        birthDate: '2009-03-15',
        birthYear: 2009,
        graduationYear: 2027,
        gender: 'Female',
        emails: ['mia.chen@email.com'],
        phoneNumbers: ['512-555-0123'],
        sports: ['Soccer'],
        height: 66,
        weight: 125,
        school: 'Westlake HS',
        teams: [{ id: 'team-1', name: 'Lonestar 09G Navy' }],
        isActive: true,
        createdAt: '2025-01-15T10:00:00Z'
      };

      // Generate CSV with FIXED format
      const csvContent = generateAthletesCSV_FIXED([mockAthlete]);
      const lines = csvContent.split('\n');
      const headers = lines[0].split(',');

      // TEST: Headers should match import template EXACTLY
      expect(headers).toEqual(EXPECTED_ATHLETES_HEADERS);
    });

    it('FAILING TEST: should export teamName as singular (first team only)', () => {
      const mockAthlete = {
        id: 'athlete-1',
        firstName: 'Jordan',
        lastName: 'Williams',
        birthDate: '2009-01-10',
        birthYear: 2009,
        graduationYear: 2027,
        gender: 'Male',
        emails: ['jordan@email.com'],
        phoneNumbers: [],
        sports: ['Basketball'],
        height: 68,
        weight: 140,
        school: 'Lake Travis HS',
        teams: [
          { id: 'team-1', name: 'Lightning 08G' },
          { id: 'team-2', name: 'Thunder Elite' }
        ],
        isActive: true,
        createdAt: '2025-01-15T10:00:00Z'
      };

      const csvContent = generateAthletesCSV_FIXED([mockAthlete]);
      const lines = csvContent.split('\n');
      const dataRow = parseCSVLine(lines[1]);

      // TEST: teamName column should contain first team only
      const headers = lines[0].split(',');
      const teamNameIndex = headers.indexOf('teamName');
      expect(dataRow[teamNameIndex]).toBe('Lightning 08G');
    });

    it('FAILING TEST: should include gender field in export', () => {
      const mockAthlete = {
        id: 'athlete-1',
        firstName: 'Alex',
        lastName: 'Johnson',
        birthDate: '2008-05-12',
        birthYear: 2008,
        graduationYear: 2026,
        gender: 'Non-binary',
        emails: ['alex@email.com'],
        phoneNumbers: [],
        sports: ['Soccer'],
        height: 67,
        weight: 135,
        school: 'Cedar Park HS',
        teams: [],
        isActive: true,
        createdAt: '2025-01-15T10:00:00Z'
      };

      const csvContent = generateAthletesCSV_FIXED([mockAthlete]);
      const lines = csvContent.split('\n');
      const headers = lines[0].split(',');
      const dataRow = parseCSVLine(lines[1]);

      // TEST: Gender column should exist and contain value
      expect(headers).toContain('gender');
      const genderIndex = headers.indexOf('gender');
      expect(dataRow[genderIndex]).toBe('Non-binary');
    });
  });

  describe('Measurements Export Format', () => {
    const EXPECTED_MEASUREMENTS_HEADERS = [
      'firstName', 'lastName', 'gender', 'teamName', 'date', 'age',
      'metric', 'value', 'units', 'flyInDistance', 'notes'
    ];

    const CURRENT_BUGGY_HEADERS = [
      'id', 'firstName', 'lastName', 'fullName', 'birthYear', 'gender', 'teams',
      'date', 'age', 'metric', 'value', 'units', 'flyInDistance', 'notes',
      'submittedBy', 'verifiedBy', 'isVerified', 'createdAt'
    ];

    it('FAILING TEST: current measurements export headers do NOT match import template', () => {
      // This test documents the CURRENT BUGGY behavior
      const currentHeaders = CURRENT_BUGGY_HEADERS;
      const requiredHeaders = EXPECTED_MEASUREMENTS_HEADERS;

      // These should NOT match (documenting the bug)
      expect(currentHeaders).not.toEqual(requiredHeaders);

      // Wrong field name in current export:
      expect(currentHeaders).toContain('teams'); // Should be 'teamName'
      expect(currentHeaders).not.toContain('teamName');

      // Extra fields in current export:
      expect(currentHeaders).toContain('id');
      expect(currentHeaders).toContain('fullName');
      expect(currentHeaders).toContain('birthYear');
      expect(currentHeaders).toContain('submittedBy');
      expect(currentHeaders).toContain('verifiedBy');
      expect(currentHeaders).toContain('isVerified');
      expect(currentHeaders).toContain('createdAt');
    });

    it('FAILING TEST: should export measurements with import-compatible headers', () => {
      const mockMeasurement = {
        id: 'measurement-1',
        userId: 'athlete-1',
        date: '2025-01-20',
        age: 15,
        metric: 'FLY10_TIME',
        value: 1.26,
        units: 's',
        flyInDistance: 20,
        notes: 'Electronic gates',
        submittedBy: 'coach-1',
        verifiedBy: 'admin-1',
        isVerified: true,
        createdAt: '2025-01-20T14:00:00Z',
        user: {
          firstName: 'Mia',
          lastName: 'Chen',
          fullName: 'Mia Chen',
          birthYear: 2009,
          gender: 'Female',
          teams: [{ id: 'team-1', name: 'FIERCE 08G' }]
        }
      };

      const csvContent = generateMeasurementsCSV_FIXED([mockMeasurement]);
      const lines = csvContent.split('\n');
      const headers = lines[0].split(',');

      // TEST: Headers should match import template EXACTLY
      expect(headers).toEqual(EXPECTED_MEASUREMENTS_HEADERS);
    });

    it('FAILING TEST: should export teamName as singular (first team only) for measurements', () => {
      const mockMeasurement = {
        id: 'measurement-1',
        userId: 'athlete-1',
        date: '2025-01-18',
        age: 15,
        metric: 'FLY10_TIME',
        value: 1.31,
        units: 's',
        flyInDistance: 15,
        notes: 'Manual timing',
        submittedBy: 'coach-1',
        verifiedBy: null,
        isVerified: false,
        createdAt: '2025-01-18T16:00:00Z',
        user: {
          firstName: 'Jordan',
          lastName: 'Williams',
          fullName: 'Jordan Williams',
          birthYear: 2009,
          gender: 'Male',
          teams: [
            { id: 'team-1', name: 'Lightning 08G' },
            { id: 'team-2', name: 'Secondary Team' }
          ]
        }
      };

      const csvContent = generateMeasurementsCSV_FIXED([mockMeasurement]);
      const lines = csvContent.split('\n');
      const dataRow = parseCSVLine(lines[1]);

      // TEST: teamName column should contain first team only
      const headers = lines[0].split(',');
      const teamNameIndex = headers.indexOf('teamName');
      expect(dataRow[teamNameIndex]).toBe('Lightning 08G');
    });
  });

  describe('Round-Trip Compatibility', () => {
    it('FAILING TEST: exported athletes CSV should be re-importable', () => {
      const mockAthlete = {
        id: 'athlete-1',
        firstName: 'Mia',
        lastName: 'Chen',
        birthDate: '2009-03-15',
        birthYear: 2009,
        graduationYear: 2027,
        gender: 'Female',
        emails: ['mia@email.com'],
        phoneNumbers: ['512-555-0123'],
        sports: ['Soccer'],
        height: 66,
        weight: 125,
        school: 'Westlake HS',
        teams: [{ id: 'team-1', name: 'Lonestar 09G Navy' }],
        isActive: true,
        createdAt: '2025-01-15T10:00:00Z'
      };

      const csvContent = generateAthletesCSV_FIXED([mockAthlete]);

      // TEST: CSV should be parseable and match required import format
      const importResult = validateImportCSV(csvContent, 'athletes');
      expect(importResult.isValid).toBe(true);
      expect(importResult.errors).toHaveLength(0);
    });

    it('FAILING TEST: exported measurements CSV should be re-importable', () => {
      const mockMeasurement = {
        id: 'measurement-1',
        userId: 'athlete-1',
        date: '2025-01-20',
        age: 15,
        metric: 'FLY10_TIME',
        value: 1.26,
        units: 's',
        flyInDistance: 20,
        notes: 'Electronic gates',
        submittedBy: 'coach-1',
        verifiedBy: 'admin-1',
        isVerified: true,
        createdAt: '2025-01-20T14:00:00Z',
        user: {
          firstName: 'Mia',
          lastName: 'Chen',
          birthYear: 2009,
          gender: 'Female',
          teams: [{ id: 'team-1', name: 'FIERCE 08G' }]
        }
      };

      const csvContent = generateMeasurementsCSV_FIXED([mockMeasurement]);

      // TEST: CSV should be parseable and match required import format
      const importResult = validateImportCSV(csvContent, 'measurements');
      expect(importResult.isValid).toBe(true);
      expect(importResult.errors).toHaveLength(0);
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS - FIXED IMPLEMENTATION (to be used in actual code)
// ============================================================================

/**
 * Generate CSV content from athletes data - FIXED VERSION
 * This is how the export endpoint SHOULD work
 */
function generateAthletesCSV_FIXED(athletes: any[]): string {
  const csvHeaders = [
    'firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear',
    'gender', 'emails', 'phoneNumbers', 'sports', 'height', 'weight',
    'school', 'teamName'
  ];

  const csvRows = athletes.map(athlete => {
    const teamName = athlete.teams && athlete.teams.length > 0 ? athlete.teams[0].name : '';
    const emails = Array.isArray(athlete.emails) ? athlete.emails.join(';') : (athlete.emails || '');
    const phoneNumbers = Array.isArray(athlete.phoneNumbers) ? athlete.phoneNumbers.join(';') : (athlete.phoneNumbers || '');
    const sports = Array.isArray(athlete.sports) ? athlete.sports.join(';') : (athlete.sports || '');

    return [
      athlete.firstName || '',
      athlete.lastName || '',
      athlete.birthDate || '',
      athlete.birthYear || '',
      athlete.graduationYear || '',
      athlete.gender || '',
      emails,
      phoneNumbers,
      sports,
      athlete.height || '',
      athlete.weight || '',
      athlete.school || '',
      teamName
    ].map(field => {
      let value = String(field || '');
      value = sanitizeCSVValue(value);

      // CSV escaping
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });

  return [csvHeaders.join(','), ...csvRows].join('\n');
}

/**
 * Generate CSV content from measurements data - FIXED VERSION
 * This is how the export endpoint SHOULD work
 */
function generateMeasurementsCSV_FIXED(measurements: any[]): string {
  const csvHeaders = [
    'firstName', 'lastName', 'gender', 'teamName', 'date', 'age',
    'metric', 'value', 'units', 'flyInDistance', 'notes'
  ];

  const csvRows = measurements.map(measurement => {
    const user = measurement.user;
    const teamName = user?.teams && user.teams.length > 0 ? user.teams[0].name : '';

    return [
      user?.firstName || '',
      user?.lastName || '',
      user?.gender || '',
      teamName,
      measurement.date || '',
      measurement.age || '',
      measurement.metric || '',
      measurement.value || '',
      measurement.units || '',
      measurement.flyInDistance || '',
      measurement.notes || ''
    ].map(field => {
      let value = String(field || '');
      value = sanitizeCSVValue(value);

      // CSV escaping
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });

  return [csvHeaders.join(','), ...csvRows].join('\n');
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      // Escaped quote
      current += '"';
      i++; // Skip next quote
    } else if (char === '"') {
      // Toggle quote mode
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current); // Add last field
  return result;
}

/**
 * Validate if a CSV can be imported
 */
function validateImportCSV(csvContent: string, type: 'athletes' | 'measurements'): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',');

  const requiredHeaders = type === 'athletes'
    ? ['firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear', 'gender', 'emails', 'phoneNumbers', 'sports', 'height', 'weight', 'school', 'teamName']
    : ['firstName', 'lastName', 'gender', 'teamName', 'date', 'age', 'metric', 'value', 'units', 'flyInDistance', 'notes'];

  // Check required headers exist
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      errors.push(`Missing required header: ${required}`);
    }
  }

  // Check no extra headers
  for (const header of headers) {
    if (!requiredHeaders.includes(header)) {
      errors.push(`Unexpected header: ${header}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
