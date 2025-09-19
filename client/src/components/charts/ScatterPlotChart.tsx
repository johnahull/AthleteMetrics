import React, { useMemo, useState, useRef } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ScatterController,
  LineController,
  Filler
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import type { AnnotationOptions } from 'chartjs-plugin-annotation';
import { Scatter } from 'react-chartjs-2';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
  Legend,
  ScatterController,
  LineController,
  Filler,
  annotationPlugin
);

// Regression calculation helper function
function calculateRegression(points: any[]) {
  if (points.length < 2) return null;

  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

// Performance quadrant labels based on metric types
function getPerformanceQuadrantLabels(xMetric: string, yMetric: string) {
  const xConfig = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG];
  const yConfig = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG];

  const xLowerIsBetter = xConfig?.lowerIsBetter || false;
  const yLowerIsBetter = yConfig?.lowerIsBetter || false;

  if (!xLowerIsBetter && !yLowerIsBetter) {
    // Both higher is better (e.g., vertical jump vs broad jump)
    return {
      topRight: { label: 'Elite Performance', color: 'green' },
      topLeft: { label: 'Good Y Performance', color: 'yellow' },
      bottomRight: { label: 'Good X Performance', color: 'yellow' },
      bottomLeft: { label: 'Development Needed', color: 'red' }
    };
  } else if (xLowerIsBetter && !yLowerIsBetter) {
    // X lower is better, Y higher is better (e.g., 40-yard dash vs vertical jump)
    return {
      topLeft: { label: 'Elite Performance', color: 'green' },
      topRight: { label: 'Good Y Performance', color: 'yellow' },
      bottomLeft: { label: 'Good X Performance', color: 'yellow' },
      bottomRight: { label: 'Development Needed', color: 'red' }
    };
  } else if (!xLowerIsBetter && yLowerIsBetter) {
    // X higher is better, Y lower is better (e.g., vertical jump vs 40-yard dash)
    return {
      bottomRight: { label: 'Elite Performance', color: 'green' },
      bottomLeft: { label: 'Good Y Performance', color: 'yellow' },
      topRight: { label: 'Good X Performance', color: 'yellow' },
      topLeft: { label: 'Development Needed', color: 'red' }
    };
  } else {
    // Both lower is better (e.g., 40-yard dash vs agility time)
    return {
      bottomLeft: { label: 'Elite Performance', color: 'green' },
      bottomRight: { label: 'Good Y Performance', color: 'yellow' },
      topLeft: { label: 'Good X Performance', color: 'yellow' },
      topRight: { label: 'Development Needed', color: 'red' }
    };
  }
}

interface ScatterPlotChartProps {
  data: ChartDataPoint[];
  statistics: Record<string, StatisticalSummary>;
  config: ChartConfiguration;
  highlightAthlete?: string;
  showAthleteNames?: boolean;
}

