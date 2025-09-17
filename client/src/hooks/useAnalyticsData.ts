/**
 * Optimized hook for analytics data fetching with caching and memoization
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import type { 
  AnalyticsRequest, 
  AnalyticsResponse, 
  ChartDataPoint,
  StatisticalSummary 
} from '@shared/analytics-types';

interface UseAnalyticsDataOptions {
  request: AnalyticsRequest;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

// Optimized cache key generator using hash for shorter, more efficient keys
const getAnalyticsQueryKey = (request: AnalyticsRequest): [string, string] => {
  // Create deterministic hash of the request object for efficient caching
  const requestString = JSON.stringify({
    analysisType: request.analysisType,
    organizationId: request.filters.organizationId,
    primary: request.metrics.primary,
    additional: request.metrics.additional.sort(), // Sort for consistency
    timeframe: request.timeframe,
    athleteId: request.athleteId,
    // Include relevant filter properties that affect the query
    athleteIds: request.filters.athleteIds?.sort(),
    teams: request.filters.teams?.sort()
  });

  // Use a simple hash for browser compatibility (crypto.subtle not available in all contexts)
  const hash = btoa(requestString).replace(/[+/=]/g, '').substring(0, 16);
  
  return ['analytics', hash];
};

export function useAnalyticsData({
  request,
  enabled = true,
  staleTime = 5 * 60 * 1000, // 5 minutes
  gcTime = 10 * 60 * 1000, // 10 minutes
}: UseAnalyticsDataOptions) {
  const queryClient = useQueryClient();

  // Memoize the query key to prevent unnecessary recalculations
  const queryKey = useMemo(() => getAnalyticsQueryKey(request), [request]);

  // Optimized fetch function
  const fetchAnalyticsData = useCallback(async (): Promise<AnalyticsResponse> => {
    const response = await fetch('/api/analytics/dashboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Analytics request failed: ${response.statusText}`);
    }

    return response.json();
  }, [request]);

  // Use React Query for caching and background updates
  const query = useQuery({
    queryKey,
    queryFn: fetchAnalyticsData,
    enabled,
    staleTime,
    gcTime,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  // Memoized chart data transformations
  const chartData = useMemo(() => {
    if (!query.data) return null;

    return query.data.data || query.data;
  }, [query.data, request.analysisType]);

  // Memoized statistics
  const statistics = useMemo(() => {
    return query.data?.statistics || {};
  }, [query.data]);

  // Prefetch related data for better UX
  const prefetchRelatedData = useCallback((relatedRequest: AnalyticsRequest) => {
    const relatedKey = getAnalyticsQueryKey(relatedRequest);
    queryClient.prefetchQuery({
      queryKey: relatedKey,
      queryFn: () => fetchAnalyticsData(),
      staleTime: staleTime,
    });
  }, [queryClient, staleTime, fetchAnalyticsData]);

  // Invalidate analytics cache
  const invalidateCache = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['analytics'],
    });
  }, [queryClient]);

  return {
    data: query.data,
    chartData,
    statistics,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    prefetchRelatedData,
    invalidateCache,
  };
}

// Hook for client-side filtering to avoid unnecessary API calls
export function useFilteredAnalyticsData(
  baseData: AnalyticsResponse | null,
  filters: {
    dateRange?: { start: string; end: string };
    athletes?: string[];
    teams?: string[];
  }
) {
  return useMemo(() => {
    if (!baseData) return null;

    let filteredData = { ...baseData };

    // Apply date range filter
    if (filters.dateRange && filteredData.data) {
      const { start, end } = filters.dateRange;
      filteredData.data = filteredData.data.filter(point => {
        const pointDate = new Date(point.date);
        return pointDate >= new Date(start) && pointDate <= new Date(end);
      });
    }

    // Apply athlete filter
    if (filters.athletes && filters.athletes.length > 0 && filteredData.data) {
      filteredData.data = filteredData.data.filter(point =>
        filters.athletes!.includes(point.athleteId)
      );
    }

    // Recalculate statistics for filtered data
    if (filteredData.data && filteredData.data.length > 0) {
      filteredData.statistics = recalculateStatistics(filteredData.data, baseData.statistics);
    }

    return filteredData;
  }, [baseData, filters]);
}

// Helper function to recalculate statistics for filtered data
function recalculateStatistics(
  filteredData: ChartDataPoint[],
  originalStats?: Record<string, StatisticalSummary>
): Record<string, StatisticalSummary> {
  if (!filteredData.length) return {};

  const statsByMetric: Record<string, number[]> = {};
  
  // Group values by metric
  filteredData.forEach(point => {
    if (!statsByMetric[point.metric]) {
      statsByMetric[point.metric] = [];
    }
    statsByMetric[point.metric].push(point.value);
  });

  const newStats: Record<string, StatisticalSummary> = {};

  // Calculate statistics for each metric
  Object.entries(statsByMetric).forEach(([metric, values]) => {
    if (values.length === 0) return;

    const sortedValues = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;
    
    // Calculate variance and standard deviation
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);

    // Calculate percentiles
    const getPercentile = (p: number) => {
      const index = (p / 100) * (sortedValues.length - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      
      if (lower === upper) {
        return sortedValues[lower];
      }
      
      const weight = index - lower;
      return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
    };

    newStats[metric] = {
      count: values.length,
      mean,
      median: getPercentile(50),
      standardDeviation,
      min: sortedValues[0],
      max: sortedValues[sortedValues.length - 1],
      percentile25: getPercentile(25),
      percentile75: getPercentile(75),
      percentile90: getPercentile(90),
      percentile95: getPercentile(95)
    };
  });

  return newStats;
}

// Cache warming utility for common analytics views
export function useAnalyticsCacheWarming(organizationId: string, athleteId?: string) {
  const queryClient = useQueryClient();

  const warmCache = useCallback(() => {
    // Common analytics requests to prefetch
    const commonRequests: AnalyticsRequest[] = [
      {
        analysisType: 'individual',
        filters: { organizationId, athleteIds: athleteId ? [athleteId] : [] },
        metrics: { primary: 'FLY10_TIME', additional: [] },
        timeframe: { type: 'trends', period: 'last_90_days' },
        athleteId,
      },
      {
        analysisType: 'inter_group',
        filters: { organizationId },
        metrics: { primary: 'VERTICAL_JUMP', additional: [] },
        timeframe: { type: 'trends', period: 'last_90_days' },
      },
    ];

    commonRequests.forEach(request => {
      const queryKey = getAnalyticsQueryKey(request);
      queryClient.prefetchQuery({
        queryKey,
        queryFn: () => fetch('/api/analytics/dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(request),
        }).then(res => res.json()),
        staleTime: 5 * 60 * 1000,
      });
    });
  }, [queryClient, organizationId, athleteId]);

  return { warmCache };
}