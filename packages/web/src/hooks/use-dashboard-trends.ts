/**
 * React Query hook for fetching dashboard trend data
 * Supports timeframe filtering for dynamic date range comparisons
 */

import { useQuery } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/queryClient";
import type { TrendData } from "@/components/kpi-card-with-trend";
import type { TimeframePreset } from "@shared/dashboard-timeframe";

interface DashboardTrendsResponse {
  athletes: TrendData & { current: number; previous: number; change: number; changePercent: number; trend: 'up' | 'down' | 'flat' };
  measurements: TrendData & { current: number; previous: number; change: number; changePercent: number; trend: 'up' | 'down' | 'flat' };
  teams: TrendData & { current: number; previous: number; change: number; changePercent: number; trend: 'up' | 'down' | 'flat' };
  periodLabel?: string;       // Human-readable current period label
  comparisonLabel?: string;   // Human-readable comparison period label
}

interface UseDashboardTrendsOptions {
  organizationId: string | null;
  teamId?: string;
  athleteId?: string;
  timeframe?: TimeframePreset | 'custom';
  dateFrom?: string;  // ISO format: YYYY-MM-DD (for custom timeframe)
  dateTo?: string;    // ISO format: YYYY-MM-DD (for custom timeframe)
}

export function useDashboardTrends(
  organizationId: string | null,
  teamId?: string,
  athleteId?: string,
  timeframe?: TimeframePreset | 'custom',
  dateFrom?: string,
  dateTo?: string
) {
  return useQuery({
    queryKey: ["/api/dashboard/trends", organizationId, teamId, athleteId, timeframe, dateFrom, dateTo],
    queryFn: async () => {
      if (!organizationId) {
        throw new Error("Organization ID is required");
      }

      // Build URL with optional filter params
      const params = new URLSearchParams({ organizationId });
      if (teamId) params.append('teamId', teamId);
      if (athleteId) params.append('athleteId', athleteId);

      // Add timeframe params
      if (timeframe) params.append('timeframe', timeframe);
      if (timeframe === 'custom' && dateFrom) params.append('dateFrom', dateFrom);
      if (timeframe === 'custom' && dateTo) params.append('dateTo', dateTo);

      const response = await fetch(`/api/dashboard/trends?${params.toString()}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<DashboardTrendsResponse>;
    },
    enabled: !!organizationId,
    staleTime: STALE_TIME.REALTIME, // Cache for 1 minute (trends change frequently)
  });
}
