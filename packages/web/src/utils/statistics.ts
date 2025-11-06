/**
 * Statistics calculation utilities for athletic performance data
 * Provides descriptive statistics for measurements
 */

export interface Statistics {
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  q1: number; // 25th percentile
  q3: number; // 75th percentile
  iqr: number; // Interquartile Range (Q3 - Q1)
}

/**
 * Calculate comprehensive statistics for a dataset
 * Handles edge cases: empty arrays, single values, small datasets
 *
 * @param values - Array of numeric values
 * @returns Statistics object with all calculated metrics
 */
export function calculateStatistics(values: number[]): Statistics {
  // Handle empty array
  if (values.length === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
    };
  }

  // Sort values for quartile calculation
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;

  // Calculate basic statistics
  const min = sorted[0];
  const max = sorted[count - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = sum / count;

  // Handle single value
  if (count === 1) {
    return {
      count: 1,
      mean,
      median: sorted[0],
      stdDev: 0,
      min: sorted[0],
      max: sorted[0],
      q1: sorted[0],
      q3: sorted[0],
      iqr: 0,
    };
  }

  // Calculate standard deviation
  const squaredDiffs = sorted.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / count;
  const stdDev = Math.sqrt(variance);

  // Calculate median
  let median: number;
  if (count % 2 === 0) {
    // Even number of values: average of middle two
    median = (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
  } else {
    // Odd number of values: middle value
    median = sorted[Math.floor(count / 2)];
  }

  // Handle two values
  if (count === 2) {
    return {
      count: 2,
      mean,
      median,
      stdDev,
      min,
      max,
      q1: min,
      q3: max,
      iqr: max - min,
    };
  }

  // Calculate quartiles using median-inclusive method
  // This aligns with the boxPlotStatistics.ts implementation
  const q1Index = Math.max(0, Math.ceil(count * 0.25) - 1);
  const q3Index = Math.max(0, Math.ceil(count * 0.75) - 1);

  const q1 = sorted[Math.min(q1Index, count - 1)];
  const q3 = sorted[Math.min(q3Index, count - 1)];
  const iqr = q3 - q1;

  return {
    count,
    mean,
    median,
    stdDev,
    min,
    max,
    q1,
    q3,
    iqr,
  };
}

/**
 * Helper to determine if a metric is "lower is better" (e.g., times)
 * vs "higher is better" (e.g., vertical jump)
 */
export function isLowerBetter(metric: string): boolean {
  const lowerBetterMetrics = [
    'FLY10_TIME',
    'AGILITY_505',
    'AGILITY_5105',
    'T_TEST',
    'DASH_40YD',
  ];
  return lowerBetterMetrics.includes(metric);
}
