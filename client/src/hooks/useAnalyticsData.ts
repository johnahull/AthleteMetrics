/**
 * Optimized hook for analytics data fetching with caching and memoization
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import { CHART_CONFIG } from '@/constants/chart-config';
import { CACHE_DURATIONS, GC_TIMES } from '@/lib/query-cache-config';
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
  staleTime = CACHE_DURATIONS.ANALYTICS,
  gcTime = GC_TIMES.ANALYTICS,
}: UseAnalyticsDataOptions) {
  const queryClient = useQueryClient();

  // Memoize the query key to prevent unnecessary recalculations
  const queryKey = useMemo(() => getAnalyticsQueryKey(request), [request]);

  // Optimized fetch function with robust error handling
  const fetchAnalyticsData = useCallback(async (): Promise<AnalyticsResponse> => {
    try {
      // Fetch CSRF token first  
      const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include',
      });
      
      if (!csrfResponse.ok) {
        throw new Error('Failed to fetch CSRF token');
      }
      
      const { csrfToken } = await csrfResponse.json();
      
      const response = await fetch('/api/analytics/dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        // Provide more specific error messages based on status code
        let errorMessage = 'Analytics request failed';
        switch (response.status) {
          case 401:
            errorMessage = 'Authentication required. Please log in again.';
            break;
          case 403:
            errorMessage = 'Access denied. You do not have permission to view this data.';
            break;
          case 429:
            errorMessage = 'Too many requests. Please wait a moment and try again.';
            break;
          case 500:
            errorMessage = 'Server error. Please try again later.';
            break;
          case 503:
            errorMessage = 'Service temporarily unavailable. Please try again later.';
            break;
          default:
            errorMessage = `Analytics request failed: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Validate response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format from analytics API');
      }

      return data;
    } catch (error) {
      // Handle network errors and other fetch issues
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error. Please check your connection and try again.');
      }

      // Re-throw other errors
      throw error;
    }
  }, [request]);

  // Generate fallback data for error scenarios
  const fallbackData = useMemo((): AnalyticsResponse => ({
    data: [],
    statistics: {},
    groupings: {},
    meta: {
      totalAthletes: 0,
      totalMeasurements: 0,
      dateRange: {
        start: new Date(),
        end: new Date()
      },
      appliedFilters: request.filters,
      recommendedCharts: []
    }
  }), [request.filters]);

  // Use React Query for caching and background updates with enhanced error handling
  const query = useQuery({
    queryKey,
    queryFn: fetchAnalyticsData,
    enabled,
    staleTime,
    gcTime,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: (failureCount, error: any) => {
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (error?.message?.includes('Authentication required') ||
          error?.message?.includes('Access denied')) {
        return false;
      }
      // Retry up to 3 times for server errors and rate limits
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
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
    data: query.data || (query.isError ? fallbackData : null),
    chartData: chartData || (query.isError ? [] : null),
    statistics: statistics || (query.isError ? {} : {}),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    errorMessage: query.error?.message || null,
    hasData: !!query.data && !query.isError,
    hasFallbackData: query.isError && !!fallbackData,
    refetch: query.refetch,
    prefetchRelatedData,
    invalidateCache,
    // Additional helpers for error handling
    isNetworkError: query.error?.message?.includes('Network error') || false,
    isAuthError: query.error?.message?.includes('Authentication') || query.error?.message?.includes('Access denied') || false,
    isRateLimited: query.error?.message?.includes('Too many requests') || false,
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
    
    // Calculate variance and standard deviation using Bessel's correction (n-1)
    // For sample variance, divide by n-1 instead of n for better statistical accuracy
    const variance = values.length > 1 
      ? values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (values.length - 1)
      : 0;
    const standardDeviation = Math.sqrt(variance);

    // Calculate percentiles
    const getPercentile = (p: number) => {
      const index = (p / CHART_CONFIG.ALGORITHM.PERCENTILE_DIVISOR) * (sortedValues.length - 1);
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
      median: getPercentile(CHART_CONFIG.PERCENTILES.P50),
      min: sortedValues[0],
      max: sortedValues[sortedValues.length - 1],
      std: standardDeviation,
      variance,
      percentiles: {
        p5: getPercentile(CHART_CONFIG.PERCENTILES.P5),
        p10: getPercentile(CHART_CONFIG.PERCENTILES.P10),
        p25: getPercentile(CHART_CONFIG.PERCENTILES.P25),
        p50: getPercentile(CHART_CONFIG.PERCENTILES.P50),
        p75: getPercentile(CHART_CONFIG.PERCENTILES.P75),
        p90: getPercentile(CHART_CONFIG.PERCENTILES.P90),
        p95: getPercentile(CHART_CONFIG.PERCENTILES.P95)
      }
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
        analysisType: 'multi_group',
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