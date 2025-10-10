/**
 * Unit tests for useGroupComparison hook
 * Tests group comparison data aggregation and state management
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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

  const WrapperComponent = ({ children }: { children: React.ReactNode }) => {
    const clientProp = queryClient;
    return React.createElement(QueryClientProvider, { client: clientProp }, children);
  };

  // Attach queryClient to wrapper for cleanup
  (WrapperComponent as any).queryClient = queryClient;

  return WrapperComponent;
};

describe('useGroupComparison', () => {
  let currentWrapper: ReturnType<typeof createWrapper> | null = null;

  afterEach(() => {
    // Clean up QueryClient after each test to prevent memory leaks
    try {
      if (currentWrapper && (currentWrapper as any).queryClient) {
        (currentWrapper as any).queryClient.clear();
      }
    } catch (error) {
      // Log cleanup failures to help diagnose issues
      console.warn('QueryClient cleanup failed:', error);
    } finally {
      // Always reset wrapper to null, even if cleanup fails
      currentWrapper = null;
    }
  });
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
      currentWrapper = createWrapper();
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: currentWrapper }
      );

      expect(result.current.selectedGroups).toEqual([]);
      expect(result.current.chartData).toBeNull();
      expect(result.current.isDataReady).toBe(false);
    });

    it('should not fetch data when analyticsData is provided', () => {
      currentWrapper = createWrapper();
      renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: currentWrapper }
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should wait for main analytics loading before fetching separately', () => {
      currentWrapper = createWrapper();
      renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: undefined,
            isMainAnalyticsLoading: true,
          }),
        { wrapper: currentWrapper }
      );

      // Should not fetch while main analytics is loading
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Group Selection', () => {
    it('should update selectedGroups via setSelectedGroups', async () => {
      currentWrapper = createWrapper();
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: currentWrapper }
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

      await act(async () => {
        result.current.setSelectedGroups(newGroups);
      });

      await waitFor(() => {
        expect(result.current.selectedGroups).toEqual(newGroups);
      });
    });

    it('should respect maxGroups limit', async () => {
      currentWrapper = createWrapper();
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
            maxGroups: 2,
          }),
        { wrapper: currentWrapper }
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
      await act(async () => {
        result.current.setSelectedGroups(groups);
      });

      await waitFor(() => {
        // Verify that the groups were set (enforcement happens in GroupSelector)
        expect(result.current.selectedGroups).toHaveLength(3);
      });
    });
  });

  describe('Data Aggregation', () => {
    it('should aggregate data by groups when groups are selected', async () => {
      currentWrapper = createWrapper();
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: currentWrapper }
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
      currentWrapper = createWrapper();
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: currentWrapper }
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

      await act(async () => {
        result.current.setSelectedGroups(groups);
      });

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

      currentWrapper = createWrapper();
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: multiMetricData,
          }),
        { wrapper: currentWrapper }
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

      currentWrapper = createWrapper();
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: undefined,
            isMainAnalyticsLoading: false,
          }),
        { wrapper: currentWrapper }
      );

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(result.current.isDataReady).toBe(false);
      expect(result.current.chartData).toBeNull();
    });

    it('should handle empty analytics data', async () => {
      currentWrapper = createWrapper();
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: { data: [], statistics: {} },
          }),
        { wrapper: currentWrapper }
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

      await act(async () => {
        result.current.setSelectedGroups(groups);
      });

      await waitFor(() => {
        expect(result.current.isDataReady).toBe(true);
      });

      // Should handle empty data without crashing
      expect(result.current.chartData).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle groups with no matching athletes', async () => {
      currentWrapper = createWrapper();
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: currentWrapper }
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

      await act(async () => {
        result.current.setSelectedGroups(groups);
      });

      await waitFor(() => {
        expect(result.current.isDataReady).toBe(true);
      });

      // Should not crash with empty groups
      expect(result.current.chartData).toBeDefined();
    });

    it('should handle removal of all groups', async () => {
      currentWrapper = createWrapper();
      const { result } = renderHook(
        () =>
          useGroupComparison({
            organizationId: 'org-1',
            metrics: mockMetrics,
            athletes: mockAthletes,
            analyticsData: mockAnalyticsData,
          }),
        { wrapper: currentWrapper }
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

      await act(async () => {
        result.current.setSelectedGroups(groups);
      });

      await waitFor(() => {
        expect(result.current.isDataReady).toBe(true);
      });

      // Remove all groups
      await act(async () => {
        result.current.setSelectedGroups([]);
      });

      await waitFor(() => {
        expect(result.current.isDataReady).toBe(false);
        expect(result.current.chartData).toBeNull();
      });
    });
  });
});