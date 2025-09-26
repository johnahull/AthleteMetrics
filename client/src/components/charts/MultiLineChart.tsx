import React, { useMemo, useState, useEffect } from 'react';
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
import { AthleteSelector } from './components/AthleteSelector';

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

interface MultiLineChartProps {
  data: TrendData[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
  selectedAthleteIds?: string[];
  onAthleteSelectionChange?: (athleteIds: string[]) => void;
  maxAthletes?: number;
}

export function MultiLineChart({
  data,
  config,
  statistics,
  highlightAthlete,
  selectedAthleteIds,
  onAthleteSelectionChange,
  maxAthletes = 3
}: MultiLineChartProps) {
  // Get unique athletes from data
  const availableAthletes = useMemo(() => {
    if (!data || data.length === 0) return [];

    const athleteMap = new Map();
    data.forEach(trend => {
      if (!athleteMap.has(trend.athleteId)) {
        athleteMap.set(trend.athleteId, {
          id: trend.athleteId,
          name: trend.athleteName,
          color: athleteMap.size
        });
      }
    });

    return Array.from(athleteMap.values());
  }, [data]);

  // Initialize athlete selection state
  const [internalSelectedAthleteIds, setInternalSelectedAthleteIds] = useState<string[]>([]);
  const [athleteToggles, setAthleteToggles] = useState<Record<string, boolean>>({});

  // Use external selectedAthleteIds if provided, otherwise use internal state
  const effectiveSelectedAthleteIds = selectedAthleteIds || internalSelectedAthleteIds;

  // Initialize selections when data changes
  useEffect(() => {
    if (availableAthletes.length > 0) {
      if (!selectedAthleteIds) {
        // Use internal state - select first few athletes by default
        const defaultSelected = availableAthletes.slice(0, Math.min(3, maxAthletes)).map(a => a.id);
        setInternalSelectedAthleteIds(defaultSelected);

        const defaultToggles = availableAthletes.reduce((acc, athlete) => {
          acc[athlete.id] = defaultSelected.includes(athlete.id);
          return acc;
        }, {} as Record<string, boolean>);
        setAthleteToggles(defaultToggles);
      } else {
        // Use external state
        const toggles = availableAthletes.reduce((acc, athlete) => {
          acc[athlete.id] = selectedAthleteIds.includes(athlete.id);
          return acc;
        }, {} as Record<string, boolean>);
        setAthleteToggles(toggles);
      }
    }
  }, [availableAthletes, selectedAthleteIds, maxAthletes]);

  // Handle athlete toggle
  const handleToggleAthlete = (athleteId: string) => {
    const isCurrentlySelected = athleteToggles[athleteId];
    const currentSelectedCount = Object.values(athleteToggles).filter(Boolean).length;

    // If trying to select and already at limit, don't allow
    if (!isCurrentlySelected && currentSelectedCount >= maxAthletes) {
      return; // Prevent selecting more than maxAthletes
    }

    const newToggles = { ...athleteToggles, [athleteId]: !athleteToggles[athleteId] };
    setAthleteToggles(newToggles);

    const newSelected = Object.keys(newToggles).filter(id => newToggles[id]);

    if (onAthleteSelectionChange) {
      onAthleteSelectionChange(newSelected);
    } else {
      setInternalSelectedAthleteIds(newSelected);
    }
  };

  // Handle select all
  const handleSelectAll = () => {
    const idsToSelect = availableAthletes.slice(0, maxAthletes).map(a => a.id);
    const newToggles = availableAthletes.reduce((acc, athlete) => {
      acc[athlete.id] = idsToSelect.includes(athlete.id);
      return acc;
    }, {} as Record<string, boolean>);
    setAthleteToggles(newToggles);

    if (onAthleteSelectionChange) {
      onAthleteSelectionChange(idsToSelect);
    } else {
      setInternalSelectedAthleteIds(idsToSelect);
    }
  };

  // Handle clear all
  const handleClearAll = () => {
    const newToggles = availableAthletes.reduce((acc, athlete) => {
      acc[athlete.id] = false;
      return acc;
    }, {} as Record<string, boolean>);
    setAthleteToggles(newToggles);

    if (onAthleteSelectionChange) {
      onAthleteSelectionChange([]);
    } else {
      setInternalSelectedAthleteIds([]);
    }
  };

  // Colors and styles for chart lines - defined outside useMemo for legend access
  const athleteColors = [
    'rgba(59, 130, 246, 1)',    // Blue
    'rgba(16, 185, 129, 1)',    // Green
    'rgba(239, 68, 68, 1)'      // Red
  ];

  const metricColors = [
    'rgba(59, 130, 246, 1)',    // Blue
    'rgba(16, 185, 129, 1)',    // Green
    'rgba(239, 68, 68, 1)',     // Red
    'rgba(245, 158, 11, 1)',    // Amber
    'rgba(139, 92, 246, 1)',    // Violet
    'rgba(236, 72, 153, 1)',    // Pink
    'rgba(34, 197, 94, 1)',     // Emerald
    'rgba(251, 113, 133, 1)'    // Rose
  ];

  const metricStyles = [
    { dash: [], opacity: 1, name: 'Solid' },
    { dash: [10, 5], opacity: 1, name: 'Dashed' },
    { dash: [2, 2], opacity: 1, name: 'Dotted' },
    { dash: [10, 5, 2, 5], opacity: 1, name: 'Dash-Dot' },
    { dash: [10, 5, 2, 5, 2, 5], opacity: 1, name: 'Dash-Dot-Dot' }
  ];

  // Transform trend data for multi-line chart
  const multiLineData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Group by athlete and metric
    const athleteMetrics = data.reduce((acc, trend) => {
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

    // Filter athletes to show based on selection
    const athletesToShow = highlightAthlete ?
      Object.values(athleteMetrics).filter((athlete: any) => athlete.athleteId === highlightAthlete) :
      Object.values(athleteMetrics).filter((athlete: any) => effectiveSelectedAthleteIds.includes(athlete.athleteId));

    if (athletesToShow.length === 0) return null;

    // Get all unique dates and metrics
    const allDates = new Set<string>();
    const allMetrics = new Set<string>();

    data.forEach(trend => {
      allMetrics.add(trend.metric);
      trend.data.forEach(point => {
        const date = point.date instanceof Date ? point.date : new Date(point.date);
        allDates.add(date.toISOString().split('T')[0]);
      });
    });

    const sortedDates = Array.from(allDates).sort();
    const metrics = Array.from(allMetrics);

    // Create labels
    const labels = sortedDates.map(dateStr => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    });

    // Determine if this is individual analysis (single athlete)
    const isSingleAthlete = athletesToShow.length === 1;

    const datasets: any[] = [];

    // Create dataset for each athlete-metric combination
    athletesToShow.forEach((athlete: any, athleteIndex) => {
      metrics.forEach((metric, metricIndex) => {
        const metricData = athlete.metrics[metric];
        if (!metricData) return;

        // Normalize values to 0-100 scale for comparison
        const stats = statistics?.[metric];
        const normalizeValue = (value: number) => {
          if (!stats) return value;
          // Use percentile rank for normalization
          const range = stats.max - stats.min;
          return range > 0 ? ((value - stats.min) / range) * 100 : 50;
        };

        // Create data points for each date
        const lineData = sortedDates.map(dateStr => {
          const point = metricData.find((p: any) => {
            const pointDate = p.date instanceof Date ? p.date : new Date(p.date);
            return pointDate.toISOString().split('T')[0] === dateStr;
          });
          return point ? normalizeValue(point.value) : null;
        });

        const isHighlighted = athlete.athleteId === highlightAthlete;
        const metricLabel = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;

        // Color strategy based on analysis type
        let borderColor: string;
        let label: string;
        let borderDash: number[] = [];

        if (isSingleAthlete) {
          // Individual analysis: different colors for each metric, solid lines
          borderColor = metricColors[metricIndex % metricColors.length];
          label = metricLabel; // Just the metric name
          borderDash = []; // Solid lines
        } else {
          // Multi-athlete analysis: different colors for athletes, dash patterns for metrics
          const baseColor = athleteColors[athleteIndex % athleteColors.length];
          const style = metricStyles[metricIndex % metricStyles.length];
          borderColor = baseColor; // Keep full opacity for clarity
          label = `${athlete.athleteName} - ${metricLabel}`;
          borderDash = style.dash;
        }

        datasets.push({
          label,
          data: lineData,
          borderColor,
          backgroundColor: borderColor.replace('1)', '0.1)'),
          borderWidth: isHighlighted ? 3 : 2,
          borderDash,
          pointRadius: isHighlighted ? 4 : 2,
          pointHoverRadius: isHighlighted ? 6 : 4,
          pointBackgroundColor: borderColor,
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          fill: false,
          tension: 0.1,
          spanGaps: true
        });
      });
    });


    return {
      labels,
      datasets,
      metrics,
      sortedDates,
      athletesToShow
    };
  }, [data, statistics, highlightAthlete, effectiveSelectedAthleteIds]);

