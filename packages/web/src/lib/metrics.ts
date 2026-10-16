// Utility functions for measurement metrics
import { Clock } from "lucide-react";

/**
 * Get the display name for a metric
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 * @param metric - Metric code
 * @returns The metric code (fallback behavior after removing hardcoded definitions)
 */
export function getMetricDisplayName(metric: string): string {
  return metric;
}

/**
 * Get the badge variant for a metric
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 * @param metric - Metric code
 * @returns "secondary" (fallback behavior after removing hardcoded definitions)
 */
export function getMetricBadgeVariant(metric: string): "default" | "secondary" | "destructive" | "outline" {
  return "secondary";
}

/**
 * Get the color class for a metric
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 * @param metric - Metric code
 * @returns "bg-gray-100 text-gray-800" (fallback behavior after removing hardcoded definitions)
 */
export function getMetricColor(metric: string): string {
  return "bg-gray-100 text-gray-800";
}

/**
 * Get the units for a metric
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 * @param metric - Metric code
 * @returns Empty string (fallback behavior after removing hardcoded definitions)
 */
export function getMetricUnits(metric: string): string {
  return "";
}

/**
 * Get the icon for a metric
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 * @param metric - Metric code
 * @returns Clock icon (fallback behavior after removing hardcoded definitions)
 */
export function getMetricIcon(metric: string) {
  return Clock;
}

/**
 * Format a metric value
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 * @param metric - Metric code
 * @param value - The value to format
 * @returns Plain number string (fallback behavior after removing hardcoded definitions)
 */
export function formatMetricValue(metric: string, value: number): string {
  return `${value}`;
}