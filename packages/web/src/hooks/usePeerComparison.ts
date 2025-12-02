/**
 * usePeerComparison Hook
 *
 * Phase 2.3: Peer Comparison & Benchmarking
 *
 * Provides:
 * - Peer percentile rankings for athletes
 * - Peer distribution data for metrics
 * - Privacy opt-in/opt-out management
 *
 * Uses the /api/athletes/:athleteId/peer-percentiles,
 * /api/peer-distributions/:metric, and
 * /api/users/:userId/peer-comparison-status endpoints.
 */

import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from '@tanstack/react-query';

/**
 * Filter criteria for peer pool selection
 */
export interface PeerFilterCriteria {
  ageRange?: [number, number];
  gender?: 'Male' | 'Female';
  orgTypes?: string[];
  sports?: string[];
  teamIds?: string[];  // Filter to specific teams (for "My Team(s)" scope)
}

/**
 * Percentile result for a single metric
 */
export interface PercentileResult {
  metric: string;
  athleteValue: number;
  percentile: number;
  sampleSize: number;
  label: string;
  message: string;
  distribution: {
    p25: number | null;
    p50: number | null;
    p75: number | null;
  };
}

/**
 * Response from peer percentiles endpoint
 */
export interface PeerPercentilesResponse {
  athleteId: string;
  percentiles: PercentileResult[];
}

/**
 * Distribution data for a metric
 */
export interface DistributionData {
  metric: string;
  sampleSize: number;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  mean: number | null;
}

/**
 * Peer comparison opt-in status
 */
export interface PeerComparisonStatus {
  optedIn: boolean;
  consentedAt: string | null;
}

/**
 * Percentile label configuration
 */
export interface PercentileLabel {
  label: string;
  message: string;
  colorClass: string;
}

/**
 * Get user-friendly label for a percentile
 */
export function getPercentileLabel(percentile: number): PercentileLabel {
  if (percentile < 0) {
    return {
      label: 'NOT ENOUGH DATA',
      message: 'Not enough peers for comparison',
      colorClass: 'text-gray-500',
    };
  }
  if (percentile >= 90) {
    return {
      label: 'TOP 10%',
      message: "You're one of the best!",
      colorClass: 'text-purple-600',
    };
  }
  if (percentile >= 75) {
    return {
      label: 'TOP 25%',
      message: 'Better than 3 out of 4 peers',
      colorClass: 'text-blue-600',
    };
  }
  if (percentile >= 50) {
    return {
      label: 'ABOVE AVERAGE',
      message: 'Above the group average',
      colorClass: 'text-green-600',
    };
  }
  if (percentile >= 25) {
    return {
      label: 'BUILDING',
      message: 'On track - keep pushing!',
      colorClass: 'text-yellow-600',
    };
  }
  return {
    label: 'DEVELOPING',
    message: 'Every session counts!',
    colorClass: 'text-orange-600',
  };
}

interface UsePercentileOptions {
  enabled?: boolean;
  staleTime?: number;
}

/**
 * Fetch peer percentiles for an athlete
 */
export function usePeerPercentiles(
  athleteId: string | undefined,
  metrics: string[],
  filters?: PeerFilterCriteria,
  options: UsePercentileOptions = {}
): UseQueryResult<PeerPercentilesResponse> {
  const { enabled = true, staleTime = 5 * 60 * 1000 } = options; // 5 min cache

  const metricsParam = metrics.join(',');
  const filtersParam = filters && Object.keys(filters).length > 0
    ? `&filters=${encodeURIComponent(JSON.stringify(filters))}`
    : '';

  return useQuery({
    queryKey: ['/api/athletes/:athleteId/peer-percentiles', athleteId, metrics, filters],
    queryFn: async () => {
      if (!athleteId) throw new Error('athleteId is required');

      const response = await fetch(
        `/api/athletes/${athleteId}/peer-percentiles?metrics=${metricsParam}${filtersParam}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch peer percentiles' }));
        throw new Error(error.message || 'Failed to fetch peer percentiles');
      }

      return response.json();
    },
    enabled: !!athleteId && metrics.length > 0 && enabled,
    staleTime,
    gcTime: 15 * 60 * 1000,
  });
}

/**
 * Fetch peer distribution for a metric
 */
export function usePeerDistribution(
  metric: string | undefined,
  filters?: PeerFilterCriteria,
  options: UsePercentileOptions = {}
): UseQueryResult<DistributionData> {
  const { enabled = true, staleTime = 5 * 60 * 1000 } = options;

  const filtersParam = filters && Object.keys(filters).length > 0
    ? `?filters=${encodeURIComponent(JSON.stringify(filters))}`
    : '';

  return useQuery({
    queryKey: ['/api/peer-distributions/:metric', metric, filters],
    queryFn: async () => {
      if (!metric) throw new Error('metric is required');

      const response = await fetch(
        `/api/peer-distributions/${metric}${filtersParam}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch peer distribution' }));
        throw new Error(error.message || 'Failed to fetch peer distribution');
      }

      return response.json();
    },
    enabled: !!metric && enabled,
    staleTime,
    gcTime: 15 * 60 * 1000,
  });
}

/**
 * Fetch user's peer comparison opt-in status
 */
export function usePeerComparisonStatus(
  userId: string | undefined,
  options: UsePercentileOptions = {}
): UseQueryResult<PeerComparisonStatus> {
  const { enabled = true, staleTime = 60 * 1000 } = options;

  return useQuery({
    queryKey: ['/api/users/:userId/peer-comparison-status', userId],
    queryFn: async () => {
      if (!userId) throw new Error('userId is required');

      const response = await fetch(
        `/api/users/${userId}/peer-comparison-status`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch peer comparison status' }));
        throw new Error(error.message || 'Failed to fetch peer comparison status');
      }

      return response.json();
    },
    enabled: !!userId && enabled,
    staleTime,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Mutation to update peer comparison opt-in status
 */
export function useUpdatePeerComparisonStatus(): UseMutationResult<
  PeerComparisonStatus,
  Error,
  { userId: string; optIn: boolean }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, optIn }) => {
      const response = await fetch(`/api/users/${userId}/peer-comparison-status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optIn }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to update peer comparison status' }));
        throw new Error(error.message || 'Failed to update peer comparison status');
      }

      return response.json();
    },
    onSuccess: (data, { userId }) => {
      // Update the status cache
      queryClient.setQueryData(['/api/users/:userId/peer-comparison-status', userId], data);
      // Invalidate percentile queries since opt-in status affects them
      queryClient.invalidateQueries({ queryKey: ['/api/athletes/:athleteId/peer-percentiles'] });
    },
  });
}

/**
 * Combined hook for peer comparison with status and percentiles
 */
export function usePeerComparisonWithStatus(
  userId: string | undefined,
  athleteId: string | undefined,
  metrics: string[],
  filters?: PeerFilterCriteria
): {
  status: UseQueryResult<PeerComparisonStatus>;
  percentiles: UseQueryResult<PeerPercentilesResponse>;
  updateStatus: UseMutationResult<PeerComparisonStatus, Error, { userId: string; optIn: boolean }>;
} {
  const status = usePeerComparisonStatus(userId);
  const isOptedIn = status.data?.optedIn ?? false;

  const percentiles = usePeerPercentiles(
    athleteId,
    metrics,
    filters,
    { enabled: isOptedIn && metrics.length > 0 }
  );

  const updateStatus = useUpdatePeerComparisonStatus();

  return {
    status,
    percentiles,
    updateStatus,
  };
}
