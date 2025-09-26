import React, { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ScatterController,
  LineController,
  Filler
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import type { AnnotationOptions } from 'chartjs-plugin-annotation';
import { Scatter } from 'react-chartjs-2';
import type { 
  TrendData, 
  ChartConfiguration, 
  StatisticalSummary 
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  parseValue,
  compareDatesByDay,
  safeArrayAccess,
  getFirstObjectValue,
  hasValue,
  hasDate,
  safeDate
} from '@/utils/data-safety';
import { getChartColor, getChartBackgroundColor } from '@/utils/chart-colors';
import { CHART_CONFIG } from '@/constants/chart-config';

// Type definitions for chart data
interface ScatterPoint {
  x: number;
  y: number;
  date: unknown;
  isPersonalBest: boolean;
}

// Chart.js data point (simplified for Chart.js)
interface ChartDataPoint {
  x: number;
  y: number;
  isPersonalBest?: boolean;
}

interface AthleteMetrics {
  [metric: string]: Array<{ value: unknown; date: unknown; isPersonalBest?: boolean }>;
}

interface AthleteData {
  athleteId: string;
  athleteName: string;
  metrics: AthleteMetrics;
}

// Register Chart.js components
ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ScatterController,
  LineController,
  Filler,
  annotationPlugin
);

// Constants for quadrant calculations
const QUADRANT_PADDING_RATIO = 0.1; // 10% padding around data bounds
const FALLBACK_PADDING_BASE = 1; // Base fallback padding when data range is zero

// Shared quadrant color mapping to eliminate duplication
const QUADRANT_COLOR_MAP = {
  chart: {
    green: CHART_CONFIG.COLORS.QUADRANTS.ELITE,
    yellow: CHART_CONFIG.COLORS.QUADRANTS.GOOD,
    orange: CHART_CONFIG.COLORS.QUADRANTS.GOOD,
    red: CHART_CONFIG.COLORS.QUADRANTS.NEEDS_WORK
  },
  legend: {
    green: { bg: CHART_CONFIG.COLORS.QUADRANTS.ELITE, border: 'rgba(16, 185, 129, 0.3)' },
    yellow: { bg: CHART_CONFIG.COLORS.QUADRANTS.GOOD, border: 'rgba(245, 158, 11, 0.3)' },
    orange: { bg: CHART_CONFIG.COLORS.QUADRANTS.GOOD, border: 'rgba(245, 158, 11, 0.3)' },
    red: { bg: CHART_CONFIG.COLORS.QUADRANTS.NEEDS_WORK, border: 'rgba(239, 68, 68, 0.3)' }
  }
};

