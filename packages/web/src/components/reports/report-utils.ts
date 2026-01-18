/**
 * Shared utility functions for report components
 *
 * This module consolidates helper functions previously duplicated across:
 * - TeamReportView.tsx
 * - AthleteReportView.tsx
 * - IndividualReportView.tsx
 *
 * These functions handle:
 * - Performance visualization (colors, badges)
 * - Report data formatting (date ranges, team names, metrics)
 * - Benchmark processing and achievement calculations
 * - Report configuration extraction
 */

import { format } from 'date-fns';
import { getMetricDisplayName } from '@/lib/metrics';
import type { TimeframeConfig, AthleteRanking, TeamStatistic } from '@/types/report-types';

// ============================================================================
// Performance Visualization
// ============================================================================

/**
 * Returns a Tailwind CSS color class based on the athlete's percentile ranking.
 *
 * Color mapping:
 * - Green (>=75th): Top quartile performance
 * - Yellow (50-74th): Above average
 * - Orange (25-49th): Below average
 * - Red (<25th): Bottom quartile
 *
 * @param percentile - The athlete's percentile (0-100) or undefined
 * @returns Tailwind CSS color class string
 */
export function getPerformanceColor(percentile: number | null | undefined): string {
  if (percentile == null) return 'text-muted-foreground';
  if (percentile >= 75) return 'text-green-600';
  if (percentile >= 50) return 'text-yellow-600';
  if (percentile >= 25) return 'text-orange-600';
  return 'text-red-600';
}

/**
 * Returns badge configuration for displaying quartile information.
 *
 * @param percentile - The athlete's percentile (0-100) or undefined
 * @returns Badge config object with label and variant, or null if undefined
 */
export function getQuartileBadge(
  percentile: number | null | undefined
): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } | null {
  if (percentile == null) return null;
  if (percentile >= 75) return { label: 'Top 25%', variant: 'default' };
  if (percentile >= 50) return { label: 'Above Avg', variant: 'secondary' };
  if (percentile >= 25) return { label: 'Below Avg', variant: 'outline' };
  return { label: 'Bottom 25%', variant: 'destructive' };
}

// ============================================================================
// Report Data Formatting
// ============================================================================

/**
 * Formats a timeframe configuration into a human-readable string.
 *
 * @param timeframe - The timeframe configuration from report config
 * @returns Formatted date range string
 */
export function formatDateRange(timeframe: TimeframeConfig): string {
  if (timeframe.type === 'custom') {
    const start = timeframe.customStart
      ? format(new Date(timeframe.customStart), 'MMM d, yyyy')
      : '';
    const end = timeframe.customEnd
      ? format(new Date(timeframe.customEnd), 'MMM d, yyyy')
      : '';
    return `${start} - ${end}`;
  }

  switch (timeframe.preset) {
    case 'season':
      return 'Current Season';
    case 'year':
      return 'Past Year';
    case 'all_time':
      return 'All Time';
    default:
      return 'All Time';
  }
}

/**
 * Extracts team names from report configuration and team data.
 *
 * @param config - Report config object with optional filters.teamIds
 * @param teams - Array of team objects with id and name
 * @param teamsLabel - Contextual label for teams (e.g., "Teams", "Groups")
 * @returns Comma-separated team names or "All {teamsLabel}"
 */
export function getTeamNames(
  config: { filters?: { teamIds?: string[] } },
  teams: { id: string; name: string }[] | undefined,
  teamsLabel: string
): string {
  const teamIds = config.filters?.teamIds;

  if (!teamIds || teamIds.length === 0) {
    return `All ${teamsLabel}`;
  }

  if (!teams || teams.length === 0) {
    return 'Loading...';
  }

  const teamNames = teamIds
    .map((id: string) => teams.find((t) => t.id === id)?.name)
    .filter(Boolean);

  return teamNames.length > 0 ? teamNames.join(', ') : `All ${teamsLabel}`;
}

