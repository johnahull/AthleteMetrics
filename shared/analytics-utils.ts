/**
 * Analytics Utility Functions
 * Robust statistical calculations with proper error handling and validation
 */

import type { StatisticalSummary, ChartDataPoint } from './analytics-types';
import { METRIC_CONFIG } from './analytics-types';

/**
 * Validates that input values are valid numbers
 */
function validateNumbers(values: number[]): number[] {
  return values.filter(val =>
    typeof val === 'number' &&
    !isNaN(val) &&
    isFinite(val)
  );
}

/**
 * Safely calculates percentile from sorted array
 */
function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (percentile / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Calculates robust statistical summary with error handling
 */
export function calculateStatistics(values: number[]): StatisticalSummary {
  const validValues = validateNumbers(values);
  const count = validValues.length;

  // Handle empty dataset
  if (count === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      std: 0,
      variance: 0,
      percentiles: {
        p5: 0, p10: 0, p25: 0, p50: 0,
        p75: 0, p90: 0, p95: 0
      }
    };
  }

  // Handle single value
  if (count === 1) {
    const value = validValues[0];
    return {
      count: 1,
      mean: value,
      median: value,
      min: value,
      max: value,
      std: 0,
      variance: 0,
      percentiles: {
        p5: value, p10: value, p25: value, p50: value,
        p75: value, p90: value, p95: value
      }
    };
  }

  // Calculate basic statistics
  const sum = validValues.reduce((acc, val) => acc + val, 0);
  const mean = sum / count;
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);

  // Calculate variance and standard deviation
  const variance = validValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
  const std = Math.sqrt(variance);

  // Sort for percentile calculations
  const sortedValues = [...validValues].sort((a, b) => a - b);
  const median = calculatePercentile(sortedValues, 50);

  return {
    count,
    mean,
    median,
    min,
    max,
    std,
    variance,
    percentiles: {
      p5: calculatePercentile(sortedValues, 5),
      p10: calculatePercentile(sortedValues, 10),
      p25: calculatePercentile(sortedValues, 25),
      p50: median,
      p75: calculatePercentile(sortedValues, 75),
      p90: calculatePercentile(sortedValues, 90),
      p95: calculatePercentile(sortedValues, 95)
    }
  };
}

/**
 * Gets the best performance value based on metric configuration
 */
export function getBestPerformanceValue(metric: string, stats: StatisticalSummary): number {
  if (stats.count === 0) return 0;

  const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
  return metricConfig?.lowerIsBetter ? stats.min : stats.max;
}

/**
 * Filters data to best measurements per athlete (for 'best' data type)
 * Uses metric configuration to determine what "best" means
 */
export function filterToBestMeasurements(data: ChartDataPoint[]): ChartDataPoint[] {
  if (data.length === 0) return [];

  const grouped = data.reduce((acc, point) => {
    const key = `${point.athleteId}-${point.metric}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(point);
    return acc;
  }, {} as Record<string, ChartDataPoint[]>);

  return Object.values(grouped).map(athleteMetricData => {
    if (athleteMetricData.length === 0) return athleteMetricData[0]; // Should not happen

    const metric = athleteMetricData[0].metric;
    const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];

    if (metricConfig?.lowerIsBetter) {
      // Find minimum value (best time)
      return athleteMetricData.reduce((best, current) =>
        current.value < best.value ? current : best
      );
    } else {
      // Find maximum value (best performance)
      return athleteMetricData.reduce((best, current) =>
        current.value > best.value ? current : best
      );
    }
  });
}

/**
 * Filters data to best measurements per athlete per date (for 'trends' data type)
 */
export function filterToBestMeasurementsPerDate(data: ChartDataPoint[]): ChartDataPoint[] {
  if (data.length === 0) return [];

  const grouped = data.reduce((acc, point) => {
    const date = point.date instanceof Date ? point.date : new Date(point.date);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `${point.athleteId}-${point.metric}-${dateStr}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(point);
    return acc;
  }, {} as Record<string, ChartDataPoint[]>);

  return Object.values(grouped).map(athleteMetricDateData => {
    if (athleteMetricDateData.length === 0) return athleteMetricDateData[0]; // Should not happen

    const metric = athleteMetricDateData[0].metric;
    const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];

    if (metricConfig?.lowerIsBetter) {
      // Find minimum value (best time) for this date
      return athleteMetricDateData.reduce((best, current) =>
        current.value < best.value ? current : best
      );
    } else {
      // Find maximum value (best performance) for this date
      return athleteMetricDateData.reduce((best, current) =>
        current.value > best.value ? current : best
      );
    }
  });
}

/**
 * Validates and normalizes date inputs for consistent handling
 */
export function validateAndNormalizeDate(date: string | Date | undefined): Date | null {
  if (!date) return null;

  try {
    const parsedDate = typeof date === 'string' ? new Date(date) : date;

    // Check if date is valid
    if (isNaN(parsedDate.getTime())) {
      return null;
    }

    // Return date with time set to start of day in UTC
    return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
  } catch {
    return null;
  }
}

/**
 * Calculates date range based on period type with timezone safety
 */
export function calculateDateRange(period: string, customStart?: Date, customEnd?: Date): {
  startDate: Date | null;
  endDate: Date;
} {
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of today in local time
  let startDate: Date | null = null;

  switch (period) {
    case 'last_7_days':
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'last_30_days':
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30);
      break;
    case 'last_90_days':
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 90);
      break;
    case 'this_year':
      startDate = new Date(endDate.getFullYear(), 0, 1);
      break;
    case 'custom':
      startDate = validateAndNormalizeDate(customStart);
      const customEndNormalized = validateAndNormalizeDate(customEnd);
      return {
        startDate,
        endDate: customEndNormalized || endDate
      };
    case 'all_time':
    default:
      // Set earliest date to January 1, 2020 for all time
      startDate = new Date(2020, 0, 1);
      break;
  }

  return { startDate, endDate };
}

/**
 * Formats date for database queries (YYYY-MM-DD)
 */
export function formatDateForDatabase(date: Date): string {
  return date.getFullYear() + '-' +
         String(date.getMonth() + 1).padStart(2, '0') + '-' +
         String(date.getDate()).padStart(2, '0');
}

/**
 * Validates analytics filter inputs
 */
export function validateAnalyticsFilters(filters: any): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate organization ID
  if (!filters.organizationId || typeof filters.organizationId !== 'string') {
    errors.push('Organization ID is required and must be a string');
  }

  // Validate birth years
  if (filters.birthYearFrom !== undefined) {
    const yearFrom = Number(filters.birthYearFrom);
    if (isNaN(yearFrom) || yearFrom < 1900 || yearFrom > new Date().getFullYear()) {
      errors.push('Birth year from must be a valid year between 1900 and current year');
    }
  }

  if (filters.birthYearTo !== undefined) {
    const yearTo = Number(filters.birthYearTo);
    if (isNaN(yearTo) || yearTo < 1900 || yearTo > new Date().getFullYear()) {
      errors.push('Birth year to must be a valid year between 1900 and current year');
    }
  }

  if (filters.birthYearFrom && filters.birthYearTo &&
      Number(filters.birthYearFrom) > Number(filters.birthYearTo)) {
    errors.push('Birth year from cannot be greater than birth year to');
  }

  // Validate team IDs
  if (filters.teams && !Array.isArray(filters.teams)) {
    errors.push('Teams filter must be an array');
  }

  // Validate genders
  if (filters.genders && !Array.isArray(filters.genders)) {
    errors.push('Genders filter must be an array');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}