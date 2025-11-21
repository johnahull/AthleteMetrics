import { useQuery } from '@tanstack/react-query';

interface WellnessFilters {
  dateFrom: string;
  dateTo: string;
  teamIds?: string[];
  athleteIds?: string[];
  questionIds?: string[];
}

interface UseWellnessAnalyticsOptions {
  organizationId: string;
  filters: WellnessFilters;
  enabled?: boolean;
}

/**
 * Custom hook for fetching wellness analytics data
 *
 * Fetches:
 * - Summary statistics (average wellness, completion rate)
 * - Individual responses for heatmap and detailed analysis
 * - Trends data for time-series charts
 */
export function useWellnessAnalytics({
  organizationId,
  filters,
  enabled = true,
}: UseWellnessAnalyticsOptions) {
  // Fetch wellness responses
  const { data: responses, isLoading: responsesLoading } = useQuery({
    queryKey: [
      '/api/organizations/:orgId/wellness/responses',
      organizationId,
      filters,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: filters.dateFrom,
        endDate: filters.dateTo,
      });

      if (filters.teamIds && filters.teamIds.length > 0) {
        params.append('teamIds', filters.teamIds.join(','));
      }

      if (filters.athleteIds && filters.athleteIds.length > 0) {
        params.append('athleteIds', filters.athleteIds.join(','));
      }

      const response = await fetch(
        `/api/organizations/${organizationId}/wellness/responses?${params}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch wellness responses');
      }

      return response.json();
    },
    enabled: enabled && !!organizationId,
  });

  // Fetch wellness trends
  const { data: trends, isLoading: trendsLoading } = useQuery({
    queryKey: [
      '/api/organizations/:orgId/wellness/analytics/trends',
      organizationId,
      filters,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: filters.dateFrom,
        endDate: filters.dateTo,
      });

      if (filters.questionIds && filters.questionIds.length > 0) {
        params.append('questionIds', filters.questionIds.join(','));
      }

      const response = await fetch(
        `/api/organizations/${organizationId}/wellness/analytics/trends?${params}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch wellness trends');
      }

      return response.json();
    },
    enabled: enabled && !!organizationId,
  });

  // Calculate summary statistics from responses
  const summary = responses
    ? {
        totalResponses: responses.length,
        uniqueAthletes: new Set(responses.map((r: any) => r.userId)).size,
        averageWellness: calculateAverageWellness(responses),
        trend: calculateTrend(responses),
        lastUpdated: new Date(),
      }
    : null;

  return {
    responses,
    trends,
    summary,
    isLoading: responsesLoading || trendsLoading,
  };
}

/**
 * Calculate overall average wellness score from responses
 */
function calculateAverageWellness(responses: any[]): number {
  if (!responses || responses.length === 0) return 0;

  let totalScore = 0;
  let scoreCount = 0;

  responses.forEach((response) => {
    const responseData = response.responses as any;
    Object.values(responseData).forEach((data: any) => {
      if (typeof data.value === 'number') {
        totalScore += data.value;
        scoreCount++;
      }
    });
  });

  return scoreCount > 0 ? totalScore / scoreCount : 0;
}

/**
 * Calculate wellness trend (up, down, or stable)
 */
function calculateTrend(responses: any[]): 'up' | 'down' | 'stable' {
  if (!responses || responses.length < 2) return 'stable';

  // Sort by date
  const sorted = [...responses].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Split into two halves and compare averages
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  const firstAvg = calculateAverageWellness(firstHalf);
  const secondAvg = calculateAverageWellness(secondHalf);

  const difference = secondAvg - firstAvg;
  const threshold = 0.5; // 5% threshold

  if (difference > threshold) return 'up';
  if (difference < -threshold) return 'down';
  return 'stable';
}