/**
 * Formats the list of metrics in a report as a comma-separated string.
 *
 * @param teamStatistics - Array of team statistics with metric codes
 * @param metricLabels - Optional mapping of metric codes to display names
 * @returns Comma-separated list of metric display names
 */
export function getMetricsList(
  teamStatistics: { metric: string }[],
  metricLabels?: Record<string, string>
): string {
  if (!teamStatistics || teamStatistics.length === 0) {
    return 'No metrics';
  }

  return teamStatistics
    .map((stat) => metricLabels?.[stat.metric] || getMetricDisplayName(stat.metric))
    .join(', ');
}

/**
 * Generates a description of the composite index calculation.
 *
 * @param weights - Optional mapping of metric codes to weight values (0-1)
 * @param metricLabels - Optional mapping of metric codes to display names
 * @returns Description string for the composite index
 */
export function getCompositeIndexDescription(
  weights?: Record<string, number>,
  metricLabels?: Record<string, string>
): string {
  if (!weights || Object.keys(weights).length === 0) {
    return 'Weighted average of percentiles';
  }

  const weightDescriptions = Object.entries(weights)
    .map(([metricCode, weight]) => {
      const metricName = metricLabels?.[metricCode] || getMetricDisplayName(metricCode);
      const percentage = (weight * 100).toFixed(0);
      return `${metricName} (${percentage}%)`;
    })
    .join(', ');

  return `Weighted average of percentiles: ${weightDescriptions}`;
}

// ============================================================================
// Benchmark Processing
// ============================================================================

/**
 * Achievement statistics for a benchmark tier.
 */
export interface BenchmarkAchievement {
  /** The benchmark tier name */
  tier: string;
  /** Number of athletes meeting this benchmark */
  count: number;
  /** Percentage of athletes meeting this benchmark */
  percentage: number;
}

/**
 * Calculates benchmark achievement statistics from athlete rankings.
 *
 * This function:
 * 1. Collects all unique benchmark names across all athletes/metrics
 * 2. Counts how many athletes meet each benchmark
 * 3. Adds "No benchmark met" for athletes who meet no benchmarks
 * 4. Filters out benchmarks with zero count
 * 5. Sorts by count descending
 *
 * @param athleteRankings - Array of athlete ranking data with benchmark comparisons
 * @returns Array of benchmark achievements sorted by count
 */
export function calculateBenchmarkAchievements(
  athleteRankings: AthleteRanking[]
): BenchmarkAchievement[] {
  if (!athleteRankings || athleteRankings.length === 0) {
    return [];
  }

  // Get all unique benchmark names across all metrics
  const allBenchmarkNames = new Set<string>();
  athleteRankings.forEach((athlete: AthleteRanking) => {
    if (athlete.benchmarkComparisons) {
      Object.values(athlete.benchmarkComparisons).forEach((comparisons) => {
        comparisons.forEach((comp) => allBenchmarkNames.add(comp.benchmarkName));
      });
    }
  });

  // If no benchmarks configured, return empty
  if (allBenchmarkNames.size === 0) {
    return [];
  }

  // Count how many athletes meet each benchmark
  const benchmarkCounts: Record<string, number> = {};
  Array.from(allBenchmarkNames).forEach((benchmarkName) => {
    benchmarkCounts[benchmarkName] = 0;
  });

  // Track which athletes meet at least one benchmark
  const athletesWithBenchmarks = new Set<string>();

  athleteRankings.forEach((athlete: AthleteRanking) => {
    if (athlete.benchmarkComparisons) {
      // Check all metrics and all benchmarks
      Object.values(athlete.benchmarkComparisons).forEach((comparisons) => {
        comparisons.forEach((comp) => {
          if (comp.meetsOrExceeds) {
            benchmarkCounts[comp.benchmarkName]++;
            athletesWithBenchmarks.add(athlete.userId);
          }
        });
      });
    }
  });

  // Convert to array format for rendering, sorted by count descending
  const achievements = Array.from(allBenchmarkNames)
    .map((benchmarkName) => ({
      tier: benchmarkName,
      count: benchmarkCounts[benchmarkName],
      percentage: (benchmarkCounts[benchmarkName] / athleteRankings.length) * 100,
    }))
    .filter((achievement) => achievement.count > 0) // Only show benchmarks that are met
    .sort((a, b) => b.count - a.count); // Sort by count descending

  // Count athletes who didn't meet any benchmark
  const noTierCount = athleteRankings.length - athletesWithBenchmarks.size;

  // Add "no benchmark met" if applicable
  if (noTierCount > 0) {
    achievements.push({
      tier: 'No benchmark met',
      count: noTierCount,
      percentage: (noTierCount / athleteRankings.length) * 100,
    });
  }

  return achievements;
}

