/**
 * Kernel Density Estimation (KDE) utilities for violin plots
 * Implements Gaussian kernel with Silverman's rule of thumb for bandwidth selection
 */

import { percentile, calculateStdDev } from '@shared/utils/statistics';
import { devLog } from '@/utils/dev-logger';
import type { KDEPoint } from '../types/violin';

/** Maximum sample size for KDE calculation (performance optimization) */
const MAX_SAMPLE_SIZE = 1000;

/** Number of points to generate for the density curve */
const DENSITY_CURVE_POINTS = 200;

/**
 * Calculates kernel density estimation for violin plot visualization
 * Uses Gaussian kernel with Silverman's rule of thumb for bandwidth selection
 *
 * @param values - Array of measurement values
 * @param bandwidth - Optional manual bandwidth (default: auto-calculated using Silverman's rule)
 * @returns Array of {x, y} points representing the density curve
 *
 * @example
 * ```ts
 * const times = [1.5, 1.6, 1.7, 1.8];
 * const density = calculateKDE(times);
 * // Returns [{x: 1.4, y: 0.1}, {x: 1.45, y: 0.2}, ...]
 * ```
 */
export function calculateKDE(values: number[], bandwidth?: number): KDEPoint[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  // Handle edge case where all values are the same
  if (range === 0) {
    return createSingleValueKDE(min);
  }

  // For large datasets (>1000 points), use stratified sampling
  const sampledValues = sampleDataset(values);

  // Calculate optimal bandwidth using Silverman's rule
  const optimalBandwidth = bandwidth ?? calculateSilvermanBandwidth(sampledValues, range);

  devLog.log('KDE calculation', {
    valuesCount: sampledValues.length,
    min,
    max,
    range,
    bandwidth: optimalBandwidth
  });

  // Generate density curve points
  const kde = generateDensityCurve(sampledValues, optimalBandwidth, min, max);

  devLog.log('KDE results', {
    kdePoints: kde.length,
    densityRange: kde.length > 0 ? [Math.min(...kde.map(p => p.y)), Math.max(...kde.map(p => p.y))] : [0, 0]
  });

  return kde.length > 0 ? kde : [{ x: min, y: 1 }];
}

/**
 * Create a narrow bell curve for datasets with zero range (all values identical)
 * @param center - The single value in the dataset
 * @returns KDE points forming a bell curve
 */
function createSingleValueKDE(center: number): KDEPoint[] {
  const artificialBandwidth = Math.abs(center) * 0.1 || 1;
  const kde: KDEPoint[] = [];

  for (let i = -50; i <= 50; i++) {
    const x = center + (i / 50) * artificialBandwidth;
    const u = i / 50;
    const density = Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
    kde.push({ x, y: density });
  }

  return kde;
}

/**
 * Apply stratified sampling to large datasets for performance
 * Preserves distribution characteristics while reducing computational cost
 *
 * @param values - Original dataset
 * @returns Sampled dataset (up to MAX_SAMPLE_SIZE points)
 */
function sampleDataset(values: number[]): number[] {
  if (values.length <= MAX_SAMPLE_SIZE) {
    return values;
  }

  // Stratified sampling to preserve distribution
  const step = Math.floor(values.length / MAX_SAMPLE_SIZE);
  const sampled = values.filter((_, i) => i % step === 0).slice(0, MAX_SAMPLE_SIZE);

  devLog.log('KDE: Using sampling for large dataset', {
    original: values.length,
    sampled: sampled.length
  });

  return sampled;
}

/**
 * Calculate optimal bandwidth using Silverman's rule of thumb
 * Formula: 0.9 * min(std, IQR/1.34) * n^(-1/5)
 *
 * @param values - Sampled dataset values
 * @param range - Range of the data (max - min)
 * @returns Optimal bandwidth for kernel smoothing
 */
function calculateSilvermanBandwidth(values: number[], range: number): number {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = calculateStdDev(values, mean);
  const sortedValues = [...values].sort((a, b) => a - b);
  const iqr = percentile(sortedValues, 75) - percentile(sortedValues, 25);

  // Silverman's rule of thumb
  let bandwidth = 0.9 * Math.min(std, iqr / 1.34) * Math.pow(n, -0.2);

  // Ensure bandwidth is valid and reasonable
  if (!isFinite(bandwidth) || bandwidth <= 0) {
    bandwidth = range * 0.1; // Fallback to 10% of range
  }

  // Make sure bandwidth is not too small
  bandwidth = Math.max(bandwidth, range * 0.05);

  return bandwidth;
}

/**
 * Generate density curve points using Gaussian kernel
 * Optimized with early exit for values >3 standard deviations away
 *
 * @param values - Sampled dataset
 * @param bandwidth - Kernel bandwidth
 * @param min - Minimum value in dataset
 * @param max - Maximum value in dataset
 * @returns Array of KDE points
 */
function generateDensityCurve(
  values: number[],
  bandwidth: number,
  min: number,
  max: number
): KDEPoint[] {
  const kde: KDEPoint[] = [];

  // Extend range by 2 * bandwidth for better visualization
  const extendedMin = min - bandwidth * 2;
  const extendedMax = max + bandwidth * 2;
  const extendedRange = extendedMax - extendedMin;
  const adjustedStep = extendedRange / DENSITY_CURVE_POINTS;

  // Pre-calculate constants for performance
  const gaussianNorm = 1 / Math.sqrt(2 * Math.PI);
  const denominator = values.length * bandwidth;

  for (let x = extendedMin; x <= extendedMax; x += adjustedStep) {
    let density = 0;

    // Calculate density at this point
    for (const value of values) {
      // Gaussian kernel
      const u = (x - value) / bandwidth;

      // Optimization: skip values that contribute negligibly (>3 standard deviations)
      if (Math.abs(u) > 3) continue;

      density += Math.exp(-0.5 * u * u) * gaussianNorm;
    }

    density = density / denominator;

    // Ensure density is a valid number
    if (isFinite(density)) {
      kde.push({ x, y: density });
    }
  }

  return kde;
}

/**
 * Calculate bandwidth using Scott's rule (alternative to Silverman's)
 * Formula: std * n^(-1/5)
 *
 * @param values - Dataset values
 * @returns Bandwidth calculated using Scott's rule
 */
export function calculateScottBandwidth(values: number[]): number {
  if (values.length === 0) return 1;

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = calculateStdDev(values, mean);

  return std * Math.pow(n, -0.2);
}