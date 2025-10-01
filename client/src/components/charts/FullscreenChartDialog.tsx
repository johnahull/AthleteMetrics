import React, { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Info, RotateCcw } from 'lucide-react';
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

// Constants
const FULLSCREEN_ASPECT_RATIO = 1.8; // Optimized for widescreen displays
const MIN_CHART_HEIGHT = 600; // Ensures charts remain readable

// Chart types that support zoom/pan
const ZOOM_SUPPORTED_CHARTS: ChartType[] = [
  'box_plot',
  'box_swarm_combo',
  'distribution',
  'bar_chart',
  'line_chart',
  'multi_line',
  'scatter_plot',
  'connected_scatter',
  'swarm_plot',
  'time_series_box_swarm',
  'violin_plot'
];

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
  // Ref to access chart container for zoom reset
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Determine which data to pass based on chart type
  const chartData = React.useMemo(
    () => getChartDataForType(chartType, data, trends, multiMetric),
    [chartType, data, trends, multiMetric]
  );

  // Check if zoom is supported for this chart type
  const supportsZoom = ZOOM_SUPPORTED_CHARTS.includes(chartType);

  // Enhanced config for fullscreen with zoom enabled (only for supported charts)
  const fullscreenConfig: ChartConfiguration = React.useMemo(() => {
    const baseConfig: ChartConfiguration = {
      ...config,
      aspectRatio: FULLSCREEN_ASPECT_RATIO,
    };

    if (supportsZoom) {
      return {
        ...baseConfig,
        plugins: {
          ...config.plugins,
          zoom: {
            zoom: {
              wheel: {
                enabled: true,
              },
              pinch: {
                enabled: true,
              },
              mode: 'xy',
            },
            pan: {
              enabled: true,
              mode: 'xy',
            },
            limits: {
              x: { min: 'original', max: 'original' },
              y: { min: 'original', max: 'original' },
            },
          },
        },
      };
    }

    return baseConfig;
  }, [config, supportsZoom]);

  // Handle reset zoom - DOM-based approach to find Chart.js instance
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

  const renderChart = () => {
    switch (chartType) {
      case 'box_plot':
      case 'box_swarm_combo':
        if (!data || data.length === 0) {
          return <div className="flex items-center justify-center h-full text-muted-foreground">No data available for box plot</div>;
        }
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
        if (!data || data.length === 0) {
          return <div className="flex items-center justify-center h-full text-muted-foreground">No data available for distribution chart</div>;
        }
        return (
          <DistributionChart
            data={chartData as ChartDataPoint[]}
            config={fullscreenConfig}
            statistics={statistics || {}}
            highlightAthlete={highlightAthlete}
          />
        );

      case 'bar_chart':
        if (!data || data.length === 0) {
          return <div className="flex items-center justify-center h-full text-muted-foreground">No data available for bar chart</div>;
        }
        return (
          <BarChart
            data={chartData as ChartDataPoint[]}
            config={fullscreenConfig}
            statistics={statistics || {}}
            highlightAthlete={highlightAthlete}
          />
        );

      case 'line_chart':
        if (!trends || trends.length === 0) {
          return <div className="flex items-center justify-center h-full text-muted-foreground">No trend data available for line chart</div>;
        }
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
        if (!trends || trends.length === 0) {
          return <div className="flex items-center justify-center h-full text-muted-foreground">No trend data available for multi-line chart</div>;
        }
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
        if (!data || data.length === 0) {
          return <div className="flex items-center justify-center h-full text-muted-foreground">No data available for scatter plot</div>;
        }
        return (
          <ScatterPlotChart
            data={chartData as ChartDataPoint[]}
            config={fullscreenConfig}
            statistics={statistics || {}}
            highlightAthlete={highlightAthlete}
          />
        );

      case 'radar_chart':
        if ((!multiMetric || multiMetric.length === 0) && (!data || data.length === 0)) {
          return <div className="flex items-center justify-center h-full text-muted-foreground">No data available for radar chart</div>;
        }
        return (
          <RadarChart
            data={multiMetric && multiMetric.length > 0 ? multiMetric : (data as any[])}
            config={fullscreenConfig}
            statistics={statistics}
            highlightAthlete={highlightAthlete}
            selectedAthleteIds={selectedAthleteIds}
            onAthleteSelectionChange={onAthleteSelectionChange}
            maxAthletes={10}
          />
        );

      case 'swarm_plot':
        if (!data || data.length === 0) {
          return <div className="flex items-center justify-center h-full text-muted-foreground">No data available for swarm plot</div>;
        }
        return (
          <SwarmChart
            data={chartData as ChartDataPoint[]}
            config={fullscreenConfig}
            statistics={statistics || {}}
            highlightAthlete={highlightAthlete}
          />
        );

      case 'connected_scatter':
        if (!trends || trends.length === 0) {
          return <div className="flex items-center justify-center h-full text-muted-foreground">No trend data available for connected scatter chart</div>;
        }
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
        if (!trends || trends.length === 0) {
          return <div className="flex items-center justify-center h-full text-muted-foreground">No trend data available for time-series chart</div>;
        }
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
        if (!rawData && (!data || data.length === 0)) {
          return <div className="flex items-center justify-center h-full text-muted-foreground">No data available for violin plot</div>;
        }
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
        aria-label={`Fullscreen view of ${title}`}
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
              )}
              {supportsZoom && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Info className="h-3 w-3 inline" aria-hidden="true" />
                  Use mouse wheel to zoom, drag to pan.
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Press <kbd className="px-1 py-0.5 text-xs font-semibold bg-muted rounded">ESC</kbd> to close fullscreen view.
              </p>
            </div>
            {supportsZoom && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetZoom}
                aria-label="Reset zoom to original view"
                title="Reset zoom"
              >
                <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
                Reset Zoom
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Chart Content */}
        <div className="flex-1 p-6 overflow-auto">
          <div
            ref={chartContainerRef}
            className="w-full h-full"
            style={{ minHeight: `${MIN_CHART_HEIGHT}px` }}
            role="img"
            aria-label={`${title} chart visualization`}
          >
            <ErrorBoundary>
              <React.Suspense
                fallback={
                  <div className="flex items-center justify-center h-full">
                    <div className="text-muted-foreground" role="status" aria-live="polite">
                      Loading chart...
                    </div>
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
