/**
 * React Query hook for fetching most improved athletes data
 * Returns athletes with highest improvement percentage for a specific metric
 */

import { useQuery } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/queryClient";
import type { TimeframePreset } from "@shared/dashboard-timeframe";

export interface MostImprovedEntry {
  athleteId: string;
  athleteName: string;
  teamId: string | null;
  teamName: string | null;
  previousValue: number;
  currentValue: number;
  improvementPercent: number;
  measurementCount: number;
  hasPersonalBest: boolean;
}

export interface MostImprovedResponse {
  improvements: MostImprovedEntry[];
  totalAthletes: number;
  metric: string;
  metricLabel: string;
  metricType: 'lower_is_better' | 'higher_is_better' | 'tracking';
}

interface UseMostImprovedOptions {
  organizationId: string | null;
  metric: string;
  teamId?: string;
  timeframe?: TimeframePreset | 'custom' | 'all';
  dateFrom?: string;  // ISO format: YYYY-MM-DD (for custom timeframe)
  dateTo?: string;    // ISO format: YYYY-MM-DD (for custom timeframe)
  limit?: number;
}

export function useMostImproved({
  organizationId,
  metric,
  teamId,
  timeframe = '30d',
  dateFrom,
  dateTo,
  limit = 5,
}: UseMostImprovedOptions) {
  return useQuery({
    queryKey: ["/api/analytics/most-improved", organizationId, metric, teamId, timeframe, dateFrom, dateTo, limit],
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

      const response = await fetch(`/api/analytics/most-improved?${params.toString()}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<MostImprovedResponse>;
    },
    enabled: !!organizationId && !!metric,
    staleTime: STALE_TIME.REALTIME, // Cache for 1 minute (improvements can change)
  });
}
