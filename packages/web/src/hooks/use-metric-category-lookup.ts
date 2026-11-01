import { useCallback, useMemo } from "react";
import { useSiteMetrics } from "@/lib/metrics-api";
import { useMetricConfig } from "@/hooks/use-metric-config";

/**
 * Resolves a metric code to its raw category for an organization's benchmark lists.
 * Benchmarks always point at a site metric, but /api/metrics filters by org type, so codes it
 * does not return fall back to the org metric config (which also covers custom org metrics).
 */
export function useMetricCategoryLookup(organizationId: string) {
  const { data: siteMetrics, isLoading, isError } = useSiteMetrics(true, organizationId);
  const { getMetricConfig } = useMetricConfig();

  const categoryByCode = useMemo(
    () => new Map((siteMetrics ?? []).map((m) => [m.code, m.category])),
    [siteMetrics],
  );

  // A site metric deliberately left uncategorised stays in Other; only codes the site list lacks use the config
  const getCategory = useCallback(
    (code: string): string | null =>
      categoryByCode.has(code) ? (categoryByCode.get(code) ?? null) : (getMetricConfig(code)?.category ?? null),
    [categoryByCode, getMetricConfig],
  );

  return { getCategory, isLoading, isError: !!isError };
}
