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
import type { 
  MultiMetricData, 
  ChartConfiguration, 
  StatisticalSummary 
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
}

export function RadarChart({ 
  data, 
  config, 
  statistics, 
  highlightAthlete 
}: RadarChartProps) {
  // State for athlete visibility toggles
  const [athleteToggles, setAthleteToggles] = useState<Record<string, boolean>>({});
  const [showGroupAverage, setShowGroupAverage] = useState(true);

  // Debug logging
  console.log('RadarChart Debug:', {
    dataLength: data?.length || 0,
    dataType: Array.isArray(data) ? 'array' : typeof data,
    hasStatistics: !!statistics,
    highlightAthlete,
    sampleData: data?.slice(0, 2)
  });

  // Get all available athletes for toggle controls
  const allAvailableAthletes = useMemo(() => {
    return highlightAthlete ? 
      data.filter(athlete => athlete.athleteId === highlightAthlete) :
      data.slice(0, 5);
  }, [data, highlightAthlete]);

  // Initialize toggles with all athletes enabled by default
  React.useEffect(() => {
    const initialToggles: Record<string, boolean> = {};
    allAvailableAthletes.forEach(athlete => {
      initialToggles[athlete.athleteId] = true;
    });
    setAthleteToggles(initialToggles);
  }, [allAvailableAthletes]);

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

    // Filter athletes based on highlight mode or toggle states (same logic as LineChart)
    const athletesToShow = highlightAthlete
      ? data.filter(athlete => athlete.athleteId === highlightAthlete)
      : data.filter(athlete =>
          allAvailableAthletes.some(a => a.athleteId === athlete.athleteId) &&
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
  }, [data, statistics, highlightAthlete, athleteToggles, allAvailableAthletes, showGroupAverage]);

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
    allAvailableAthletes.forEach(athlete => {
      allEnabled[athlete.athleteId] = true;
    });
    setAthleteToggles(allEnabled);
  };

  const clearAllAthletes = () => {
    const allDisabled: Record<string, boolean> = {};
    allAvailableAthletes.forEach(athlete => {
      allDisabled[athlete.athleteId] = false;
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
      {/* Athlete Controls Panel - Only show when not in highlight mode */}
      {!highlightAthlete && allAvailableAthletes.length > 0 && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">
              Athletes ({visibleAthleteCount} of {allAvailableAthletes.length} visible)
            </h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllAthletes}
                disabled={visibleAthleteCount === allAvailableAthletes.length}
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
            {allAvailableAthletes.map((athlete, index) => {
              const colors = [
                'rgba(59, 130, 246, 1)',    // Blue
                'rgba(16, 185, 129, 1)',    // Green
                'rgba(239, 68, 68, 1)',     // Red
                'rgba(245, 158, 11, 1)',    // Amber
                'rgba(139, 92, 246, 1)'     // Purple
              ];
              const athleteColor = colors[index % colors.length];

              return (
                <div key={athlete.athleteId} className="flex items-center space-x-2">
                  <Checkbox
                    id={`athlete-${athlete.athleteId}`}
                    checked={athleteToggles[athlete.athleteId] !== false}
                    onCheckedChange={() => toggleAthlete(athlete.athleteId)}
                  />
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: athleteColor }}
                  />
                  <label
                    htmlFor={`athlete-${athlete.athleteId}`}
                    className="text-sm cursor-pointer flex-1 truncate"
                  >
                    {athlete.athleteName}
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

      <Radar data={radarData} options={options} />

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