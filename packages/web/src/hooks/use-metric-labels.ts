import { useMemo } from 'react';
import { useAvailableMetrics } from './use-available-metrics';

export interface UseMetricLabelsResult {
  labels: Record<string, string>;
  getLabel: (code: string) => string;
  isLoading: boolean;
}

/**
 * Resolves metric codes to human-readable labels for display in the UI.
 *
 * Backed by `useAvailableMetrics`, which already merges:
 *   - Org-enabled site metrics (with `customLabel` override per org)
 *   - Active custom org metrics
 *   - Fallback active site metrics for users with no org context
 *
 * Unknown codes (archived/deleted/migrated-away metrics referenced by old
 * measurements) fall back to returning the code itself — a clearer signal
 * than an empty string and consistent with patterns already in the codebase.
 */
export function useMetricLabels(): UseMetricLabelsResult {
  const { metrics, isLoading } = useAvailableMetrics();

  const labels = useMemo(
    () => Object.fromEntries(metrics.map((m) => [m.code, m.label])),
    [metrics],
  );

  const getLabel = useMemo(
    () => (code: string) => labels[code] ?? code,
    [labels],
  );

  return { labels, getLabel, isLoading };
}
