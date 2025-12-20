// Utility functions for measurement metrics
import { Clock, ArrowUp, Zap, Move, Timer, TrendingUp, Gauge } from "lucide-react";
import { formatFly10TimeWithSpeed } from "@/lib/speed-utils";
import { METRIC_CONFIG, type MetricType } from "@shared/analytics-types";

/**
 * Metrics where lower values indicate better performance (time-based metrics)
 * Used for trend calculations and comparison logic
 * @deprecated Use getMetricType() instead
 */
export const LOWER_IS_BETTER_METRICS = [
  'FLY10_TIME',
  'AGILITY_505',
  'AGILITY_5105',
  'T_TEST',
  'DASH_40YD',
] as const;

export type LowerIsBetterMetric = typeof LOWER_IS_BETTER_METRICS[number];

/**
 * Get the metric type for a given metric code
 * Uses METRIC_CONFIG as static lookup for known metrics.
 *
 * IMPORTANT: For derived/custom metrics, prefer using the `useAvailableMetrics` hook
 * which fetches metric types directly from the database (siteMetrics table).
 * This function is provided for utility code that cannot use React hooks.
 *
 * @param metric - Metric code (e.g., 'FLY10_TIME', 'HEIGHT', 'TOP_SPEED_CALC')
 * @param metricTypeOverride - Optional override from database (useAvailableMetrics hook)
 * @returns MetricType - 'lower_is_better', 'higher_is_better', or 'tracking'
 */
export function getMetricType(metric: string, metricTypeOverride?: MetricType): MetricType {
  // Use override from database if provided (preferred)
  if (metricTypeOverride) {
    return metricTypeOverride;
  }

  // Fall back to static METRIC_CONFIG for known metrics
  const config = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
  if (config) {
    return config.metricType;
  }

  // Last resort fallback for unknown metrics (should rarely happen if DB is source of truth)
  // Default to higher_is_better as most custom metrics are performance metrics
  return 'higher_is_better';
}

/**
 * Check if a metric is a tracking metric (no better/worse direction)
 * @param metric - Metric code (e.g., 'HEIGHT', 'WEIGHT')
 * @returns boolean - true if tracking metric, false otherwise
 */
export function isTrackingMetric(metric: string): boolean {
  return getMetricType(metric) === 'tracking';
}

/**
 * Check if lower values are better for this metric
 * @param metric - Metric code
 * @returns boolean - true if lower is better, false otherwise
 * @deprecated Use getMetricType() instead for more granular control
 */
export function isLowerIsBetter(metric: string): boolean {
  return getMetricType(metric) === 'lower_is_better';
}

export function getMetricDisplayName(metric: string): string {
  switch (metric) {
    case "FLY10_TIME":
      return "Fly-10";
    case "VERTICAL_JUMP":
      return "Vertical Jump";
    case "AGILITY_505":
      return "5-0-5";
    case "AGILITY_5105":
      return "5-10-5";
    case "T_TEST":
      return "T-Test";
    case "DASH_40YD":
      return "40yd Dash";
    case "RSI":
      return "RSI";
    case "TOP_SPEED":
      return "Top Speed";
    default:
      return metric;
  }
}

export function getMetricBadgeVariant(metric: string): "default" | "secondary" | "destructive" | "outline" {
  switch (metric) {
    case "FLY10_TIME":
      return "default";
    case "VERTICAL_JUMP":
      return "secondary";
    case "AGILITY_505":
    case "AGILITY_5105":
      return "outline";
    case "T_TEST":
      return "destructive";
    case "DASH_40YD":
      return "default";
    case "RSI":
      return "outline";
    case "TOP_SPEED":
      return "default";
    default:
      return "secondary";
  }
}

export function getMetricColor(metric: string): string {
  switch (metric) {
    case "FLY10_TIME":
      return "bg-blue-100 text-blue-800";
    case "VERTICAL_JUMP":
      return "bg-purple-100 text-purple-800";
    case "AGILITY_505":
      return "bg-green-100 text-green-800";
    case "AGILITY_5105":
      return "bg-yellow-100 text-yellow-800";
    case "T_TEST":
      return "bg-red-100 text-red-800";
    case "DASH_40YD":
      return "bg-indigo-100 text-indigo-800";
    case "RSI":
      return "bg-orange-100 text-orange-800";
    case "TOP_SPEED":
      return "bg-teal-100 text-teal-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function getMetricUnits(metric: string): string {
  switch (metric) {
    case "FLY10_TIME":
    case "AGILITY_505":
    case "AGILITY_5105":
    case "T_TEST":
    case "DASH_40YD":
      return "s";
    case "VERTICAL_JUMP":
      return "in";
    case "RSI":
      return "";
    case "TOP_SPEED":
      return "mph";
    default:
      return "";
  }
}

export function getMetricIcon(metric: string) {
  switch (metric) {
    case "FLY10_TIME":
      return Clock;
    case "VERTICAL_JUMP":
      return ArrowUp;
    case "AGILITY_505":
    case "AGILITY_5105":
      return Zap;
    case "T_TEST":
      return Move;
    case "DASH_40YD":
      return Timer;
    case "RSI":
      return TrendingUp;
    case "TOP_SPEED":
      return Gauge;
    default:
      return Clock;
  }
}

export function formatMetricValue(metric: string, value: number): string {
  switch (metric) {
    case "FLY10_TIME":
      return formatFly10TimeWithSpeed(value);
    case "VERTICAL_JUMP":
      return `${value}in`;
    case "RSI":
      return `${value}`;
    case "TOP_SPEED":
      return `${value} mph`;
    default:
      return `${value}s`;
  }
}