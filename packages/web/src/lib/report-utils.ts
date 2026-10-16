/**
 * Shared utility functions for report rendering
 * Extracted from TeamReportView to follow DRY principles
 */

import { isLowerBetterType, type MetricType } from '@shared/analytics-types';

/**
 * Determine if lower values are better for a metric
 * Uses the metric's type from the metric list when given (see resolveMetricType)
 */
export function isLowerBetter(metricCode: string, metricType?: MetricType): boolean {
  return isLowerBetterType(metricCode, metricType);
}

/**
 * Sort athletes by metric performance (best to worst)
 */
export function sortAthletesByMetric<T extends { measurements: Record<string, number | undefined> }>(
  athletes: T[],
  metricCode: string,
  metricType?: MetricType
): T[] {
  if (!Array.isArray(athletes)) return [];
  const lowerIsBetter = isLowerBetter(metricCode, metricType);
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
  metricCode: string,
  metricType?: MetricType
): string | null {
  const comparisons = athlete.benchmarkComparisons?.[metricCode];
  if (!comparisons || comparisons.length === 0) return null;

  // Find the highest tier benchmark the athlete meets or exceeds
  const lowerIsBetter = isLowerBetter(metricCode, metricType);
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
