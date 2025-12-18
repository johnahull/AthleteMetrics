/**
 * Template Generator Service Tests
 * Tests for generating CSV import templates with example data
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { templateGeneratorService } from '../template-generator-service';
import { db } from '../../db';
import { teams, organizations, siteMetrics } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('TemplateGeneratorService', () => {
  let testOrgId: string;
  let testTeamIds: string[];

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: 'Test Organization',
      subdomain: 'test-template-gen',
    }).returning();
    testOrgId = org.id;

    // Create test teams
    const [team1] = await db.insert(teams).values({
      name: 'Test Team A',
      organizationId: testOrgId,
    }).returning();

    const [team2] = await db.insert(teams).values({
      name: 'Test Team B',
      organizationId: testOrgId,
    }).returning();

    testTeamIds = [team1.id, team2.id];
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(teams).where(eq(teams.organizationId, testOrgId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe('getSampleValue', () => {
    it('should return sample value for FLY10_TIME', () => {
      const value = templateGeneratorService.getSampleValue('FLY10_TIME');
      expect(value).toBe('1.28');
    });

    it('should return sample value for VERTICAL_JUMP', () => {
      const value = templateGeneratorService.getSampleValue('VERTICAL_JUMP');
      expect(value).toBe('22.5');
    });

    it('should return sample value for DASH_40YD', () => {
      const value = templateGeneratorService.getSampleValue('DASH_40YD');
      expect(value).toBe('5.1');
    });

    it('should return sample value for HEIGHT', () => {
      const value = templateGeneratorService.getSampleValue('HEIGHT');
      expect(value).toBe('68');
    });

    it('should return empty string for unknown metric', () => {
      const value = templateGeneratorService.getSampleValue('UNKNOWN_METRIC');
      expect(value).toBe('');
    });
  });

  describe('generateAthleteExample', () => {
    it('should generate athlete example row with all standard fields', () => {
      const row = templateGeneratorService.generateAthleteExample(
        'Mia',
        'Chen',
        'Test Team A'
      );

      expect(row).toHaveProperty('firstName', 'Mia');
      expect(row).toHaveProperty('lastName', 'Chen');
      expect(row).toHaveProperty('teamName', 'Test Team A');
      expect(row).toHaveProperty('birthDate');
      expect(row).toHaveProperty('birthYear');
      expect(row).toHaveProperty('graduationYear');
      expect(row).toHaveProperty('gender');
      expect(row).toHaveProperty('emails');
      expect(row).toHaveProperty('phoneNumbers');
      expect(row).toHaveProperty('sports');
      expect(row).toHaveProperty('position');
      expect(row).toHaveProperty('height');
      expect(row).toHaveProperty('weight');
      expect(row).toHaveProperty('school');
    });

    it('should generate realistic example data', () => {
      const row = templateGeneratorService.generateAthleteExample(
        'Jordan',
        'Williams',
        'Varsity Football'
      );

      // Birth year should be reasonable (2006-2010 range for high school athletes)
      const birthYear = parseInt(row.birthYear);
      expect(birthYear).toBeGreaterThanOrEqual(2004);
      expect(birthYear).toBeLessThanOrEqual(2010);

      // Graduation year should be future or recent
      const gradYear = parseInt(row.graduationYear);
      expect(gradYear).toBeGreaterThanOrEqual(2024);
      expect(gradYear).toBeLessThanOrEqual(2028);

      // Email should follow pattern
      expect(row.emails).toContain('@example.com');

      // Height should be reasonable (inches)
      const height = parseInt(row.height);
      expect(height).toBeGreaterThanOrEqual(60);
      expect(height).toBeLessThanOrEqual(80);

      // Weight should be reasonable (pounds)
      const weight = parseInt(row.weight);
      expect(weight).toBeGreaterThanOrEqual(100);
      expect(weight).toBeLessThanOrEqual(250);
    });
  });

  describe('generateMeasurementExample', () => {
    it('should generate measurement example row with all standard fields', () => {
      const row = templateGeneratorService.generateMeasurementExample(
        'Alex',
        'Rodriguez',
        'Track Team',
        { code: 'FLY10_TIME', unit: 's' }
      );

      expect(row).toHaveProperty('firstName', 'Alex');
      expect(row).toHaveProperty('lastName', 'Rodriguez');
      expect(row).toHaveProperty('teamName', 'Track Team');
      expect(row).toHaveProperty('date');
      expect(row).toHaveProperty('age');
      expect(row).toHaveProperty('metric', 'FLY10_TIME');
      expect(row).toHaveProperty('value', '1.28'); // Sample value for FLY10_TIME
      expect(row).toHaveProperty('units', 's');
      expect(row).toHaveProperty('flyInDistance');
      expect(row).toHaveProperty('notes');
      expect(row).toHaveProperty('gender');
    });

    it('should use metric-specific sample values', () => {
      const row1 = templateGeneratorService.generateMeasurementExample(
        'Taylor',
        'Anderson',
        'Basketball',
        { code: 'VERTICAL_JUMP', unit: 'in' }
      );
      expect(row1.value).toBe('22.5');
      expect(row1.units).toBe('in');

      const row2 = templateGeneratorService.generateMeasurementExample(
        'Casey',
        'Thompson',
        'Football',
        { code: 'DASH_40YD', unit: 's' }
      );
      expect(row2.value).toBe('5.1');
      expect(row2.units).toBe('s');
    });

    it('should generate realistic measurement dates (recent)', () => {
      const row = templateGeneratorService.generateMeasurementExample(
        'Jordan',
        'Lee',
        'Soccer',
        { code: 'TOP_SPEED', unit: 'mph' }
      );

      const measurementDate = new Date(row.date);
      const now = new Date();
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      expect(measurementDate.getTime()).toBeGreaterThanOrEqual(sixtyDaysAgo.getTime());
      expect(measurementDate.getTime()).toBeLessThanOrEqual(now.getTime());
    });
  });

  describe('generateExampleRows', () => {
    it('should generate athlete example rows with correct count', () => {
      const teamsData = [{ name: 'Team A' }, { name: 'Team B' }];
      const rows = templateGeneratorService.generateExampleRows(
        'athletes',
        teamsData,
        [],
        3
      );

      expect(rows).toHaveLength(3);
      rows.forEach(row => {
        expect(row).toHaveProperty('firstName');
        expect(row).toHaveProperty('lastName');
        expect(row).toHaveProperty('teamName');
      });
    });

    it('should distribute athletes across teams', () => {
      const teamsData = [{ name: 'Team A' }, { name: 'Team B' }];
      const rows = templateGeneratorService.generateExampleRows(
        'athletes',
        teamsData,
        [],
        4
      );

      const teamNames = rows.map(r => r.teamName);
      expect(teamNames).toContain('Team A');
      expect(teamNames).toContain('Team B');
    });

    it('should generate measurement example rows with metrics', () => {
      const teamsData = [{ name: 'Track Team' }];
      const metricsData = [
        { code: 'FLY10_TIME', unit: 's' },
        { code: 'VERTICAL_JUMP', unit: 'in' },
      ];

      const rows = templateGeneratorService.generateExampleRows(
        'measurements',
        teamsData,
        metricsData,
        4
      );

      expect(rows).toHaveLength(4);

      // Should have both metrics represented
      const metrics = rows.map(r => r.metric);
      expect(metrics).toContain('FLY10_TIME');
      expect(metrics).toContain('VERTICAL_JUMP');
    });

    it('should default to 3 rows when count not specified', () => {
      const teamsData = [{ name: 'Team A' }];
      const rows = templateGeneratorService.generateExampleRows(
        'athletes',
        teamsData,
        []
      );

      expect(rows).toHaveLength(3);
    });
  });

  describe('buildCsvContent', () => {
    it('should build CSV with headers and rows', () => {
      const headers = ['firstName', 'lastName', 'age'];
      const rows = [
        { firstName: 'Mia', lastName: 'Chen', age: '16' },
        { firstName: 'Jordan', lastName: 'Lee', age: '17' },
      ];

      const csv = templateGeneratorService.buildCsvContent(headers, rows);

      const lines = csv.split('\n');
      expect(lines[0]).toBe('firstName,lastName,age');
      expect(lines[1]).toBe('Mia,Chen,16');
      expect(lines[2]).toBe('Jordan,Lee,17');
    });

    it('should handle empty rows', () => {
      const headers = ['firstName', 'lastName'];
      const rows: Record<string, string>[] = [];

      const csv = templateGeneratorService.buildCsvContent(headers, rows);

      expect(csv).toBe('firstName,lastName');
    });

    it('should add comment line if provided', () => {
      const headers = ['name'];
      const rows = [{ name: 'Test' }];
      const comment = 'This is a sample template';

      const csv = templateGeneratorService.buildCsvContent(headers, rows, comment);

      const lines = csv.split('\n');
      expect(lines[0]).toBe('# This is a sample template');
      expect(lines[1]).toBe('name');
      expect(lines[2]).toBe('Test');
    });

    it('should escape commas in field values', () => {
      const headers = ['name', 'notes'];
      const rows = [{ name: 'Smith, John', notes: 'Some notes' }];

      const csv = templateGeneratorService.buildCsvContent(headers, rows);

      const lines = csv.split('\n');
      expect(lines[1]).toContain('"Smith, John"');
    });

    it('should handle missing fields in rows', () => {
      const headers = ['firstName', 'lastName', 'age'];
      const rows = [{ firstName: 'Mia', lastName: 'Chen' }]; // Missing age

      const csv = templateGeneratorService.buildCsvContent(headers, rows);

      const lines = csv.split('\n');
      expect(lines[1]).toBe('Mia,Chen,');
    });
  });
});
