/**
 * Metric-aware measurement value validation.
 *
 * Most metrics (times, distances, loads) only make sense as positive numbers.
 * Metrics whose site_metrics.validation_min is <= 0 (e.g. the 0-3 Movement
 * Quality ordinals, where 0 means "Absent") opt in to a range check instead:
 * 0 is allowed and the value must sit within [validation_min, validation_max].
 * Every other metric keeps the strict "> 0" rule with no upper-bound check.
 */
export interface MetricValueBounds {
  validationMin?: number | string | null;
  validationMax?: number | string | null;
  decimalPrecision?: number | null;
}

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
  bounds?: MetricValueBounds | null,
): string | null {
  // Callers outside the Zod-validated routes may pass numeric strings (e.g. '1.45')
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (rawValue === '' || !Number.isFinite(value)) return 'Value must be a finite number';

  const min = toNumber(bounds?.validationMin);
  if (min === null || min > 0) {
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
