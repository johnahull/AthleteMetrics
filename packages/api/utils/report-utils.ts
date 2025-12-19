/**
 * Report generation utility functions
 * These helpers are used for PDF report generation and metric analysis
 */

import { METRIC_CONFIG } from '@shared/analytics-types';

/**
 * Determines if lower values are better for a given metric
 * Uses METRIC_CONFIG as source of truth, supports derived metrics with fallback
 * @param metricCode - The metric code to check
 * @returns true if lower values are better (e.g., times), false otherwise
 */
export function isLowerBetter(metricCode: string): boolean {
  const config = METRIC_CONFIG[metricCode as keyof typeof METRIC_CONFIG];
  if (config) {
    return config.metricType === 'lower_is_better';
  }
  // Fallback for derived/custom metrics: check for time-related keywords
  return metricCode.includes('TIME') || metricCode.includes('AGILITY') || metricCode.includes('DASH');
}

/**
 * Sorts athletes by their performance in a specific metric
 * @param athletes - Array of athlete objects with measurements
 * @param metricCode - The metric code to sort by
 * @returns Sorted array of athletes (best to worst performance)
 */
export function sortAthletesByMetric(athletes: any[], metricCode: string): any[] {
  if (!Array.isArray(athletes)) return [];
  const lowerIsBetter = isLowerBetter(metricCode);
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
 * @returns The name of the highest benchmark tier met, or null if none
 */
export function getBenchmarkLabel(athlete: any, metricCode: string): string | null {
  const comparisons = athlete.benchmarkComparisons?.[metricCode];
  if (!comparisons || comparisons.length === 0) return null;

  const lowerIsBetter = isLowerBetter(metricCode);
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
