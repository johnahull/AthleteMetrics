/**
 * Chart Export Utilities
 * Functions for exporting charts as CSV data or PNG images
 */

import { downloadCSV, arrayToCSV } from './csv';
import type {
  ChartDataPoint,
  TrendData,
  MultiMetricData,
  AnalyticsResponse
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

export type ExportFormat = 'csv' | 'png' | 'clipboard';

/**
 * Export analytics data as CSV
 */
export function exportAnalyticsDataAsCSV(
  analyticsData: AnalyticsResponse,
  chartType: string,
  metrics: { primary: string; additional: string[] }
): void {
  const timestamp = new Date().toISOString().split('T')[0];
  const metricLabels = [metrics.primary, ...metrics.additional]
    .map(m => METRIC_CONFIG[m as keyof typeof METRIC_CONFIG]?.label || m)
    .join('_');

  const filename = `analytics_${chartType}_${metricLabels}_${timestamp}.csv`;

  // Determine which data structure to export based on what's available
  if (analyticsData.data && analyticsData.data.length > 0) {
    // Export chart data points
    const csvData = convertChartDataPointsToCSV(analyticsData.data);
    downloadCSV(csvData, filename);
  } else if (analyticsData.trends && analyticsData.trends.length > 0) {
    // Export trend data
    const csvData = convertTrendDataToCSV(analyticsData.trends);
    downloadCSV(csvData, filename);
  } else if (analyticsData.multiMetric && analyticsData.multiMetric.length > 0) {
    // Export multi-metric data
    const csvData = convertMultiMetricDataToCSV(analyticsData.multiMetric);
    downloadCSV(csvData, filename);
  } else {
    console.warn('No data available to export');
  }
}

/**
 * Convert ChartDataPoint[] to CSV
 */
function convertChartDataPointsToCSV(data: ChartDataPoint[]): string {
  const rows = data.map(point => ({
    'Athlete ID': point.athleteId,
    'Athlete Name': point.athleteName,
    'Team': point.teamName || '',
    'Metric': point.metric,
    'Value': point.value,
    'Date': point.date instanceof Date
      ? point.date.toISOString().split('T')[0]
      : new Date(point.date).toISOString().split('T')[0],
    'Grouping': point.grouping || ''
  }));

  return arrayToCSV(rows);
}

/**
 * Convert TrendData[] to CSV
 */
function convertTrendDataToCSV(trends: TrendData[]): string {
  const rows: any[] = [];

  trends.forEach(trend => {
    trend.data.forEach(point => {
      rows.push({
        'Athlete ID': trend.athleteId,
        'Athlete Name': trend.athleteName,
        'Team': trend.teamName || '',
        'Metric': trend.metric,
        'Value': point.value,
        'Date': point.date instanceof Date
          ? point.date.toISOString().split('T')[0]
          : new Date(point.date).toISOString().split('T')[0]
      });
    });
  });

  return arrayToCSV(rows);
}

/**
 * Convert MultiMetricData[] to CSV
 * Note: MultiMetricData structure only includes athleteId, athleteName, and metrics.
 * It does not include team information, unlike ChartDataPoint and TrendData.
 */
function convertMultiMetricDataToCSV(multiMetric: MultiMetricData[]): string {
  const rows: any[] = [];

  multiMetric.forEach(athlete => {
    const row: any = {
      'Athlete ID': athlete.athleteId,
      'Athlete Name': athlete.athleteName
    };

    // Add each metric as a column
    Object.entries(athlete.metrics).forEach(([metric, value]) => {
      const metricLabel = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;
      row[metricLabel] = value;
    });

    rows.push(row);
  });

  return arrayToCSV(rows);
}

/**
 * Export chart as PNG image
 * Uses html2canvas to capture the entire container
 */
export async function exportChartAsPNG(
  containerElement: HTMLElement | null,
  filename: string
): Promise<void> {
  if (!containerElement) {
    console.warn('No container element available for export');
    return;
  }

  let canvas: HTMLCanvasElement | null = null;

  try {
    // Dynamically import html2canvas
    const html2canvas = (await import('html2canvas')).default;

    // Capture the entire container
    canvas = await html2canvas(containerElement, {
      backgroundColor: '#ffffff',
      scale: 2, // Higher quality
      logging: false,
      useCORS: true
    });

    // Convert to blob and download
    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Failed to create image blob');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  } catch (error) {
    console.error('Error exporting chart as PNG:', error);
  } finally {
    // Clean up canvas to free memory
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
    }
  }
}

/**
 * Copy chart to clipboard as image
 * Uses html2canvas to capture and Clipboard API to copy
 */
export async function copyChartToClipboard(
  containerElement: HTMLElement | null
): Promise<void> {
  if (!containerElement) {
    console.warn('No container element available for clipboard copy');
    return;
  }

  // Check if Clipboard API is available
  if (!navigator.clipboard || !navigator.clipboard.write) {
    console.error('Clipboard API not available. Requires HTTPS or localhost.');
    return;
  }

  let canvas: HTMLCanvasElement | null = null;

  try {
    // Dynamically import html2canvas
    const html2canvas = (await import('html2canvas')).default;

    // Capture the entire container
    canvas = await html2canvas(containerElement, {
      backgroundColor: '#ffffff',
      scale: 2, // Higher quality
      logging: false,
      useCORS: true
    });

    // Convert canvas to blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas!.toBlob(resolve, 'image/png');
    });

    if (!blob) {
      console.error('Failed to create image blob for clipboard');
      return;
    }

    // Copy to clipboard using Clipboard API
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob
      })
    ]);

    console.log('Chart copied to clipboard successfully');
  } catch (error) {
    console.error('Error copying chart to clipboard:', error);
  } finally {
    // Clean up canvas to free memory
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
    }
  }
}

/**
 * Sanitize a filename to prevent path traversal and injection attacks
 * @param filename - The filename to sanitize
 * @returns Sanitized filename safe for file download
 */
function sanitizeFilename(filename: string): string {
  const sanitized = filename
    // Remove path traversal sequences
    .replace(/\.\./g, '')
    // Remove path separators
    .replace(/[/\\]/g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters (ASCII 0-31)
    .replace(/[\x00-\x1F]/g, '')
    // Replace whitespace with underscores
    .replace(/\s+/g, '_')
    // Remove other potentially dangerous characters
    .replace(/[<>:"|?*]/g, '')
    // Limit to alphanumeric, underscore, hyphen, and dot
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    // Prevent hidden files
    .replace(/^\.+/, '')
    // Collapse multiple underscores
    .replace(/_+/g, '_')
    // Trim underscores from start and end
    .replace(/^_+|_+$/g, '');

  // Enforce 200 char limit (255 is OS limit, leave room for extension)
  const MAX_LENGTH = 200;
  return sanitized.length > MAX_LENGTH
    ? sanitized.substring(0, MAX_LENGTH)
    : sanitized;
}

/**
 * Generate appropriate filename for export
 */
export function generateExportFilename(
  chartType: string,
  metrics: { primary: string; additional: string[] },
  format: ExportFormat
): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const metricLabels = [metrics.primary, ...metrics.additional]
    .map(m => METRIC_CONFIG[m as keyof typeof METRIC_CONFIG]?.label || m)
    .join('_');

  const chartTypeName = chartType.replace(/_/g, '-');

  const extension = format === 'csv' ? 'csv' : 'png';
  const viewType = 'chart';

  const rawFilename = `analytics_${chartTypeName}_${metricLabels}_${viewType}_${timestamp}.${extension}`;

  return sanitizeFilename(rawFilename);
}
