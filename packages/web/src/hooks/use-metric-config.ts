/**
 * Hook for accessing dynamic metric configurations in charts and other components
 * Falls back to static METRIC_CONFIG for backward compatibility
 */

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { useOrganizationMetrics, useSiteMetrics } from '@/lib/metrics-api';
import { METRIC_CONFIG } from '@shared/analytics-types';
import type { DynamicMetricConfig } from '@shared/analytics-types';

interface MetricConfigLookup {
  /**
   * Get metric configuration by code
   * Returns dynamic config if available, falls back to static METRIC_CONFIG
   */
  getMetricConfig: (code: string) => {
    label: string;
    unit: string;
    lowerIsBetter: boolean;
    category?: string;
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
  const { organizationContext, userOrganizations } = useAuth();

  // Determine which organization to fetch metrics for
  const currentOrgId = organizationContext || userOrganizations?.[0]?.organizationId;

  // Fetch organization-enabled metrics (or all site metrics for site admins without org context)
  const { data: orgMetrics, isLoading: loadingOrg } = useOrganizationMetrics(
    currentOrgId || "",
    true // enabledOnly
  );
  const { data: siteMetrics, isLoading: loadingSite } = useSiteMetrics(false);

  // Build dynamic metrics map
  const metricsMap = useMemo((): Record<string, DynamicMetricConfig> => {
    if (currentOrgId && orgMetrics) {
      return Object.fromEntries(
        orgMetrics
          .filter(om => om.isEnabled)
          .map(om => [
            om.metricCode,
            {
              code: om.metricCode,
              label: om.customLabel || om.siteMetric.label,
              category: om.siteMetric.category || undefined,
              unit: om.siteMetric.unit || '',
              lowerIsBetter: om.siteMetric.lowerIsBetter,
              isActive: om.siteMetric.isActive,
              isSystemDefault: om.siteMetric.isSystemDefault,
            }
          ])
      );
    } else if (siteMetrics) {
      return Object.fromEntries(
        siteMetrics.map(sm => [
          sm.code,
          {
            code: sm.code,
            label: sm.label,
            category: sm.category || undefined,
            unit: sm.unit || '',
            lowerIsBetter: sm.lowerIsBetter,
            isActive: sm.isActive,
            isSystemDefault: sm.isSystemDefault,
          }
        ])
      );
    }
    return {};
  }, [currentOrgId, orgMetrics, siteMetrics]);

  const isLoaded = !loadingOrg && !loadingSite;

  const getMetricConfig = useMemo(() => {
    return (code: string) => {
      // Try dynamic config first
      const dynamicConfig = metricsMap[code];
      if (dynamicConfig) {
        return {
          label: dynamicConfig.label,
          unit: dynamicConfig.unit,
          lowerIsBetter: dynamicConfig.lowerIsBetter,
          category: dynamicConfig.category,
        };
      }

      // Fall back to static METRIC_CONFIG for backward compatibility
      const staticConfig = METRIC_CONFIG[code as keyof typeof METRIC_CONFIG];
      if (staticConfig) {
        return {
          label: staticConfig.label,
          unit: staticConfig.unit,
          lowerIsBetter: staticConfig.lowerIsBetter,
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
