import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Download, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { 
  ChartDataPoint, 
  ChartConfiguration, 
  ChartType,
  StatisticalSummary,
  TrendData,
  MultiMetricData 
} from '@shared/analytics-types';

// Import chart components
import { BoxPlotChart } from './BoxPlotChart';
import { DistributionChart } from './DistributionChart';
import { BarChart } from './BarChart';
import { LineChart } from './LineChart';
import { ScatterPlotChart } from './ScatterPlotChart';
import { RadarChart } from './RadarChart';
import { SwarmChart } from './SwarmChart';
import { ConnectedScatterChart } from './ConnectedScatterChart';
import { MultiLineChart } from './MultiLineChart';

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
        <div className="w-full" style={{ minHeight: '300px' }}>
          <ChartComponent
            data={chartData as any}
            config={chartConfig}
            statistics={statistics}
            highlightAthlete={highlightAthlete}
          />
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
      return timeframeType === 'best' ? 'box_plot' : 'line_chart';
    } else if (metricCount === 2) {
      return timeframeType === 'best' ? 'scatter_plot' : 'connected_scatter';
    } else {
      return timeframeType === 'best' ? 'radar_chart' : 'multi_line';
    }
  } else {
    if (metricCount === 1) {
      return timeframeType === 'best' ? 'distribution' : 'multi_line';
    } else if (metricCount === 2) {
      return 'scatter_plot';
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
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export default ChartContainer;