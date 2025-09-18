import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type {
  ChartDataPoint,
  ChartConfiguration,
  StatisticalSummary
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

// Helper function to get the best performance value based on metric type
function getBestPerformanceValue(metric: string, values: number[]): number {
  const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
  // For time-based metrics (lower is better), use min. For performance metrics (higher is better), use max.
  return metricConfig?.lowerIsBetter ? Math.min(...values) : Math.max(...values);
}

// Helper function to get the best performing athlete based on metric type
function getBestPerformingAthlete(metric: string, athletes: any[], values: number[]) {
  const bestValue = getBestPerformanceValue(metric, values);
  return athletes.find(a => a.value === bestValue);
}

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface BarChartProps {
  data: ChartDataPoint[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
}

export function BarChart({ 
  data, 
  config, 
  statistics, 
  highlightAthlete 
}: BarChartProps) {
  // Transform data for bar chart
  const barData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const metrics = Object.keys(statistics || {});
    const primaryMetric = metrics[0];
    
    if (!primaryMetric) return null;

    // Use the filtered data as-is (backend already provides best measurements per athlete)
    const metricData = data.filter(d => d.metric === primaryMetric);
    const athleteData = metricData.reduce((acc, point) => {
      acc[point.athleteId] = point;
      return acc;
    }, {} as Record<string, ChartDataPoint>);

    const firstMetric = data[0]?.metric;
    const metricConfig = firstMetric ? METRIC_CONFIG[firstMetric as keyof typeof METRIC_CONFIG] : null;

    const sortedAthletes = Object.values(athleteData)
      .sort((a, b) => {
        // Sort by best performance (consider lowerIsBetter)
        return metricConfig?.lowerIsBetter
          ? a.value - b.value // Lower is better (ascending)
          : b.value - a.value; // Higher is better (descending)
      });

    // Start with top 25 athletes
    let athletes = sortedAthletes.slice(0, 25);

    // If highlightAthlete exists and not in top 25, include them
    if (highlightAthlete && !athletes.find(a => a.athleteId === highlightAthlete)) {
      const highlightedAthlete = sortedAthletes.find(a => a.athleteId === highlightAthlete);
      if (highlightedAthlete) {
        athletes = athletes.slice(0, 24).concat(highlightedAthlete);
      }
    }

    const labels = athletes.map(athlete => athlete.athleteName);
    const values = athletes.map(athlete => athlete.value);
    
    // Create color array - highlight selected athlete
    const backgroundColors = athletes.map(athlete => 
      athlete.athleteId === highlightAthlete ? 
        'rgba(16, 185, 129, 0.8)' : 'rgba(59, 130, 246, 0.6)'
    );
    
    const borderColors = athletes.map(athlete => 
      athlete.athleteId === highlightAthlete ? 
        'rgba(16, 185, 129, 1)' : 'rgba(59, 130, 246, 1)'
    );

    const unit = METRIC_CONFIG[primaryMetric as keyof typeof METRIC_CONFIG]?.unit || '';
    const label = METRIC_CONFIG[primaryMetric as keyof typeof METRIC_CONFIG]?.label || primaryMetric;
    const isLowerBetter = METRIC_CONFIG[primaryMetric as keyof typeof METRIC_CONFIG]?.lowerIsBetter;

    return {
      labels,
      datasets: [{
        label: label,
        data: values,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 2
      }],
      athletes,
      unit,
      primaryMetric,
      isLowerBetter
    };
  }, [data, statistics, highlightAthlete]);

  // Chart options
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const, // Horizontal bars for better athlete name visibility
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
            const athleteIndex = context[0].dataIndex;
            return barData?.athletes[athleteIndex]?.athleteName || '';
          },
          label: (context) => {
            const value = context.parsed.x;
            return `${barData?.datasets[0].label}: ${value.toFixed(2)}${barData?.unit}`;
          },
          afterLabel: (context) => {
            const athleteIndex = context.dataIndex;
            const athlete = barData?.athletes[athleteIndex];
            const stats = statistics?.[barData?.primaryMetric || ''];
            
            if (!athlete || !stats) return [];
            
            // Calculate percentile rank
            const allValues = data
              .filter(d => d.metric === barData?.primaryMetric)
              .map(d => d.value)
              .sort((a, b) => barData?.isLowerBetter ? a - b : b - a);
            
            const rank = allValues.findIndex(v => v === athlete.value) + 1;
            const percentile = ((allValues.length - rank + 1) / allValues.length) * 100;
            
            return [
              `Rank: ${rank} of ${allValues.length}`,
              `Percentile: ${percentile.toFixed(0)}%`,
              `Team: ${athlete.teamName || 'Independent'}`
            ];
          }
        }
      },
      legend: {
        display: false // Hide legend for single dataset
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: `${barData?.datasets[0].label} (${barData?.unit})`
        },
        beginAtZero: !barData?.isLowerBetter // Start from zero unless lower is better
      },
      y: {
        title: {
          display: true,
          text: 'Athletes'
        },
        ticks: {
          font: {
            size: 11
          }
        }
      }
    },
    elements: {
      bar: {
        borderRadius: 4
      }
    }
  };

  if (!barData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available for bar chart
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Bar data={barData} options={options} />
      
      {/* Performance indicators */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm text-center">
        <div>
          <div className="font-medium">Best Performance</div>
          <div className="text-lg font-bold text-green-600">
            {getBestPerformanceValue(barData.primaryMetric, barData.datasets[0].data).toFixed(2)}{barData.unit}
          </div>
          <div className="text-xs text-muted-foreground">
            {getBestPerformingAthlete(barData.primaryMetric, barData.athletes, barData.datasets[0].data)?.athleteName}
          </div>
        </div>
        
        <div>
          <div className="font-medium">Average</div>
          <div className="text-lg font-bold text-blue-600">
            {(barData.datasets[0].data.reduce((a, b) => a + b, 0) / barData.datasets[0].data.length).toFixed(2)}{barData.unit}
          </div>
          <div className="text-xs text-muted-foreground">
            Top 25 athletes
          </div>
        </div>
        
        <div>
          <div className="font-medium">Range</div>
          <div className="text-lg font-bold text-gray-600">
            {(Math.max(...barData.datasets[0].data) - Math.min(...barData.datasets[0].data)).toFixed(2)}{barData.unit}
          </div>
          <div className="text-xs text-muted-foreground">
            Max - Min
          </div>
        </div>
      </div>
    </div>
  );
}

export default BarChart;