// ============================================================================
// Report Configuration Extraction
// ============================================================================

/**
 * Extracts the athleteId from an individual report configuration.
 *
 * Individual reports can have either:
 * - `athleteId`: Single athlete ID (preferred)
 * - `athleteIds`: Array of athlete IDs (first one used)
 *
 * @param config - Report configuration object
 * @returns The athlete ID or undefined if not found
 */
export function extractAthleteId(
  config: { athleteId?: string; athleteIds?: string[] }
): string | undefined {
  return config?.athleteId || config?.athleteIds?.[0];
}

// ============================================================================
// Statistical Calculations
// ============================================================================

/**
 * Result of deviation statistics calculation.
 */
export interface DeviationStats {
  /** Absolute deviation from average (value - average) */
  deviation: number | null;
  /** Percentage difference from average ((deviation / |average|) * 100) */
  percentDiff: number | null;
  /** Z-score ((value - average) / standardDeviation) */
  zScore: number | null;
  /** Tailwind CSS color class for deviation display */
  deviationColor: string;
  /** Tailwind CSS color class for z-score display */
  zScoreColor: string;
}

/**
 * Calculates deviation statistics for a metric value compared to team/group average.
 *
 * This function consolidates the deviation calculation logic previously duplicated
 * in TeamReportView.tsx and AthleteReportView.tsx (~30 lines each).
 *
 * @param value - The athlete's metric value
 * @param average - The team/group average for this metric
 * @param standardDeviation - The standard deviation for this metric
 * @param lowerIsBetter - Whether lower values indicate better performance (e.g., time metrics)
 * @returns DeviationStats object with all calculated values and colors
 */
export function calculateDeviationStats(
  value: number | undefined,
  average: number | null,
  standardDeviation: number | null,
  lowerIsBetter: boolean
): DeviationStats {
  // Calculate deviation from average
  const deviation = value !== undefined && average !== null
    ? value - average
    : null;

  // Calculate percent difference (protect against division by zero)
  const percentDiff = deviation !== null && average !== null && average !== 0
    ? (deviation / Math.abs(average)) * 100
    : null;

  // Calculate z-score (protect against zero/null standard deviation)
  const zScore = value !== undefined && average !== null &&
    standardDeviation !== null && standardDeviation > 0
    ? (value - average) / standardDeviation
    : null;

  // Determine colors based on metric direction
  // Green = good performance, Red = poor performance
  const deviationColor = deviation === null ? '' :
    (lowerIsBetter
      ? (deviation < 0 ? 'text-green-600' : 'text-red-600')
      : (deviation > 0 ? 'text-green-600' : 'text-red-600'));

  const zScoreColor = zScore === null ? '' :
    (lowerIsBetter
      ? (zScore < 0 ? 'text-green-600' : 'text-red-600')
      : (zScore > 0 ? 'text-green-600' : 'text-red-600'));

  return {
    deviation,
    percentDiff,
    zScore,
    deviationColor,
    zScoreColor,
  };
}
