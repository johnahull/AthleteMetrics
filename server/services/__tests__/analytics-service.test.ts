/**
 * Test suite for AnalyticsService
 * Tests analytics aggregation and organization access control
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database before importing anything
vi.mock('../../db', () => ({
  db: {}
}));

vi.mock('../../storage', () => ({
  storage: {}
}));

import { AnalyticsService } from '../analytics-service';

// Mock the storage
const mockStorage = {
  getMeasurements: vi.fn(),
  getTeams: vi.fn(),
  getUserOrganizations: vi.fn(),
};

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    // @ts-ignore - mocking storage
    analyticsService = new AnalyticsService();
    // @ts-ignore - inject mock storage
    analyticsService['storage'] = mockStorage;
    vi.clearAllMocks();

    // Mock organization access by default
    mockStorage.getUserOrganizations.mockResolvedValue([
      { organizationId: 'org-1', organization: { id: 'org-1', name: 'Test Org' } }
    ]);
  });

  describe('getDashboardAnalytics', () => {
    it('should calculate basic analytics metrics', async () => {
      mockStorage.getMeasurements.mockResolvedValue([
        { metric: 'FLY10_TIME', value: 1.5, isVerified: true },
        { metric: 'FLY10_TIME', value: 1.6, isVerified: false },
        { metric: 'VERTICAL_JUMP', value: 30, isVerified: true },
      ]);

      const analytics = await analyticsService.getDashboardAnalytics(
        { organizationId: 'org-1' },
        'user-1'
      );

      expect(analytics.totalMeasurements).toBe(3);
      expect(analytics.verifiedCount).toBe(2);
      expect(analytics.metricBreakdown).toEqual({
        FLY10_TIME: 2,
        VERTICAL_JUMP: 1
      });
    });

    it('should handle empty measurements', async () => {
      mockStorage.getMeasurements.mockResolvedValue([]);

      const analytics = await analyticsService.getDashboardAnalytics(
        { organizationId: 'org-1' },
        'user-1'
      );

      expect(analytics.totalMeasurements).toBe(0);
      expect(analytics.verifiedCount).toBe(0);
      expect(analytics.metricBreakdown).toEqual({});
    });

    it('should include date range and results when provided', async () => {
      const mockMeasurements = [
        { metric: 'FLY10_TIME', value: 1.5, isVerified: true },
      ];
      mockStorage.getMeasurements.mockResolvedValue(mockMeasurements);

      const analytics = await analyticsService.getDashboardAnalytics(
        {
          organizationId: 'org-1',
          dateRange: { start: '2024-01-01', end: '2024-12-31' }
        },
        'user-1'
      );

      expect(analytics.dateRange).toEqual({
        start: '2024-01-01',
        end: '2024-12-31'
      });
      expect(analytics.results).toEqual(mockMeasurements);
    });

    it('should check organization access', async () => {
      mockStorage.getUserOrganizations.mockResolvedValue([
        { organizationId: 'org-2', organization: { id: 'org-2', name: 'Other Org' } }
      ]);
      mockStorage.getMeasurements.mockResolvedValue([]);

      await expect(
        analyticsService.getDashboardAnalytics(
          { organizationId: 'org-1' },
          'user-1'
        )
      ).rejects.toThrow();
    });

    it('should filter by metrics', async () => {
      mockStorage.getMeasurements.mockResolvedValue([
        { metric: 'FLY10_TIME', value: 1.5, isVerified: true },
      ]);

      await analyticsService.getDashboardAnalytics(
        {
          organizationId: 'org-1',
          metrics: ['FLY10_TIME', 'VERTICAL_JUMP']
        },
        'user-1'
      );

      expect(mockStorage.getMeasurements).toHaveBeenCalledWith({
        organizationId: 'org-1',
        metric: 'FLY10_TIME,VERTICAL_JUMP',
        startDate: undefined,
        endDate: undefined
      });
    });
  });

  describe('getTeamAnalytics', () => {
    it('should calculate team statistics', async () => {
      mockStorage.getTeams.mockResolvedValue([
        { id: '1', level: 'varsity', isArchived: false },
        { id: '2', level: 'jv', isArchived: false },
        { id: '3', level: 'varsity', isArchived: true },
      ]);

      const analytics = await analyticsService.getTeamAnalytics('org-1', 'user-1');

      expect(analytics.totalTeams).toBe(3);
      expect(analytics.activeTeams).toBe(2);
      expect(analytics.archivedTeams).toBe(1);
      expect(analytics.levelBreakdown).toEqual({
        varsity: 2,
        jv: 1
      });
    });

    it('should handle teams without levels', async () => {
      mockStorage.getTeams.mockResolvedValue([
        { id: '1', level: null, isArchived: false },
        { id: '2', level: undefined, isArchived: false },
      ]);

      const analytics = await analyticsService.getTeamAnalytics('org-1', 'user-1');

      expect(analytics.levelBreakdown).toEqual({
        Unknown: 2
      });
    });

    it('should handle empty teams', async () => {
      mockStorage.getTeams.mockResolvedValue([]);

      const analytics = await analyticsService.getTeamAnalytics('org-1', 'user-1');

      expect(analytics.totalTeams).toBe(0);
      expect(analytics.activeTeams).toBe(0);
      expect(analytics.archivedTeams).toBe(0);
      expect(analytics.levelBreakdown).toEqual({});
    });

    it('should work without organization filter', async () => {
      mockStorage.getUserOrganizations.mockResolvedValue([]);
      mockStorage.getTeams.mockResolvedValue([
        { id: '1', level: 'varsity', isArchived: false }
      ]);

      const analytics = await analyticsService.getTeamAnalytics(undefined, 'user-1');

      expect(analytics.totalTeams).toBe(1);
      expect(mockStorage.getMeasurements).not.toHaveBeenCalled();
    });
  });
});
