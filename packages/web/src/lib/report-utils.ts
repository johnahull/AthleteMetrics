/**
 * Shared utility functions for report rendering
 * Extracted from TeamReportView to follow DRY principles
 */

import { getMetricTypeWithFallback } from '@shared/analytics-types';

/**
 * Determine if lower values are better for a metric
 * Uses the canonical fallback logic from analytics-types
 */
export function isLowerBetter(metricCode: string): boolean {
  return getMetricTypeWithFallback(metricCode) === 'lower_is_better';
}

/**
 * Determine if a metric is a tracking-only metric (no better/worse direction)
 * Uses the canonical fallback logic from analytics-types
 */
export function isTrackingMetric(metricCode: string): boolean {
  return getMetricTypeWithFallback(metricCode) === 'tracking';
}

/**
 * Sort athletes by metric performance (best to worst)
 */
export function sortAthletesByMetric<T extends { measurements: Record<string, number | undefined> }>(
  athletes: T[],
  metricCode: string
): T[] {
  if (!Array.isArray(athletes)) return [];
  const lowerIsBetter = isLowerBetter(metricCode);
  return [...athletes]
    .filter(athlete => athlete?.measurements?.[metricCode] !== undefined)
    .sort((a, b) => {
      const aVal = a.measurements[metricCode];
      const bVal = b.measurements[metricCode];

      // Defensive check (should not be needed due to filter, but safe)
      if (aVal === undefined || bVal === undefined) return 0;

      return lowerIsBetter ? aVal - bVal : bVal - aVal;
    });
}

/**
 * Get benchmark comparison label for an athlete
 */
export function getBenchmarkLabel<T extends { benchmarkComparisons?: Record<string, Array<{ benchmarkName: string; benchmarkValue: number; meetsOrExceeds: boolean }>> }>(
  athlete: T,
  metricCode: string
): string | null {
  const comparisons = athlete.benchmarkComparisons?.[metricCode];
  if (!comparisons || comparisons.length === 0) return null;

  // Find the highest tier benchmark the athlete meets or exceeds
  const lowerIsBetter = isLowerBetter(metricCode);
  const sortedComparisons = [...comparisons].sort((a, b) => {
    // Sort by benchmark value (higher tier benchmarks are more stringent)
    return lowerIsBetter ? a.benchmarkValue - b.benchmarkValue : b.benchmarkValue - a.benchmarkValue;
  });

  for (const comparison of sortedComparisons) {
    if (comparison.meetsOrExceeds) {
      return comparison.benchmarkName;
    }
  }

  return null;
}
