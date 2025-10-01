import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';
import type { 
  ChartDataPoint, 
  ChartConfiguration, 
  StatisticalSummary 
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { generateDeterministicJitter } from './utils/boxPlotStatistics';

// Register Chart.js components
ChartJS.register(
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend
);

interface SwarmChartProps {
  data: ChartDataPoint[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
}

export function SwarmChart({ 
  data, 
  config, 
  statistics, 
  highlightAthlete 
}: SwarmChartProps) {
  // Transform data for swarm plot
  const swarmData = useMemo(() => {
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

    const athletes = Object.values(athleteData);
    const values = athletes.map(a => a.value);
    
    // Create swarm positions with jitter to avoid overlap
    const swarmPoints = athletes.map((athlete, index) => {
      // Calculate position along x-axis (categorical) with jitter
      const baseX = 0; // Single category
      const jitterRange = 0.3;
      const jitter = generateDeterministicJitter(athlete.athleteId, jitterRange);
      
      return {
        x: baseX + jitter,
        y: athlete.value,
        athleteId: athlete.athleteId,
        athleteName: athlete.athleteName,
        teamName: athlete.teamName,
        isHighlighted: athlete.athleteId === highlightAthlete
      };
    });

    // Create datasets
    const datasets = [];
    
    // Main points
    const mainPoints = swarmPoints.filter(p => !p.isHighlighted);
    if (mainPoints.length > 0) {
      datasets.push({
        label: 'Athletes',
        data: mainPoints,
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        pointRadius: 6,
        pointHoverRadius: 8
      });
    }

    // Highlighted athlete
    const highlightedPoint = swarmPoints.find(p => p.isHighlighted);
    if (highlightedPoint) {
      datasets.push({
        label: highlightedPoint.athleteName,
        data: [highlightedPoint],
        backgroundColor: 'rgba(16, 185, 129, 1)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 3,
        pointRadius: 8,
        pointHoverRadius: 10,
        pointStyle: 'star'
      });
    }

    // Add statistical markers
    const stats = statistics?.[primaryMetric];
    if (stats) {
      // Mean line
      datasets.push({
        label: 'Mean',
        data: [
          { x: -0.4, y: stats.mean },
          { x: 0.4, y: stats.mean }
        ],
        backgroundColor: 'rgba(239, 68, 68, 1)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 2,
        pointRadius: 0,
        showLine: true,
        fill: false
      });

      // Median line
      datasets.push({
        label: 'Median',
        data: [
          { x: -0.4, y: stats.median },
          { x: 0.4, y: stats.median }
        ],
        backgroundColor: 'rgba(245, 158, 11, 1)',
        borderColor: 'rgba(245, 158, 11, 1)',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        showLine: true,
        fill: false
      });
    }

    const unit = METRIC_CONFIG[primaryMetric as keyof typeof METRIC_CONFIG]?.unit || '';
    const metricLabel = METRIC_CONFIG[primaryMetric as keyof typeof METRIC_CONFIG]?.label || primaryMetric;

    return {
      datasets,
      unit,
      metricLabel,
      primaryMetric,
      swarmPoints,
      stats
    };
  }, [data, statistics, highlightAthlete]);

  // Chart options
  const options: ChartOptions<'scatter'> = {
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
            const point = context[0].raw as any;
            return point.athleteName || context[0].dataset.label;
          },
          label: (context) => {
            const point = context.raw as any;
            const value = point.y || context.parsed.y;
            return `${swarmData?.metricLabel}: ${value.toFixed(2)}${swarmData?.unit}`;
          },
          afterLabel: (context) => {
            const point = context.raw as any;
            if (!point.athleteName) return [];
            
            const stats = swarmData?.stats;
            if (!stats) return [`Team: ${point.teamName || 'Independent'}`];
            
            // Calculate percentile
            const allValues = swarmData?.swarmPoints.map(p => p.y).sort((a, b) => a - b) || [];
            const rank = allValues.filter(v => v < point.y).length;
            const percentile = allValues.length > 0 ? (rank / allValues.length) * 100 : 0;
            
            return [
              `Team: ${point.teamName || 'Independent'}`,
              `Percentile: ${percentile.toFixed(0)}%`
            ];
          }
        }
      },
      legend: {
        display: config.showLegend,
        position: 'top' as const,
        labels: {
          filter: (item) => {
            // Hide statistical lines from legend
            return !item.text.includes('Mean') && !item.text.includes('Median');
          }
        }
      }
    },
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        min: -0.5,
        max: 0.5,
        title: {
          display: true,
          text: swarmData?.metricLabel || 'Athletes'
        },
        ticks: {
          display: false // Hide x-axis ticks for categorical display
        },
        grid: {
          display: false
        }
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: `${swarmData?.metricLabel} (${swarmData?.unit})`
        },
        grid: {
          display: true
        }
      }
    },
    elements: {
      point: {
        hoverRadius: 10
      }
    },
    interaction: {
      intersect: false,
      mode: 'point'
    }
  };

  if (!swarmData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available for swarm plot
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Scatter data={swarmData} options={options} />
      
      {/* Statistical summary */}
      {swarmData.stats && (
        <div className="mt-4 grid grid-cols-5 gap-4 text-sm text-center">
          <div>
            <div className="font-medium">Count</div>
            <div className="text-lg font-bold">{swarmData.stats.count}</div>
          </div>
          <div>
            <div className="font-medium">Mean</div>
            <div className="text-lg font-bold text-red-600">
              {swarmData.stats.mean.toFixed(2)}{swarmData.unit}
            </div>
          </div>
          <div>
            <div className="font-medium">Median</div>
            <div className="text-lg font-bold text-yellow-600">
              {swarmData.stats.median.toFixed(2)}{swarmData.unit}
            </div>
          </div>
          <div>
            <div className="font-medium">Std Dev</div>
            <div className="text-lg font-bold text-gray-600">
              {swarmData.stats.std.toFixed(2)}{swarmData.unit}
            </div>
          </div>
          <div>
            <div className="font-medium">Range</div>
            <div className="text-lg font-bold text-gray-600">
              {(swarmData.stats.max - swarmData.stats.min).toFixed(2)}{swarmData.unit}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SwarmChart;