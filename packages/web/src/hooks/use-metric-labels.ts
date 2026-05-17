import { useCallback, useMemo } from 'react';
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
 *
 * **About `isLoading`:** while the upstream `useAvailableMetrics` query is
 * in flight, `labels` is `{}` and `getLabel(code)` returns the code itself.
 * Consumers that render label-bearing content during the initial fetch will
 * see a brief code flash on first paint before the cache warms. Most
 * surfaces in the app are gated by a parent query's loading state (a
 * skeleton or empty state hides the row), so the flash is invisible in
 * practice. If you build a new high-visibility surface where the flash
 * would be jarring, check `isLoading` and render a skeleton until it's
 * `false`. Do *not* render the label fallback (`code`) to users when
 * `isLoading === true` — that's the bug this hook exists to prevent.
 */
export function useMetricLabels(): UseMetricLabelsResult {
  const { metrics, isLoading } = useAvailableMetrics();

  const labels = useMemo(
    () => Object.fromEntries(metrics.map((m) => [m.code, m.label])),
    [metrics],
  );

  const getLabel = useCallback(
    (code: string) => labels[code] ?? code,
    [labels],
  );

  return { labels, getLabel, isLoading };
}
