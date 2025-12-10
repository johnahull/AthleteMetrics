/**
 * React Query hook for fetching at-risk athletes data
 * Returns athletes with declining performance or who are inactive
 */

import { useQuery } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/queryClient";

export interface DecliningAthleteEntry {
  athleteId: string;
  athleteName: string;
  teamId: string | null;
  teamName: string | null;
  metric: string;
  metricLabel: string;
  declinePercent: number;
  previousValue: number;
  currentValue: number;
}

export interface InactiveAthleteEntry {
  athleteId: string;
  athleteName: string;
  teamId: string | null;
  teamName: string | null;
  lastMeasurementDate: string;
  daysSinceLastMeasurement: number;
}

export interface AtRiskResponse {
  declining: DecliningAthleteEntry[];
  inactive: InactiveAthleteEntry[];
  atRiskCount: number;
}

interface UseAtRiskAthletesOptions {
  organizationId: string | null;
  teamId?: string;
  inactivityThreshold?: number;
}

export function useAtRiskAthletes({
  organizationId,
  teamId,
  inactivityThreshold = 14,
}: UseAtRiskAthletesOptions) {
  return useQuery({
    queryKey: ["/api/analytics/at-risk", organizationId, teamId, inactivityThreshold],
    queryFn: async () => {
      if (!organizationId) {
        throw new Error("Organization ID is required");
      }

      // Build URL with query params
      const params = new URLSearchParams({
        organizationId,
        inactivityThreshold: String(inactivityThreshold),
      });

      if (teamId) params.append('teamId', teamId);

      const response = await fetch(`/api/analytics/at-risk?${params.toString()}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<AtRiskResponse>;
    },
    enabled: !!organizationId,
    staleTime: STALE_TIME.REALTIME, // Cache for 1 minute (at-risk status can change)
  });
}
