/**
 * Centralized hook for getting available metrics across the application
 * Ensures consistent filtering: only active site metrics + org-enabled metrics
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useOrganizationMetrics } from '@/lib/metrics-api';
import type { MetricType } from '@shared/analytics-types';

export interface AvailableMetric {
  code: string;
  label: string;
  unit: string;
  metricType: MetricType;
  lowerIsBetter: boolean; // Derived from metricType for backward compatibility
  category?: string;
  description?: string;
  isDerived?: boolean;
  formula?: string;
  dependentMetrics?: string[];
}

/**
 * Get available metrics for the current user/organization
 *
 * Filtering rules:
 * 1. Site-level: Only active metrics (siteMetrics.isActive = true)
 * 2. Org-level: Only enabled metrics (organizationMetrics.isEnabled = true)
 * 3. Custom labels: Org custom labels override site labels
 *
 * Use this hook in:
 * - Data entry forms (measurement creation)
 * - Analytics metric selection
 * - Any metric dropdown/selector
 *
 * @returns Array of available metrics with custom labels applied
 */
export function useAvailableMetrics(): {
  metrics: AvailableMetric[];
  isLoading: boolean;
  error: Error | null;
} {
  const { organizationContext, userOrganizations, user } = useAuth();

  // Determine current organization ID
  // Note: currentOrgId may be undefined during initial load when userOrganizations is still loading
  const currentOrgId = organizationContext || userOrganizations?.[0]?.organizationId;

  // Fetch organization metrics (active site metrics + org-enabled only)
  // The hook already handles empty orgId gracefully with enabled: !!organizationId
  const {
    data: orgMetrics,
    isLoading: loadingOrg,
    error: errorOrg
  } = useOrganizationMetrics(
    currentOrgId || "",
    true // enabledOnly - only get org-enabled metrics
  );

  // Fallback to site metrics for users without org context
  // This allows independent athletes to add measurements using all active site metrics
  const {
    data: siteMetrics,
    isLoading: loadingSite,
    error: errorSite
  } = useQuery<Array<{
    code: string;
    label: string;
    unit: string | null;
    metricType: MetricType;
    category: string | null;
    description: string | null;
    isActive: boolean;
    isDerived?: boolean;
    formula?: string | null;
    dependentMetrics?: string[] | null;
  }>>({
    queryKey: ['activeMetrics'],
    queryFn: async () => {
      const response = await fetch('/api/metrics/active');
      if (!response.ok) {
        throw new Error('Failed to fetch active metrics');
      }
      return response.json();
    },
    enabled: !!user && !currentOrgId, // Fetch if logged in AND no org context
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Build available metrics list
  const metrics = useMemo((): AvailableMetric[] => {
    // Return empty array if still loading and no data available yet
    if ((loadingOrg || loadingSite) && !orgMetrics && !siteMetrics) {
      return [];
    }

    // Use org metrics if available (already filtered by backend for active+enabled)
    if (currentOrgId && orgMetrics) {
      return orgMetrics
        .filter(om => om.isEnabled) // Extra safety filter (redundant but explicit)
        .map(om => ({
          code: om.metricCode,
          label: om.customLabel || om.siteMetric.label, // Custom label takes precedence
          unit: om.siteMetric.unit || '',
          metricType: om.siteMetric.metricType,
          lowerIsBetter: om.siteMetric.metricType === 'lower_is_better',
          category: om.siteMetric.category || undefined,
          description: om.siteMetric.description || undefined,
          isDerived: om.siteMetric.isDerived || undefined,
          formula: om.siteMetric.formula || undefined,
          dependentMetrics: om.siteMetric.dependentMetrics || undefined,
        }));
    }

    // Fallback to active site metrics (for users without org context, e.g., independent athletes)
    if (siteMetrics) {
      return siteMetrics
        .filter(sm => sm.isActive) // Only active metrics
        .map(sm => ({
          code: sm.code,
          label: sm.label,
          unit: sm.unit || '',
          metricType: sm.metricType,
          lowerIsBetter: sm.metricType === 'lower_is_better',
          category: sm.category || undefined,
          description: sm.description || undefined,
          isDerived: sm.isDerived || undefined,
          formula: sm.formula || undefined,
          dependentMetrics: sm.dependentMetrics || undefined,
        }));
    }

    return [];
  }, [currentOrgId, orgMetrics, siteMetrics, loadingOrg, loadingSite]);

  return {
    metrics,
    isLoading: loadingOrg || loadingSite,
    error: (errorOrg || errorSite)
      ? new Error((errorOrg || errorSite)?.message || 'Failed to fetch metrics')
      : null,
  };
}

/**
 * Get a specific metric by code
 */
export function useMetricByCode(code: string): {
  metric: AvailableMetric | undefined;
  isLoading: boolean;
} {
  const { metrics, isLoading } = useAvailableMetrics();

  const metric = useMemo(
    () => metrics.find(m => m.code === code),
    [metrics, code]
  );

  return { metric, isLoading };
}

/**
 * Check if a metric is available (active and enabled)
 */
export function useIsMetricAvailable(code: string): {
  isAvailable: boolean;
  isLoading: boolean;
} {
  const { metrics, isLoading } = useAvailableMetrics();

  const isAvailable = useMemo(
    () => metrics.some(m => m.code === code),
    [metrics, code]
  );

  return { isAvailable, isLoading };
}
