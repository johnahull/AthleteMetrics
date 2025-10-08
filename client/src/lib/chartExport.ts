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
        'Metric': point.metric,
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
 */
function convertMultiMetricDataToCSV(multiMetric: MultiMetricData[]): string {
  const rows: any[] = [];

  multiMetric.forEach(athlete => {
    const row: any = {
      'Athlete ID': athlete.athleteId,
      'Athlete Name': athlete.athleteName,
      'Team': athlete.teamName || ''
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

  try {
    // Dynamically import html2canvas
    const html2canvas = (await import('html2canvas')).default;

    // Capture the entire container
    const canvas = await html2canvas(containerElement, {
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

  try {
    // Dynamically import html2canvas
    const html2canvas = (await import('html2canvas')).default;

    // Capture the entire container
    const canvas = await html2canvas(containerElement, {
      backgroundColor: '#ffffff',
      scale: 2, // Higher quality
      logging: false,
      useCORS: true
    });

    // Convert canvas to blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
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
  }
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
    .join('_')
    .replace(/\s+/g, '_');

  const chartTypeName = chartType.replace(/_/g, '-');

  const extension = format === 'csv' ? 'csv' : 'png';
  const viewType = 'chart';

  return `analytics_${chartTypeName}_${metricLabels}_${viewType}_${timestamp}.${extension}`;
}
