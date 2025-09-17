import React, { useMemo } from 'react';
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
  ChartDataPoint, 
  ChartConfiguration, 
  StatisticalSummary 
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

// Register Chart.js components
ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface ScatterPlotChartProps {
  data: ChartDataPoint[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
}

export function ScatterPlotChart({ 
  data, 
  config, 
  statistics, 
  highlightAthlete 
}: ScatterPlotChartProps) {
  // Transform data for scatter plot
  const scatterData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const metrics = Object.keys(statistics || {});
    if (metrics.length < 2) return null;

    const [xMetric, yMetric] = metrics;

    // Group data by athlete to get best values
    const athleteData = data.reduce((acc, point) => {
      if (!acc[point.athleteId]) {
        acc[point.athleteId] = {
          athleteId: point.athleteId,
          athleteName: point.athleteName,
          teamName: point.teamName,
          metrics: {}
        };
      }
      
      // Store best value for each metric
      if (!acc[point.athleteId].metrics[point.metric] || 
          point.value > acc[point.athleteId].metrics[point.metric]) {
        acc[point.athleteId].metrics[point.metric] = point.value;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Create scatter points
    const scatterPoints = Object.values(athleteData)
      .filter((athlete: any) => 
        athlete.metrics[xMetric] !== undefined && 
        athlete.metrics[yMetric] !== undefined
      )
      .map((athlete: any) => ({
        x: athlete.metrics[xMetric],
        y: athlete.metrics[yMetric],
        athleteId: athlete.athleteId,
        athleteName: athlete.athleteName,
        teamName: athlete.teamName
      }));

    // Create datasets
    const datasets = [];

    // Main dataset
    const mainPoints = highlightAthlete ? 
      scatterPoints.filter(p => p.athleteId !== highlightAthlete) : 
      scatterPoints;

    if (mainPoints.length > 0) {
      datasets.push({
        label: 'Athletes',
        data: mainPoints,
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 7
      });
    }

    // Highlighted athlete
    if (highlightAthlete) {
      const highlightedPoint = scatterPoints.find(p => p.athleteId === highlightAthlete);
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
    }

    // Add group averages if statistics available
    if (statistics && statistics[xMetric] && statistics[yMetric]) {
      datasets.push({
        label: 'Group Average',
        data: [{
          x: statistics[xMetric].mean,
          y: statistics[yMetric].mean
        }],
        backgroundColor: 'rgba(239, 68, 68, 1)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 3,
        pointRadius: 8,
        pointStyle: 'crossRot'
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
      points: scatterPoints
    } as any;
  }, [data, statistics, highlightAthlete]);

  // Calculate correlation coefficient
  const correlation = useMemo(() => {
    if (!scatterData || scatterData.points.length < 2) return null;

    const points = scatterData.points;
    const n = points.length;
    const sumX = points.reduce((sum: number, p: any) => sum + p.x, 0);
    const sumY = points.reduce((sum: number, p: any) => sum + p.y, 0);
    const sumXY = points.reduce((sum: number, p: any) => sum + p.x * p.y, 0);
    const sumX2 = points.reduce((sum: number, p: any) => sum + p.x * p.x, 0);
    const sumY2 = points.reduce((sum: number, p: any) => sum + p.y * p.y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }, [scatterData]);

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
            return point.athleteName || 'Group Average';
          },
          label: (context) => {
            const point = context.raw as any;
            return [
              `${scatterData?.xLabel}: ${point.x}${scatterData?.xUnit}`,
              `${scatterData?.yLabel}: ${point.y}${scatterData?.yUnit}`
            ];
          },
          afterLabel: (context) => {
            const point = context.raw as any;
            return point.teamName ? [`Team: ${point.teamName}`] : [];
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
        hoverRadius: 8
      }
    },
    interaction: {
      intersect: false,
      mode: 'point'
    }
  };

  if (!scatterData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available for scatter plot (requires 2+ metrics)
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Scatter data={scatterData} options={options} />
      
      {/* Correlation analysis */}
      {correlation !== null && (
        <div className="mt-4 flex items-center justify-center space-x-8 text-sm">
          <div className="text-center">
            <div className="font-medium">Correlation</div>
            <div className={`text-lg font-bold ${
              Math.abs(correlation) > 0.7 ? 'text-green-600' :
              Math.abs(correlation) > 0.4 ? 'text-yellow-600' : 'text-gray-600'
            }`}>
              r = {correlation.toFixed(3)}
            </div>
          </div>
          <div className="text-center">
            <div className="font-medium">Relationship</div>
            <div className="text-muted-foreground">
              {Math.abs(correlation) > 0.7 ? 'Strong' :
               Math.abs(correlation) > 0.4 ? 'Moderate' : 'Weak'}
              {correlation > 0 ? ' Positive' : ' Negative'}
            </div>
          </div>
          <div className="text-center">
            <div className="font-medium">Sample Size</div>
            <div className="text-muted-foreground">
              n = {scatterData.points.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScatterPlotChart;