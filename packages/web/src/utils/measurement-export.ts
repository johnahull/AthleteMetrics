/**
 * Measurement export utilities
 *
 * Provides CSV export functionality for athlete measurements.
 */

import type { Measurement } from '@shared/schema';
import { getMetricDisplayName } from '@/constants/metrics';

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
 * @returns CSV string with headers and data rows
 */
export function measurementsToCSVString(measurements: Measurement[]): string {
  const headers = 'Date,Metric,Value,Units,Status,Season,Team,Notes';

  if (measurements.length === 0) {
    return headers;
  }

  const rows = measurements.map(measurement => {
    const metricName = getMetricDisplayName(measurement.metric);
    const status = measurement.isVerified ? 'Verified' : 'Unverified';
    const season = measurement.season || '';
    const team = measurement.teamNameSnapshot || '';
    const notes = escapeCSVField(measurement.notes);

    return [
      measurement.date,
      metricName,
      measurement.value,
      measurement.units,
      status,
      season,
      team,
      notes,
    ].join(',');
  });

  return [headers, ...rows].join('\n');
}

/**
 * Export measurements to CSV file and trigger download
 * @param measurements - Array of measurements to export
 * @param filename - Optional filename (default: "measurements-YYYY-MM-DD.csv")
 */
export function exportMeasurementsToCSV(
  measurements: Measurement[],
  filename?: string
): void {
  // Generate default filename with current date
  const defaultFilename = `measurements-${new Date().toISOString().split('T')[0]}.csv`;
  const finalFilename = filename || defaultFilename;

  // Convert measurements to CSV string
  const csvContent = measurementsToCSVString(measurements);

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
