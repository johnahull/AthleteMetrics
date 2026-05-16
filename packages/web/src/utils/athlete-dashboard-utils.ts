/**
 * Utility functions for athlete dashboard data preparation
 */

import { differenceInDays, startOfMonth, endOfMonth } from 'date-fns';
import { isLowerIsBetter } from '@/lib/metrics';

interface Measurement {
  id: string;
  metric: string;
  value: string | number;
  units: string;
  date: string;
  age: number;
  notes?: string | null;
}

/**
 * Calculate how many measurements were made in the current month
 */
export function calculateMonthlyMeasurementCount(measurements: Measurement[]): number {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  return measurements.filter((m) => {
    const measurementDate = new Date(m.date);
    return measurementDate >= monthStart && measurementDate <= monthEnd;
  }).length;
}

/**
 * Get the most recent measurement date
 */
export function getLastMeasurementDate(measurements: Measurement[]): Date | null {
  if (measurements.length === 0) return null;

  const sortedMeasurements = [...measurements].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return new Date(sortedMeasurements[0].date);
}

/**
 * Calculate personal records for all metrics.
 *
 * Pass `metricLabels` (from `useMetricLabels().labels`) to surface custom org
 * metrics and per-org label overrides. Falls back to a built-in name map for
 * unmigrated callers, then to the raw code.
 */
export function calculatePersonalRecords(
  measurements: Measurement[],
  metricLabels?: Record<string, string>,
) {
  const metricGroups: Record<string, Measurement[]> = {};

  // Group measurements by metric
  measurements.forEach((m) => {
    if (!metricGroups[m.metric]) {
      metricGroups[m.metric] = [];
    }
    metricGroups[m.metric].push(m);
  });

  const personalRecords: any[] = [];

  // Calculate PR for each metric
  Object.entries(metricGroups).forEach(([metric, metricMeasurements]) => {
    if (metricMeasurements.length === 0) return;

    // Sort by value (ascending for time-based metrics, descending for others)
    const isLowerBetter = isLowerIsBetter(metric);

    const sortedMeasurements = [...metricMeasurements].sort((a, b) => {
      const aValue = parseFloat(String(a.value));
      const bValue = parseFloat(String(b.value));
      return isLowerBetter ? aValue - bValue : bValue - aValue;
    });

    const bestMeasurement = sortedMeasurements[0];
    const bestValue = parseFloat(String(bestMeasurement.value));

    // Check if this is a recent PR (within 7 days)
    const daysSincePR = differenceInDays(new Date(), new Date(bestMeasurement.date));
    const isRecent = daysSincePR <= 7;

    // Calculate improvement if there are multiple measurements
    let improvement: number | null = null;
    let improvementText: string | null = null;

    if (sortedMeasurements.length > 1) {
      const secondBest = sortedMeasurements[1];
      const secondBestValue = parseFloat(String(secondBest.value));
      improvement = Math.abs(bestValue - secondBestValue);

      const units = bestMeasurement.units || '';
      const formattedImprovement = isLowerBetter
        ? improvement.toFixed(2)
        : improvement.toFixed(1);

      if (isLowerBetter) {
        improvementText = `↑ ${formattedImprovement}${units} better than last best`;
      } else {
        improvementText = `↑ ${formattedImprovement}${units} better than last best`;
      }
    }

    personalRecords.push({
      metric,
      displayName: metricLabels?.[metric] ?? getMetricDisplayName(metric),
      value: bestValue,
      units: bestMeasurement.units,
      date: bestMeasurement.date,
      isRecent,
      improvement,
      improvementText,
    });
  });

  return personalRecords;
}

/**
 * Generate recent activity timeline data with insights.
 *
 * Pass `metricLabels` (from `useMetricLabels().labels`) to surface custom org
 * metrics and per-org label overrides. Falls back as in `calculatePersonalRecords`.
 */
export function generateActivityTimeline(
  measurements: Measurement[],
  metricLabels?: Record<string, string>,
) {
  // Get last 5 measurements sorted by date
  const recentMeasurements = [...measurements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  // Calculate personal records to detect new PRs
  const personalRecords = calculatePersonalRecords(measurements);
  const prMap = new Map(personalRecords.map((pr) => [pr.metric, pr.value]));

  return recentMeasurements.map((measurement, index) => {
    const value = parseFloat(String(measurement.value));
    const isLowerBetter = measurement.metric.includes('TIME') ||
      measurement.metric.includes('DASH') ||
      measurement.metric.includes('AGILITY');

    // Check if this is a PR
    const currentPR = prMap.get(measurement.metric);
    const isPR = currentPR !== undefined && Math.abs(value - currentPR) < 0.01;

    let insight: string | null = null;
    let insightType: 'pr' | 'improvement' | 'consistent' | null = null;

    if (isPR) {
      insight = 'New personal record! 🎉';
      insightType = 'pr';
    } else {
      // Check for improvement from previous measurement
      const previousMeasurements = measurements
        .filter((m) => m.metric === measurement.metric && new Date(m.date) < new Date(measurement.date))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (previousMeasurements.length > 0) {
        const previousValue = parseFloat(String(previousMeasurements[0].value));
        const diff = Math.abs(value - previousValue);
        const percentChange = (diff / previousValue) * 100;

        const hasImproved = isLowerBetter ? value < previousValue : value > previousValue;

        if (hasImproved && percentChange > 1) {
          insight = `Improved by ${percentChange.toFixed(1)}% from last time`;
          insightType = 'improvement';
        } else if (percentChange < 1) {
          insight = 'Consistent performance';
          insightType = 'consistent';
        }
      }
    }

    return {
      id: measurement.id,
      date: measurement.date,
      metric: measurement.metric,
      displayName: metricLabels?.[measurement.metric] ?? getMetricDisplayName(measurement.metric),
      value,
      units: measurement.units,
      insight,
      insightType,
    };
  });
}

/**
 * Last-resort metric display name when the caller didn't supply a labels map
 * AND the code isn't one of the known built-ins. Underscore-split fallback
 * keeps unknown codes legible (e.g. CUSTOM_DEADLIFT_1RM → "CUSTOM DEADLIFT
 * 1RM"), matching the same fallback shape used by
 * resolveTimelineLabel in measurements-timeline.tsx.
 */
function getMetricDisplayName(metric: string): string {
  const displayNames: Record<string, string> = {
    FLY10_TIME: '10-Yard Fly Time',
    VERTICAL_JUMP: 'Vertical Jump',
    DASH_40YD: '40-Yard Dash',
    AGILITY_505: '5-0-5 Agility',
    AGILITY_5105: '5-10-5 Agility',
    T_TEST: 'T-Test Agility',
    TOP_SPEED: 'Top Speed',
    RSI: 'Reactive Strength Index',
  };

  return displayNames[metric] ?? metric.replace(/_/g, ' ');
}
