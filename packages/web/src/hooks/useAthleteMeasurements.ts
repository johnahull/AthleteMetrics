/**
 * useAthleteMeasurements Hook
 *
 * Fetches measurement data for an athlete.
 * This data can change more frequently than profile data.
 *
 * Uses the existing /api/measurements endpoint with athleteId filter.
 */

import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import type { Measurement } from '@shared/schema';
import { useAthleteOrg } from '@/lib/athlete-org-context';
import { useContext } from 'react';
import { AthleteOrgContext } from '@/lib/athlete-org-context';

interface UseAthleteMeasurementsOptions {
  /** Whether to fetch the data */
  enabled?: boolean;
  /** Override stale time (default 60 seconds) */
  staleTime?: number;
  /** Include unverified measurements (default false - only verified) */
  includeUnverified?: boolean;
}

interface CreateMeasurementInput {
  /** The athlete's user ID (required for backend validation) */
  userId: string;
  /** The metric type (e.g., 'FLY10_TIME', 'VERTICAL_JUMP') */
  metric: string;
  /** The measurement value */
  value: number;
  /** The date of the measurement (ISO string) */
  date: string;
  /** Optional notes */
  notes?: string;
  /** Optional team ID for context */
  teamId?: string;
}

/**
 * Fetch all measurements for an athlete
 */
export function useAthleteMeasurements(
  athleteId: string | undefined,
  options: UseAthleteMeasurementsOptions = {}
): UseQueryResult<Measurement[]> {
  const { enabled = true, staleTime = 60 * 1000, includeUnverified = false } = options;

  // Try to access AthleteOrgContext (may not be available)
  const context = useContext(AthleteOrgContext);
  const filterMode = context?.filterMode;
  const organizations = context?.organizations;

  return useQuery({
    queryKey: ['/api/measurements', { athleteId, includeUnverified, filterMode }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('athleteId', athleteId!);

      if (includeUnverified) {
        params.set('includeUnverified', 'true');
      }

      // Add filterMode params if context is available
      if (filterMode) {
        if (filterMode === 'personal') {
          params.set('filterMode', 'personal');
        } else if (filterMode === 'all') {
          params.set('filterMode', 'all');
          // Include all org IDs
          if (organizations && organizations.length > 0) {
            const orgIds = organizations.map(org => org.id).join(',');
            params.set('orgIds', orgIds);
          }
        } else {
          // filterMode is a specific org ID
          params.set('organizationId', filterMode);
        }
      }

      const response = await fetch(`/api/measurements?${params.toString()}`, {
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

/**
 * Get athlete's full measurement history including unverified entries.
 * Used for the "My Measurements" history page where athletes can see
 * both coach-verified and self-entered measurements.
 */
export function useAthleteMeasurementHistory(
  athleteId: string | undefined,
  options: Omit<UseAthleteMeasurementsOptions, 'includeUnverified'> = {}
): UseQueryResult<Measurement[]> & {
  verifiedMeasurements: Measurement[];
  unverifiedMeasurements: Measurement[];
  sortedByDate: Measurement[];
} {
  const query = useAthleteMeasurements(athleteId, { ...options, includeUnverified: true });

  const verifiedMeasurements = query.data?.filter(m => m.isVerified) || [];
  const unverifiedMeasurements = query.data?.filter(m => !m.isVerified) || [];
  const sortedByDate = query.data
    ? [...query.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

  return {
    ...query,
    verifiedMeasurements,
    unverifiedMeasurements,
    sortedByDate,
  };
}

/**
 * Create a self-entry measurement.
 * Athletes can log their own measurements which are marked as unverified.
 * These personal entries are for tracking purposes and not included in peer comparisons.
 */
export function useCreateSelfMeasurement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateMeasurementInput) => {
      const response = await fetch('/api/measurements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to create measurement' }));
        throw new Error(error.message || 'Failed to create measurement');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all measurement queries to refetch
      queryClient.invalidateQueries({ queryKey: ['/api/measurements'] });
    },
  });
}

interface UpdateMeasurementInput {
  /** The measurement ID to update */
  measurementId: string;
  /** Updated measurement value */
  value?: number;
  /** Updated date */
  date?: string;
  /** Updated notes */
  notes?: string;
}

/**
 * Update a self-entry measurement.
 * Athletes can only update measurements they submitted themselves (unverified).
 */
export function useUpdateSelfMeasurement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ measurementId, ...data }: UpdateMeasurementInput) => {
      const response = await fetch(`/api/measurements/${measurementId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to update measurement' }));
        throw new Error(error.message || 'Failed to update measurement');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all measurement queries to refetch
      queryClient.invalidateQueries({ queryKey: ['/api/measurements'] });
    },
  });
}

/**
 * Delete a self-entry measurement.
 * Athletes can only delete their own unverified measurements.
 */
export function useDeleteSelfMeasurement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (measurementId: string) => {
      const response = await fetch(`/api/measurements/${measurementId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to delete measurement' }));
        throw new Error(error.message || 'Failed to delete measurement');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all measurement queries to refetch
      queryClient.invalidateQueries({ queryKey: ['/api/measurements'] });
    },
  });
}
