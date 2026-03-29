/**
 * Reports API client and React Query hooks
 * Provides hooks for generating and managing coaching insights
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

// ============================================================================
// API Response Types
// ============================================================================

interface GenerateInsightsResponse {
  insights: string;
  generatedAt: string;
  model: string;
}

interface UpdateInsightsResponse {
  id: string;
  coachingInsights: string;
  coachingInsightsGeneratedAt: string | null;
  coachingInsightsModel: string | null;
}

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Generate coaching insights for a report
 */
async function generateInsights(reportId: string): Promise<GenerateInsightsResponse> {
  const response = await fetch(`/api/reports/${reportId}/generate-insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to generate insights");
  }

  return response.json();
}

/**
 * Update coaching insights for a report (manual edit)
 */
async function updateInsights(
  reportId: string,
  insights: string
): Promise<UpdateInsightsResponse> {
  const response = await fetch(`/api/reports/${reportId}/insights`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ coachingInsights: insights }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update insights");
  }

  return response.json();
}

/**
 * Download Eval Report One-Pager PDF for an athlete
 */
export async function downloadEvalOnePager(athleteId: string, sport?: string): Promise<void> {
  const params = sport ? `?sport=${sport}` : '';
  const response = await fetch(`/api/reports/eval-onepager/${athleteId}${params}`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to generate eval report');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eval-report-${athleteId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to generate coaching insights for a report
 * Automatically updates the report cache on success
 */
export function useGenerateInsights(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => generateInsights(reportId),
    onSuccess: (data) => {
      // Update the report cache with new insights (optimistic update)
      queryClient.setQueryData(["/api/reports", reportId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          coachingInsights: data.insights,
          coachingInsightsGeneratedAt: data.generatedAt,
          coachingInsightsModel: data.model,
        };
      });

      // Invalidate reports list to update coachingInsightsGeneratedAt timestamp
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    },
  });
}

/**
 * Hook to update coaching insights for a report (manual edit)
 * Automatically updates the report cache on success
 */
export function useUpdateInsights(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (insights: string) => updateInsights(reportId, insights),
    onSuccess: (data) => {
      // Update the report cache with edited insights (optimistic update)
      queryClient.setQueryData(["/api/reports", reportId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          coachingInsights: data.coachingInsights,
          coachingInsightsGeneratedAt: data.coachingInsightsGeneratedAt,
          coachingInsightsModel: data.coachingInsightsModel,
        };
      });

      // Invalidate reports list to update coachingInsightsGeneratedAt timestamp
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    },
  });
}
