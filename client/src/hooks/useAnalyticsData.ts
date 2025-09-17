/**
 * Optimized hook for analytics data fetching with caching and memoization
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import type { AnalyticsRequest, AnalyticsResponse } from '@shared/analytics-types';

interface UseAnalyticsDataOptions {
  request: AnalyticsRequest;
  enabled?: boolean;
  staleTime?: number;
  cacheTime?: number;
}

// Cache key generator for analytics data
const getAnalyticsQueryKey = (request: AnalyticsRequest) => [
  'analytics',
  request.analysisType,
  request.filters.organizationId,
  request.metrics.primary,
  request.metrics.additional.sort().join(','),
  request.timeframe.type,
  request.timeframe.period,
  request.athleteId,
];

export function useAnalyticsData({
  request,
  enabled = true,
  staleTime = 5 * 60 * 1000, // 5 minutes
  cacheTime = 10 * 60 * 1000, // 10 minutes
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
    cacheTime,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  // Memoized chart data transformations
  const chartData = useMemo(() => {
    if (!query.data) return null;

    switch (request.analysisType) {
      case 'individual':
        return query.data.data;
      case 'inter_group':
        return query.data.groupComparison;
      case 'intra_group':
        return query.data.groupAnalysis;
      default:
        return query.data.data;
    }
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
      // This would need proper statistics recalculation logic
      // For now, returning the filtered data as-is
    }

    return filteredData;
  }, [baseData, filters]);
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
        timeframe: { type: 'recent', period: '3_months' },
        athleteId,
      },
      {
        analysisType: 'inter_group',
        filters: { organizationId },
        metrics: { primary: 'VERTICAL_JUMP', additional: [] },
        timeframe: { type: 'recent', period: '6_months' },
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