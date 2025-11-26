import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { WELLNESS_CONSTANTS } from '@shared/wellness-constants';

interface AthleteData {
  id: string;
  name: string;
  status: 'red' | 'yellow' | 'green';
  score: number | null;
  injuries: { x: number; y: number; label?: string }[];
  lastSubmission: Date;
}

interface TeamDashboardData {
  teamId: string;
  teamName: string;
  teamStatus: 'red' | 'yellow' | 'green';
  teamAverageScore: number | null;
  scaleMax: number;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  totalAthletes: number;
  completionRate: number;
  trend: 'up' | 'down' | 'stable';
  commonInjuries: { label: string; count: number }[];
  athletes: AthleteData[];
}

interface UseWellnessDashboardOptions {
  organizationId: string;
  date?: string; // YYYY-MM-DD format
  teamIds?: string[];
  enabled?: boolean;
  enablePolling?: boolean; // Enable automatic polling for real-time updates
}

/**
 * Custom hook for fetching wellness dashboard data
 *
 * Fetches team-level wellness status summaries with athlete details.
 * Supports automatic polling for near-real-time updates when athletes
 * submit wellness questionnaires.
 */
export function useWellnessDashboard({
  organizationId,
  date,
  teamIds,
  enabled = true,
  enablePolling = true,
}: UseWellnessDashboardOptions) {
  const {
    data: dashboardData,
    isLoading,
    isFetching,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery<TeamDashboardData[]>({
    queryKey: [
      '/api/organizations/:orgId/wellness/dashboard',
      organizationId,
      date,
      teamIds,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (date) {
        params.append('date', date);
      }

      if (teamIds && teamIds.length > 0) {
        params.append('teamIds', teamIds.join(','));
      }

      const queryString = params.toString();
      const url = `/api/organizations/${organizationId}/wellness/dashboard${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, { credentials: 'include' });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch dashboard data');
      }

      return response.json();
    },
    enabled: enabled && !!organizationId,
    retry: 2,
    staleTime: WELLNESS_CONSTANTS.DASHBOARD_STALE_TIME_MS, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    // Polling configuration for near-real-time updates
    refetchInterval: enablePolling ? WELLNESS_CONSTANTS.DASHBOARD_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false, // Don't poll when tab is hidden (save battery)
  });

  // Track timing for visibility refetch to avoid double-fetching
  const lastVisibilityRefetch = useRef<number>(0);
  const dataUpdatedAtRef = useRef<number | undefined>(dataUpdatedAt);

  // Keep ref in sync with latest value (avoids stale closure without adding to deps)
  dataUpdatedAtRef.current = dataUpdatedAt;

  // Refetch immediately when tab becomes visible after being hidden
  useEffect(() => {
    if (!enabled || !organizationId || !enablePolling) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        // Only refetch if enough time has passed (avoid double-fetching)
        const timeSinceLastRefetch = now - lastVisibilityRefetch.current;
        const currentDataUpdatedAt = dataUpdatedAtRef.current;
        const isStale = currentDataUpdatedAt && (now - currentDataUpdatedAt) > WELLNESS_CONSTANTS.DASHBOARD_STALE_TIME_MS;

        if (isStale && timeSinceLastRefetch > 5000) {
          lastVisibilityRefetch.current = now;
          refetch();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, organizationId, enablePolling, refetch]);

  return {
    data: dashboardData,
    isLoading,
    isFetching, // True during background refetch (for UI indicator)
    error,
    refetch,
    dataUpdatedAt, // Timestamp of last successful fetch (for "Last updated" display)
  };
}
