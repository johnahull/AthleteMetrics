import React, { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RotateCcw, Info } from 'lucide-react';
import { ErrorBoundary } from '../ErrorBoundary';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import type {
  ChartDataPoint,
  ChartConfiguration,
  ChartType,
  StatisticalSummary,
  TrendData,
  MultiMetricData,
  GroupDefinition
} from '@shared/analytics-types';
import { getChartDataForType } from './chartDataUtils';

// Register zoom plugin for fullscreen charts
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  zoomPlugin
);

// Lazy load chart components
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

interface FullscreenChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  chartType: ChartType;
  data: ChartDataPoint[];
  rawData?: ChartDataPoint[];
  trends?: TrendData[];
  multiMetric?: MultiMetricData[];
  statistics?: Record<string, StatisticalSummary>;
  config: ChartConfiguration;
  highlightAthlete?: string;
  selectedAthleteIds?: string[];
  onAthleteSelectionChange?: (athleteIds: string[]) => void;
  selectedDates?: string[];
  metric?: string;
  selectedGroups?: GroupDefinition[];
}

export function FullscreenChartDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  chartType,
  data,
  rawData,
  trends,
  multiMetric,
  statistics,
  config,
  highlightAthlete,
  selectedAthleteIds,
  onAthleteSelectionChange,
  selectedDates,
  metric,
  selectedGroups
}: FullscreenChartDialogProps) {
  // Ref to access chart instance for zoom reset
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Determine which data to pass based on chart type
  const chartData = React.useMemo(
    () => getChartDataForType(chartType, data, trends, multiMetric),
    [chartType, data, trends, multiMetric]
  );

  // Reset zoom handler
  const handleResetZoom = () => {
    // Find Chart.js instance in the DOM
    const chartCanvas = chartContainerRef.current?.querySelector('canvas');
    if (chartCanvas) {
      const chartInstance = ChartJS.getChart(chartCanvas);
      if (chartInstance && typeof chartInstance.resetZoom === 'function') {
        chartInstance.resetZoom();
      }
    }
  };

  // Enhanced config for fullscreen with zoom enabled
  // Only add zoom config for chart types that support it
  const supportsZoom = ['line_chart', 'multi_line', 'scatter_plot', 'connected_scatter', 'box_plot', 'box_swarm_combo', 'swarm_plot'].includes(chartType);

  const fullscreenConfig: ChartConfiguration = {
    ...config,
    aspectRatio: 1.8, // Wider aspect ratio for fullscreen
    plugins: {
      ...config.plugins,
      ...(supportsZoom && {
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true,
            },
            mode: 'xy' as const,
          },
          pan: {
            enabled: true,
            mode: 'xy' as const,
          },
          limits: {
            x: { min: 'original', max: 'original' },
            y: { min: 'original', max: 'original' },
          },
        },
      }),
    },
  };

  const renderChart = () => {
    // Validate data exists for the chart type
    const validateData = () => {
      if (chartType === 'line_chart' || chartType === 'multi_line' ||
          chartType === 'connected_scatter' || chartType === 'time_series_box_swarm') {
        if (!trends || trends.length === 0) {
          return 'No trend data available for this chart type.';
        }
      } else if (chartType === 'radar_chart') {
        if ((!multiMetric || multiMetric.length === 0) && (!data || data.length === 0)) {
          return 'No data available for radar chart.';
        }
      } else {
        if (!data || data.length === 0) {
          return 'No data available for this chart type.';
        }
      }
      return null;
    };

    const validationError = validateData();
    if (validationError) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <div className="text-lg font-medium mb-2">No Data Available</div>
            <div className="text-sm">{validationError}</div>
          </div>
        </div>
      );
    }

    switch (chartType) {
      case 'box_plot':
      case 'box_swarm_combo':
        return (
          <BoxPlotChart
            data={chartData as ChartDataPoint[]}
            rawData={rawData}
            config={fullscreenConfig}
            statistics={statistics}
            highlightAthlete={highlightAthlete}
            showAllPoints={chartType === 'box_swarm_combo'}
            selectedGroups={selectedGroups}
          />
        );
      case 'distribution':
        return (
          <DistributionChart
            data={chartData as ChartDataPoint[]}
            config={fullscreenConfig}
            statistics={statistics || {}}
            highlightAthlete={highlightAthlete}
          />
        );
      case 'bar_chart':
        return (
          <BarChart
            data={chartData as ChartDataPoint[]}
            config={fullscreenConfig}
            statistics={statistics || {}}
            highlightAthlete={highlightAthlete}
          />
        );
      case 'line_chart':
        return (
          <LineChart
            data={trends!}
            config={fullscreenConfig}
            statistics={statistics}
            highlightAthlete={highlightAthlete}
            selectedAthleteIds={selectedAthleteIds}
            onAthleteSelectionChange={onAthleteSelectionChange}
          />
        );
      case 'multi_line':
        return (
          <MultiLineChart
            data={trends!}
            config={fullscreenConfig}
            statistics={statistics}
            highlightAthlete={highlightAthlete}
            selectedAthleteIds={selectedAthleteIds}
            onAthleteSelectionChange={onAthleteSelectionChange}
            maxAthletes={3}
          />
        );
      case 'scatter_plot':
        return (
          <ScatterPlotChart
            data={chartData as ChartDataPoint[]}
            config={fullscreenConfig}
            statistics={statistics || {}}
            highlightAthlete={highlightAthlete}
          />
        );
      case 'radar_chart':
        return (
          <RadarChart
            data={multiMetric && multiMetric.length > 0 ? multiMetric : data as any[]}
            config={fullscreenConfig}
            statistics={statistics}
            highlightAthlete={highlightAthlete}
            selectedAthleteIds={selectedAthleteIds}
            onAthleteSelectionChange={onAthleteSelectionChange}
            maxAthletes={10}
          />
        );
      case 'swarm_plot':
        return (
          <SwarmChart
            data={chartData as ChartDataPoint[]}
            config={fullscreenConfig}
            statistics={statistics || {}}
            highlightAthlete={highlightAthlete}
          />
        );
      case 'connected_scatter':
        return (
          <ConnectedScatterChart
            data={trends!}
            config={fullscreenConfig}
            statistics={statistics}
            highlightAthlete={highlightAthlete}
            selectedAthleteIds={selectedAthleteIds}
            onAthleteSelectionChange={onAthleteSelectionChange}
            maxAthletes={10}
          />
        );
      case 'time_series_box_swarm':
        return (
          <TimeSeriesBoxSwarmChart
            data={trends!}
            config={fullscreenConfig}
            statistics={statistics}
            selectedDates={selectedDates || []}
            metric={metric || ''}
          />
        );
      case 'violin_plot':
        return (
          <ViolinChart
            data={rawData || chartData as ChartDataPoint[]}
            config={fullscreenConfig}
            statistics={statistics}
            highlightAthlete={highlightAthlete}
            selectedGroups={selectedGroups}
          />
        );
      default:
        return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Chart type "{chartType}" not supported in fullscreen mode
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] h-[95vh] max-h-[95vh] p-0 gap-0 flex flex-col"
        aria-labelledby="fullscreen-chart-title"
        aria-describedby="fullscreen-chart-description"
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex-1">
            <DialogTitle id="fullscreen-chart-title" className="text-xl font-semibold">
              {title}
            </DialogTitle>
            {subtitle && (
              <p id="fullscreen-chart-description" className="text-sm text-muted-foreground mt-1">
                {subtitle}
              </p>
            )}
            {supportsZoom && (
              <div className="flex items-center gap-2 mt-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3 inline" aria-hidden="true" />
                  <span>Use mouse wheel to zoom, drag to pan. Press ESC to close.</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetZoom}
                  className="ml-auto"
                  aria-label="Reset zoom level to default view"
                >
                  <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
                  Reset Zoom
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Chart Content */}
        <div
          className="flex-1 p-6 overflow-auto"
          ref={chartContainerRef}
          role="region"
          aria-label="Fullscreen chart visualization"
        >
          <div className="w-full h-full min-h-[600px]">
            <ErrorBoundary>
              <React.Suspense
                fallback={
                  <div
                    className="flex items-center justify-center h-full"
                    role="status"
                    aria-live="polite"
                    aria-label="Loading chart"
                  >
                    <div className="text-muted-foreground">Loading chart...</div>
                  </div>
                }
              >
                {renderChart()}
              </React.Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
