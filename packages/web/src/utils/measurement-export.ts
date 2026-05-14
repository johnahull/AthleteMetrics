/**
 * Measurement export utilities
 *
 * Provides CSV export functionality for athlete measurements.
 */

import type { Measurement } from '@shared/schema';

/**
 * Escape CSV field value
 * Wraps value in quotes if it contains comma, quote, or newline
 * Escapes internal quotes by doubling them
 * Prevents CSV injection by escaping formula characters
 */
function escapeCSVField(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }

  const stringValue = String(value);

  // Prevent CSV injection by escaping values that start with formula characters
  // When Excel/Sheets see =, +, -, @, \t, \r at the start, they may execute as formulas
  const formulaChars = ['=', '+', '-', '@', '\t', '\r'];
  if (formulaChars.some(char => stringValue.startsWith(char))) {
    // Prefix with single quote to force text interpretation, then wrap in quotes
    return `"'${stringValue.replace(/"/g, '""')}"`;
  }

  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Convert measurements to CSV string
 * @param measurements - Array of measurements to export
 * @param metricLabels - Optional mapping of metric codes to display names.
 *   When provided, codes resolve to labels (e.g. "FLY10_TIME" -> "10-Yard Fly Time").
 *   When omitted or unknown, falls back to the raw metric code.
 * @returns CSV string with headers and data rows
 */
export function measurementsToCSVString(
  measurements: Measurement[],
  metricLabels?: Record<string, string>
): string {
  const headers = 'Date,Metric,Value,Units,Status,Season,Team,Notes';

  if (measurements.length === 0) {
    return headers;
  }

  const rows = measurements.map(measurement => {
    const metricName = metricLabels?.[measurement.metric] ?? measurement.metric;
    const status = measurement.isVerified ? 'Verified' : 'Unverified';
    const season = measurement.season || '';
    const team = measurement.teamNameSnapshot || '';

    // SECURITY: Escape ALL fields to prevent CSV injection and column shifting
    // Even fields that seem safe (date, status) could contain malicious content
    return [
      escapeCSVField(measurement.date),
      escapeCSVField(metricName),
      escapeCSVField(String(measurement.value)),
      escapeCSVField(measurement.units),
      escapeCSVField(status),
      escapeCSVField(season),
      escapeCSVField(team),
      escapeCSVField(measurement.notes),
    ].join(',');
  });

  return [headers, ...rows].join('\n');
}

/**
 * Export measurements to CSV file and trigger download
 * @param measurements - Array of measurements to export
 * @param filename - Optional filename (default: "measurements-YYYY-MM-DD.csv")
 * @param metricLabels - Optional mapping of metric codes to display names.
 *   When provided, codes resolve to labels (e.g. "FLY10_TIME" -> "10-Yard Fly Time").
 *   When omitted or unknown, falls back to the raw metric code.
 */
export function exportMeasurementsToCSV(
  measurements: Measurement[],
  filename?: string,
  metricLabels?: Record<string, string>
): void {
  // Generate default filename with current date
  const defaultFilename = `measurements-${new Date().toISOString().split('T')[0]}.csv`;
  const finalFilename = filename || defaultFilename;

  // Convert measurements to CSV string
  const csvContent = measurementsToCSVString(measurements, metricLabels);

  // Create Blob with CSV content
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = finalFilename;

  // Trigger download
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
