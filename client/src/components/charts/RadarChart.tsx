import React, { useMemo } from 'react';
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
import type {
  MultiMetricData,
  ChartConfiguration,
  StatisticalSummary,
  ChartDataPoint
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
  maxAthletes
}: RadarChartProps) {
  // Transform data for radar chart
  const radarData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Check if data is MultiMetricData or ChartDataPoint
    const isMultiMetric = data.length > 0 && 'metrics' in data[0];

    let processedData: MultiMetricData[] = [];

    if (isMultiMetric) {
      // Data is already MultiMetricData
      processedData = data as MultiMetricData[];
    } else {
      // Convert ChartDataPoint data to MultiMetricData format
      const chartData = data as ChartDataPoint[];
      const athleteMap = new Map<string, Partial<MultiMetricData>>();

      chartData.forEach(point => {
        if (!athleteMap.has(point.athleteId)) {
          athleteMap.set(point.athleteId, {
            athleteId: point.athleteId,
            athleteName: point.athleteName,
            metrics: {},
            percentileRanks: {}
          });
        }

        const athlete = athleteMap.get(point.athleteId);
        athlete.metrics[point.metric] = point.value;

        // Calculate percentile rank if statistics are available
        if (statistics && statistics[point.metric]) {
          const stats = statistics[point.metric];
          const percentile = ((point.value - stats.min) / (stats.max - stats.min)) * 100;
          athlete.percentileRanks[point.metric] = Math.max(0, Math.min(100, percentile));
        }
      });

      processedData = Array.from(athleteMap.values());
    }

    // Get all metrics from the processed data
    const allMetrics = new Set<string>();
    processedData.forEach(athlete => {
      Object.keys(athlete.metrics).forEach(metric => allMetrics.add(metric));
    });

    const metrics = Array.from(allMetrics);
    // Require at least 2 metrics for meaningful radar chart visualization
    // (reduced from 3+ to support more chart scenarios while maintaining utility)
    if (metrics.length < 2) return null;

    // Create labels from metric config
    const labels = metrics.map(metric => 
      METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric
    );

    // Calculate group averages for comparison
    const groupAverages = metrics.map(metric => {
      const values = processedData
        .map(athlete => athlete.metrics[metric])
        .filter(value => value !== undefined);

      return values.length > 0 ? 
        values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    });

    // Normalize values to 0-100 scale using percentile ranks
    const normalizeValue = (value: number, metric: string) => {
      const stats = statistics?.[metric];
      if (!stats) return 50; // Default to middle if no stats

      // Use percentile rank (0-100)
      const allValues = processedData
        .map(athlete => athlete.metrics[metric])
        .filter(val => val !== undefined)
        .sort((a, b) => a - b);

      const rank = allValues.filter(v => v < value).length;
      return (rank / allValues.length) * 100;
    };

    const datasets = [];

    // Group average dataset
    const normalizedGroupAverages = groupAverages.map((avg, index) => 
      normalizeValue(avg, metrics[index])
    );

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

    // Individual athlete datasets
    const athletesToShow = highlightAthlete ? 
      processedData.filter(athlete => athlete.athleteId === highlightAthlete) :
      processedData.slice(0, 5); // Show top 5 if no specific athlete

    const colors = [
      { bg: 'rgba(59, 130, 246, 0.3)', border: 'rgba(59, 130, 246, 1)' },
      { bg: 'rgba(16, 185, 129, 0.3)', border: 'rgba(16, 185, 129, 1)' },
      { bg: 'rgba(239, 68, 68, 0.3)', border: 'rgba(239, 68, 68, 1)' },
      { bg: 'rgba(245, 158, 11, 0.3)', border: 'rgba(245, 158, 11, 1)' },
      { bg: 'rgba(139, 92, 246, 0.3)', border: 'rgba(139, 92, 246, 1)' }
    ];

    athletesToShow.forEach((athlete, index) => {
      const athleteValues = metrics.map(metric => {
        const value = athlete.metrics[metric];
        return value !== undefined ? normalizeValue(value, metric) : 0;
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
      data: processedData // Added for context in the tooltip logic
    };
  }, [data, statistics, highlightAthlete]);

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
              // Corrected reference to radarData.data
              const athlete = radarData?.data.find(a => a.athleteName === athleteName);
              actualValue = athlete?.metrics[metric] || 0;
            }

            const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
            const label = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;

            return [
              `${label}: ${actualValue.toFixed(2)}${unit}`,
              `Percentile: ${rawValue.toFixed(0)}%`
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

  if (!radarData) {
    // Check if we have data but it doesn't meet radar chart requirements
    if (data && data.length > 0) {
      const isMultiMetric = data.length > 0 && 'metrics' in data[0];

      if (isMultiMetric) {
        const processedData = data as MultiMetricData[];
        const allMetrics = new Set<string>();
        processedData.forEach(athlete => {
          Object.keys(athlete.metrics).forEach(metric => allMetrics.add(metric));
        });

        if (allMetrics.size < 2) {
          return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center">
                <div className="text-lg font-medium mb-2">Radar Chart Unavailable</div>
                <div className="text-sm">
                  Radar charts require at least 2 metrics with data for each athlete.
                </div>
                <div className="text-sm mt-1 text-muted-foreground/80">
                  Currently showing {allMetrics.size} metric{allMetrics.size !== 1 ? 's' : ''}. Try selecting more metrics.
                </div>
              </div>
            </div>
          );
        }
      } else {
        // For ChartDataPoint data, check available metrics
        const chartData = data as ChartDataPoint[];
        const availableMetrics = new Set(chartData.map(point => point.metric));

        if (availableMetrics.size < 2) {
          return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center">
                <div className="text-lg font-medium mb-2">Radar Chart Unavailable</div>
                <div className="text-sm">
                  Radar charts require at least 2 metrics with data for each athlete.
                </div>
                <div className="text-sm mt-1 text-muted-foreground/80">
                  Currently showing {availableMetrics.size} metric{availableMetrics.size !== 1 ? 's' : ''}. Try selecting more metrics.
                </div>
              </div>
            </div>
          );
        }
      }
    }

    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Radar Chart Unavailable</div>
          <div className="text-sm">
            Radar charts require at least 2 metrics with data for each athlete.
          </div>
          <div className="text-sm mt-1 text-muted-foreground/80">
            Try selecting more metrics or adjusting your filters.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Radar data={radarData} options={options} />

      {/* Performance summary */}
      <div className="mt-4 text-sm">
        <div className="text-center text-muted-foreground mb-2">
          Values shown as percentile ranks (0-100%) relative to group
        </div>

        {highlightAthlete && (
          <div className="grid grid-cols-3 gap-4 text-center">
            {radarData.metrics.slice(0, 3).map((metric, index) => {
              const athlete = radarData.data.find(a => a.athleteId === highlightAthlete);
              const value = athlete?.metrics[metric];
              const percentile = athlete?.percentileRanks?.[metric];
              const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
              const label = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;

              return (
                <div key={metric} className="space-y-1">
                  <div className="font-medium text-xs">{label}</div>
                  <div className="text-lg font-bold">
                    {value?.toFixed(2)}{unit}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {percentile?.toFixed(0)}th percentile
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