interface ConnectedScatterChartProps {
  data: TrendData[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
  selectedAthleteIds?: string[];
  onAthleteSelectionChange?: (athleteIds: string[]) => void;
  maxAthletes?: number;
}

// Performance quadrant labels based on metric types
function getPerformanceQuadrantLabels(xMetric: string, yMetric: string) {
  const xConfig = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG];
  const yConfig = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG];

  const xLowerIsBetter = xConfig?.lowerIsBetter || false;
  const yLowerIsBetter = yConfig?.lowerIsBetter || false;

  // Get clean metric names (remove common suffixes)
  const xName = xConfig?.label.replace(/ (Time|Test|Jump|Dash|Index)$/, '') || xMetric;
  const yName = yConfig?.label.replace(/ (Time|Test|Jump|Dash|Index)$/, '') || yMetric;

  // Generate contextual descriptions based on metric combination
  const getDescriptions = () => {
    // Speed vs Power combinations
    if ((xMetric.includes('DASH') || xMetric.includes('FLY')) && yMetric.includes('VERTICAL')) {
      return { elite: 'Fast + Explosive', xGood: 'Strong Speed', yGood: 'Strong Power', development: 'Needs Speed & Power' };
    }
    if ((yMetric.includes('DASH') || yMetric.includes('FLY')) && xMetric.includes('VERTICAL')) {
      return { elite: 'Explosive + Fast', xGood: 'Strong Power', yGood: 'Strong Speed', development: 'Needs Power & Speed' };
    }

    // Speed vs Agility combinations
    if ((xMetric.includes('DASH') || xMetric.includes('FLY')) && (yMetric.includes('AGILITY') || yMetric.includes('T_TEST'))) {
      return { elite: 'Fast + Agile', xGood: 'Strong Speed', yGood: 'Strong Agility', development: 'Needs Speed & Agility' };
    }
    if ((yMetric.includes('DASH') || yMetric.includes('FLY')) && (xMetric.includes('AGILITY') || xMetric.includes('T_TEST'))) {
      return { elite: 'Agile + Fast', xGood: 'Strong Agility', yGood: 'Strong Speed', development: 'Needs Agility & Speed' };
    }

    // Power vs Agility combinations
    if (xMetric.includes('VERTICAL') && (yMetric.includes('AGILITY') || yMetric.includes('T_TEST'))) {
      return { elite: 'Explosive + Agile', xGood: 'Strong Power', yGood: 'Strong Agility', development: 'Needs Power & Agility' };
    }
    if (yMetric.includes('VERTICAL') && (xMetric.includes('AGILITY') || xMetric.includes('T_TEST'))) {
      return { elite: 'Agile + Explosive', xGood: 'Strong Agility', yGood: 'Strong Power', development: 'Needs Agility & Power' };
    }

    // Agility vs Agility combinations
    if ((xMetric.includes('AGILITY') || xMetric.includes('T_TEST')) && (yMetric.includes('AGILITY') || yMetric.includes('T_TEST'))) {
      return { elite: 'Multi-Directional Elite', xGood: `Strong ${xName}`, yGood: `Strong ${yName}`, development: 'Needs Agility Work' };
    }

    // Speed vs Speed combinations
    if ((xMetric.includes('DASH') || xMetric.includes('FLY')) && (yMetric.includes('DASH') || yMetric.includes('FLY'))) {
      return { elite: 'Speed Elite', xGood: `Strong ${xName}`, yGood: `Strong ${yName}`, development: 'Needs Speed Work' };
    }

    // RSI combinations
    if (xMetric.includes('RSI') || yMetric.includes('RSI')) {
      const nonRSI = xMetric.includes('RSI') ? yName : xName;
      return { elite: `Reactive + ${nonRSI} Elite`, xGood: `Strong ${xName}`, yGood: `Strong ${yName}`, development: `Needs ${xName} & ${yName}` };
    }

    // Default generic descriptions with metric names
    return { elite: `${xName} + ${yName} Elite`, xGood: `Strong ${xName}`, yGood: `Strong ${yName}`, development: `Needs ${xName} & ${yName}` };
  };

  const descriptions = getDescriptions();

  if (!xLowerIsBetter && !yLowerIsBetter) {
    // Both higher is better (e.g., vertical jump vs RSI)
    return {
      topRight: { label: descriptions.elite, color: 'green' },
      topLeft: { label: descriptions.yGood, color: 'yellow' },
      bottomRight: { label: descriptions.xGood, color: 'yellow' },
      bottomLeft: { label: descriptions.development, color: 'red' }
    };
  } else if (xLowerIsBetter && !yLowerIsBetter) {
    // X lower is better, Y higher is better (e.g., 40-yard dash vs vertical jump)
    return {
      topLeft: { label: descriptions.elite, color: 'green' },
      topRight: { label: descriptions.yGood, color: 'yellow' },
      bottomLeft: { label: descriptions.xGood, color: 'yellow' },
      bottomRight: { label: descriptions.development, color: 'red' }
    };
  } else if (!xLowerIsBetter && yLowerIsBetter) {
    // X higher is better, Y lower is better (e.g., vertical jump vs 40-yard dash)
    return {
      bottomRight: { label: descriptions.elite, color: 'green' },
      bottomLeft: { label: descriptions.yGood, color: 'yellow' },
      topRight: { label: descriptions.xGood, color: 'yellow' },
      topLeft: { label: descriptions.development, color: 'red' }
    };
  } else {
    // Both lower is better (e.g., 40-yard dash vs agility time)
    return {
      bottomLeft: { label: descriptions.elite, color: 'green' },
      bottomRight: { label: descriptions.yGood, color: 'yellow' },
      topLeft: { label: descriptions.xGood, color: 'yellow' },
      topRight: { label: descriptions.development, color: 'red' }
    };
  }
}

