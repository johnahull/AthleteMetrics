/**
 * Report generation utility functions
 * These helpers are used for PDF report generation and metric analysis
 */

import { isLowerBetter } from './metric-type';

// Re-export from shared package — single source of truth
export { deriveTierGroupName } from '@shared/benchmark-utils';
import { tierRangeLabels, type TierBounds } from '@shared/benchmark-utils';
import type { MeasurementFormat } from '@shared/duration-format';

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
 * @param lowerIsBetter - The metric's direction, when the caller already resolved it (looked up only if omitted)
 * @returns The name of the highest benchmark tier met, or null if none
 */
export async function getBenchmarkLabel(
  athlete: any,
  metricCode: string,
  organizationId?: string,
  lowerIsBetter?: boolean,
): Promise<string | null> {
  const comparisons = athlete.benchmarkComparisons?.[metricCode];
  if (!comparisons || comparisons.length === 0) return null;

  // Check for tier benchmark comparisons first
  const tierComparison = comparisons.find((c: any) => c.tierName);
  if (tierComparison) {
    if (tierComparison.isBestTier) {
      return `${tierComparison.tierName} [Best]`;
    }
    if (tierComparison.distanceToNextTier != null && tierComparison.nextTierName) {
      // fixed 2 decimals (the web caption drops trailing zeros)
      const formatted = tierComparison.distanceToNextTier.toFixed(2);
      return `${tierComparison.tierName} (${formatted} to ${tierComparison.nextTierName})`;
    }
    return tierComparison.tierName;
  }

  // Fall back to single-value benchmark logic
  const lowerBetter = lowerIsBetter ?? await isLowerBetter(metricCode, organizationId);
  const sortedComparisons = [...comparisons].sort((a: any, b: any) => {
    return lowerBetter ? a.benchmarkValue - b.benchmarkValue : b.benchmarkValue - a.benchmarkValue;
  });

  for (const comparison of sortedComparisons) {
    if (comparison.meetsOrExceeds) {
      return comparison.benchmarkName;
    }
  }

  return null;
}

/**
 * Rows ([rank, tier, range]) for the PDF tier reference table, tiers in the order given. The range is
 * the web chart's boundary label (tierRangeLabels) in ASCII because the jsPDF Helvetica font is
 * WinAnsi-only; "-" when a tier has no bounds (old snapshots of single-cutoff tiers).
 */
export function tierLegendRows(
  tiers: Array<TierBounds & { tierName: string }>,
  unit?: string | null,
  format?: MeasurementFormat | null,
): string[][] {
  const ranges = tierRangeLabels(tiers, { unit, format, ascii: true, decimals: 2 });
  return tiers.map((t, i) => [`#${t.tierOrder}`, t.tierName, ranges[i] || '-']);
}

/** "Oct 31, 2026" (plus ", 9:30 PM" with time) in the given IANA time zone, for report PDFs. */
export function formatReportDate(d: string | Date, timeZone: string, withTime = false): string {
  return new Date(d)
    .toLocaleString('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    })
    .replace(/\s/g, ' '); // ICU puts U+202F before AM/PM, which jsPDF's WinAnsi font cannot print
}
