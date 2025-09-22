import React, { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { AthleteSelector as AthleteSelectionEnhanced } from '@/components/ui/athlete-selector-enhanced';
import type {
  MultiMetricData,
  ChartConfiguration,
  StatisticalSummary,
  TrendData
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

// Register Chart.js components
ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

interface RadarChartProps {
  data: MultiMetricData[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
  selectedAthleteIds?: string[];
  onAthleteSelectionChange?: (athleteIds: string[]) => void;
  maxAthletes?: number;
}

export function RadarChart({ 
  data, 
  config, 
  statistics, 
  highlightAthlete,
  selectedAthleteIds,
  onAthleteSelectionChange,
  maxAthletes = 10
}: RadarChartProps) {
  // State for athlete visibility toggles
  const [athleteToggles, setAthleteToggles] = useState<Record<string, boolean>>({});
  const [showGroupAverage, setShowGroupAverage] = useState(true);

  // Smart default selection for athletes when not controlled by parent
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);

  // Use external selection if provided, otherwise use internal state
  const effectiveSelectedIds = selectedAthleteIds || internalSelectedIds;
  const handleSelectionChange = onAthleteSelectionChange || setInternalSelectedIds;

  // Debug logging
  console.log('RadarChart Debug:', {
    dataLength: data?.length || 0,
    dataType: Array.isArray(data) ? 'array' : typeof data,
    hasStatistics: !!statistics,
    highlightAthlete,
    sampleData: data?.slice(0, 2)
  });

  // Get all available athletes sorted by performance
  const allAthletes = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Sort athletes by performance for smart defaults
    const firstMetric = Object.keys(data[0]?.metrics || {})[0];
    if (!firstMetric) return [];

    const metricConfig = METRIC_CONFIG[firstMetric as keyof typeof METRIC_CONFIG];
    const lowerIsBetter = metricConfig?.lowerIsBetter || false;

    const sortedData = [...data].sort((a, b) => {
      const aValue = a.metrics[firstMetric];
      const bValue = b.metrics[firstMetric];
      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return 1;
      if (bValue === undefined) return -1;

      return lowerIsBetter ? aValue - bValue : bValue - aValue;
    });

    return sortedData.map((athlete, index) => ({
      id: athlete.athleteId,
      name: athlete.athleteName,
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

  // Convert MultiMetricData to TrendData format for enhanced athlete selector
  const trendDataForSelector = useMemo((): TrendData[] => {
    if (!data || data.length === 0) return [];

    // Get the primary metric from the first available metric
    const allMetrics = new Set<string>();
    data.forEach(athlete => {
      Object.keys(athlete.metrics).forEach(metric => allMetrics.add(metric));
    });
    const primaryMetric = Array.from(allMetrics)[0] || 'FLY10_TIME';

    return data.map(athlete => ({
      athleteId: athlete.athleteId,
      athleteName: athlete.athleteName,
      metric: primaryMetric,
      teamName: '', // MultiMetricData doesn't include team info
      data: [{
        date: new Date(),
        value: athlete.metrics[primaryMetric] || 0,
        isPersonalBest: false
      }]
    }));
  }, [data]);

  // Initialize toggles with displayed athletes enabled by default
  React.useEffect(() => {
    const initialToggles: Record<string, boolean> = {};
    displayedAthletes.forEach(athlete => {
      initialToggles[athlete.id] = true;
    });
    setAthleteToggles(initialToggles);
  }, [displayedAthletes]);

  // Transform data for radar chart
  const radarData = useMemo(() => {
    if (!data || data.length === 0) {
      console.log('RadarChart: No data provided');
      return null;
    }

    // Get all metrics from the data
    const allMetrics = new Set<string>();
    data.forEach(athlete => {
      Object.keys(athlete.metrics).forEach(metric => allMetrics.add(metric));
    });

    const metrics = Array.from(allMetrics);
    console.log('RadarChart: Found metrics:', metrics);

    if (metrics.length < 3) {
      console.log(`RadarChart: Insufficient metrics (${metrics.length}/3 minimum required)`);
      return null;
    }

    // Create labels from metric config
    const labels = metrics.map(metric => 
      METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric
    );

    // Calculate group averages for comparison
    const groupAverages = metrics.map(metric => {
      const values = data
        .map(athlete => athlete.metrics[metric])
        .filter(value => value !== undefined);

      return values.length > 0 ? 
        values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    });

    // Min-max values for scaling
    const minMaxValues: Record<string, { min: number, max: number }> = {};
    metrics.forEach(metric => {
      const values = data
        .map(athlete => athlete.metrics[metric])
        .filter(value => value !== undefined);

      if (values.length > 0) {
        minMaxValues[metric] = {
          min: Math.min(...values),
          max: Math.max(...values)
        };
      } else {
        minMaxValues[metric] = { min: 0, max: 100 }; // Default if no data
      }
    });

    // Check if metric has lower is better from configuration
    const isLowerIsBetter = (metric: string): boolean => {
      const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
      return metricConfig?.lowerIsBetter || false;
    };

    // Filter based on highlighted athlete or toggle states
    const athletesToShow = highlightAthlete
      ? data.filter(athlete => athlete.athleteId === highlightAthlete)
      : data.filter(athlete =>
          displayedAthletes.some(a => a.id === athlete.athleteId) &&
          athleteToggles[athlete.athleteId]
        );

    if (athletesToShow.length === 0) return null;

    const datasets = [];

    // Group average dataset
    const normalizedGroupAverages = groupAverages.map((avg, index) => {
      const metric = metrics[index];
      const min = minMaxValues[metric].min;
      const max = minMaxValues[metric].max;
      const range = max - min;
      if (range === 0) return 50;
      let scaledAvg;
      if (isLowerIsBetter(metric)) {
        // For metrics where lower is better, invert the scaling
        scaledAvg = ((max - avg) / range) * 100;
      } else {
        // For metrics where higher is better, use normal scaling
        scaledAvg = ((avg - min) / range) * 100;
      }
      return Math.max(0, Math.min(100, scaledAvg));
    });

    // Add group average dataset if enabled
    if (showGroupAverage) {
      datasets.push({
        label: 'Group Average',
        data: normalizedGroupAverages,
        backgroundColor: 'rgba(156, 163, 175, 0.2)',
        borderColor: 'rgba(156, 163, 175, 1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(156, 163, 175, 1)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgba(156, 163, 175, 1)',
        pointRadius: 4
      });
    }

    const colors = [
      { bg: 'rgba(59, 130, 246, 0.3)', border: 'rgba(59, 130, 246, 1)' },
      { bg: 'rgba(16, 185, 129, 0.3)', border: 'rgba(16, 185, 129, 1)' },
      { bg: 'rgba(239, 68, 68, 0.3)', border: 'rgba(239, 68, 68, 1)' },
      { bg: 'rgba(245, 158, 11, 0.3)', border: 'rgba(245, 158, 11, 1)' },
      { bg: 'rgba(139, 92, 246, 0.3)', border: 'rgba(139, 92, 246, 1)' }
    ];

    // Add athlete datasets only for visible athletes
    athletesToShow.forEach((athlete, index) => {
      const athleteValues = metrics.map(metric => {
        const value = athlete.metrics[metric];
        if (value === undefined) return 0;

        const min = minMaxValues[metric].min;
        const max = minMaxValues[metric].max;
        const range = max - min;
        if (range === 0) return 50;
        let scaledValue;
        if (isLowerIsBetter(metric)) {
          // For metrics where lower is better, invert the scaling
          scaledValue = ((max - value) / range) * 100;
        } else {
          // For metrics where higher is better, use normal scaling
          scaledValue = ((value - min) / range) * 100;
        }
        return Math.max(0, Math.min(100, scaledValue));
      });

      const color = colors[index % colors.length];

      datasets.push({
        label: athlete.athleteName,
        data: athleteValues,
        backgroundColor: color.bg,
        borderColor: color.border,
        borderWidth: highlightAthlete === athlete.athleteId ? 3 : 2,
        pointBackgroundColor: color.border,
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: color.border,
        pointRadius: highlightAthlete === athlete.athleteId ? 6 : 4
      });
    });

    return {
      labels,
      datasets,
      metrics,
      groupAverages,
      minMaxValues
    };
  }, [data, statistics, highlightAthlete, athleteToggles, displayedAthletes, showGroupAverage]);

  // Chart options
  const options: ChartOptions<'radar'> = {
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
            return context[0].dataset.label || '';
          },
          label: (context) => {
            const metricIndex = context.dataIndex;
            const metric = radarData?.metrics[metricIndex];
            const rawValue = context.parsed.r;

            if (!metric) return '';

            // Find the actual value for this athlete and metric
            const athleteName = context.dataset.label;
            let actualValue = 0;

            if (athleteName === 'Group Average') {
              actualValue = radarData?.groupAverages[metricIndex] || 0;
            } else {
              const athlete = data.find(a => a.athleteName === athleteName);
              actualValue = athlete?.metrics[metric] || 0;
            }

            const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
            const label = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;

            return [
              `${label}: ${actualValue.toFixed(2)}${unit}`,
              `Scaled: ${rawValue.toFixed(1)}% of range`
            ];
          }
        }
      },
      legend: {
        display: config.showLegend,
        position: 'top' as const
      }
    },
    scales: {
      r: {
        beginAtZero: true,
        min: 0,
        max: 100,
        ticks: {
          stepSize: 20,
          callback: (value) => `${value}%`
        },
        pointLabels: {
          font: {
            size: 12
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        },
        angleLines: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    elements: {
      line: {
        borderWidth: 2
      },
      point: {
        hoverRadius: 8
      }
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

  if (!radarData || !data || data.length === 0) {
    const metrics = data && data.length > 0 ? 
      new Set(data.flatMap(athlete => Object.keys(athlete.metrics))) : 
      new Set();

    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Radar Chart Unavailable</div>
          <div className="text-sm">
            Radar charts require at least 3 metrics. Currently selected: {metrics.size} metric{metrics.size !== 1 ? 's' : ''}.
          </div>
          <div className="text-xs mt-2 text-gray-500">
            Add more metrics in the Additional Metrics section above.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Enhanced Athlete Selection - Only show when not in highlight mode and we have enough athletes */}
      {!highlightAthlete && data.length > 0 && trendDataForSelector.length > 0 && (
        <AthleteSelectionEnhanced
          data={trendDataForSelector}
          selectedAthleteIds={effectiveSelectedIds}
          onSelectionChange={handleSelectionChange}
          maxSelection={maxAthletes}
          metric={Array.from(new Set(data.flatMap(athlete => Object.keys(athlete.metrics))))[0] || 'FLY10_TIME'}
          className="mb-4"
        />
      )}

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
              id="group-average-radar"
              checked={showGroupAverage}
              onCheckedChange={(checked) => setShowGroupAverage(checked === true)}
            />
            <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-400" />
            <label htmlFor="group-average-radar" className="text-sm cursor-pointer">
              Group Average
            </label>
          </div>
        </div>
      )}

      {/* Chart Container with fixed height */}
      <div className="h-96 w-full">
        <Radar data={radarData} options={options} />
      </div>

      {/* Performance summary */}
      <div className="mt-4 text-sm">
        <div className="text-center text-muted-foreground mb-2">
          Values shown as min-max scaled (0-100%) within group range
        </div>

        {highlightAthlete && (
          <div className="grid grid-cols-3 gap-4 text-center">
            {radarData.metrics.slice(0, 3).map((metric, index) => {
              const athlete = data.find(a => a.athleteId === highlightAthlete);
              const value = athlete?.metrics[metric];
              const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
              const label = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;
              const isLowerBetter = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.lowerIsBetter || false;
              const min = radarData.minMaxValues[metric]?.min;
              const max = radarData.minMaxValues[metric]?.max;

              if (value === undefined || min === undefined || max === undefined) {
                return null; // Skip if data is missing
              }

              const range = max - min;
              let percentageOfRange = 0;
              if (range !== 0) {
                if (isLowerBetter) {
                  // For metrics where lower is better, invert the scaling
                  percentageOfRange = ((max - value) / range) * 100;
                } else {
                  // For metrics where higher is better, use normal scaling
                  percentageOfRange = ((value - min) / range) * 100;
                }
              }
              const clampedPercentage = Math.max(0, Math.min(100, percentageOfRange));

              return (
                <div key={metric} className="space-y-1">
                  <div className="font-medium text-xs">{label}</div>
                  <div className="text-lg font-bold">
                    {value?.toFixed(2)}{unit}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {clampedPercentage.toFixed(1)}% of range
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default RadarChart;