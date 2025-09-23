import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AlertTriangle, Download, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '../ErrorBoundary';
import type { 
  ChartDataPoint, 
  ChartConfiguration, 
  ChartType,
  StatisticalSummary,
  TrendData,
  MultiMetricData 
} from '@shared/analytics-types';

// Union type for all possible chart data types
type ChartDataType = ChartDataPoint[] | TrendData[] | MultiMetricData[] | null;

// Type guards for specific chart data types
function isTrendData(data: ChartDataType): data is TrendData[] {
  return data !== null && Array.isArray(data) && data.length > 0 && 'data' in data[0];
}

function isMultiMetricData(data: ChartDataType): data is MultiMetricData[] {
  return data !== null && Array.isArray(data) && data.length > 0 && 'metrics' in data[0];
}

function isChartDataPoints(data: ChartDataType): data is ChartDataPoint[] {
  return data !== null && Array.isArray(data) && (data.length === 0 || 'value' in data[0]);
}

function isValidChartData(data: ChartDataType): data is ChartDataPoint[] | TrendData[] | MultiMetricData[] {
  return data !== null && Array.isArray(data);
}

// Lazy load chart components to reduce bundle size
const BoxPlotChart = React.lazy(() => import('./BoxPlotChart').then(m => ({ default: m.BoxPlotChart })));
const DistributionChart = React.lazy(() => import('./DistributionChart').then(m => ({ default: m.DistributionChart })));
const BarChart = React.lazy(() => import('./BarChart').then(m => ({ default: m.BarChart })));
const LineChart = React.lazy(() => import('./LineChart').then(m => ({ default: m.LineChart })));
const ScatterPlotChart = React.lazy(() => import('./ScatterPlotChart').then(m => ({ default: m.ScatterPlotChart })));
const RadarChart = React.lazy(() => import('./RadarChart').then(m => ({ default: m.RadarChart })));
const SwarmChart = React.lazy(() => import('./SwarmChart').then(m => ({ default: m.SwarmChart })));
const ConnectedScatterChart = React.lazy(() => import('./ConnectedScatterChart').then(m => ({ default: m.ConnectedScatterChart })));
const MultiLineChart = React.lazy(() => import('./MultiLineChart').then(m => ({ default: m.MultiLineChart })));
const TimeSeriesBoxSwarmChart = React.lazy(() => import('./TimeSeriesBoxSwarmChart').then(m => ({ default: m.TimeSeriesBoxSwarmChart })));

interface ChartContainerProps {
  title: string;
  subtitle?: string;
  chartType: ChartType;
  data: ChartDataPoint[];
  trends?: TrendData[];
  multiMetric?: MultiMetricData[];
  statistics?: Record<string, StatisticalSummary>;
  config?: Partial<ChartConfiguration>;
  isLoading?: boolean;
  error?: string;
  highlightAthlete?: string;
  selectedAthleteIds?: string[];
  onAthleteSelectionChange?: (athleteIds: string[]) => void;
  selectedDates?: string[];
  metric?: string;
  onExport?: () => void;
  onFullscreen?: () => void;
  className?: string;
}

