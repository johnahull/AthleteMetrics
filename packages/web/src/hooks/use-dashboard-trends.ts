/**
 * React Query hook for fetching dashboard trend data
 */

import { useQuery } from "@tanstack/react-query";
import type { TrendData } from "@/components/kpi-card-with-trend";

interface DashboardTrendsResponse {
  athletes: TrendData & { current: number; previous: number; change: number; changePercent: number; trend: 'up' | 'down' | 'flat' };
  measurements: TrendData & { current: number; previous: number; change: number; changePercent: number; trend: 'up' | 'down' | 'flat' };
  teams: TrendData & { current: number; previous: number; change: number; changePercent: number; trend: 'up' | 'down' | 'flat' };
}

export function useDashboardTrends(organizationId: string | null) {
  return useQuery({
    queryKey: ["/api/dashboard/trends", organizationId],
    queryFn: async () => {
      if (!organizationId) {
        throw new Error("Organization ID is required");
      }

      const response = await fetch(`/api/dashboard/trends?organizationId=${organizationId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<DashboardTrendsResponse>;
    },
    enabled: !!organizationId,
    staleTime: 60000, // Cache for 1 minute (trends don't change frequently)
  });
}