  // Determine if this is individual analysis (single athlete) - needed for legend
  const isSingleAthlete = multiLineData?.athletesToShow?.length === 1;

  // Chart options
  const options: ChartOptions<'line'> = {
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
          title: (context: any) => {
            const dateIndex = context[0].dataIndex;
            const dateStr = multiLineData?.sortedDates[dateIndex];
            return dateStr ? new Date(dateStr).toLocaleDateString() : '';
          },
          label: (context: any) => {
            const value = context.parsed.y;
            if (value === null) return '';

            return `${context.dataset.label}: ${value.toFixed(1)}%`;
          },
          afterLabel: (context: any) => {
            // Find the actual value for this data point
            const datasetLabel = context.dataset.label || '';
            const [athleteName, metricName] = datasetLabel.split(' - ');

            if (datasetLabel.includes('Group Avg')) return [];

            const athlete = multiLineData?.athletesToShow.find((a: any) => 
              a.athleteName === athleteName
            );

            if (!athlete) return [];

            const metric = multiLineData?.metrics.find(m => 
              (METRIC_CONFIG[m as keyof typeof METRIC_CONFIG]?.label || m) === metricName
            );

            if (!metric) return [];

            const dateStr = multiLineData?.sortedDates[context.dataIndex];
            const metricData = athlete.metrics[metric];
            const point = metricData?.find((p: any) => {
              const pointDate = p.date instanceof Date ? p.date : new Date(p.date);
              return pointDate.toISOString().split('T')[0] === dateStr;
            });

            if (point) {
              const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
              return [`Actual: ${point.value.toFixed(2)}${unit}`];
            }

            return [];
          }
        }
      },
      legend: {
        display: config.showLegend,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'line'
        }
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
          text: 'Normalized Performance (%)'
        },
        min: 0,
        max: 100,
        grid: {
          display: true
        },
        ticks: {
          callback: (value: any) => `${value}%`
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

  if (!multiLineData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No trend data available for multi-line chart
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Athlete Selector - only show for multi-athlete scenarios */}
      {availableAthletes.length > 1 && !highlightAthlete && (
        <AthleteSelector
          athletes={availableAthletes}
          athleteToggles={athleteToggles}
          showGroupAverage={false}
          onToggleAthlete={handleToggleAthlete}
          onSelectAll={handleSelectAll}
          onClearAll={handleClearAll}
          onToggleGroupAverage={() => {}} // Not used in multi-line chart
          className="mb-4"
        />
      )}

      <Line data={multiLineData} options={options} />

      {/* Chart explanation */}
      <div className="mt-4 text-sm">
        <div className="text-center text-muted-foreground mb-2">
          All metrics normalized to 0-100% scale for comparison.
        </div>

        {/* Enhanced Legend */}
        <div className="space-y-4">
          {/* Athletes Legend */}
          {!isSingleAthlete && (
            <div>
              <h4 className="text-sm font-medium mb-2">Athletes:</h4>
              <div className="grid grid-cols-3 gap-2">
                {multiLineData.athletesToShow.map((athlete, index) => {
                  const color = athleteColors[index % athleteColors.length];
                  return (
                    <div key={athlete.athleteId} className="flex items-center space-x-2">
                      <div
                        className="w-4 h-3 rounded"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs truncate" title={athlete.athleteName}>
                        {athlete.athleteName}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Metrics Legend */}
          <div>
            <h4 className="text-sm font-medium mb-2">Metrics & Line Styles:</h4>
            <div className="grid grid-cols-1 gap-2">
              {multiLineData.metrics.map((metric, index) => {
                const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
                const label = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;
                const isLowerBetter = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.lowerIsBetter;
                const style = metricStyles[index % metricStyles.length];

                return (
                  <div key={metric} className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <svg width="32" height="8" className="flex-shrink-0">
                        <line
                          x1="0" y1="4" x2="32" y2="4"
                          stroke="rgba(75, 85, 99, 1)"
                          strokeWidth="2"
                          strokeDasharray={style.dash.length > 0 ? style.dash.join(',') : '0'}
                        />
                      </svg>
                      <span className="text-xs">
                        <strong>{style.name}:</strong> {label} ({unit}) {isLowerBetter ? '↓' : '↑'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {isSingleAthlete && (
            <div className="text-center text-xs text-muted-foreground mt-2">
              Different colors represent different metrics for the selected athlete.
            </div>
          )}

          {!isSingleAthlete && (
            <div className="text-center text-xs text-muted-foreground mt-2">
              Each athlete has a unique color. Different line styles represent different metrics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MultiLineChart;