export const ConnectedScatterChart = React.memo(function ConnectedScatterChart({
  data,
  config,
  statistics,
  highlightAthlete,
  selectedAthleteIds,
  onAthleteSelectionChange,
  maxAthletes = 10
}: ConnectedScatterChartProps) {
  // State for athlete visibility toggles
  const [athleteToggles, setAthleteToggles] = useState<Record<string, boolean>>({});
  const [showGroupAverage, setShowGroupAverage] = useState(true);
  const [showQuadrants, setShowQuadrants] = useState(true);

  // Smart default selection for athletes when not controlled by parent
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Use external selection if provided, otherwise use internal state
  const effectiveSelectedIds = selectedAthleteIds || internalSelectedIds;
  // Get all available athletes sorted by performance
  const allAthletes = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Get unique athletes and sort by performance for smart defaults
    const uniqueAthletes = Array.from(new Set(data.map(trend => trend.athleteId)))
      .map(athleteId => {
        const trend = data.find(t => t.athleteId === athleteId);
        return trend ? {
          id: athleteId,
          name: trend.athleteName
        } : null;
      })
      .filter(Boolean) as Array<{ id: string; name: string }>;

    // Sort by performance (use first metric for sorting)
    const firstMetric = data[0]?.metric;
    const metricConfig = METRIC_CONFIG[firstMetric as keyof typeof METRIC_CONFIG];
    const lowerIsBetter = metricConfig?.lowerIsBetter || false;

    return uniqueAthletes.map((athlete, index) => ({
      ...athlete,
      color: index
    }));
  }, [data]);

  // Initialize smart default selection when data changes and no external selection
  React.useEffect(() => {
    if (!selectedAthleteIds && allAthletes.length > 0 && effectiveSelectedIds.length === 0 && !hasInitialized) {
      // Auto-select athletes up to maxAthletes
      const defaultIds = allAthletes.slice(0, Math.min(maxAthletes, allAthletes.length)).map(a => a.id);
      setInternalSelectedIds(defaultIds);
      setHasInitialized(true);
    }
  }, [allAthletes, maxAthletes, selectedAthleteIds, effectiveSelectedIds.length, hasInitialized]);

  // Get athletes that should be displayed (either selected or first N for backwards compatibility)
  const displayedAthletes = useMemo(() => {
    if (effectiveSelectedIds.length > 0) {
      // Use selected athletes in selection order
      return effectiveSelectedIds.map((id, index) => {
        const athlete = allAthletes.find(a => a.id === id);
        return athlete ? { ...athlete, color: index } : null;
      }).filter(Boolean) as Array<{ id: string; name: string; color: number }>;
    } else {
      // Fallback to first N athletes for backwards compatibility
      return allAthletes.slice(0, maxAthletes);
    }
  }, [allAthletes, effectiveSelectedIds, maxAthletes]);

  // Initialize toggles with displayed athletes enabled by default
  React.useEffect(() => {
    const initialToggles: Record<string, boolean> = {};
    displayedAthletes.forEach(athlete => {
      initialToggles[athlete.id] = true;
    });
    setAthleteToggles(initialToggles);
  }, [displayedAthletes]);

  // Transform trend data for connected scatter plot
  const scatterData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Get unique metrics
    const metrics = Array.from(new Set(data.map(trend => trend.metric)));
    if (metrics.length < 2) return null;

    const [xMetric, yMetric] = metrics;

    // Filter based on highlighted athlete or toggle states
    const trendsToShow = highlightAthlete
      ? data.filter(trend => trend.athleteId === highlightAthlete)
      : data.filter(trend => {
          const isInDisplayedAthletes = displayedAthletes.some(a => a.id === trend.athleteId);
          // If athleteToggles is empty (initial state), show all displayed athletes
          // Otherwise, respect the toggle state
          const isToggleEnabled = Object.keys(athleteToggles).length === 0
            ? true
            : athleteToggles[trend.athleteId];
          return isInDisplayedAthletes && isToggleEnabled;
        });

    if (trendsToShow.length === 0) return null;

    // Group trends by athlete
    const athleteTrends = trendsToShow.reduce((acc, trend) => {
      if (!acc[trend.athleteId]) {
        acc[trend.athleteId] = {
          athleteId: trend.athleteId,
          athleteName: trend.athleteName,
          metrics: {}
        };
      }
      acc[trend.athleteId].metrics[trend.metric] = trend.data;
      return acc;
    }, {} as Record<string, AthleteData>);

    const colors = [getChartColor(0), getChartColor(1), getChartColor(2)];

    const datasets = Object.values(athleteTrends).map((athlete: AthleteData, index) => {
      const xData = athlete.metrics[xMetric] || [];
      const yData = athlete.metrics[yMetric] || [];

      // Create connected points by matching dates
      const connectedPoints = xData
        .map((xPoint: unknown) => {
          if (!hasValue(xPoint) || !hasDate(xPoint)) return null;

          const yPoint = yData.find((y: unknown) => {
            if (!hasDate(y)) return false;
            return compareDatesByDay(y.date, xPoint.date);
          });

          if (!yPoint || !hasValue(yPoint)) return null;

          return {
            // Safely convert values to numbers
            x: parseValue(xPoint.value),
            y: parseValue(yPoint.value),
            date: xPoint.date,
            isPersonalBest: Boolean((xPoint as any).isPersonalBest || (yPoint as any).isPersonalBest)
          };
        })
        .filter((point: ScatterPoint | null): point is ScatterPoint => point !== null)
        .sort((a: ScatterPoint, b: ScatterPoint) => {
          const dateA = safeDate(a.date);
          const dateB = safeDate(b.date);

          if (!dateA || !dateB) return 0;
          return dateA.getTime() - dateB.getTime();
        });

      const color = colors[index % colors.length];
      const isHighlighted = athlete.athleteId === highlightAthlete;

      return {
        label: athlete.athleteName,
        data: connectedPoints.map((point): ChartDataPoint => ({
          x: point.x,
          y: point.y,
          isPersonalBest: point.isPersonalBest
        })),
        backgroundColor: color.replace('1)', '0.6)'),
        borderColor: color,
        borderWidth: isHighlighted ? 3 : 2,
        pointRadius: isHighlighted ? 6 : 4,
        pointHoverRadius: isHighlighted ? 10 : 8,
        pointBackgroundColor: (context: any) => {
          const point = context.raw;
          return point?.isPersonalBest ? 'rgba(255, 215, 0, 1)' : color;
        },
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        showLine: true,
        fill: false,
        tension: 0.1
      };
    });

    // Add group averages if statistics available and enabled
    if (showGroupAverage && statistics && statistics[xMetric]?.mean && statistics[yMetric]?.mean) {
      datasets.push({
        label: 'Group Average',
        data: [{
          x: statistics[xMetric].mean,
          y: statistics[yMetric].mean
        }],
        backgroundColor: 'rgba(156, 163, 175, 1)',
        borderColor: 'rgba(156, 163, 175, 1)',
        borderWidth: 3,
        pointRadius: 8,
        pointHoverRadius: 10,
        pointBackgroundColor: () => 'rgba(156, 163, 175, 1)',
        pointBorderColor: 'rgba(156, 163, 175, 1)',
        pointBorderWidth: 2,
        showLine: false,
        fill: false,
        tension: 0
      });
    }

    const xUnit = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG]?.unit || '';
    const yUnit = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG]?.unit || '';
    const xLabel = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG]?.label || xMetric;
    const yLabel = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG]?.label || yMetric;

    return {
      datasets,
      xMetric,
      yMetric,
      xUnit,
      yUnit,
      xLabel,
      yLabel,
      athleteTrends
    };
  }, [data, statistics, highlightAthlete, displayedAthletes, athleteToggles, showGroupAverage]);

  // Chart options
  const options: ChartOptions<'scatter'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: config.title,
        font: {
          size: 16,
          weight: 'bold'
        }
      },
      subtitle: {
        display: !!config.subtitle,
        text: config.subtitle
      },
      tooltip: {
        callbacks: {
          title: (context) => {
            const point = context[0].raw as any;
            const datasetLabel = context[0].dataset.label;
            
            if (datasetLabel === 'Group Average') {
              return 'Group Average';
            }
            
            return point.date ? 
              `${datasetLabel} - ${new Date(point.date).toLocaleDateString()}` :
              datasetLabel;
          },
          label: (context) => {
            const point = context.raw as any;
            return [
              `${scatterData?.xLabel}: ${point.x?.toFixed(2)}${scatterData?.xUnit}`,
              `${scatterData?.yLabel}: ${point.y?.toFixed(2)}${scatterData?.yUnit}`
            ];
          },
          afterLabel: (context) => {
            const point = context.raw as any;
            const labels = [];
            
            if (point.isPersonalBest) {
              labels.push('🏆 Personal Best!');
            }
            
            if (point.date) {
              labels.push(`Date: ${new Date(point.date).toLocaleDateString()}`);
            }
            
            return labels;
          }
        }
      },
      legend: {
        display: config.showLegend,
        position: 'top' as const
      },
      annotation: showQuadrants && scatterData ? {
        annotations: (() => {
          // Early return for empty datasets
          if (!scatterData?.datasets?.length) {
            return {};
          }

          const xMean = statistics?.[scatterData.xMetric]?.mean || 0;
          const yMean = statistics?.[scatterData.yMetric]?.mean || 0;
          const labels = getPerformanceQuadrantLabels(scatterData.xMetric, scatterData.yMetric);

          // Calculate chart bounds for full background coverage
          const allPoints = scatterData.datasets.map((dataset: any) => dataset.data).flat();
          const xValues = allPoints.map((p: any) => p.x).filter((x: number) => !isNaN(x));
          const yValues = allPoints.map((p: any) => p.y).filter((y: number) => !isNaN(y));

          // Safety check for empty arrays
          if (xValues.length === 0 || yValues.length === 0) {
            return {};
          }

          const xRange = Math.max(...xValues) - Math.min(...xValues);
          const yRange = Math.max(...yValues) - Math.min(...yValues);
          const xPadding = xRange > 0 ? xRange * QUADRANT_PADDING_RATIO : FALLBACK_PADDING_BASE;
          const yPadding = yRange > 0 ? yRange * QUADRANT_PADDING_RATIO : FALLBACK_PADDING_BASE;

          const xMin = Math.min(...xValues) - xPadding;
          const xMax = Math.max(...xValues) + xPadding;
          const yMin = Math.min(...yValues) - yPadding;
          const yMax = Math.max(...yValues) + yPadding;

          return {
            // Top Right Quadrant
            topRight: {
              type: 'box' as const,
              xMin: xMean,
              xMax: xMax,
              yMin: yMean,
              yMax: yMax,
              backgroundColor: QUADRANT_COLOR_MAP.chart[labels.topRight.color as keyof typeof QUADRANT_COLOR_MAP.chart],
              borderWidth: 0,
              z: 0
            },
            // Top Left Quadrant
            topLeft: {
              type: 'box' as const,
              xMin: xMin,
              xMax: xMean,
              yMin: yMean,
              yMax: yMax,
              backgroundColor: QUADRANT_COLOR_MAP.chart[labels.topLeft.color as keyof typeof QUADRANT_COLOR_MAP.chart],
              borderWidth: 0,
              z: 0
            },
            // Bottom Right Quadrant
            bottomRight: {
              type: 'box' as const,
              xMin: xMean,
              xMax: xMax,
              yMin: yMin,
              yMax: yMean,
              backgroundColor: QUADRANT_COLOR_MAP.chart[labels.bottomRight.color as keyof typeof QUADRANT_COLOR_MAP.chart],
              borderWidth: 0,
              z: 0
            },
            // Bottom Left Quadrant
            bottomLeft: {
              type: 'box' as const,
              xMin: xMin,
              xMax: xMean,
              yMin: yMin,
              yMax: yMean,
              backgroundColor: QUADRANT_COLOR_MAP.chart[labels.bottomLeft.color as keyof typeof QUADRANT_COLOR_MAP.chart],
              borderWidth: 0,
              z: 0
            },
            // Vertical line at x mean
            xMeanLine: {
              type: 'line' as const,
              xMin: xMean,
              xMax: xMean,
              yMin: yMin,
              yMax: yMax,
              borderColor: 'rgba(156, 163, 175, 0.5)',
              borderWidth: 2,
              borderDash: [5, 5],
              z: 1
            },
            // Horizontal line at y mean
            yMeanLine: {
              type: 'line' as const,
              xMin: xMin,
              xMax: xMax,
              yMin: yMean,
              yMax: yMean,
              borderColor: 'rgba(156, 163, 175, 0.5)',
              borderWidth: 2,
              borderDash: [5, 5],
              z: 1
            }
          };
        })()
      } : undefined
    },
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        title: {
          display: true,
          text: `${scatterData?.xLabel} (${scatterData?.xUnit})`
        },
        grid: {
          display: true
        }
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: `${scatterData?.yLabel} (${scatterData?.yUnit})`
        },
        grid: {
          display: true
        }
      }
    },
    elements: {
      point: {
        hoverRadius: 10
      },
      line: {
        tension: 0.1
      }
    },
    interaction: {
      intersect: false,
      mode: 'point'
    }
  }), [scatterData, config, showQuadrants, statistics]);

  // Helper functions for athlete toggles
  const toggleAthlete = (athleteId: string) => {
    setAthleteToggles(prev => ({
      ...prev,
      [athleteId]: !prev[athleteId]
    }));
  };

  const selectAllAthletes = () => {
    const allEnabled: Record<string, boolean> = {};
    displayedAthletes.forEach(athlete => {
      allEnabled[athlete.id] = true;
    });
    setAthleteToggles(allEnabled);
  };

  const clearAllAthletes = () => {
    const allDisabled: Record<string, boolean> = {};
    displayedAthletes.forEach(athlete => {
      allDisabled[athlete.id] = false;
    });
    setAthleteToggles(allDisabled);
  };

  const visibleAthleteCount = Object.values(athleteToggles).filter(Boolean).length;

  if (!scatterData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No trend data available for connected scatter plot (requires 2+ metrics with time series data)
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Athlete Controls Panel - Only show when not in highlight mode */}
      {!highlightAthlete && allAthletes.length > 0 && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">
              Athletes ({visibleAthleteCount} of {displayedAthletes.length} visible)
            </h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllAthletes}
                disabled={visibleAthleteCount === displayedAthletes.length}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllAthletes}
                disabled={visibleAthleteCount === 0}
              >
                Clear All
              </Button>
            </div>
          </div>

          {/* Athletes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 mb-3">
            {displayedAthletes.map(athlete => {
              const athleteColor = getChartColor(athlete.color);

              return (
                <div key={athlete.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`athlete-${athlete.id}`}
                    checked={athleteToggles[athlete.id] || false}
                    onCheckedChange={() => toggleAthlete(athlete.id)}
                  />
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: athleteColor }}
                  />
                  <label
                    htmlFor={`athlete-${athlete.id}`}
                    className="text-sm cursor-pointer flex-1 truncate"
                  >
                    {athlete.name}
                  </label>
                </div>
              );
            })}
          </div>

          {/* Group Average Toggle */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="group-average"
                checked={showGroupAverage}
                onCheckedChange={(checked) => setShowGroupAverage(checked === true)}
              />
              <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-400" />
              <label htmlFor="group-average" className="text-sm cursor-pointer">
                Group Average
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="quadrants"
                checked={showQuadrants}
                onCheckedChange={setShowQuadrants}
              />
              <Label htmlFor="quadrants" className="text-sm">Show Performance Quadrants</Label>
            </div>
          </div>
        </div>
      )}

      <Scatter data={scatterData} options={options} />

      {/* Quadrant Legend */}
      {showQuadrants && scatterData && (() => {
        const labels = getPerformanceQuadrantLabels(scatterData.xMetric, scatterData.yMetric);

        const quadrantLegend = [
          {
            label: labels.topRight.label,
            color: labels.topRight.color,
            position: 'Top Right',
            ...QUADRANT_COLOR_MAP.legend[labels.topRight.color as keyof typeof QUADRANT_COLOR_MAP.legend]
          },
          {
            label: labels.topLeft.label,
            color: labels.topLeft.color,
            position: 'Top Left',
            ...QUADRANT_COLOR_MAP.legend[labels.topLeft.color as keyof typeof QUADRANT_COLOR_MAP.legend]
          },
          {
            label: labels.bottomRight.label,
            color: labels.bottomRight.color,
            position: 'Bottom Right',
            ...QUADRANT_COLOR_MAP.legend[labels.bottomRight.color as keyof typeof QUADRANT_COLOR_MAP.legend]
          },
          {
            label: labels.bottomLeft.label,
            color: labels.bottomLeft.color,
            position: 'Bottom Left',
            ...QUADRANT_COLOR_MAP.legend[labels.bottomLeft.color as keyof typeof QUADRANT_COLOR_MAP.legend]
          }
        ];

        return (
          <div
            className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mt-4"
            role="region"
            aria-labelledby="quadrant-legend-title"
          >
            <h4 id="quadrant-legend-title" className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Performance Quadrants
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs" role="list">
              {quadrantLegend.map((item, index) => (
                <div key={index} className="flex items-center space-x-2" role="listitem">
                  <div
                    className="w-4 h-4 rounded border-2 flex-shrink-0"
                    style={{
                      backgroundColor: item.bg,
                      borderColor: item.border
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {item.label}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">
                      {item.position}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Quadrants are based on the mean values of {scatterData?.xLabel} and {scatterData?.yLabel}
            </div>
          </div>
        );
      })()}

      {/* Progress indicators */}
      {highlightAthlete && (
        <div className="mt-4 text-sm">
          <div className="text-center text-muted-foreground mb-2">
            Connected points show performance progression over time
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="font-medium">Trajectory</div>
              <div className="text-lg font-bold text-blue-600">
                {/* Calculate overall improvement direction */}
                {(() => {
                  const athleteData = getFirstObjectValue(scatterData.athleteTrends);
                  if (!athleteData || !athleteData.metrics) return 'N/A';

                  const xData = athleteData.metrics[scatterData.xMetric] || [];
                  const yData = athleteData.metrics[scatterData.yMetric] || [];

                  if (xData.length < 2 || yData.length < 2) return 'N/A';

                  // Safely access array elements and convert values
                  const xLastPoint = safeArrayAccess(xData, xData.length - 1);
                  const xFirstPoint = safeArrayAccess(xData, 0);
                  const yLastPoint = safeArrayAccess(yData, yData.length - 1);
                  const yFirstPoint = safeArrayAccess(yData, 0);

                  if (!xLastPoint || !xFirstPoint || !yLastPoint || !yFirstPoint) return 'N/A';
                  if (!hasValue(xLastPoint) || !hasValue(xFirstPoint) || !hasValue(yLastPoint) || !hasValue(yFirstPoint)) return 'N/A';

                  const xLastValue = parseValue(xLastPoint.value);
                  const xFirstValue = parseValue(xFirstPoint.value);
                  const yLastValue = parseValue(yLastPoint.value);
                  const yFirstValue = parseValue(yFirstPoint.value);

                  const xImprovement = xLastValue - xFirstValue;
                  const yImprovement = yLastValue - yFirstValue;
                  
                  const xBetter = METRIC_CONFIG[scatterData.xMetric as keyof typeof METRIC_CONFIG]?.lowerIsBetter ? 
                    xImprovement < 0 : xImprovement > 0;
                  const yBetter = METRIC_CONFIG[scatterData.yMetric as keyof typeof METRIC_CONFIG]?.lowerIsBetter ? 
                    yImprovement < 0 : yImprovement > 0;
                  
                  if (xBetter && yBetter) return '↗️ Improving Both';
                  if (xBetter || yBetter) return '↕️ Mixed Progress';
                  return '↘️ Needs Focus';
                })()}
              </div>
            </div>
            
            <div>
              <div className="font-medium">Personal Bests</div>
              <div className="text-lg font-bold text-yellow-600">
                {/* Count personal bests in the data */}
                {(() => {
                  const pbCount = scatterData.datasets[0]?.data?.filter((point: any) => 
                    point.isPersonalBest
                  ).length || 0;
                  
                  return `${pbCount} 🏆`;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Optimize re-renders by comparing critical props
  return (
    prevProps.data === nextProps.data &&
    prevProps.config === nextProps.config &&
    prevProps.statistics === nextProps.statistics &&
    prevProps.highlightAthlete === nextProps.highlightAthlete &&
    JSON.stringify(prevProps.selectedAthleteIds) === JSON.stringify(nextProps.selectedAthleteIds) &&
    prevProps.maxAthletes === nextProps.maxAthletes &&
    prevProps.onAthleteSelectionChange === nextProps.onAthleteSelectionChange
  );
});

export default ConnectedScatterChart;