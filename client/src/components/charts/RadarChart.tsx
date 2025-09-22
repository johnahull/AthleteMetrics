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
  // Debug logging
  console.log('RadarChart Debug:', {
    dataLength: data?.length || 0,
    dataType: Array.isArray(data) ? 'array' : typeof data,
    hasStatistics: !!statistics,
    highlightAthlete,
    sampleData: data?.slice(0, 2)
  });

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

    // Normalize values to 0-100 scale using percentile ranks
    const normalizeValue = (value: number, metric: string) => {
      const stats = statistics?.[metric];
      if (!stats) return 50; // Default to middle if no stats

      // Use percentile rank (0-100)
      const allValues = data
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
      data.filter(athlete => athlete.athleteId === highlightAthlete) :
      data.slice(0, 5); // Show top 5 if no specific athlete

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
      groupAverages
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
              const athlete = data.find(a => a.athleteName === athleteName);
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
      <Radar data={radarData} options={options} />
      
      {/* Performance summary */}
      <div className="mt-4 text-sm">
        <div className="text-center text-muted-foreground mb-2">
          Values shown as percentile ranks (0-100%) relative to group
        </div>
        
        {highlightAthlete && (
          <div className="grid grid-cols-3 gap-4 text-center">
            {radarData.metrics.slice(0, 3).map((metric, index) => {
              const athlete = data.find(a => a.athleteId === highlightAthlete);
              const value = athlete?.metrics[metric];
              const percentile = athlete?.percentileRanks[metric];
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