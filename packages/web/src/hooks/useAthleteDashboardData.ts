/**
 * useAthleteDashboardData Hook
 *
 * Aggregates all data needed for the athlete dashboard:
 * - Measurements
 * - Personal records
 * - Activity timeline
 * - Monthly measurement count
 * - Metric progress data
 *
 * This hook combines multiple data sources into a single, easy-to-consume result.
 */

import { useMemo } from 'react';
import { useAthleteMeasurements } from './useAthleteMeasurements';
import { useAthleteProfile } from './useAthleteProfile';
import {
  calculateMonthlyMeasurementCount,
  getLastMeasurementDate,
  calculatePersonalRecords,
  generateActivityTimeline,
} from '@/utils/athlete-dashboard-utils';
import { getMetricDisplayName, LOWER_IS_BETTER_METRICS } from '@/lib/metrics';
import type { Measurement } from '@shared/schema';

export interface PersonalRecord {
  metric: string;
  displayName: string;
  value: number;
  units: string;
  date: string;
  isRecent: boolean;
  improvement: number | null;
  improvementText: string | null;
}

export interface ActivityTimelineItem {
  id: string;
  date: string;
  metric: string;
  displayName: string;
  value: number;
  units: string;
  insight: string | null;
  insightType: 'pr' | 'improvement' | 'consistent' | null;
}

export interface MetricProgress {
  metric: string;
  displayName: string;
  measurements: Array<{
    value: number;
    date: string;
  }>;
  currentValue: number;
  trend: 'improving' | 'steady' | 'declining';
  trendPercent: number;
}

export interface DashboardData {
  /** Athlete's first name for welcome message */
  athleteName: string;
  /** Number of measurements in current month */
  measurementsThisMonth: number;
  /** Date of last measurement */
  lastMeasurementDate: Date | null;
  /** Personal records by metric */
  personalRecords: PersonalRecord[];
  /** Recent activity with insights */
  activityTimeline: ActivityTimelineItem[];
  /** Progress data for each metric */
  metricProgress: MetricProgress[];
  /** All measurements */
  measurements: Measurement[];
  /** Available metrics that have data */
  availableMetrics: string[];
}

interface UseAthleteDashboardDataOptions {
  enabled?: boolean;
}

export function useAthleteDashboardData(
  athleteId: string | undefined,
  options: UseAthleteDashboardDataOptions = {}
) {
  const { enabled = true } = options;

  // Fetch athlete profile
  const athleteQuery = useAthleteProfile(athleteId, { enabled });

  // Fetch measurements (single query - no duplicate calls)
  const measurementsQuery = useAthleteMeasurements(athleteId, { enabled });

  // Calculate dashboard data from measurements
  // Group measurements by metric inline to avoid duplicate API calls
  const dashboardData = useMemo((): DashboardData | null => {
    if (!measurementsQuery.data || !athleteQuery.data) {
      return null;
    }

    const measurements = measurementsQuery.data;
    const athlete = athleteQuery.data;

    // Group measurements by metric (computed inline, not from separate hook)
    const measurementsByMetric: Record<string, Measurement[]> = {};
    const availableMetrics: string[] = [];

    measurements.forEach((m: Measurement) => {
      if (!measurementsByMetric[m.metric]) {
        measurementsByMetric[m.metric] = [];
        availableMetrics.push(m.metric);
      }
      measurementsByMetric[m.metric].push(m);
    });

    // Sort metrics alphabetically for consistent ordering
    availableMetrics.sort();

    // Calculate monthly count
    const measurementsThisMonth = calculateMonthlyMeasurementCount(measurements);

    // Get last measurement date
    const lastMeasurementDate = getLastMeasurementDate(measurements);

    // Calculate personal records
    const personalRecords = calculatePersonalRecords(measurements);

    // Generate activity timeline
    const activityTimeline = generateActivityTimeline(measurements);

    // Calculate metric progress for each metric
    const metricProgress: MetricProgress[] = availableMetrics.map((metric) => {
      const metricMeasurements = measurementsByMetric[metric] || [];

      // Sort by date (oldest first for chart)
      const sortedMeasurements = [...metricMeasurements]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((m) => ({
          value: parseFloat(String(m.value)),
          date: m.date,
        }));

      // Get current value (most recent)
      const currentValue =
        sortedMeasurements.length > 0
          ? sortedMeasurements[sortedMeasurements.length - 1].value
          : 0;

      // Calculate trend
      const { trend, trendPercent } = calculateTrend(metric, sortedMeasurements);

      return {
        metric,
        displayName: getMetricDisplayName(metric),
        measurements: sortedMeasurements,
        currentValue,
        trend,
        trendPercent,
      };
    });

    return {
      athleteName: athlete.firstName || athlete.fullName?.split(' ')[0] || 'Athlete',
      measurementsThisMonth,
      lastMeasurementDate,
      personalRecords,
      activityTimeline,
      metricProgress,
      measurements,
      availableMetrics,
    };
  }, [measurementsQuery.data, athleteQuery.data]);

  return {
    data: dashboardData,
    isLoading: measurementsQuery.isLoading || athleteQuery.isLoading,
    isError: measurementsQuery.isError || athleteQuery.isError,
    error: measurementsQuery.error || athleteQuery.error,
    // Expose individual queries for more granular loading states
    athleteQuery,
    measurementsQuery,
  };
}

/**
 * Calculate trend direction and percentage
 * Uses LOWER_IS_BETTER_METRICS from shared constants
 */
function calculateTrend(
  metric: string,
  measurements: Array<{ value: number; date: string }>
): { trend: 'improving' | 'steady' | 'declining'; trendPercent: number } {
  if (measurements.length < 2) {
    return { trend: 'steady', trendPercent: 0 };
  }

  // Cast to readonly string[] to allow string parameter in includes()
  const isLowerBetter = (LOWER_IS_BETTER_METRICS as readonly string[]).includes(metric);

  // Compare last value to average of previous values
  const currentValue = measurements[measurements.length - 1].value;
  const previousValues = measurements.slice(0, -1).map((m) => m.value);
  const previousAvg =
    previousValues.reduce((sum, v) => sum + v, 0) / previousValues.length;

  const diff = currentValue - previousAvg;
  const percentChange = (Math.abs(diff) / previousAvg) * 100;

  // Determine trend based on metric type
  let trend: 'improving' | 'steady' | 'declining';

  if (Math.abs(percentChange) < 1) {
    trend = 'steady';
  } else if (isLowerBetter) {
    trend = diff < 0 ? 'improving' : 'declining';
  } else {
    trend = diff > 0 ? 'improving' : 'declining';
  }

  return {
    trend,
    trendPercent: Math.round(percentChange * 10) / 10,
  };
}
