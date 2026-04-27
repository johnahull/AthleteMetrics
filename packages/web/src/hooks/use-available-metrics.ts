/**
 * Centralized hook for getting available metrics across the application
 * Ensures consistent filtering: only active site metrics + org-enabled metrics + custom org metrics
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useOrganizationMetrics } from '@/lib/metrics-api';
import { useCustomOrgMetrics } from '@/lib/custom-metrics-api';
import type { MetricType } from '@shared/analytics-types';

export interface AuxiliaryInputConfig {
  label: string;              // Auxiliary input label (e.g., "Reps")
  unit: string;               // Auxiliary input unit (e.g., "reps")
  validationMin?: number;
  validationMax?: number;
  required: boolean;
  computeFormula: string;
  primaryInputLabel: string;  // e.g., "Weight Lifted"
  primaryInputUnit: string;   // e.g., "lbs"
}

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
  isCustom?: boolean; // True if this is an organization-specific custom metric
  // Paired-input metric config — when set, the metric expects (primary, auxiliary)
  // inputs and the server computes the stored value via auxiliaryInputConfig.computeFormula.
  // See packages/api/services/paired-input-compute.ts for the server-side flow.
  auxiliaryInputConfig?: AuxiliaryInputConfig;
}

/**
 * Get available metrics for the current user/organization
 *
 * Filtering rules:
 * 1. Site-level: Only active metrics (siteMetrics.isActive = true)
 * 2. Org-level: Only enabled metrics (organizationMetrics.isEnabled = true)
 * 3. Custom org metrics: Active custom metrics for the organization
 * 4. Custom labels: Org custom labels override site labels
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

  // Fetch custom org metrics (organization-specific custom metrics)
  const {
    data: customOrgMetrics,
    isLoading: loadingCustom,
    error: errorCustom
  } = useCustomOrgMetrics(
    currentOrgId || "",
    { includeArchived: false }
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
    auxiliaryInputConfig?: AuxiliaryInputConfig | null;
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
    const isLoading = loadingOrg || loadingSite || loadingCustom;
    if (isLoading && !orgMetrics && !siteMetrics && !customOrgMetrics) {
      return [];
    }

    const result: AvailableMetric[] = [];

    // Use org metrics if available (already filtered by backend for active+enabled)
    if (currentOrgId && orgMetrics) {
      const siteMetricsList = orgMetrics
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
          isCustom: false,
          auxiliaryInputConfig: om.siteMetric.auxiliaryInputConfig || undefined,
        }));
      result.push(...siteMetricsList);

      // Add custom org metrics
      if (customOrgMetrics && Array.isArray(customOrgMetrics)) {
        const customMetricsList = customOrgMetrics
          .filter(cm => cm.isActive) // Only active custom metrics
          .map(cm => ({
            code: cm.code,
            label: cm.label,
            unit: cm.unit || '',
            metricType: cm.metricType as MetricType,
            lowerIsBetter: cm.metricType === 'lower_is_better',
            category: cm.category || undefined,
            description: cm.description || undefined,
            isDerived: cm.isDerived || undefined,
            formula: cm.formula || undefined,
            dependentMetrics: cm.dependentMetrics || undefined,
            isCustom: true,
            auxiliaryInputConfig: cm.auxiliaryInputConfig || undefined,
          }));
        result.push(...customMetricsList);
      }
    } else if (siteMetrics) {
      // Fallback to active site metrics (for users without org context, e.g., independent athletes)
      const fallback = siteMetrics
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
          isCustom: false,
          auxiliaryInputConfig: sm.auxiliaryInputConfig || undefined,
        }));
      result.push(...fallback);
    }

    // Sort alphabetically by label so every dropdown that consumes this hook
    // (e.g. /publish, measurement forms, analytics selectors) shows metrics
    // in a consistent, predictable order. `sensitivity: 'base'` makes the
    // sort case- and accent-insensitive.
    return result.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    );
  }, [currentOrgId, orgMetrics, customOrgMetrics, siteMetrics, loadingOrg, loadingCustom, loadingSite]);

  return {
    metrics,
    isLoading: loadingOrg || loadingSite || loadingCustom,
    error: (errorOrg || errorSite || errorCustom)
      ? new Error((errorOrg || errorSite || errorCustom)?.message || 'Failed to fetch metrics')
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
