/**
 * Hook for accessing dynamic metric configurations in charts and other components
 * Falls back to static METRIC_CONFIG for backward compatibility
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useOrganizationMetrics } from '@/lib/metrics-api';
import { useCustomOrgMetrics } from '@/lib/custom-metrics-api';
import { METRIC_CONFIG } from '@shared/analytics-types';
import type { DynamicMetricConfig, MetricType } from '@shared/analytics-types';
import type { DisplayFormat } from '@shared/duration-format';

interface MetricConfigLookup {
  /**
   * Get metric configuration by code
   * Returns dynamic config if available, falls back to static METRIC_CONFIG
   */
  getMetricConfig: (code: string) => {
    label: string;
    unit: string;
    metricType: MetricType;
    lowerIsBetter: boolean; // Derived from metricType for backward compatibility
    category?: string;
    displayFormat: DisplayFormat;
    decimalPrecision?: number;
  } | null;

  /**
   * Check if dynamic metrics are loaded
   */
  isLoaded: boolean;

  /**
   * All available metric configs as a map
   */
  metricsMap: Record<string, DynamicMetricConfig>;
}

/**
 * Hook to access metric configurations with organization-level customization
 *
 * Usage in charts:
 * ```
 * const { getMetricConfig } = useMetricConfig();
 * const config = getMetricConfig(metricCode);
 * const label = config?.label || metricCode;
 * const unit = config?.unit || '';
 * ```
 */
export function useMetricConfig(): MetricConfigLookup {
  const { organizationContext, userOrganizations, user } = useAuth();

  // Determine which organization to fetch metrics for
  const currentOrgId = organizationContext || userOrganizations?.[0]?.organizationId;

  // Fetch organization-enabled metrics (or all site metrics for site admins without org context)
  const { data: orgMetrics, isLoading: loadingOrg } = useOrganizationMetrics(
    currentOrgId || "",
    true // enabledOnly
  );

  // Custom org metrics, so their codes resolve too (label, unit, mm:ss display)
  const { data: customOrgMetrics, isLoading: loadingCustom } = useCustomOrgMetrics(currentOrgId || "", { includeArchived: false });

  // Fallback to site metrics ONLY for site admins without org context
  const { data: siteMetrics, isLoading: loadingSite } = useQuery<Array<{
    code: string;
    label: string;
    unit: string | null;
    metricType: MetricType;
    category: string | null;
    description: string | null;
    isActive: boolean;
    isSystemDefault: boolean;
    displayFormat?: DisplayFormat;
    decimalPrecision?: number;
  }>>({
    queryKey: ['siteMetrics', false],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('includeInactive', 'false');
      const response = await fetch(`/api/site-metrics?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch site metrics');
      }
      return response.json();
    },
    enabled: user?.isSiteAdmin === true && !currentOrgId, // Only fetch if site admin AND no org context
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Build dynamic metrics map
  const metricsMap = useMemo((): Record<string, DynamicMetricConfig> => {
    if (currentOrgId && orgMetrics) {
      const customEntries = (Array.isArray(customOrgMetrics) ? customOrgMetrics : [])
        .filter(cm => cm.isActive)
        .map(cm => [
          cm.code,
          {
            code: cm.code,
            label: cm.label,
            category: cm.category || undefined,
            unit: cm.unit || '',
            metricType: cm.metricType as MetricType,
            isActive: true,
            isSystemDefault: false,
            displayFormat: cm.displayFormat ?? 'decimal',
            decimalPrecision: cm.decimalPrecision ?? undefined,
          },
        ]);
      return Object.fromEntries([
        ...customEntries,
        ...orgMetrics
          .filter(om => om.isEnabled)
          .map(om => [
            om.metricCode,
            {
              code: om.metricCode,
              label: om.customLabel || om.siteMetric.label,
              category: om.siteMetric.category || undefined,
              unit: om.siteMetric.unit || '',
              metricType: om.siteMetric.metricType,
              isActive: om.siteMetric.isActive,
              isSystemDefault: om.siteMetric.isSystemDefault,
              displayFormat: om.siteMetric.displayFormat ?? 'decimal',
              decimalPrecision: om.siteMetric.decimalPrecision ?? undefined,
            }
          ]),
      ]);
    } else if (siteMetrics) {
      return Object.fromEntries(
        siteMetrics.map(sm => [
          sm.code,
          {
            code: sm.code,
            label: sm.label,
            category: sm.category || undefined,
            unit: sm.unit || '',
            metricType: sm.metricType,
            isActive: sm.isActive,
            isSystemDefault: sm.isSystemDefault,
            displayFormat: sm.displayFormat ?? 'decimal',
            decimalPrecision: sm.decimalPrecision ?? undefined,
          }
        ])
      );
    }
    return {};
  }, [currentOrgId, orgMetrics, customOrgMetrics, siteMetrics]);

  const isLoaded = !loadingOrg && !loadingSite && !loadingCustom;

  const getMetricConfig = useMemo(() => {
    return (code: string) => {
      // Try dynamic config first
      const dynamicConfig = metricsMap[code];
      if (dynamicConfig) {
        return {
          label: dynamicConfig.label,
          unit: dynamicConfig.unit,
          metricType: dynamicConfig.metricType,
          lowerIsBetter: dynamicConfig.metricType === 'lower_is_better',
          category: dynamicConfig.category,
          displayFormat: dynamicConfig.displayFormat ?? 'decimal',
          decimalPrecision: dynamicConfig.decimalPrecision,
        };
      }

      // Fall back to static METRIC_CONFIG for backward compatibility
      const staticConfig = METRIC_CONFIG[code as keyof typeof METRIC_CONFIG];
      if (staticConfig) {
        return {
          label: staticConfig.label,
          unit: staticConfig.unit,
          metricType: staticConfig.metricType,
          lowerIsBetter: staticConfig.metricType === 'lower_is_better',
          displayFormat: 'decimal' as const,
        };
      }

      return null;
    };
  }, [metricsMap]);

  return {
    getMetricConfig,
    isLoaded,
    metricsMap,
  };
}
