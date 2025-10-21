import type { BoxPlotStatistics } from '../types/timeSeriesChartTypes';

/**
 * Calculate box plot statistics with proper quartile calculation
 * Fixes potential array bounds issues for small datasets
 */
export function calculateBoxPlotStatistics(values: number[]): BoxPlotStatistics {
  if (values.length === 0) {
    throw new Error('Cannot calculate box plot statistics for empty array');
  }

  // Sort values to ensure proper quartile calculation
  const sortedValues = [...values].sort((a, b) => a - b);
  const length = sortedValues.length;

  // Handle edge cases for small datasets
  if (length === 1) {
    const value = sortedValues[0];
    return {
      min: value,
      max: value,
      q1: value,
      median: value,
      q3: value,
      mean: value
    };
  }

  if (length === 2) {
    const [min, max] = sortedValues;
    const mean = (min + max) / 2;
    return {
      min,
      max,
      q1: min,
      median: mean,
      q3: max,
      mean
    };
  }

  // Proper quartile calculation for larger datasets
  const q1Index = Math.max(0, Math.ceil(length * 0.25) - 1);
  const medianIndex = Math.max(0, Math.ceil(length * 0.5) - 1);
  const q3Index = Math.max(0, Math.ceil(length * 0.75) - 1);

  // Ensure indices are within bounds
  const safeQ1Index = Math.min(q1Index, length - 1);
  const safeMedianIndex = Math.min(medianIndex, length - 1);
  const safeQ3Index = Math.min(q3Index, length - 1);

  const min = sortedValues[0];
  const max = sortedValues[length - 1];
  const q1 = sortedValues[safeQ1Index];
  const median = sortedValues[safeMedianIndex];
  const q3 = sortedValues[safeQ3Index];
  const mean = sortedValues.reduce((sum, val) => sum + val, 0) / length;

  return {
    min,
    max,
    q1,
    median,
    q3,
    mean
  };
}

/**
 * Safely parse date with fallback handling
 * Addresses date handling inconsistency concerns
 */
export function safeParseDate(date: Date | string | number): Date {
  if (date instanceof Date) {
    return isNaN(date.getTime()) ? new Date() : date;
  }

  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Generate deterministic jitter for athlete points
 * Replaces Math.random() to prevent points jumping on re-render
 */
export function generateDeterministicJitter(athleteId: string, jitterRange: number): number {
  const hash = athleteId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return ((hash % 100) / 100 - 0.5) * jitterRange;
}