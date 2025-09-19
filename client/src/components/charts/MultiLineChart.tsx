import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { 
  TrendData, 
  ChartConfiguration, 
  StatisticalSummary 
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface MultiLineChartProps {
  data: TrendData[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
}

export function MultiLineChart({ 
  data, 
  config, 
  statistics, 
  highlightAthlete 
}: MultiLineChartProps) {
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

    // Filter athletes to show
    const athletesToShow = highlightAthlete ? 
      Object.values(athleteMetrics).filter((athlete: any) => athlete.athleteId === highlightAthlete) :
      Object.values(athleteMetrics).slice(0, 3);

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

    // Generate colors for athlete-metric combinations
    const athleteColors = [
      'rgba(59, 130, 246, 1)',
      'rgba(16, 185, 129, 1)',
      'rgba(239, 68, 68, 1)'
    ];
    
    const metricStyles = [
      { dash: [], opacity: 1 },
      { dash: [5, 5], opacity: 0.8 },
      { dash: [10, 5, 5, 5], opacity: 0.6 },
      { dash: [15, 3, 3, 3], opacity: 0.4 }
    ];

    const datasets: any[] = [];

    // Create dataset for each athlete-metric combination
    athletesToShow.forEach((athlete: any, athleteIndex) => {
      const baseColor = athleteColors[athleteIndex % athleteColors.length];
      
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

        const style = metricStyles[metricIndex % metricStyles.length];
        const isHighlighted = athlete.athleteId === highlightAthlete;
        const metricLabel = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;

        datasets.push({
          label: `${athlete.athleteName} - ${metricLabel}`,
          data: lineData,
          borderColor: baseColor.replace('1)', `${style.opacity})`),
          backgroundColor: baseColor.replace('1)', '0.1)'),
          borderWidth: isHighlighted ? 3 : 2,
          borderDash: style.dash,
          pointRadius: isHighlighted ? 4 : 2,
          pointHoverRadius: isHighlighted ? 6 : 4,
          pointBackgroundColor: baseColor,
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          fill: false,
          tension: 0.1,
          spanGaps: true
        });
      });
    });

    // Add group average lines
    metrics.forEach((metric, metricIndex) => {
      const stats = statistics?.[metric];
      if (!stats) return;

      const normalizedMean = 50; // Group average is always at 50% in normalized scale
      const meanData = sortedDates.map(() => normalizedMean);

      const style = metricStyles[metricIndex % metricStyles.length];
      const metricLabel = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;

      datasets.push({
        label: `Group Avg - ${metricLabel}`,
        data: meanData,
        borderColor: 'rgba(156, 163, 175, 0.8)',
        backgroundColor: 'rgba(156, 163, 175, 0.1)',
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
        pointHoverRadius: 3,
        fill: false
      });
    });

    return {
      labels,
      datasets,
      metrics,
      sortedDates,
      athletesToShow
    };
  }, [data, statistics, highlightAthlete]);

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
          title: (context) => {
            const dateIndex = context[0].dataIndex;
            const dateStr = multiLineData?.sortedDates[dateIndex];
            return dateStr ? new Date(dateStr).toLocaleDateString() : '';
          },
          label: (context) => {
            const value = context.parsed.y;
            if (value === null) return '';
            
            return `${context.dataset.label}: ${value.toFixed(1)}%`;
          },
          afterLabel: (context) => {
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
          callback: (value) => `${value}%`
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
      <Line data={multiLineData} options={options} />
      
      {/* Chart explanation */}
      <div className="mt-4 text-sm">
        <div className="text-center text-muted-foreground mb-2">
          All metrics normalized to 0-100% scale for comparison. 50% = group average.
        </div>
        
        {/* Metric legend */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {multiLineData.metrics.map((metric, index) => {
            const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
            const label = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;
            const isLowerBetter = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.lowerIsBetter;
            
            return (
              <div key={metric} className="flex items-center space-x-2">
                <div 
                  className="w-4 h-0.5" 
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 1)',
                    borderStyle: index % 2 === 0 ? 'solid' : 'dashed'
                  }}
                />
                <span>{label} ({unit}) {isLowerBetter ? '↓' : '↑'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default MultiLineChart;