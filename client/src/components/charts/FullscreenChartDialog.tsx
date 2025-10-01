import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  // Determine which data to pass based on chart type
  const chartData = React.useMemo(() => {
    switch (chartType) {
      case 'line_chart':
      case 'multi_line':
      case 'connected_scatter':
      case 'time_series_box_swarm':
        return trends;
      case 'radar_chart':
        return multiMetric && multiMetric.length > 0 ? multiMetric : data;
      default:
        return data;
    }
  }, [chartType, data, trends, multiMetric]);

  // Enhanced config for fullscreen with zoom enabled
  const fullscreenConfig: ChartConfiguration = {
    ...config,
    aspectRatio: 1.8, // Wider aspect ratio for fullscreen
  };

  const renderChart = () => {
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
            data={trends || []}
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
            data={trends || []}
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
            data={multiMetric || []}
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
            data={trends || []}
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
            data={trends || []}
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
      <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] max-h-[95vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 pr-8">
              <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                💡 Use mouse wheel to zoom, drag to pan. Double-click to reset.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Chart Content */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="w-full h-full min-h-[600px]">
            <React.Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="text-muted-foreground">Loading chart...</div>
                </div>
              }
            >
              {renderChart()}
            </React.Suspense>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
