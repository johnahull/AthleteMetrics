/**
 * useAssessmentContext
 *
 * Fetches the athlete's latest assessment metrics + D1 benchmark gap.
 * Query key: ["training", "assessment-context"]
 * Endpoint: GET /api/training/my-assessment-context
 * Returns null gracefully when athlete has no measurement history.
 */

import { useQuery } from "@tanstack/react-query";

export interface AssessmentMetric {
  metricKey: string;
  metricLabel: string;
  latestValue: number;
  unit: string;
  d1Threshold: number | null;
  gap: number | null; // positive = better than D1; negative = below D1
  higherIsBetter: boolean;
}

export interface AssessmentContext {
  metrics: AssessmentMetric[];
  lastMeasuredAt: string | null;
}

export function useAssessmentContext() {
  return useQuery<AssessmentContext | null>({
    queryKey: ["training", "assessment-context"],
    queryFn: async () => {
      const response = await fetch("/api/training/my-assessment-context", {
        credentials: "include",
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Failed to fetch assessment context: ${response.status}`);
      }
      const data = await response.json();
      // API returns { assessmentContext: ... | null }
      return data.assessmentContext ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
