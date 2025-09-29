/**
 * Shared statistical utility functions
 * Provides common statistical calculations used across analytics features
 */

/**
 * Calculate percentile from a sorted array
 * @param arr - Sorted array of numbers
 * @param p - Percentile (0-100)
 * @returns The value at the given percentile
 */
export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;

  const index = (p / 100) * (arr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (upper >= arr.length) return arr[arr.length - 1];
  if (lower === upper) return arr[lower];

  return arr[lower] * (upper - index) + arr[upper] * (index - lower);
}

/**
 * Calculate comprehensive statistical summary for a dataset
 * @param values - Array of numeric values
 * @returns Object containing statistical measures
 */
export function calculateStats(values: number[]): {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  count: number;
  std: number;
} {
  if (values.length === 0) {
    return {
      min: 0,
      q1: 0,
      median: 0,
      q3: 0,
      max: 0,
      mean: 0,
      count: 0,
      std: 0
    };
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const q1 = percentile(sortedValues, 25);
  const median = percentile(sortedValues, 50);
  const q3 = percentile(sortedValues, 75);
  const min = Math.min(...sortedValues);
  const max = Math.max(...sortedValues);
  const mean = sortedValues.reduce((a, b) => a + b, 0) / sortedValues.length;
  const count = sortedValues.length;
  const std = Math.sqrt(
    sortedValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / sortedValues.length
  );

  return { min, q1, median, q3, max, mean, count, std };
}

/**
 * Calculate interquartile range (IQR)
 * @param values - Array of numeric values
 * @returns The IQR (Q3 - Q1)
 */
export function calculateIQR(values: number[]): number {
  if (values.length === 0) return 0;

  const sortedValues = [...values].sort((a, b) => a - b);
  const q1 = percentile(sortedValues, 25);
  const q3 = percentile(sortedValues, 75);

  return q3 - q1;
}

/**
 * Calculate standard deviation
 * @param values - Array of numeric values
 * @param mean - Optional pre-calculated mean (for performance)
 * @returns Standard deviation
 */
export function calculateStdDev(values: number[], mean?: number): number {
  if (values.length === 0) return 0;

  const avg = mean ?? values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;

  return Math.sqrt(variance);
}

/**
 * Calculate z-score for a value in a dataset
 * @param value - The value to calculate z-score for
 * @param mean - Mean of the dataset
 * @param stdDev - Standard deviation of the dataset
 * @returns Z-score
 */
export function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Detect outliers using IQR method
 * @param values - Array of numeric values
 * @param multiplier - IQR multiplier for outlier detection (default: 1.5)
 * @returns Array of outlier values
 */
export function detectOutliers(values: number[], multiplier: number = 1.5): number[] {
  if (values.length === 0) return [];

  const sortedValues = [...values].sort((a, b) => a - b);
  const q1 = percentile(sortedValues, 25);
  const q3 = percentile(sortedValues, 75);
  const iqr = q3 - q1;

  const lowerBound = q1 - multiplier * iqr;
  const upperBound = q3 + multiplier * iqr;

  return values.filter(v => v < lowerBound || v > upperBound);
}