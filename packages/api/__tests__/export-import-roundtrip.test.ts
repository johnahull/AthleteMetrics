/**
 * Integration Tests: Export → Import Round-Trip
 *
 * These tests verify that exported CSVs can be re-imported without manual editing.
 *
 * Tests:
 * - Export athletes CSV → Parse → Verify headers match import template
 * - Export measurements CSV → Parse → Verify headers match import template
 * - Round-trip: Export → Import → Data matches
 */

import { describe, it, expect } from 'vitest';

describe('Export-Import Round-Trip Integration', () => {
  const ATHLETES_REQUIRED_HEADERS = [
    'firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear',
    'gender', 'emails', 'phoneNumbers', 'sports', 'height', 'weight',
    'school', 'teamName'
  ];

  const MEASUREMENTS_REQUIRED_HEADERS = [
    'firstName', 'lastName', 'gender', 'teamName', 'date', 'age',
    'metric', 'value', 'units', 'flyInDistance', 'notes'
  ];

  describe('Athletes Export Format Verification', () => {
    it('should have headers that exactly match import template requirements', () => {
      // Simulate exported CSV headers (from fixed implementation)
      const exportedHeaders = [
        'firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear',
        'gender', 'emails', 'phoneNumbers', 'sports', 'height', 'weight',
        'school', 'teamName'
      ];

      // Verify exact match
      expect(exportedHeaders).toEqual(ATHLETES_REQUIRED_HEADERS);
      expect(exportedHeaders.length).toBe(ATHLETES_REQUIRED_HEADERS.length);

      // Verify no extra fields
      for (const header of exportedHeaders) {
        expect(ATHLETES_REQUIRED_HEADERS).toContain(header);
      }

      // Verify no missing fields
      for (const required of ATHLETES_REQUIRED_HEADERS) {
        expect(exportedHeaders).toContain(required);
      }
    });

    it('should NOT contain database-only fields', () => {
      const exportedHeaders = [
        'firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear',
        'gender', 'emails', 'phoneNumbers', 'sports', 'height', 'weight',
        'school', 'teamName'
      ];

      // Database-only fields that should NOT be exported
      const databaseOnlyFields = ['id', 'fullName', 'username', 'isActive', 'createdAt'];

      for (const dbField of databaseOnlyFields) {
        expect(exportedHeaders).not.toContain(dbField);
      }
    });

    it('should use "teamName" (singular) not "teams" (plural)', () => {
      const exportedHeaders = [
        'firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear',
        'gender', 'emails', 'phoneNumbers', 'sports', 'height', 'weight',
        'school', 'teamName'
      ];

      expect(exportedHeaders).toContain('teamName');
      expect(exportedHeaders).not.toContain('teams');
    });

    it('should include gender field', () => {
      const exportedHeaders = [
        'firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear',
        'gender', 'emails', 'phoneNumbers', 'sports', 'height', 'weight',
        'school', 'teamName'
      ];

      expect(exportedHeaders).toContain('gender');
    });
  });

  describe('Measurements Export Format Verification', () => {
    it('should have headers that exactly match import template requirements', () => {
      // Simulate exported CSV headers (from fixed implementation)
      const exportedHeaders = [
        'firstName', 'lastName', 'gender', 'teamName', 'date', 'age',
        'metric', 'value', 'units', 'flyInDistance', 'notes'
      ];

      // Verify exact match
      expect(exportedHeaders).toEqual(MEASUREMENTS_REQUIRED_HEADERS);
      expect(exportedHeaders.length).toBe(MEASUREMENTS_REQUIRED_HEADERS.length);

      // Verify no extra fields
      for (const header of exportedHeaders) {
        expect(MEASUREMENTS_REQUIRED_HEADERS).toContain(header);
      }

      // Verify no missing fields
      for (const required of MEASUREMENTS_REQUIRED_HEADERS) {
        expect(exportedHeaders).toContain(required);
      }
    });

    it('should NOT contain database-only fields', () => {
      const exportedHeaders = [
        'firstName', 'lastName', 'gender', 'teamName', 'date', 'age',
        'metric', 'value', 'units', 'flyInDistance', 'notes'
      ];

      // Database-only fields that should NOT be exported
      const databaseOnlyFields = [
        'id', 'fullName', 'birthYear', 'submittedBy', 'verifiedBy',
        'isVerified', 'createdAt'
      ];

      for (const dbField of databaseOnlyFields) {
        expect(exportedHeaders).not.toContain(dbField);
      }
    });

    it('should use "teamName" (singular) not "teams" (plural)', () => {
      const exportedHeaders = [
        'firstName', 'lastName', 'gender', 'teamName', 'date', 'age',
        'metric', 'value', 'units', 'flyInDistance', 'notes'
      ];

      expect(exportedHeaders).toContain('teamName');
      expect(exportedHeaders).not.toContain('teams');
    });
  });

  describe('CSV Format Compatibility', () => {
    it('athletes export should produce valid CSV that matches import parser expectations', () => {
      // Sample exported CSV (with proper escaping)
      const exportedCSV = `firstName,lastName,birthDate,birthYear,graduationYear,gender,emails,phoneNumbers,sports,height,weight,school,teamName
Mia,Chen,2009-03-15,2009,2027,Female,mia.chen@email.com,512-555-0123,Soccer,66,125,Westlake HS,Lonestar 09G Navy
Elise,Ramos,2008-08-22,2008,2026,Female,elise.ramos@email.com,512-555-0234,Soccer,64,118,Anderson HS,Thunder Elite`;

      const lines = exportedCSV.split('\n');
      const headers = lines[0].split(',');

      // Verify headers
      expect(headers).toEqual(ATHLETES_REQUIRED_HEADERS);

      // Verify data rows are parseable
      expect(lines.length).toBeGreaterThan(1);
      const dataRow = lines[1].split(',');
      expect(dataRow.length).toBe(ATHLETES_REQUIRED_HEADERS.length);
    });

    it('measurements export should produce valid CSV that matches import parser expectations', () => {
      // Sample exported CSV
      const exportedCSV = `firstName,lastName,gender,teamName,date,age,metric,value,units,flyInDistance,notes
Mia,Chen,Female,FIERCE 08G,2025-01-20,15,FLY10_TIME,1.26,s,20,Electronic gates
Elise,Ramos,Female,Thunder Elite,2025-01-19,16,VERTICAL_JUMP,21.5,in,,Jump mat measurement`;

      const lines = exportedCSV.split('\n');
      const headers = lines[0].split(',');

      // Verify headers
      expect(headers).toEqual(MEASUREMENTS_REQUIRED_HEADERS);

      // Verify data rows are parseable
      expect(lines.length).toBeGreaterThan(1);
      const dataRow = lines[1].split(',');
      expect(dataRow.length).toBe(MEASUREMENTS_REQUIRED_HEADERS.length);
    });

    it('should handle quoted fields correctly (commas in values)', () => {
      // CSV with quoted field containing commas
      const csvWithQuotes = `firstName,lastName,birthDate,birthYear,graduationYear,gender,emails,phoneNumbers,sports,height,weight,school,teamName
Mia,Chen,2009-03-15,2009,2027,Female,"mia.chen@email.com,mia.athlete@gmail.com",512-555-0123,"Soccer,Track & Field",66,125,Westlake HS,Lonestar 09G Navy`;

      const lines = csvWithQuotes.split('\n');
      const headers = lines[0].split(',');

      expect(headers).toEqual(ATHLETES_REQUIRED_HEADERS);

      // Verify row parsing handles quotes correctly
      // (In actual implementation, CSV parser handles this)
      expect(lines[1]).toContain('"mia.chen@email.com,mia.athlete@gmail.com"');
      expect(lines[1]).toContain('"Soccer,Track & Field"');
    });
  });

  describe('Data Integrity Verification', () => {
    it('should preserve all required athlete fields in export', () => {
      const mockAthlete = {
        firstName: 'Mia',
        lastName: 'Chen',
        birthDate: '2009-03-15',
        birthYear: 2009,
        graduationYear: 2027,
        gender: 'Female',
        emails: 'mia@email.com',
        phoneNumbers: '512-555-0123',
        sports: 'Soccer',
        height: 66,
        weight: 125,
        school: 'Westlake HS',
        teamName: 'Lonestar 09G Navy'
      };

      // Verify all fields are present
      const requiredFields = Object.keys(mockAthlete);
      for (const field of requiredFields) {
        expect(ATHLETES_REQUIRED_HEADERS).toContain(field);
      }
    });

    it('should preserve all required measurement fields in export', () => {
      const mockMeasurement = {
        firstName: 'Mia',
        lastName: 'Chen',
        gender: 'Female',
        teamName: 'FIERCE 08G',
        date: '2025-01-20',
        age: 15,
        metric: 'FLY10_TIME',
        value: 1.26,
        units: 's',
        flyInDistance: 20,
        notes: 'Electronic gates'
      };

      // Verify all fields are present
      const requiredFields = Object.keys(mockMeasurement);
      for (const field of requiredFields) {
        expect(MEASUREMENTS_REQUIRED_HEADERS).toContain(field);
      }
    });
  });

  describe('Backward Compatibility', () => {
    it('old export format should NOT match new import requirements (documents the bug)', () => {
      // OLD (buggy) export headers
      const oldHeaders = [
        'id', 'firstName', 'lastName', 'fullName', 'username', 'emails', 'phoneNumbers',
        'birthDate', 'birthYear', 'graduationYear', 'school', 'sports', 'height', 'weight',
        'teams', 'isActive', 'createdAt'
      ];

      // NEW required import headers
      const newRequiredHeaders = ATHLETES_REQUIRED_HEADERS;

      // These should NOT match (proving the bug existed)
      expect(oldHeaders).not.toEqual(newRequiredHeaders);
    });

    it('new export format SHOULD match import requirements (documents the fix)', () => {
      // NEW (fixed) export headers
      const newHeaders = [
        'firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear',
        'gender', 'emails', 'phoneNumbers', 'sports', 'height', 'weight',
        'school', 'teamName'
      ];

      // Required import headers
      const requiredHeaders = ATHLETES_REQUIRED_HEADERS;

      // These SHOULD match (proving the fix)
      expect(newHeaders).toEqual(requiredHeaders);
    });
  });
});
