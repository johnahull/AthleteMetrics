import React, { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type {
  TrendData,
  ChartConfiguration,
  StatisticalSummary
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { isFly10Metric, formatFly10Dual } from '@/utils/fly10-conversion';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ChevronUpIcon, ChevronDownIcon } from 'lucide-react';
import { getAthleteColor } from '@/utils/chart-constants';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface LineChartProps {
  data: TrendData[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
  selectedAthleteIds?: string[];
  onAthleteSelectionChange?: (athleteIds: string[]) => void;
  maxAthletes?: number;
}

export function LineChart({
  data,
  config,
  statistics,
  highlightAthlete,
  selectedAthleteIds,
  onAthleteSelectionChange,
  maxAthletes = 10
}: LineChartProps) {
  // State for athlete visibility toggles
  const [athleteToggles, setAthleteToggles] = useState<Record<string, boolean>>({});
  const [showGroupAverage, setShowGroupAverage] = useState(true);
  const [isSelectionExpanded, setIsSelectionExpanded] = useState(false);

  // Smart default selection for athletes when not controlled by parent
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);

  // Use external selection if provided, otherwise use internal state
  const effectiveSelectedIds = selectedAthleteIds || internalSelectedIds;
  const handleSelectionChange = onAthleteSelectionChange || setInternalSelectedIds;

  // Get all available athletes sorted by performance
  const allAthletes = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Sort athletes by performance for smart defaults
    const metric = data[0]?.metric;
    const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
    const lowerIsBetter = metricConfig?.lowerIsBetter || false;

    const sortedData = [...data].sort((a, b) => {
      const aValues = a.data.map(point => point.value);
      const bValues = b.data.map(point => point.value);
      const aBest = lowerIsBetter ? Math.min(...aValues) : Math.max(...aValues);
      const bBest = lowerIsBetter ? Math.min(...bValues) : Math.max(...bValues);

      return lowerIsBetter ? aBest - bBest : bBest - aBest;
    });

    return sortedData.map((trend, index) => ({
      id: trend.athleteId,
      name: trend.athleteName,
      color: index
    }));
  }, [data]);

  // Initialize smart default selection when data changes and no external selection
  React.useEffect(() => {
    if (!selectedAthleteIds && allAthletes.length > 0 && effectiveSelectedIds.length === 0) {
      // Auto-select top performers up to maxAthletes
      const defaultIds = allAthletes.slice(0, Math.min(maxAthletes, allAthletes.length)).map(a => a.id);
      setInternalSelectedIds(defaultIds);
    }
  }, [allAthletes, maxAthletes, selectedAthleteIds, effectiveSelectedIds.length]);

  // Get athletes that should be displayed on chart (filtered by selection)
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

  // Initialize toggles with all athletes (first maxAthletes enabled by default)
  React.useEffect(() => {
    const initialToggles: Record<string, boolean> = {};
    allAthletes.forEach((athlete, index) => {
      initialToggles[athlete.id] = index < maxAthletes;
    });
    setAthleteToggles(initialToggles);
  }, [allAthletes, maxAthletes]);

  // Transform trend data for line chart
  // Memoize selected athlete IDs to prevent unnecessary re-renders when toggles object changes
  const selectedAthleteIdsSet = useMemo(
    () => new Set(Object.keys(athleteToggles).filter(id => athleteToggles[id])),
    [athleteToggles]
  );

  const lineData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Filter based on highlighted athlete or toggle states
    const trendsToShow = highlightAthlete
      ? data.filter(trend => trend.athleteId === highlightAthlete)
      : data.filter(trend => selectedAthleteIdsSet.has(trend.athleteId));

    if (trendsToShow.length === 0) return null;

    // Get all unique dates for consistent x-axis
    const allDates = new Set<string>();
    trendsToShow.forEach(trend => {
      trend.data.forEach(point => {
        const date = point.date instanceof Date ? point.date : new Date(point.date);
        allDates.add(date.toISOString().split('T')[0]);
      });
    });

    const sortedDates = Array.from(allDates).sort();
    const labels = sortedDates.map(dateStr => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    });

    const datasets = trendsToShow.map((trend) => {
      // Create data points for each date
      const trendData = sortedDates.map(dateStr => {
        const point = trend.data.find(p => {
          const pointDate = p.date instanceof Date ? p.date : new Date(p.date);
          return pointDate.toISOString().split('T')[0] === dateStr;
        });
        return point ? point.value : null;
      });

      // Find displayed athlete index for consistent color mapping
      const displayedIndex = displayedAthletes.findIndex(a => a.id === trend.athleteId);
      const safeIndex = displayedIndex >= 0 ? displayedIndex : 0;
      const color = getAthleteColor(safeIndex); // Use shared color constants
      const isHighlighted = trend.athleteId === highlightAthlete;

      return {
        label: trend.athleteName,
        data: trendData,
        borderColor: color,
        backgroundColor: color.replace('1)', '0.1)'),
        borderWidth: isHighlighted ? 3 : 2,
        pointRadius: isHighlighted ? 5 : 3,
        pointHoverRadius: isHighlighted ? 7 : 5,
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        fill: false,
        tension: 0.1,
        spanGaps: true // Connect line across null values
      };
    });

    // Add group average line if available and enabled
    if (showGroupAverage && trendsToShow.length > 0 && trendsToShow[0].data[0]?.groupAverage !== undefined) {
      const groupAverageData = sortedDates.map(dateStr => {
        // Find the group average for this specific date from any athlete's data
        // Since group average is per-date, we can use any athlete that has data for this date
        for (const trend of trendsToShow) {
          const point = trend.data.find(p => {
            const pointDate = p.date instanceof Date ? p.date : new Date(p.date);
            return pointDate.toISOString().split('T')[0] === dateStr;
          });
          if (point && point.groupAverage !== undefined) {
            return point.groupAverage;
          }
        }
        return null;
      });

      datasets.push({
        label: 'Group Average',
        data: groupAverageData,
        borderColor: 'rgba(156, 163, 175, 1)',
        backgroundColor: 'rgba(156, 163, 175, 0.1)',
        borderWidth: 2,
        // borderDash: [5, 5], // Comment out for now due to type issues
        pointRadius: 0,
        pointHoverRadius: 4,
        pointBackgroundColor: 'rgba(156, 163, 175, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        fill: false,
        tension: 0.1,
        spanGaps: true
      });
    }

    const metric = trendsToShow[0].metric;
    const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
    const metricLabel = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;

    return {
      labels,
      datasets,
      metric,
      unit,
      metricLabel,
      sortedDates
    };
  }, [data, highlightAthlete, selectedAthleteIdsSet, showGroupAverage]);

  // Find personal bests
  const personalBests = useMemo(() => {
    if (!lineData || !data) return [];

    const bests: Array<{
      athleteId: string;
      athleteName: string;
      value: number;
      date: Date;
      datasetIndex: number;
      pointIndex: number;
    }> = [];

    data.forEach((trend, datasetIndex) => {
      if (highlightAthlete && trend.athleteId !== highlightAthlete) return;

      const bestPoint = trend.data.find(point => point.isPersonalBest);
      if (bestPoint) {
        const pointIndex = lineData.sortedDates.findIndex(dateStr => {
          const bestPointDate = bestPoint.date instanceof Date ? bestPoint.date : new Date(bestPoint.date);
          return bestPointDate.toISOString().split('T')[0] === dateStr;
        });

        if (pointIndex >= 0) {
          bests.push({
            athleteId: trend.athleteId,
            athleteName: trend.athleteName,
            value: bestPoint.value,
            date: bestPoint.date,
            datasetIndex,
            pointIndex
          });
        }
      }
    });

    return bests;
  }, [lineData, data, highlightAthlete]);

  // Chart options
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      ...config.plugins,
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
            const dateIndex = context[0].dataIndex;
            const dateStr = lineData?.sortedDates[dateIndex];
            return dateStr ? new Date(dateStr).toLocaleDateString() : '';
          },
          label: (context) => {
            const value = context.parsed.y;
            if (value === null) return '';

            // Format value with dual display for FLY10_TIME
            const formattedValue = lineData?.metric && isFly10Metric(lineData.metric)
              ? formatFly10Dual(value, 'time-first')
              : `${value.toFixed(2)}${lineData?.unit}`;

            return `${context.dataset.label}: ${formattedValue}`;
          },
          afterLabel: (context) => {
            const datasetIndex = context.datasetIndex;
            const pointIndex = context.dataIndex;

            // Check if this is a personal best
            const pb = personalBests.find(best =>
              best.datasetIndex === datasetIndex && best.pointIndex === pointIndex
            );

            return pb ? ['🏆 Personal Best!'] : [];
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
        title: {
          display: true,
          text: 'Date'
        },
        grid: {
          display: true
        }
      },
      y: {
        title: {
          display: true,
          text: `${lineData?.metricLabel} (${lineData?.unit})`
        },
        grid: {
          display: true
        }
      }
    },
    elements: {
      point: {
        hoverRadius: 8
      },
      line: {
        tension: 0.1
      }
    },
    interaction: {
      intersect: false,
      mode: 'index'
    }
  };

  // Helper functions for athlete toggles
  const toggleAthlete = (athleteId: string) => {
    const isCurrentlySelected = athleteToggles[athleteId];
    const currentSelectedCount = Object.values(athleteToggles).filter(Boolean).length;

    // If trying to select and already at limit, don't allow
    if (!isCurrentlySelected && currentSelectedCount >= maxAthletes) {
      return; // Don't change state
    }

    const newToggles = {
      ...athleteToggles,
      [athleteId]: !athleteToggles[athleteId]
    };
    setAthleteToggles(newToggles);

    // Call parent callback for controlled mode
    if (onAthleteSelectionChange) {
      const newSelected = Object.keys(newToggles).filter(id => newToggles[id]);
      onAthleteSelectionChange(newSelected);
    } else {
      // Update internal state for uncontrolled mode
      const newSelected = Object.keys(newToggles).filter(id => newToggles[id]);
      handleSelectionChange(newSelected);
    }
  };

  const selectAllAthletes = () => {
    const newToggles: Record<string, boolean> = {};
    allAthletes.forEach((athlete, index) => {
      newToggles[athlete.id] = index < maxAthletes;
    });
    setAthleteToggles(newToggles);

    // Call parent callback for controlled mode
    if (onAthleteSelectionChange) {
      const newSelected = Object.keys(newToggles).filter(id => newToggles[id]);
      onAthleteSelectionChange(newSelected);
    } else {
      const newSelected = Object.keys(newToggles).filter(id => newToggles[id]);
      handleSelectionChange(newSelected);
    }
  };

  const clearAllAthletes = () => {
    const allDisabled: Record<string, boolean> = {};
    allAthletes.forEach(athlete => {
      allDisabled[athlete.id] = false;
    });
    setAthleteToggles(allDisabled);

    // Call parent callback for controlled mode
    if (onAthleteSelectionChange) {
      onAthleteSelectionChange([]);
    } else {
      handleSelectionChange([]);
    }
  };

  const visibleAthleteCount = Object.values(athleteToggles).filter(Boolean).length;

  if (!lineData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No trend data available for line chart
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Athlete Controls Panel - Only show when not in highlight mode */}
      {!highlightAthlete && allAthletes.length > 0 && (
        <div className="mb-4">
          <Button
            variant="outline"
            onClick={() => setIsSelectionExpanded(!isSelectionExpanded)}
            className="flex items-center justify-between w-full"
          >
            <span>
              Select Athletes ({visibleAthleteCount} of {allAthletes.length} visible, max {maxAthletes})
            </span>
            {isSelectionExpanded ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" />
            )}
          </Button>

          {isSelectionExpanded && (
            <div className="mt-2 p-4 bg-gray-50 rounded-lg border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900">
                  Athletes ({visibleAthleteCount} of {allAthletes.length} visible, max {maxAthletes})
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllAthletes}
                    disabled={visibleAthleteCount >= maxAthletes}
                    title={`Select first ${maxAthletes} athletes`}
                  >
                    Select {maxAthletes}
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
                {allAthletes.map(athlete => {
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
        </div>
      )}

      <Line data={lineData} options={options} />

      {/* Progress indicators */}
      {highlightAthlete && personalBests.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="text-center">
            <div className="font-medium">Personal Best</div>
            <div className="text-lg font-bold text-green-600">
              {personalBests[0].value.toFixed(2)}{lineData.unit}
            </div>
            <div className="text-xs text-muted-foreground">
              {(() => {
                const date = personalBests[0].date instanceof Date ? personalBests[0].date : new Date(personalBests[0].date);
                return date.toLocaleDateString();
              })()}
            </div>
          </div>

          <div className="text-center">
            <div className="font-medium">Progress Trend</div>
            <div className="text-lg font-bold text-blue-600">
              {/* Calculate simple trend - positive or negative */}
              {(() => {
                const athleteTrend = data.find(t => t.athleteId === highlightAthlete);
                if (!athleteTrend || athleteTrend.data.length < 2) return 'N/A';

                const first = athleteTrend.data[0].value;
                const last = athleteTrend.data[athleteTrend.data.length - 1].value;
                const isLowerBetter = METRIC_CONFIG[athleteTrend.metric as keyof typeof METRIC_CONFIG]?.lowerIsBetter;

                const improvement = isLowerBetter ? first - last : last - first;
                const trend = improvement > 0 ? '↗️ Improving' : improvement < 0 ? '↘️ Declining' : '→ Stable';

                return trend;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LineChart;