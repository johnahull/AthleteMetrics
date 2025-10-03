import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AlertTriangle, Download, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '../ErrorBoundary';
import { FullscreenChartDialog } from './FullscreenChartDialog';
import type {
  ChartDataPoint,
  ChartConfiguration,
  ChartType,
  StatisticalSummary,
  TrendData,
  MultiMetricData,
  GroupDefinition
} from '@shared/analytics-types';
import { devLog } from '@/utils/dev-logger';
import { getChartDataForType } from './chartDataUtils';

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
const ViolinChart = React.lazy(() => import('./ViolinChart').then(m => ({ default: m.ViolinChart })));

interface ChartContainerProps {
  title: string;
  subtitle?: string;
  chartType: ChartType;
  data: ChartDataPoint[];
  rawData?: ChartDataPoint[]; // Raw individual athlete data for swarm points
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
  selectedGroups?: GroupDefinition[];
  onExport?: () => void;
  onFullscreen?: () => void;
  className?: string;
}

export function ChartContainer({
  title,
  subtitle,
  chartType,
  data,
  rawData,
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
  selectedGroups,
  onExport,
  onFullscreen,
  className
}: ChartContainerProps) {
  // Fullscreen state
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  // Handle fullscreen toggle
  const handleFullscreen = () => {
    if (onFullscreen) {
      // If custom handler is provided, use it
      onFullscreen();
    } else {
      // Otherwise, use built-in fullscreen dialog
      setIsFullscreenOpen(true);
    }
  };

  // Memoize chart component selection for generic cases only
  // Exclude types that are handled explicitly with custom props
  const ChartComponent = useMemo(() => {
    switch (chartType) {
      case 'box_plot':
        return BoxPlotChart;
      case 'distribution':
        return DistributionChart;
      case 'bar_chart':
        return BarChart;
      case 'scatter_plot':
        return ScatterPlotChart;
      case 'swarm_plot':
        return SwarmChart;
      case 'connected_scatter':
        return ConnectedScatterChart;
      case 'multi_line':
        return MultiLineChart;
      // These cases are handled explicitly, so return null for generic component
      case 'line_chart':
      case 'radar_chart':
      case 'box_swarm_combo':
      case 'time_series_box_swarm':
      case 'violin_plot':
        return null;
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
    devLog.log('ChartContainer Debug:', {
      chartType,
      dataLength: data?.length || 0,
      trendsLength: trends?.length || 0,
      multiMetricLength: multiMetric?.length || 0,
      hasMultiMetric: !!multiMetric,
      isPreAggregated: data && data.length > 0 && data[0].athleteId?.startsWith?.('group-')
    });

    return getChartDataForType(chartType, data, trends, multiMetric);
  }, [chartType, data, trends, multiMetric]);

  if (isLoading) {
    const cardHeight = chartType === 'radar_chart' ? 'h-[900px]' : 'h-[700px]';
    return (
      <Card className={`${className} ${cardHeight} flex flex-col`}>
        <CardHeader className="flex-shrink-0">
          <Skeleton className="h-6 w-48" />
          {subtitle && <Skeleton className="h-4 w-32" />}
        </CardHeader>
        <CardContent className="flex-1">
          <Skeleton className="h-full w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    const cardHeight = chartType === 'radar_chart' ? 'h-[900px]' : 'h-[700px]';
    return (
      <Card className={`${className} ${cardHeight} flex flex-col`}>
        <CardHeader className="flex-shrink-0">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Chart Error
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Only show unsupported chart error for truly unsupported types
  // (ChartComponent is null for both unsupported types AND explicitly handled types)
  const explicitlyHandledTypes = ['radar_chart', 'line_chart', 'box_swarm_combo', 'time_series_box_swarm', 'violin_plot'];
  if (!ChartComponent && !explicitlyHandledTypes.includes(chartType)) {
    const cardHeight = chartType === 'radar_chart' ? 'h-[900px]' : 'h-[700px]';
    return (
      <Card className={`${className} ${cardHeight} flex flex-col`}>
        <CardHeader className="flex-shrink-0">
          <CardTitle>Unsupported Chart Type</CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
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
    devLog.log('ChartContainer: No data available', {
      chartType,
      hasChartData: !!chartData,
      isArray: Array.isArray(chartData),
      length: Array.isArray(chartData) ? chartData.length : 'N/A',
      dataType: typeof chartData,
      selectedGroups: selectedGroups?.length || 0
    });
    
    const cardHeight = chartType === 'radar_chart' ? 'h-[900px]' : 'h-[700px]';
    return (
      <Card className={`${className} ${cardHeight} flex flex-col`}>
        <CardHeader className="flex-shrink-0">
          <CardTitle>{title}</CardTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </CardHeader>
        <CardContent className="flex-1">
          <Alert>
            <AlertDescription>
              {selectedGroups && selectedGroups.length > 0 
                ? `No data available for the selected groups (${selectedGroups.map(g => g.name).join(', ')}). Try selecting different groups or check if the groups have measurement data.`
                : 'No data available for this chart. Try adjusting your filters or date range.'
              }
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Use larger height for radar chart due to additional controls, violin plot and box+swarm for better visibility
  // Box+swarm: 1100px for multi-group (more data), 700px for individual/multi-athlete
  const isMultiGroup = selectedGroups && selectedGroups.length > 0;
  const cardHeight = chartType === 'radar_chart' ? 'h-[900px]'
    : chartType === 'violin_plot' ? 'h-[910px]'
    : (chartType === 'box_swarm_combo' || chartType === 'time_series_box_swarm')
      ? (isMultiGroup ? 'h-[1100px]' : 'h-[700px]')
    : 'h-[700px]';

  return (
    <Card className={`${className} ${cardHeight} flex flex-col`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-shrink-0">
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
          <Button
            variant="outline"
            size="icon"
            onClick={handleFullscreen}
            title="View fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className={`w-full ${chartType === 'box_swarm_combo' && selectedGroups && selectedGroups.length >= 2 ? 'flex-1 flex flex-col' : ''}`} style={{
          height: chartType === 'box_swarm_combo' && selectedGroups && selectedGroups.length >= 2
            ? undefined
            : '500px',
          minHeight: '500px'
        }}>
          <ErrorBoundary>
            {isValidChartData(chartData) ? (
              <React.Suspense
                key={`chart-${chartType}`}
                fallback={<LoadingSpinner text="Loading chart..." className="h-64" />}
              >
                {chartType === 'radar_chart' ? (
                  <RadarChart
                    data={multiMetric || []}
                    config={chartConfig}
                    statistics={statistics}
                    highlightAthlete={highlightAthlete}
                    selectedAthleteIds={selectedAthleteIds}
                    onAthleteSelectionChange={onAthleteSelectionChange}
                    maxAthletes={10}
                  />
                ) : chartType === 'line_chart' ? (
                  <LineChart
                    data={trends || []}
                    config={chartConfig}
                    statistics={statistics}
                    highlightAthlete={highlightAthlete}
                    selectedAthleteIds={selectedAthleteIds}
                    onAthleteSelectionChange={onAthleteSelectionChange}
                  />
                ) : chartType === 'multi_line' ? (
                  <MultiLineChart
                    data={trends || []}
                    config={chartConfig}
                    statistics={statistics}
                    highlightAthlete={highlightAthlete}
                    selectedAthleteIds={selectedAthleteIds}
                    onAthleteSelectionChange={onAthleteSelectionChange}
                    maxAthletes={3}
                  />
                ) : chartType === 'connected_scatter' ? (
                  <ConnectedScatterChart
                    data={trends || []}
                    config={chartConfig}
                    statistics={statistics}
                    highlightAthlete={highlightAthlete}
                    selectedAthleteIds={selectedAthleteIds}
                    onAthleteSelectionChange={onAthleteSelectionChange}
                    maxAthletes={10}
                  />
                ) : chartType === 'box_swarm_combo' ? (
                  <BoxPlotChart
                    data={chartData as ChartDataPoint[]}
                    rawData={rawData}
                    config={chartConfig}
                    statistics={statistics}
                    highlightAthlete={highlightAthlete}
                    showAllPoints={true}
                    selectedGroups={selectedGroups}
                  />
                ) : chartType === 'time_series_box_swarm' ? (
                  <TimeSeriesBoxSwarmChart
                    data={trends || []}
                    config={chartConfig}
                    statistics={statistics}
                    selectedDates={selectedDates || []}
                    metric={metric || ''}
                  />
                ) : chartType === 'violin_plot' ? (
                  <ErrorBoundary>
                    <ViolinChart
                      data={rawData || chartData as ChartDataPoint[]}
                      config={chartConfig}
                      statistics={statistics}
                      highlightAthlete={highlightAthlete}
                      selectedGroups={selectedGroups}
                    />
                  </ErrorBoundary>
                ) : ChartComponent ? (
                  <ChartComponent
                    key={`chart-component-${chartType}`}
                    data={chartData as any}
                    rawData={rawData}
                    config={chartConfig}
                    statistics={statistics || {}}
                    highlightAthlete={highlightAthlete}
                    showAllPoints={chartType === 'box_plot' && selectedGroups && selectedGroups.length >= 2}
                    selectedGroups={selectedGroups}
                  />
                ) : (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">
                    Unsupported chart type: {chartType}
                  </div>
                )}
              </React.Suspense>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                No data available to display
              </div>
            )}
          </ErrorBoundary>
        </div>
      </CardContent>

      {/* Fullscreen Chart Dialog */}
      <FullscreenChartDialog
        open={isFullscreenOpen}
        onOpenChange={setIsFullscreenOpen}
        title={title}
        subtitle={subtitle}
        chartType={chartType}
        data={data}
        rawData={rawData}
        trends={trends}
        multiMetric={multiMetric}
        statistics={statistics}
        config={chartConfig}
        highlightAthlete={highlightAthlete}
        selectedAthleteIds={selectedAthleteIds}
        onAthleteSelectionChange={onAthleteSelectionChange}
        selectedDates={selectedDates}
        metric={metric}
        selectedGroups={selectedGroups}
      />
    </Card>
  );
}

// Chart selection helper
export function getRecommendedChartType(
  analysisType: string,
  metricCount: number,
  timeframeType: string
): ChartType {
  if (analysisType === 'individual') {
    if (metricCount === 1) {
      return timeframeType === 'best' ? 'box_swarm_combo' : 'line_chart';
    } else if (metricCount === 2) {
      return timeframeType === 'best' ? 'scatter_plot' : 'connected_scatter';
    } else {
      // 3+ metrics
      return timeframeType === 'best' ? 'radar_chart' : 'multi_line';
    }
  } else {
    // Group analysis (intra_group or multi_group)
    if (metricCount === 1) {
      return timeframeType === 'best' ? 'box_swarm_combo' : 'time_series_box_swarm';
    } else if (metricCount === 2) {
      return timeframeType === 'best' ? 'scatter_plot' : 'connected_scatter';
    } else {
      // 3+ metrics
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