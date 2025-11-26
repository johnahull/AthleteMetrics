import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { WellnessResponse, WellnessSummary, WellnessResponseData, TrendDirection, WellnessTemplate, WellnessRequest, WellnessTrend } from '@shared/wellness-types';
import type { CompletionRate, ResponsesByTemplate } from '@shared/wellness-analytics-types';
import { WELLNESS_CONSTANTS } from '@shared/wellness-constants';
import { calculateAverageWellness, calculateTrend } from '@/utils/wellness-analytics';

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
  } = useQuery<WellnessTrend[]>({
    queryKey: [
      '/api/organizations/:orgId/wellness/analytics/trends',
      organizationId,
      filters,
    ],
    queryFn: async (): Promise<WellnessTrend[]> => {
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
  const responsesByTemplate = useMemo((): ResponsesByTemplate => {
    if (!responses || !templates) return {};

    const grouped: ResponsesByTemplate = {};

    templates.forEach((template) => {
      grouped[template.id] = {
        template,
        responses: responses.filter((r) => r.templateId === template.id),
      };
    });

    return grouped;
  }, [responses, templates]);

  // Get scale orientation from first template (for trend calculation)
  const scaleOrientation = useMemo(() => {
    if (!templates || templates.length === 0) return 'higher_is_better' as const;
    return templates[0].config.statusConfig?.scaleOrientation || 'higher_is_better';
  }, [templates]);

  // Get scale range from first template for trend calculation
  const scaleRange = useMemo(() => {
    if (!templates || templates.length === 0) return 10; // Default to 10
    const firstTemplate = templates[0];
    const scaleQuestions = firstTemplate.config.questions.filter(q => q.type === 'scale');
    if (scaleQuestions.length === 0) return 10;
    const firstScale = scaleQuestions[0];
    if ('scaleMax' in firstScale) {
      return firstScale.scaleMax;
    }
    return 10;
  }, [templates]);

  // Calculate summary statistics from responses
  const summary: WellnessSummary | null = responses
    ? {
        totalResponses: responses.length,
        uniqueAthletes: new Set(responses.map((r: WellnessResponse) => r.userId)).size,
        averageWellness: calculateAverageWellness(responses),
        trend: calculateTrend(responses, scaleOrientation, scaleRange),
        lastUpdated: new Date(),
      }
    : null;

  // Calculate completion rate based on requests and responses
  const completionRate = useMemo((): CompletionRate => {
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
    scaleOrientation,
    isLoading: responsesLoading || trendsLoading || templatesLoading || requestsLoading,
    error: responsesError || trendsError,
    refetch: () => {
      refetchResponses();
      refetchTrends();
    },
  };
}

