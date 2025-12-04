/**
 * React Query hook for fetching leaderboard data
 * Returns top performers with percentile rankings for a specific metric
 */

import { useQuery } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/queryClient";
import type { TimeframePreset } from "@shared/dashboard-timeframe";

export interface LeaderboardEntry {
  rank: number;
  athleteId: string;
  athleteName: string;
  teamId: string | null;
  teamName: string | null;
  value: number;
  percentile: number;
  isPersonalBest: boolean;
}

export interface LeaderboardResponse {
  rankings: LeaderboardEntry[];
  totalAthletes: number;
  metric: string;
  metricLabel: string;
  metricType: 'lower_is_better' | 'higher_is_better' | 'tracking';
}

interface UseLeaderboardOptions {
  organizationId: string | null;
  metric: string;
  teamId?: string;
  timeframe?: TimeframePreset | 'custom' | 'all';
  dateFrom?: string;  // ISO format: YYYY-MM-DD (for custom timeframe)
  dateTo?: string;    // ISO format: YYYY-MM-DD (for custom timeframe)
  limit?: number;
}

export function useLeaderboard({
  organizationId,
  metric,
  teamId,
  timeframe = '30d',
  dateFrom,
  dateTo,
  limit = 10,
}: UseLeaderboardOptions) {
  return useQuery({
    queryKey: ["/api/analytics/leaderboard", organizationId, metric, teamId, timeframe, dateFrom, dateTo, limit],
    queryFn: async () => {
      if (!organizationId) {
        throw new Error("Organization ID is required");
      }

      if (!metric) {
        throw new Error("Metric is required");
      }

      // Build URL with query params
      const params = new URLSearchParams({
        organizationId,
        metric,
        limit: String(limit),
      });

      if (teamId) params.append('teamId', teamId);

      // Add timeframe params
      if (timeframe) params.append('timeframe', timeframe);
      if (timeframe === 'custom' && dateFrom) params.append('dateFrom', dateFrom);
      if (timeframe === 'custom' && dateTo) params.append('dateTo', dateTo);

      const response = await fetch(`/api/analytics/leaderboard?${params.toString()}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<LeaderboardResponse>;
    },
    enabled: !!organizationId && !!metric,
    staleTime: STALE_TIME.REALTIME, // Cache for 1 minute (leaderboards can change)
  });
}
