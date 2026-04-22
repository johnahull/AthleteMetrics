/**
 * React Query hook for fetching the merged metric-explanation map for
 * a list of codes. Scoped to the current organization so custom-org
 * metric labels and site-level overrides apply, matching the report pipeline.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import type { MetricExplanation } from '@shared/metric-explanations';

interface ExplanationsResponse {
  explanations: Record<string, MetricExplanation>;
}

export function useAthleteMetricExplanations(codes: string[]): {
  explanations: Record<string, MetricExplanation>;
  isLoading: boolean;
  error: Error | null;
} {
  const { user, organizationContext, userOrganizations } = useAuth();
  const organizationId = organizationContext || userOrganizations?.[0]?.organizationId;

  const sortedCodes = useMemo(
    () => Array.from(new Set(codes.filter(Boolean))).sort(),
    [codes],
  );
  const codesParam = sortedCodes.join(',');

  const { data, isLoading, error } = useQuery<ExplanationsResponse>({
    queryKey: ['metric-explanations', organizationId ?? 'no-org', codesParam],
    queryFn: async () => {
      const params = new URLSearchParams({ codes: codesParam });
      if (organizationId) params.set('organizationId', organizationId);
      const response = await fetch(`/api/metric-explanations?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch metric explanations (${response.status})`);
      }
      return response.json();
    },
    enabled: !!user && sortedCodes.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  return {
    explanations: data?.explanations ?? {},
    isLoading,
    error: error ? (error instanceof Error ? error : new Error(String(error))) : null,
  };
}