export function ChartContainer({
  title,
  subtitle,
  chartType,
  data,
  trends,
  multiMetric,
  statistics,
  config = {},
  isLoading = false,
  error,
  highlightAthlete,
  selectedAthleteIds,
  onAthleteSelectionChange,
  selectedDates,
  metric,
  onExport,
  onFullscreen,
  className
}: ChartContainerProps) {
  // Memoize chart component selection
  const ChartComponent = useMemo(() => {
    switch (chartType) {
      case 'box_plot':
        return BoxPlotChart;
      case 'distribution':
        return DistributionChart;
      case 'bar_chart':
        return BarChart;
      case 'line_chart':
        return LineChart;
      case 'scatter_plot':
        return ScatterPlotChart;
      case 'radar_chart':
        return RadarChart;
      case 'swarm_plot':
        return SwarmChart;
      case 'connected_scatter':
        return ConnectedScatterChart;
      case 'multi_line':
        return MultiLineChart;
      case 'box_swarm_combo':
        return BoxPlotChart; // Composite chart handled within BoxPlotChart
      case 'time_series_box_swarm':
        return TimeSeriesBoxSwarmChart;
      default:
        return null;
    }
  }, [chartType]);

  // Chart configuration with defaults
  const chartConfig: ChartConfiguration = {
    type: chartType,
    title,
    subtitle,
    showLegend: true,
    showTooltips: true,
    responsive: true,
    aspectRatio: 2,
    ...config
  };

  // Determine which data to pass based on chart type
  const chartData = useMemo(() => {
    switch (chartType) {
      case 'line_chart':
      case 'multi_line':
      case 'connected_scatter':
      case 'time_series_box_swarm':
        return trends;
      case 'radar_chart':
        return multiMetric;
      default:
        return data;
    }
  }, [chartType, data, trends, multiMetric]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          {subtitle && <Skeleton className="h-4 w-32" />}
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Chart Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!ChartComponent) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Unsupported Chart Type</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Chart type "{chartType}" is not implemented yet.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!chartData || (Array.isArray(chartData) && chartData.length === 0)) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              No data available for this chart. Try adjusting your filters or date range.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex-1">
          <CardTitle className="text-lg font-medium">{title}</CardTitle>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onExport && (
            <Button
              variant="outline"
              size="icon"
              onClick={onExport}
              title="Export chart"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          {onFullscreen && (
            <Button
              variant="outline"
              size="icon"
              onClick={onFullscreen}
              title="View fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full" style={{ height: chartType === 'connected_scatter' ? '650px' : '500px' }}>
          <ErrorBoundary>
            {isValidChartData(chartData) ? (
              <React.Suspense fallback={<LoadingSpinner text="Loading chart..." className="h-64" />}>
                <ChartComponent
                  data={chartData as any}
                  config={chartConfig}
                  statistics={statistics || {}}
                  highlightAthlete={highlightAthlete}
                  selectedAthleteIds={selectedAthleteIds}
                  onAthleteSelectionChange={onAthleteSelectionChange}
                  showAllPoints={chartType === 'box_swarm_combo'}
                  selectedDates={chartType === 'time_series_box_swarm' ? (selectedDates || []) : []}
                  metric={chartType === 'time_series_box_swarm' ? (metric || '') : ''}
                />
              </React.Suspense>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                No data available to display
              </div>
            )}
          </ErrorBoundary>
        </div>
      </CardContent>
    </Card>
  );
}

// Chart selection helper
export function getRecommendedChartType(
  analysisType: string,
  metricCount: number,
  timeframeType: string
): ChartType {
  const key = metricCount === 1 ? '1' : metricCount === 2 ? '2' : '3+';

  if (analysisType === 'individual') {
    if (metricCount === 1) {
      return timeframeType === 'best' ? 'box_swarm_combo' : 'line_chart';
    } else if (metricCount === 2) {
      return timeframeType === 'best' ? 'scatter_plot' : 'connected_scatter';
    } else {
      return timeframeType === 'best' ? 'radar_chart' : 'multi_line';
    }
  } else {
    // Group analysis (intra_group or inter_group)
    if (metricCount === 1) {
      return timeframeType === 'best' ? 'distribution' : 'time_series_box_swarm';
    } else if (metricCount === 2) {
      return timeframeType === 'best' ? 'scatter_plot' : 'connected_scatter';
    } else {
      return 'radar_chart';
    }
  }
}

// Chart data validation
export function validateChartData(
  chartType: ChartType,
  data: any,
  config: ChartConfiguration
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data) {
    errors.push('No data provided');
    return { isValid: false, errors };
  }

  // Type-specific validations
  switch (chartType) {
    case 'line_chart':
    case 'multi_line':
      if (!Array.isArray(data) || data.length === 0) {
        errors.push('Line charts require trend data array');
      }
      break;
    
    case 'radar_chart':
      if (!Array.isArray(data) || data.length === 0) {
        errors.push('Radar charts require multi-metric data array');
      }
      break;
    
    case 'scatter_plot':
    case 'box_plot':
    case 'distribution':
    case 'bar_chart':
      if (!Array.isArray(data) || data.length === 0) {
        errors.push('Chart requires data points array');
      }
      break;

    case 'time_series_box_swarm':
      if (!Array.isArray(data) || data.length === 0) {
        errors.push('Time-series box+swarm chart requires trend data array');
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export default ChartContainer;