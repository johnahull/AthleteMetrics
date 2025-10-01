import type {
  ChartDataPoint,
  ChartType,
  TrendData,
  MultiMetricData
} from '@shared/analytics-types';

/**
 * Determines which data to pass to a chart based on its type.
 * Centralizes the logic for data selection across ChartContainer and FullscreenChartDialog.
 *
 * @param chartType - The type of chart being rendered
 * @param data - Standard chart data points
 * @param trends - Trend data for time-series charts
 * @param multiMetric - Multi-metric data for radar charts
 * @returns The appropriate data for the given chart type
 */
export function getChartDataForType(
  chartType: ChartType,
  data: ChartDataPoint[],
  trends?: TrendData[],
  multiMetric?: MultiMetricData[]
): ChartDataPoint[] | TrendData[] | MultiMetricData[] {
  switch (chartType) {
    case 'line_chart':
    case 'multi_line':
    case 'connected_scatter':
    case 'time_series_box_swarm':
      return trends || [];
    case 'radar_chart':
      // For radar charts, prefer multiMetric data but fall back to standard data
      return multiMetric && multiMetric.length > 0 ? multiMetric : data;
    default:
      return data;
  }
}
