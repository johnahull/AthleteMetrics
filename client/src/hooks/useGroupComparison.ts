/**
 * Custom hook for managing multi-group comparison state and data aggregation
 *
 * Provides functionality for:
 * - Group selection and management
 * - Data aggregation by groups
 * - Statistical calculations per group
 * - Chart data transformation for group comparisons
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCacheConfig } from '@/lib/query-cache-config';
import type {
  GroupDefinition,
  GroupComparisonData,
  MetricSelection,
  ChartDataPoint,
  StatisticalSummary
} from '@shared/analytics-types';
import { devLog } from '@/utils/dev-logger';

interface Athlete {
  id: string;
  name: string;
  team?: string;
  position?: string;
  age?: number;
  graduationYear?: number;
}

interface UseGroupComparisonProps {
  /** Organization ID for data filtering */
  organizationId: string;
  /** Selected metrics for comparison */
  metrics: MetricSelection;
  /** Available athletes */
  athletes: Athlete[];
  /** Maximum number of groups allowed */
  maxGroups?: number;
  /** Analytics data from the main analytics context (avoids duplicate API calls) */
  analyticsData?: any;
  /** Whether the main analytics context is still loading */
  isMainAnalyticsLoading?: boolean;
}

interface UseGroupComparisonReturn {
  /** Currently selected groups */
  selectedGroups: GroupDefinition[];
  /** Update selected groups */
  setSelectedGroups: (groups: GroupDefinition[]) => void;
  /** Aggregated data for chart display */
  groupComparisonData: GroupComparisonData | null;
  /** Chart-ready data points for selected chart type */
  chartData: ChartDataPoint[] | null;
  /** Statistical summaries for normalization */
  statistics: Record<string, StatisticalSummary> | null;
  /** Recommended chart types for multi-group analysis */
  recommendedCharts: string[] | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Whether data is ready for visualization */
  isDataReady: boolean;
}

export function useGroupComparison({
  organizationId,
  metrics,
  athletes,
  maxGroups = 8,
  analyticsData,
  isMainAnalyticsLoading = false
}: UseGroupComparisonProps): UseGroupComparisonReturn {
  const [selectedGroups, setSelectedGroups] = useState<GroupDefinition[]>([]);

  // Only fetch separately if analytics data is not available AND main analytics is not loading
  // This prevents CSRF race conditions by waiting for the main analytics to complete
  const shouldFetchSeparately = !analyticsData && !isMainAnalyticsLoading;

  // Fetch measurement data for all athletes (only if analytics data not provided)
  const { data: fetchedData, isLoading, error } = useQuery({
    queryKey: ['group-measurements', organizationId, metrics],
    ...getCacheConfig('MEASUREMENTS'),
    queryFn: async () => {
      // Reuse the main analytics API instead of separate measurements API
      // This avoids CSRF token conflicts
      const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include'
      });

      if (!csrfResponse.ok) {
        throw new Error('Failed to fetch CSRF token');
      }

      const { csrfToken } = await csrfResponse.json();

      const response = await fetch(`/api/analytics/dashboard`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          analysisType: 'multi_group',
          filters: { organizationId },
          metrics: { primary: metrics.primary, additional: metrics.additional },
          timeframe: { type: 'best', period: 'all_time' }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch analytics data: ${response.status} ${response.statusText}`);
      }

      return response.json();
    },
    enabled: shouldFetchSeparately && !!organizationId && !!metrics.primary
  });

  // Use provided analytics data or fetched data
  const measurementData = analyticsData || fetchedData;

  // Calculate group aggregations
  const groupComparisonData = useMemo((): GroupComparisonData | null => {

    if (!measurementData?.data || selectedGroups.length === 0) {
      return null;
    }

    devLog.log('Calculating group aggregations', {
      groupCount: selectedGroups.length,
      dataPoints: measurementData.data.length,
      metrics: [metrics.primary, ...metrics.additional]
    });

    const allMetrics = [metrics.primary, ...metrics.additional];
    const aggregations: GroupComparisonData['aggregations'] = {};

    selectedGroups.forEach(group => {
      aggregations[group.id] = {};

      allMetrics.forEach(metric => {
        // Get data points for this group and metric
        const groupData = measurementData.data.filter((point: ChartDataPoint) =>
          group.memberIds.includes(point.athleteId) && point.metric === metric
        );

        if (groupData.length === 0) {
          aggregations[group.id][metric] = {
            mean: 0,
            median: 0,
            min: 0,
            max: 0,
            stdDev: 0,
            count: 0,
            values: []
          };
          return;
        }

        const values = groupData.map((point: ChartDataPoint) => point.value);
        values.sort((a: number, b: number) => a - b);

        const count = values.length;
        const sum = values.reduce((a: number, b: number) => a + b, 0);
        const mean = sum / count;
        const median = count % 2 === 0
          ? (values[count / 2 - 1] + values[count / 2]) / 2
          : values[Math.floor(count / 2)];
        const min = values[0];
        const max = values[count - 1];

        // Calculate standard deviation
        const variance = values.reduce((acc: number, val: number) => acc + Math.pow(val - mean, 2), 0) / count;
        const stdDev = Math.sqrt(variance);

        aggregations[group.id][metric] = {
          mean,
          median,
          min,
          max,
          stdDev,
          count,
          values
        };
      });
    });

    return {
      groups: selectedGroups,
      metrics: allMetrics,
      aggregations,
      statistics: measurementData.statistics
    };
  }, [measurementData, selectedGroups, metrics]);

  // Transform data for chart consumption
  const chartData = useMemo((): ChartDataPoint[] | null => {
    if (!groupComparisonData) return null;

    const points: ChartDataPoint[] = [];

    groupComparisonData.groups.forEach(group => {
      groupComparisonData.metrics.forEach(metric => {
        const aggregation = groupComparisonData.aggregations[group.id][metric];

        if (aggregation.count > 0) {
          // Create a representative data point for the group using the mean
          points.push({
            athleteId: `group-${group.id}`,
            athleteName: group.name,
            metric,
            value: aggregation.mean,
            date: new Date(),
            // Add group-specific metadata
            grouping: group.id,
            teamName: group.type === 'team' ? group.name : undefined,
            additionalData: {
              groupId: group.id,
              groupType: group.type,
              groupSize: aggregation.count,
              groupStats: {
                mean: aggregation.mean,
                median: aggregation.median,
                stdDev: aggregation.stdDev,
                min: aggregation.min,
                max: aggregation.max
              }
            }
          });
        }
      });
    });

    return points;
  }, [groupComparisonData]);

  // Reset groups when athletes change significantly
  useEffect(() => {
    if (selectedGroups.length > 0) {
      const invalidGroups = selectedGroups.filter(group => {
        const validMembers = group.memberIds.filter(id =>
          athletes.some(athlete => athlete.id === id)
        );
        return validMembers.length === 0; // Group has no valid members
      });

      if (invalidGroups.length > 0) {
        const validGroups = selectedGroups.filter(group => !invalidGroups.includes(group));
        setSelectedGroups(validGroups);
      }
    }
  }, [athletes, selectedGroups]);

  const isDataReady = !isLoading && !error && selectedGroups.length >= 2 && !!chartData;

  // Extract recommended charts from the fetched data
  const recommendedCharts = useMemo(() => {
    return measurementData?.meta?.recommendedCharts || null;
  }, [measurementData]);

  return {
    selectedGroups,
    setSelectedGroups,
    groupComparisonData,
    chartData,
    statistics: groupComparisonData?.statistics || null,
    recommendedCharts,
    isLoading,
    error: error?.message || null,
    isDataReady
  };
}

export default useGroupComparison;