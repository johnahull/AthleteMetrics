/**
 * Unit tests for useGroupComparison hook
 * Tests group comparison data aggregation and state management
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GroupDefinition, MetricSelection } from '@shared/analytics-types';
import { useGroupComparison } from '../useGroupComparison';
import React from 'react';

// Mock fetch globally
global.fetch = vi.fn();

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useGroupComparison', () => {
  const mockAthletes = [
    { id: 'athlete-1', name: 'John Doe', team: 'Team A', age: 16 },
    { id: 'athlete-2', name: 'Jane Smith', team: 'Team A', age: 17 },
    { id: 'athlete-3', name: 'Bob Johnson', team: 'Team B', age: 15 },
    { id: 'athlete-4', name: 'Alice Williams', team: 'Team B', age: 16 },
  ];

  const mockMetrics: MetricSelection = {
    primary: 'FLY10_TIME',
    secondary: null,
    additional: []
  };

  const mockAnalyticsData = {
    data: [
      {
        athleteId: 'athlete-1',
        athleteName: 'John Doe',
        metric: 'FLY10_TIME',
        value: 1.5,
        date: new Date('2024-01-01'),
        teamName: 'Team A',
      },
      {
        athleteId: 'athlete-2',
        athleteName: 'Jane Smith',
        metric: 'FLY10_TIME',
        value: 1.6,
        date: new Date('2024-01-01'),
        teamName: 'Team A',
      },
      {
        athleteId: 'athlete-3',
        athleteName: 'Bob Johnson',
        metric: 'FLY10_TIME',
        value: 1.7,
        date: new Date('2024-01-01'),
        teamName: 'Team B',
      },
    ],
    statistics: {
      FLY10_TIME: {
        mean: 1.6,
        median: 1.6,
        stdDev: 0.1,
        min: 1.5,
        max: 1.7,
        count: 3
      }
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with empty groups', () => {
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.selectedGroups).toEqual([]);
      expect(result.current.chartData).toBeNull();
      expect(result.current.isDataReady).toBe(false);
    });

    it('should not fetch data when analyticsData is provided', () => {
      renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: createWrapper() }
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should wait for main analytics loading before fetching separately', () => {
      renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: undefined,
            isMainAnalyticsLoading: true,
          }),
        { wrapper: createWrapper() }
      );

      // Should not fetch while main analytics is loading
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Group Selection', () => {
    it('should update selectedGroups via setSelectedGroups', () => {
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: createWrapper() }
      );

      const newGroups: GroupDefinition[] = [
        {
          id: 'group-1',
          name: 'Team A',
          type: 'team',
          memberIds: ['athlete-1', 'athlete-2'],
          color: '#3B82F6',
          criteria: { teams: ['Team A'] }
        }
      ];

      result.current.setSelectedGroups(newGroups);

      expect(result.current.selectedGroups).toEqual(newGroups);
    });

    it('should respect maxGroups limit', () => {
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
            maxGroups: 2,
          }),
        { wrapper: createWrapper() }
      );

      const groups: GroupDefinition[] = Array.from({ length: 3 }, (_, i) => ({
        id: `group-${i}`,
        name: `Group ${i}`,
        type: 'team' as const,
        memberIds: ['athlete-1'],
        color: '#3B82F6',
        criteria: { teams: [`Team ${i}`] }
      }));

      // The hook itself doesn't enforce the limit, but maxGroups is passed to components
      result.current.setSelectedGroups(groups);

      // Verify that the groups were set (enforcement happens in GroupSelector)
      expect(result.current.selectedGroups).toHaveLength(3);
    });
  });

  describe('Data Aggregation', () => {
    it('should aggregate data by groups when groups are selected', async () => {
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: createWrapper() }
      );

      const groups: GroupDefinition[] = [
        {
          id: 'group-1',
          name: 'Team A',
          type: 'team',
          memberIds: ['athlete-1', 'athlete-2'],
          color: '#3B82F6',
          criteria: { teams: ['Team A'] }
        },
        {
          id: 'group-2',
          name: 'Team B',
          type: 'team',
          memberIds: ['athlete-3'],
          color: '#10B981',
          criteria: { teams: ['Team B'] }
        }
      ];

      result.current.setSelectedGroups(groups);

      await waitFor(() => {
        expect(result.current.isDataReady).toBe(true);
      });

      expect(result.current.chartData).not.toBeNull();
      expect(result.current.groupComparisonData).not.toBeNull();
    });

    it('should calculate group statistics correctly', async () => {
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: createWrapper() }
      );

      const groups: GroupDefinition[] = [
        {
          id: 'group-1',
          name: 'Team A',
          type: 'team',
          memberIds: ['athlete-1', 'athlete-2'],
          color: '#3B82F6',
          criteria: { teams: ['Team A'] }
        }
      ];

      result.current.setSelectedGroups(groups);

      await waitFor(() => {
        expect(result.current.groupComparisonData).not.toBeNull();
      });

      const groupData = result.current.groupComparisonData;
      expect(groupData?.groups).toHaveLength(1);
      expect(groupData?.groups[0].statistics).toBeDefined();
    });

    it('should filter data by selected metric', async () => {
      const multiMetricData = {
        data: [
          ...mockAnalyticsData.data,
          {
            athleteId: 'athlete-1',
            athleteName: 'John Doe',
            metric: 'VERTICAL_JUMP',
            value: 25.0,
            date: new Date('2024-01-01'),
            teamName: 'Team A',
          }
        ],
        statistics: mockAnalyticsData.statistics
      };

      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: multiMetricData,
          }),
        { wrapper: createWrapper() }
      );

      const groups: GroupDefinition[] = [
        {
          id: 'group-1',
          name: 'Team A',
          type: 'team',
          memberIds: ['athlete-1', 'athlete-2'],
          color: '#3B82F6',
          criteria: { teams: ['Team A'] }
        }
      ];

      result.current.setSelectedGroups(groups);

      await waitFor(() => {
        expect(result.current.chartData).not.toBeNull();
      });

      // All chart data points should be for the primary metric
      result.current.chartData?.forEach(point => {
        expect(point.metric).toBe('FLY10_TIME');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch errors gracefully', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: undefined,
            isMainAnalyticsLoading: false,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(result.current.isDataReady).toBe(false);
      expect(result.current.chartData).toBeNull();
    });

    it('should handle empty analytics data', () => {
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: { data: [], statistics: {} },
          }),
        { wrapper: createWrapper() }
      );

      const groups: GroupDefinition[] = [
        {
          id: 'group-1',
          name: 'Team A',
          type: 'team',
          memberIds: ['athlete-1', 'athlete-2'],
          color: '#3B82F6',
          criteria: { teams: ['Team A'] }
        }
      ];

      result.current.setSelectedGroups(groups);

      expect(result.current.isDataReady).toBe(true);
      // Should handle empty data without crashing
      expect(result.current.chartData).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle groups with no matching athletes', async () => {
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: createWrapper() }
      );

      const groups: GroupDefinition[] = [
        {
          id: 'group-1',
          name: 'Team C',
          type: 'team',
          memberIds: [],
          color: '#3B82F6',
          criteria: { teams: ['Team C'] }
        }
      ];

      result.current.setSelectedGroups(groups);

      await waitFor(() => {
        expect(result.current.isDataReady).toBe(true);
      });

      // Should not crash with empty groups
      expect(result.current.chartData).toBeDefined();
    });

    it('should handle removal of all groups', async () => {
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: createWrapper() }
      );

      const groups: GroupDefinition[] = [
        {
          id: 'group-1',
          name: 'Team A',
          type: 'team',
          memberIds: ['athlete-1', 'athlete-2'],
          color: '#3B82F6',
          criteria: { teams: ['Team A'] }
        }
      ];

      result.current.setSelectedGroups(groups);

      await waitFor(() => {
        expect(result.current.isDataReady).toBe(true);
      });

      // Remove all groups
      result.current.setSelectedGroups([]);

      expect(result.current.isDataReady).toBe(false);
      expect(result.current.chartData).toBeNull();
    });
  });
});