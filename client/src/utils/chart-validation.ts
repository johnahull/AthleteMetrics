/**
 * Chart validation utilities for runtime prop validation
 * Provides defensive programming against invalid chart configurations
 */

import { DEFAULT_SELECTION_COUNT } from './chart-constants';

/**
 * Validation result interface
 */
interface ValidationResult {
  isValid: boolean;
  value: number;
  warnings: string[];
  errors: string[];
}

/**
 * Validate maxAthletes prop with comprehensive error checking
 * @param maxAthletes - The maxAthletes value to validate
 * @param availableAthletes - Number of available athletes for context
 * @returns Validation result with sanitized value
 */
export function validateMaxAthletes(
  maxAthletes: number | undefined,
  availableAthletes: number = 0
): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let value = maxAthletes ?? DEFAULT_SELECTION_COUNT;

  // Check for invalid types
  if (maxAthletes !== undefined && (typeof maxAthletes !== 'number' || isNaN(maxAthletes))) {
    errors.push(`maxAthletes must be a valid number, received: ${typeof maxAthletes}`);
    value = DEFAULT_SELECTION_COUNT;
  }

  // Check for negative values
  if (value < 0) {
    errors.push(`maxAthletes cannot be negative, received: ${value}`);
    value = DEFAULT_SELECTION_COUNT;
  }

  // Check for zero
  if (value === 0) {
    warnings.push('maxAthletes of 0 means no athletes can be selected');
    value = 1; // Minimum of 1 for usability
  }

  // Check for extremely large values
  if (value > 100) {
    warnings.push(`maxAthletes of ${value} is unusually large and may impact performance`);
  }

  // Check against available athletes
  if (availableAthletes > 0 && value > availableAthletes) {
    warnings.push(
      `maxAthletes (${value}) exceeds available athletes (${availableAthletes})`
    );
  }

  // Ensure minimum of 1
  value = Math.max(1, value);

  return {
    isValid: errors.length === 0,
    value,
    warnings,
    errors
  };
}

/**
 * Validate chart data array for common issues
 * @param data - Chart data array to validate
 * @returns Validation result
 */
export function validateChartData<T>(data: T[]): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push('Chart data must be an array');
    return { isValid: false, value: 0, warnings, errors };
  }

  if (data.length === 0) {
    warnings.push('Chart data is empty');
  }

  if (data.length > 10000) {
    warnings.push(`Large dataset detected (${data.length} items) - consider pagination or virtualization`);
  }

  return {
    isValid: errors.length === 0,
    value: data.length,
    warnings,
    errors
  };
}

/**
 * Log validation warnings and errors to console in development
 * @param componentName - Name of the component for context
 * @param result - Validation result to log
 */
export function logValidationResult(componentName: string, result: ValidationResult): void {
  if (process.env.NODE_ENV === 'development') {
    if (result.errors.length > 0) {
      console.error(`[${componentName}] Validation errors:`, result.errors);
    }
    if (result.warnings.length > 0) {
      console.warn(`[${componentName}] Validation warnings:`, result.warnings);
    }
  }
}