export function ScatterPlotChart({
  data,
  statistics,
  config,
  highlightAthlete,
  showAthleteNames = false
}: ScatterPlotChartProps) {
  const [showRegressionLine, setShowRegressionLine] = useState(true);
  const [showQuadrants, setShowQuadrants] = useState(true);
  const [localShowAthleteNames, setLocalShowAthleteNames] = useState(showAthleteNames);

  // Transform data for scatter plot
  const scatterData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const metrics = Object.keys(statistics || {});
    if (metrics.length < 2) return null;

    const [xMetric, yMetric] = metrics;

    // Group data by athlete (backend already provides best measurements per athlete)
    const athleteData = data.reduce((acc, point) => {
      if (!acc[point.athleteId]) {
        acc[point.athleteId] = {
          athleteId: point.athleteId,
          athleteName: point.athleteName,
          teamName: point.teamName,
          metrics: {}
        };
      }
      acc[point.athleteId].metrics[point.metric] = point.value;
      return acc;
    }, {} as Record<string, any>);

    // Create scatter points for athletes with both metrics
    const scatterPoints = Object.values(athleteData)
      .filter((athlete: any) => athlete.metrics[xMetric] !== undefined && athlete.metrics[yMetric] !== undefined)
      .map((athlete: any) => ({
        x: athlete.metrics[xMetric],
        y: athlete.metrics[yMetric],
        athleteId: athlete.athleteId,
        athleteName: athlete.athleteName,
        teamName: athlete.teamName
      }));

    if (scatterPoints.length === 0) return null;

    const datasets = [];

    // Main dataset
    const mainPoints = highlightAthlete ?
      scatterPoints.filter(p => p.athleteId !== highlightAthlete) :
      scatterPoints;

    if (mainPoints.length > 0) {
      datasets.push({
        type: 'scatter' as const,
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
          type: 'scatter' as const,
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
    if (statistics && statistics[xMetric]?.mean !== undefined && statistics[yMetric]?.mean !== undefined) {
      datasets.push({
        type: 'scatter' as const,
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

    // Calculate regression line
    const regression = calculateRegression(scatterPoints);

    // Add regression line if enabled and we have enough points
    if (showRegressionLine && regression && scatterPoints.length >= 2) {
      const xValues = scatterPoints.map(p => p.x);
      const minX = Math.min(...xValues);
      const maxX = Math.max(...xValues);

      datasets.push({
        label: 'Trend Line',
        type: 'line' as const,
        data: [
          { x: minX, y: regression.slope * minX + regression.intercept },
          { x: maxX, y: regression.slope * maxX + regression.intercept }
        ],
        borderColor: 'rgba(107, 114, 128, 0.8)',
        backgroundColor: 'rgba(107, 114, 128, 0.1)',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        showLine: true,
        tension: 0
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
      points: scatterPoints,
      regression
    } as any;
  }, [data, statistics, highlightAthlete, showRegressionLine, showQuadrants]);

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
      },
      annotation: showQuadrants && statistics && scatterData ? {
        annotations: (() => {
          const xMean = statistics[scatterData.xMetric]?.mean || 0;
          const yMean = statistics[scatterData.yMetric]?.mean || 0;
          const labels = getPerformanceQuadrantLabels(scatterData.xMetric, scatterData.yMetric);

          // Calculate chart bounds for full background coverage
          const xValues = scatterData.points.map((p: any) => p.x);
          const yValues = scatterData.points.map((p: any) => p.y);

          // Safety check for empty arrays
          if (xValues.length === 0 || yValues.length === 0) {
            return {};
          }

          const xMin = Math.min(...xValues) - (Math.max(...xValues) - Math.min(...xValues)) * 0.1;
          const xMax = Math.max(...xValues) + (Math.max(...xValues) - Math.min(...xValues)) * 0.1;
          const yMin = Math.min(...yValues) - (Math.max(...yValues) - Math.min(...yValues)) * 0.1;
          const yMax = Math.max(...yValues) + (Math.max(...yValues) - Math.min(...yValues)) * 0.1;

          const colorMap = {
            green: 'rgba(16, 185, 129, 0.1)',
            yellow: 'rgba(245, 158, 11, 0.1)',
            orange: 'rgba(251, 146, 60, 0.1)',
            red: 'rgba(239, 68, 68, 0.1)'
          };

          return {
            // Top Right Quadrant
            topRight: {
              type: 'box' as const,
              xMin: xMean,
              xMax: xMax,
              yMin: yMean,
              yMax: yMax,
              backgroundColor: colorMap[labels.topRight.color as keyof typeof colorMap],
              borderWidth: 0,
              z: 0
            },
            // Top Left Quadrant
            topLeft: {
              type: 'box' as const,
              xMin: xMin,
              xMax: xMean,
              yMin: yMean,
              yMax: yMax,
              backgroundColor: colorMap[labels.topLeft.color as keyof typeof colorMap],
              borderWidth: 0,
              z: 0
            },
            // Bottom Right Quadrant
            bottomRight: {
              type: 'box' as const,
              xMin: xMean,
              xMax: xMax,
              yMin: yMin,
              yMax: yMean,
              backgroundColor: colorMap[labels.bottomRight.color as keyof typeof colorMap],
              borderWidth: 0,
              z: 0
            },
            // Bottom Left Quadrant
            bottomLeft: {
              type: 'box' as const,
              xMin: xMin,
              xMax: xMean,
              yMin: yMin,
              yMax: yMean,
              backgroundColor: colorMap[labels.bottomLeft.color as keyof typeof colorMap],
              borderWidth: 0,
              z: 0
            },
            // Vertical line at x mean
            xMeanLine: {
              type: 'line' as const,
              xMin: xMean,
              xMax: xMean,
              yMin: yMin,
              yMax: yMax,
              borderColor: 'rgba(107, 114, 128, 0.5)',
              borderWidth: 1,
              borderDash: [3, 3],
              z: 1
            },
            // Horizontal line at y mean
            yMeanLine: {
              type: 'line' as const,
              xMin: xMin,
              xMax: xMax,
              yMin: yMean,
              yMax: yMean,
              borderColor: 'rgba(107, 114, 128, 0.5)',
              borderWidth: 1,
              borderDash: [3, 3],
              z: 1
            }
          };
        })()
      } : undefined
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
    },
    onHover: (event, elements) => {
      if (event.native?.target) {
        (event.native.target as HTMLElement).style.cursor = elements.length > 0 ? 'pointer' : 'default';
      }
    }
  };

  if (!scatterData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available for scatter plot
      </div>
    );
  }

  return (
    <div className="w-full h-full space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center space-x-2">
          <Switch
            id="regression-line"
            checked={showRegressionLine}
            onCheckedChange={setShowRegressionLine}
          />
          <Label htmlFor="regression-line">Show Trend Line</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="quadrants"
            checked={showQuadrants}
            onCheckedChange={setShowQuadrants}
          />
          <Label htmlFor="quadrants">Show Performance Quadrants</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="athlete-names"
            checked={localShowAthleteNames}
            onCheckedChange={setLocalShowAthleteNames}
          />
          <Label htmlFor="athlete-names">Show Athlete Names</Label>
        </div>
        {correlation !== null && (
          <div className="text-muted-foreground">
            Correlation: <span className="font-mono">{correlation.toFixed(3)}</span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="h-96">
        <Scatter data={scatterData} options={options} />
      </div>
    </div>
  );
}