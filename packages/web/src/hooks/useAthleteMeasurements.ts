/**
 * useAthleteMeasurements Hook
 *
 * Fetches measurement data for an athlete.
 * This data can change more frequently than profile data.
 *
 * Uses the existing /api/measurements endpoint with athleteId filter.
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { Measurement } from '@shared/schema';

interface UseAthleteMeasurementsOptions {
  /** Whether to fetch the data */
  enabled?: boolean;
  /** Override stale time (default 60 seconds) */
  staleTime?: number;
}

/**
 * Fetch all measurements for an athlete
 */
export function useAthleteMeasurements(
  athleteId: string | undefined,
  options: UseAthleteMeasurementsOptions = {}
): UseQueryResult<Measurement[]> {
  const { enabled = true, staleTime = 60 * 1000 } = options;

  return useQuery({
    queryKey: ['/api/measurements', { athleteId }],
    queryFn: async () => {
      const response = await fetch(`/api/measurements?athleteId=${athleteId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch measurements');
      }
      return response.json();
    },
    enabled: !!athleteId && enabled,
    staleTime,
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
}

/**
 * Get measurements grouped by metric type
 */
export function useMeasurementsByMetric(
  athleteId: string | undefined,
  options: UseAthleteMeasurementsOptions = {}
): {
  measurementsByMetric: Record<string, Measurement[]>;
  availableMetrics: string[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const query = useAthleteMeasurements(athleteId, options);

  const measurementsByMetric: Record<string, Measurement[]> = {};
  const availableMetrics: string[] = [];

  if (query.data) {
    query.data.forEach((m: Measurement) => {
      if (!measurementsByMetric[m.metric]) {
        measurementsByMetric[m.metric] = [];
        availableMetrics.push(m.metric);
      }
      measurementsByMetric[m.metric].push(m);
    });

    // Sort metrics alphabetically
    availableMetrics.sort();
  }

  return {
    measurementsByMetric,
    availableMetrics,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

/**
 * Get recent measurements (last N)
 */
export function useRecentMeasurements(
  athleteId: string | undefined,
  limit: number = 10,
  options: UseAthleteMeasurementsOptions = {}
): UseQueryResult<Measurement[]> & { recentMeasurements: Measurement[] } {
  const query = useAthleteMeasurements(athleteId, options);

  const recentMeasurements = query.data
    ? [...query.data]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, limit)
    : [];

  return {
    ...query,
    recentMeasurements,
  };
}
