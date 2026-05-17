import { useCallback, useMemo } from 'react';
import { useAvailableMetrics } from './use-available-metrics';

export interface UseMetricLabelsResult {
  labels: Record<string, string>;
  getLabel: (code: string) => string;
  isLoading: boolean;
}

/**
 * Underscore-split fallback used when no real label is known. Lives at the
 * module top so it has a stable identity and can be shared with consumers
 * who want the same "code → readable string" shape without depending on the
 * hook (e.g. non-React utilities).
 */
export function splitMetricCode(code: string): string {
  return code.replace(/_/g, ' ');
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
 * measurements, OR codes seen while the upstream query is still loading)
 * fall back to an underscore-split form (`FLY10_TIME` → `"FLY10 TIME"`).
 * That gives users readable prose even in the worst case and keeps render
 * output consistent across surfaces — every label-rendering site now reads
 * the same way for the same unknown code.
 *
 * **About `isLoading`:** while the upstream `useAvailableMetrics` query is
 * in flight, `labels` is `{}` and `getLabel(code)` falls back to the
 * underscore-split form. That's intentional: it's a strictly nicer first-
 * paint than the raw underscored code, so most surfaces don't need to gate
 * render on `isLoading`. The flag is still exposed for surfaces that want
 * to render a skeleton until labels resolve.
 */
export function useMetricLabels(): UseMetricLabelsResult {
  const { metrics, isLoading } = useAvailableMetrics();

  const labels = useMemo(
    () => Object.fromEntries(metrics.map((m) => [m.code, m.label])),
    [metrics],
  );

  const getLabel = useCallback(
    (code: string) => labels[code] ?? splitMetricCode(code),
    [labels],
  );

  return { labels, getLabel, isLoading };
}
