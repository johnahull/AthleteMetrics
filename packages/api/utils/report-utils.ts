/**
 * Report generation utility functions
 * These helpers are used for PDF report generation and metric analysis
 */

import { db } from '../db';
import { eq } from 'drizzle-orm';
import { siteMetrics } from '@shared/schema';

/**
 * Derives a tier group display name from an individual tier benchmark name.
 * Tier benchmarks are named like "40yd Dash - Elite", "40yd Dash - Good", etc.
 * This strips the tier-specific suffix to get the group name.
 */
export function deriveTierGroupName(tierBenchmarkName: string): string {
  return tierBenchmarkName.replace(/ - [^-]+$/, '');
}

// Cache for metric types to avoid repeated DB queries
const metricTypeCache = new Map<string, string>();

/**
 * Determines if lower values are better for a given metric
 * Queries siteMetrics table as source of truth
 * @param metricCode - The metric code to check
 * @returns true if lower values are better (e.g., times), false otherwise
 */
export async function isLowerBetter(metricCode: string): Promise<boolean> {
  // Check cache first
  if (metricTypeCache.has(metricCode)) {
    return metricTypeCache.get(metricCode) === 'lower_is_better';
  }

  // Query database for metric type
  const [metric] = await db
    .select({ metricType: siteMetrics.metricType })
    .from(siteMetrics)
    .where(eq(siteMetrics.code, metricCode));

  const metricType = metric?.metricType || 'higher_is_better';
  metricTypeCache.set(metricCode, metricType);

  return metricType === 'lower_is_better';
}

/**
 * Sorts athletes by their performance in a specific metric
 * @param athletes - Array of athlete objects with measurements
 * @param metricCode - The metric code to sort by
 * @returns Sorted array of athletes (best to worst performance)
 */
export async function sortAthletesByMetric(athletes: any[], metricCode: string): Promise<any[]> {
  if (!Array.isArray(athletes)) return [];
  const lowerIsBetter = await isLowerBetter(metricCode);
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
export async function getBenchmarkLabel(athlete: any, metricCode: string): Promise<string | null> {
  const comparisons = athlete.benchmarkComparisons?.[metricCode];
  if (!comparisons || comparisons.length === 0) return null;

  // Check for tier benchmark comparisons first
  const tierComparison = comparisons.find((c: any) => c.tierName);
  if (tierComparison) {
    if (tierComparison.isBestTier) {
      return `${tierComparison.tierName} ★`;
    }
    if (tierComparison.distanceToNextTier !== null && tierComparison.nextTierName) {
      const dist = tierComparison.distanceToNextTier;
      const formatted = dist < 1 ? dist.toFixed(2) : dist.toFixed(1);
      return `${tierComparison.tierName} (↑${formatted} to ${tierComparison.nextTierName})`;
    }
    return tierComparison.tierName;
  }

  // Fall back to single-value benchmark logic
  const lowerIsBetter = await isLowerBetter(metricCode);
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
