import React, { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';
import type { 
  TrendData, 
  ChartConfiguration, 
  StatisticalSummary 
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  parseValue,
  compareDatesByDay,
  safeArrayAccess,
  getFirstObjectValue,
  hasValue,
  hasDate,
  safeDate
} from '@/utils/data-safety';

// Type definitions for chart data
interface ScatterPoint {
  x: number;
  y: number;
  date: unknown;
  isPersonalBest: boolean;
}

// Register Chart.js components
ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface ConnectedScatterChartProps {
  data: TrendData[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
  selectedAthleteIds?: string[];
  onAthleteSelectionChange?: (athleteIds: string[]) => void;
  maxAthletes?: number;
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

  // Smart default selection for athletes when not controlled by parent
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);

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
    if (!selectedAthleteIds && allAthletes.length > 0 && effectiveSelectedIds.length === 0) {
      // Auto-select athletes up to maxAthletes
      const defaultIds = allAthletes.slice(0, Math.min(maxAthletes, allAthletes.length)).map(a => a.id);
      setInternalSelectedIds(defaultIds);
    }
  }, [allAthletes, maxAthletes, selectedAthleteIds, effectiveSelectedIds.length]);

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
    }, {} as Record<string, any>);

    const colors = [
      'rgba(59, 130, 246, 1)',
      'rgba(16, 185, 129, 1)',
      'rgba(239, 68, 68, 1)'
    ];

    const datasets = Object.values(athleteTrends).map((athlete: any, index) => {
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
        data: connectedPoints,
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
  const options: ChartOptions<'scatter'> = {
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
      }
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
  };

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
              const colors = [
                'rgba(59, 130, 246, 1)',    // Blue
                'rgba(16, 185, 129, 1)',    // Green
                'rgba(239, 68, 68, 1)',     // Red
                'rgba(245, 158, 11, 1)',    // Amber
                'rgba(139, 92, 246, 1)',    // Purple
                'rgba(236, 72, 153, 1)',    // Pink
                'rgba(20, 184, 166, 1)',    // Teal
                'rgba(251, 146, 60, 1)',    // Orange
                'rgba(124, 58, 237, 1)',    // Violet
                'rgba(34, 197, 94, 1)'      // Emerald - 10th color
              ];
              const athleteColor = colors[athlete.color % colors.length];

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
          <div className="flex items-center space-x-2 pt-2 border-t">
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
        </div>
      )}

      <Scatter data={scatterData} options={options} />
      
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
});

export default ConnectedScatterChart;