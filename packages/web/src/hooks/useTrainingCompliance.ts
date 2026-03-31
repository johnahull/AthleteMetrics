/**
 * useTrainingCompliance
 *
 * Fetches team training consistency data for the coach dashboard.
 * Query key: ["training", "compliance", orgId]
 * Endpoint: GET /api/training/compliance
 */

import { useQuery } from "@tanstack/react-query";
import type { AthleteComplianceRow } from "@/components/training/TrainingComplianceTable";

export function useTrainingCompliance(orgId: string | null) {
  return useQuery<AthleteComplianceRow[]>({
    queryKey: ["training", "compliance", orgId],
    queryFn: async () => {
      const response = await fetch("/api/training/compliance", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch compliance: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000, // 2 minutes — compliance data changes as athletes log
  });
}
