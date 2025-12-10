/**
 * useAthleteWellnessStatus Hook
 *
 * Fetches the authenticated athlete's wellness status for dashboard display.
 * Returns data in the format expected by WellnessStatusCard component.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/lib/api';

// Zod schema for runtime validation
const wellnessDataSchema = z.object({
  lastSubmissionDate: z.string(),
  flaggedConcerns: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
  overallStatus: z.enum(['red', 'yellow', 'green']),
});

export type WellnessData = z.infer<typeof wellnessDataSchema>;

/**
 * Fetch athlete's wellness status for dashboard card
 * @param enabled - Whether to enable the query (default: true)
 * @returns UseQueryResult with WellnessData or null
 */
export function useAthleteWellnessStatus(enabled: boolean = true): UseQueryResult<WellnessData | null> {
  return useQuery<WellnessData | null>({
    queryKey: ['athlete-wellness-status'],
    queryFn: async () => {
      const data = await apiClient.get<WellnessData | null>('/wellness/my-status');

      // Return null if no data (no wellness submissions)
      if (data === null) {
        return null;
      }

      // Validate response structure
      return wellnessDataSchema.parse(data);
    },
    enabled,
    staleTime: 5 * 60 * 1000, // Consider stale after 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });
}
