// Utility functions for measurement metrics

/**
 * Join a value and its unit for display: "2.34 s", "28 in", "99.14%".
 * %, inch (") and foot (') marks attach without a space; no unit gives the bare value.
 */
export function formatValueWithUnit(value: string | number, unit?: string | null): string {
  if (!unit || `${value}`.trim() === '') return `${value}`;
  return /^[%"']/.test(unit) ? `${value}${unit}` : `${value} ${unit}`;
}
