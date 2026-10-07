/**
 * Metric-aware measurement value validation.
 *
 * Most metrics (times, distances, loads) only make sense as positive numbers.
 * Movement Quality (MQ) metrics are the only exception (AM-FEAT-015): their
 * 0-3 ordinal scores use 0 for "Absent", so an MQ metric whose site_metrics
 * validation_min is <= 0 gets a range check instead: 0 is allowed and the value
 * must sit within [validation_min, validation_max].
 * Every other metric keeps the strict "> 0" rule with no upper-bound check, even
 * when its site_metrics row has validation_min = 0 (e.g. RSI_L, COND_YYIR1_DISTANCE),
 * so existing metrics behave exactly as before (spec criterion 6).
 */
import { isMovementQualityMetric } from './peer-comparison-exclusions';

export interface MetricValueBounds {
  validationMin?: number | string | null;
  validationMax?: number | string | null;
  decimalPrecision?: number | null;
}

/** Field-shaped validation error so routes can answer 400 { message, field: 'value' } */
export class MeasurementValueValidationError extends Error {
  readonly field = 'value';

  constructor(message: string) {
    super(message);
    this.name = 'MeasurementValueValidationError';
  }
}

// Plain decimal notation only: rejects '', whitespace-only, hex ('0x3'), exponents, 'Infinity'
const DECIMAL_STRING = /^-?(\d+(\.\d*)?|\.\d+)$/;

const toNumber = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * @returns an error message, or null when the value is acceptable
 */
export function validateMeasurementValue(
  rawValue: number | string,
  bounds: MetricValueBounds | null | undefined,
  metricCode: string,
): string | null {
  // Callers outside the Zod-validated routes may pass numeric strings (e.g. '1.45')
  let value: number;
  if (typeof rawValue === 'number') {
    value = rawValue;
  } else {
    const trimmed = String(rawValue).trim();
    if (!DECIMAL_STRING.test(trimmed)) return 'Value must be a finite number';
    value = Number(trimmed);
  }
  if (!Number.isFinite(value)) return 'Value must be a finite number';

  const min = toNumber(bounds?.validationMin);
  if (!isMovementQualityMetric(metricCode) || min === null || min > 0) {
    return value > 0 ? null : 'Value must be positive';
  }

  if (value < min) return `Value must be at least ${min}`;
  const max = toNumber(bounds?.validationMax);
  if (max !== null && value > max) return `Value must be at most ${max}`;
  if (bounds?.decimalPrecision === 0 && !Number.isInteger(value)) {
    return 'Value must be a whole number';
  }
  return null;
}
