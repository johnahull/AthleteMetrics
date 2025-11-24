import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { WellnessResponse, WellnessSummary, WellnessResponseData, TrendDirection, WellnessTemplate, WellnessRequest } from '@shared/wellness-types';
import { WELLNESS_CONSTANTS } from '@shared/wellness-constants';

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
  const {
    data: responses,
    isLoading: responsesLoading,
    error: responsesError,
    refetch: refetchResponses,
  } = useQuery<WellnessResponse[]>({
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch wellness responses');
      }

      return response.json();
    },
    enabled: enabled && !!organizationId,
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });

  // Fetch wellness trends
  const {
    data: trends,
    isLoading: trendsLoading,
    error: trendsError,
    refetch: refetchTrends,
  } = useQuery<any[]>({
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch wellness trends');
      }

      return response.json();
    },
    enabled: enabled && !!organizationId,
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch wellness requests for completion rate calculation
  const {
    data: requests,
    isLoading: requestsLoading,
  } = useQuery<WellnessRequest[]>({
    queryKey: [
      '/api/organizations/:orgId/wellness/requests',
      organizationId,
      filters.dateFrom,
      filters.dateTo,
    ],
    queryFn: async () => {
      const response = await fetch(
        `/api/organizations/${organizationId}/wellness/requests`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch wellness requests');
      }

      return response.json();
    },
    enabled: enabled && !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Get unique template IDs from responses
  const templateIds = useMemo(() => {
    if (!responses || responses.length === 0) return [];
    return [...new Set(responses.map((r) => r.templateId))];
  }, [responses]);

  // Fetch templates for responses
  const {
    data: templates,
    isLoading: templatesLoading,
  } = useQuery<WellnessTemplate[]>({
    queryKey: ['/api/wellness/templates', templateIds],
    queryFn: async () => {
      // Fetch all unique templates used in responses
      const templatePromises = templateIds.map(async (templateId) => {
        const response = await fetch(`/api/wellness/templates/${templateId}`, {
          credentials: 'include',
        });
        if (!response.ok) return null;
        return response.json();
      });

      const results = await Promise.all(templatePromises);
      return results.filter((t): t is WellnessTemplate => t !== null);
    },
    enabled: enabled && templateIds.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes (templates change rarely)
  });

  // Group responses by template
  const responsesByTemplate = useMemo(() => {
    if (!responses || !templates) return {};

    const grouped: Record<string, { template: WellnessTemplate; responses: WellnessResponse[] }> = {};

    templates.forEach((template) => {
      grouped[template.id] = {
        template,
        responses: responses.filter((r) => r.templateId === template.id),
      };
    });

    return grouped;
  }, [responses, templates]);

  // Calculate summary statistics from responses
  const summary: WellnessSummary | null = responses
    ? {
        totalResponses: responses.length,
        uniqueAthletes: new Set(responses.map((r: WellnessResponse) => r.userId)).size,
        averageWellness: calculateAverageWellness(responses),
        trend: calculateTrend(responses),
        lastUpdated: new Date(),
      }
    : null;

  // Calculate completion rate based on requests and responses
  const completionRate = useMemo(() => {
    if (!requests || requests.length === 0) {
      return { percentage: 0, completed: 0, total: 0 };
    }

    // Filter requests to the date range
    const relevantRequests = requests.filter(req => {
      const createdDate = new Date(req.createdAt);
      const fromDate = new Date(filters.dateFrom);
      const toDate = new Date(filters.dateTo);
      return createdDate >= fromDate && createdDate <= toDate;
    });

    if (relevantRequests.length === 0) {
      return { percentage: 0, completed: 0, total: 0 };
    }

    // Get all unique athletes targeted by requests
    const targetedAthletes = new Set<string>();
    relevantRequests.forEach(req => {
      // Add directly targeted athletes
      if (req.targetAthleteIds) {
        req.targetAthleteIds.forEach(id => targetedAthletes.add(id));
      }
      // Note: targetTeamIds would require additional API call to resolve athletes
      // For now, we'll work with direct athlete targeting
    });

    // Get unique athletes who responded
    const respondedAthletes = responses
      ? new Set(responses.map(r => r.userId))
      : new Set();

    const total = targetedAthletes.size;
    const completed = Array.from(targetedAthletes).filter(id =>
      respondedAthletes.has(id)
    ).length;

    return {
      percentage: total > 0 ? (completed / total) * 100 : 0,
      completed,
      total,
    };
  }, [requests, responses, filters.dateFrom, filters.dateTo]);

  return {
    responses,
    trends,
    summary,
    templates,
    responsesByTemplate,
    requests,
    completionRate,
    isLoading: responsesLoading || trendsLoading || templatesLoading || requestsLoading,
    error: responsesError || trendsError,
    refetch: () => {
      refetchResponses();
      refetchTrends();
    },
  };
}

/**
 * Calculate overall average wellness score from responses
 */
function calculateAverageWellness(responses: WellnessResponse[]): number {
  if (!responses || responses.length === 0) return 0;

  let totalScore = 0;
  let scoreCount = 0;

  responses.forEach((response) => {
    const responseData = response.responses as WellnessResponseData;
    Object.values(responseData).forEach((data) => {
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
function calculateTrend(responses: WellnessResponse[]): TrendDirection {
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

  // Use percentage threshold from constants (5% of scale range 1-10 = 0.5 points)
  const threshold = (WELLNESS_CONSTANTS.TREND_PERCENTAGE_THRESHOLD / 100) *
    (WELLNESS_CONSTANTS.SCORE_MAX - WELLNESS_CONSTANTS.SCORE_MIN);

  if (difference > threshold) return 'up';
  if (difference < -threshold) return 'down';
  return 'stable';
}
