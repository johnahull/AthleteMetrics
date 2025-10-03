/**
 * Test suite for ExportService
 * Tests CSV export functionality with proper escaping
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';

// Mock the database before importing anything
vi.mock('../../db', () => ({
  db: {}
}));

vi.mock('../../storage', () => ({
  storage: {}
}));

import { ExportService } from '../export-service';

// Mock the storage
const mockStorage = {
  getAthletes: vi.fn(),
  getMeasurements: vi.fn(),
  getTeams: vi.fn(),
  getUserOrganizations: vi.fn(),
};

describe('ExportService', () => {
  let exportService: ExportService;

  beforeEach(() => {
    // @ts-ignore - mocking storage
    exportService = new ExportService();
    // @ts-ignore - inject mock storage
    exportService['storage'] = mockStorage;
    vi.clearAllMocks();

    // Mock organization access by default
    mockStorage.getUserOrganizations.mockResolvedValue([
      { organizationId: 'org-1', organization: { id: 'org-1', name: 'Test Org' } }
    ]);
  });

  describe('CSV Escaping', () => {
    it('should properly escape CSV fields with commas', async () => {
      mockStorage.getAthletes.mockResolvedValue([
        {
          id: '1',
          firstName: 'Smith',
          lastName: 'Johnson, Jr.',
          emails: ['test@example.com'],
          birthDate: '2000-01-01',
          gender: 'M'
        }
      ]);

      const csv = await exportService.exportAthletes('org-1', 'user-1');

      expect(csv).toContain('"Johnson, Jr."');
      expect(csv).not.toContain('Johnson, Jr.,');
    });

    it('should properly escape CSV fields with quotes', async () => {
      mockStorage.getAthletes.mockResolvedValue([
        {
          id: '1',
          firstName: 'John "Johnny"',
          lastName: 'Doe',
          emails: ['test@example.com'],
          birthDate: '2000-01-01',
          gender: 'M'
        }
      ]);

      const csv = await exportService.exportAthletes('org-1', 'user-1');

      expect(csv).toContain('"John ""Johnny"""');
    });

    it('should properly escape CSV fields with newlines', async () => {
      mockStorage.getTeams.mockResolvedValue([
        {
          id: '1',
          name: 'Team\nWith\nNewlines',
          level: 'varsity',
          season: '2024',
          isArchived: false
        }
      ]);

      const csv = await exportService.exportTeams('org-1', 'user-1');

      expect(csv).toContain('"Team\nWith\nNewlines"');
    });

    it('should handle empty and null values', async () => {
      mockStorage.getAthletes.mockResolvedValue([
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          emails: [],
          birthDate: null,
          gender: null
        }
      ]);

      const csv = await exportService.exportAthletes('org-1', 'user-1');

      expect(csv).toContain('1,John,Doe,,,');
    });
  });

  describe('exportAthletes', () => {
    it('should export athletes to CSV format', async () => {
      mockStorage.getAthletes.mockResolvedValue([
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          emails: ['john@example.com'],
          birthDate: '2000-01-01',
          gender: 'M'
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smith',
          emails: ['jane@example.com'],
          birthDate: '1999-05-15',
          gender: 'F'
        }
      ]);

      const csv = await exportService.exportAthletes('org-1', 'user-1');

      expect(csv).toContain('ID,First Name,Last Name,Email,Birthdate,Gender');
      expect(csv).toContain('1,John,Doe,john@example.com,2000-01-01,M');
      expect(csv).toContain('2,Jane,Smith,jane@example.com,1999-05-15,F');
    });

    it('should check organization access', async () => {
      mockStorage.getUserOrganizations.mockResolvedValue([
        { organizationId: 'org-2', organization: { id: 'org-2', name: 'Other Org' } }
      ]);
      mockStorage.getAthletes.mockResolvedValue([]);

      await expect(
        exportService.exportAthletes('org-1', 'user-1')
      ).rejects.toThrow();
    });

    it('should handle athletes without emails', async () => {
      mockStorage.getAthletes.mockResolvedValue([
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          emails: [],
          birthDate: '2000-01-01',
          gender: 'M'
        }
      ]);

      const csv = await exportService.exportAthletes('org-1', 'user-1');

      expect(csv).toContain('1,John,Doe,,2000-01-01,M');
    });
  });

  describe('exportMeasurements', () => {
    it('should export measurements to CSV format', async () => {
      mockStorage.getMeasurements.mockResolvedValue([
        {
          date: '2024-01-01',
          user: { firstName: 'John', lastName: 'Doe' },
          metric: 'FLY10_TIME',
          value: 1.5,
          units: 'seconds',
          isVerified: true
        }
      ]);

      const csv = await exportService.exportMeasurements(
        { organizationId: 'org-1' },
        'user-1'
      );

      expect(csv).toContain('Date,Athlete,Metric,Value,Units,Verified');
      expect(csv).toContain('2024-01-01,John Doe,FLY10_TIME,1.5,seconds,true');
    });

    it('should handle measurements without units', async () => {
      mockStorage.getMeasurements.mockResolvedValue([
        {
          date: '2024-01-01',
          user: { firstName: 'John', lastName: 'Doe' },
          metric: 'WEIGHT',
          value: 180,
          units: null,
          isVerified: false
        }
      ]);

      const csv = await exportService.exportMeasurements(
        { organizationId: 'org-1' },
        'user-1'
      );

      expect(csv).toContain('2024-01-01,John Doe,WEIGHT,180,,false');
    });
  });

  describe('exportTeams', () => {
    it('should export teams to CSV format', async () => {
      mockStorage.getTeams.mockResolvedValue([
        {
          id: '1',
          name: 'Varsity Football',
          level: 'varsity',
          season: '2024 Fall',
          isArchived: false
        },
        {
          id: '2',
          name: 'JV Basketball',
          level: 'jv',
          season: '2024 Winter',
          isArchived: true
        }
      ]);

      const csv = await exportService.exportTeams('org-1', 'user-1');

      expect(csv).toContain('ID,Name,Level,Season,Is Archived');
      expect(csv).toContain('1,Varsity Football,varsity,2024 Fall,false');
      expect(csv).toContain('2,JV Basketball,jv,2024 Winter,true');
    });

    it('should handle teams with null values', async () => {
      mockStorage.getTeams.mockResolvedValue([
        {
          id: '1',
          name: 'Team Name',
          level: null,
          season: null,
          isArchived: false
        }
      ]);

      const csv = await exportService.exportTeams('org-1', 'user-1');

      expect(csv).toContain('1,Team Name,,,false');
    });
  });
});
