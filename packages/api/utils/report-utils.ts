/**
 * Report generation utility functions
 * These helpers are used for PDF report generation and metric analysis
 */

import { isLowerBetter } from './metric-type';

// Re-export from shared package — single source of truth
export { deriveTierGroupName } from '@shared/benchmark-utils';

// Direction comes from the metric's own row (site metric, else the organization's custom metric)
export { isLowerBetter };

/**
 * Sorts athletes by their performance in a specific metric
 * @param athletes - Array of athlete objects with measurements
 * @param metricCode - The metric code to sort by
 * @param organizationId - The report's organization, to resolve its custom metrics
 * @returns Sorted array of athletes (best to worst performance)
 */
export async function sortAthletesByMetric(athletes: any[], metricCode: string, organizationId?: string): Promise<any[]> {
  if (!Array.isArray(athletes)) return [];
  const lowerIsBetter = await isLowerBetter(metricCode, organizationId);
  return [...athletes]
    .filter(athlete => athlete?.measurements?.[metricCode] !== undefined)
    .sort((a, b) => {
      const aVal = a.measurements[metricCode];
      const bVal = b.measurements[metricCode];
      if (aVal === undefined || bVal === undefined) return 0;
      return lowerIsBetter ? aVal - bVal : bVal - aVal;
    });
}

/**
 * Gets the highest benchmark tier an athlete meets for a specific metric
 * @param athlete - Athlete object with benchmark comparisons
 * @param metricCode - The metric code to check
 * @param organizationId - The report's organization, to resolve its custom metrics
 * @returns The name of the highest benchmark tier met, or null if none
 */
export async function getBenchmarkLabel(athlete: any, metricCode: string, organizationId?: string): Promise<string | null> {
  const comparisons = athlete.benchmarkComparisons?.[metricCode];
  if (!comparisons || comparisons.length === 0) return null;

  // Check for tier benchmark comparisons first
  const tierComparison = comparisons.find((c: any) => c.tierName);
  if (tierComparison) {
    if (tierComparison.isBestTier) {
      return `${tierComparison.tierName} [Best]`;
    }
    if (tierComparison.distanceToNextTier != null && tierComparison.nextTierName) {
      const dist = tierComparison.distanceToNextTier;
      const formatted = dist < 1 ? dist.toFixed(2) : dist.toFixed(1);
      return `${tierComparison.tierName} (${formatted} to ${tierComparison.nextTierName})`;
    }
    return tierComparison.tierName;
  }

  // Fall back to single-value benchmark logic
  const lowerIsBetter = await isLowerBetter(metricCode, organizationId);
  const sortedComparisons = [...comparisons].sort((a: any, b: any) => {
    return lowerIsBetter ? a.benchmarkValue - b.benchmarkValue : b.benchmarkValue - a.benchmarkValue;
  });

  for (const comparison of sortedComparisons) {
    if (comparison.meetsOrExceeds) {
      return comparison.benchmarkName;
    }
  }

  return null;
}
