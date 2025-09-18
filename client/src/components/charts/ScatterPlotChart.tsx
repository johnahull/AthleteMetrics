import React, { useMemo, useState } from 'react';
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
import annotationPlugin from 'chartjs-plugin-annotation';
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
  Legend,
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
  const sumY2 = points.reduce((sum, p) => sum + p.y * p.y, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const meanY = sumY / n;
  const ssTotal = points.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0);
  const ssResidual = points.reduce((sum, p) => {
    const predicted = slope * p.x + intercept;
    return sum + Math.pow(p.y - predicted, 2);
  }, 0);
  const rSquared = ssTotal === 0 ? 0 : 1 - (ssResidual / ssTotal);

  return { slope, intercept, rSquared };
}

// Performance-aware quadrant labels helper function
function getPerformanceQuadrantLabels(xMetric: string, yMetric: string) {
  const xConfig = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG];
  const yConfig = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG];

  const xLabel = xConfig?.label || xMetric;
  const yLabel = yConfig?.label || yMetric;

  // Determine performance terminology
  const xGoodTerm = xConfig?.lowerIsBetter ? 'Fast' : 'Strong';
  const xPoorTerm = xConfig?.lowerIsBetter ? 'Slow' : 'Weak';
  const yGoodTerm = yConfig?.lowerIsBetter ? 'Fast' : 'Strong';
  const yPoorTerm = yConfig?.lowerIsBetter ? 'Slow' : 'Weak';

  return {
    topRight: {
      // Good Y, Good/Bad X (depending on if X is lower-is-better)
      label: xConfig?.lowerIsBetter ? `${xPoorTerm}-${yGoodTerm}` : `${xGoodTerm}-${yGoodTerm}`,
      description: `Above avg ${yLabel}, ${xConfig?.lowerIsBetter ? 'above avg' : 'above avg'} ${xLabel}`,
      color: xConfig?.lowerIsBetter ? 'yellow' : 'green'
    },
    topLeft: {
      // Good Y, Bad/Good X (depending on if X is lower-is-better)
      label: xConfig?.lowerIsBetter ? `${xGoodTerm}-${yGoodTerm}` : `${xPoorTerm}-${yGoodTerm}`,
      description: `Above avg ${yLabel}, ${xConfig?.lowerIsBetter ? 'below avg' : 'below avg'} ${xLabel}`,
      color: xConfig?.lowerIsBetter ? 'green' : 'yellow'
    },
    bottomRight: {
      // Bad Y, Good/Bad X (depending on if X is lower-is-better)
      label: xConfig?.lowerIsBetter ? `${xPoorTerm}-${yPoorTerm}` : `${xGoodTerm}-${yPoorTerm}`,
      description: `Below avg ${yLabel}, ${xConfig?.lowerIsBetter ? 'above avg' : 'above avg'} ${xLabel}`,
      color: xConfig?.lowerIsBetter ? 'red' : 'orange'
    },
    bottomLeft: {
      // Bad Y, Bad/Good X (depending on if X is lower-is-better)
      label: xConfig?.lowerIsBetter ? `${xGoodTerm}-${yPoorTerm}` : `${xPoorTerm}-${yPoorTerm}`,
      description: `Below avg ${yLabel}, ${xConfig?.lowerIsBetter ? 'below avg' : 'below avg'} ${xLabel}`,
      color: xConfig?.lowerIsBetter ? 'orange' : 'red'
    }
  };
}

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
  const [showRegressionLine, setShowRegressionLine] = useState(true);
  const [showQuadrants, setShowQuadrants] = useState(true);
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

      // Store the filtered value for each metric (should be only one per athlete per metric)
      acc[point.athleteId].metrics[point.metric] = point.value;

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
            // Average lines
            xAverageLine: {
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
            yAverageLine: {
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

      {/* Controls and Analysis */}
      <div className="mt-4 space-y-4">
        {/* Toggle Controls */}
        <div className="flex items-center justify-center space-x-6">
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={showRegressionLine}
              onChange={(e) => setShowRegressionLine(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Show Trend Line</span>
          </label>

          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={showQuadrants}
              onChange={(e) => setShowQuadrants(e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span>Show Quadrants</span>
          </label>
        </div>

        {/* Statistical Analysis */}
        {correlation !== null && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="font-medium">Correlation</div>
              <div className={`text-lg font-bold ${
                Math.abs(correlation) > 0.7 ? 'text-green-600' :
                Math.abs(correlation) > 0.4 ? 'text-yellow-600' : 'text-gray-600'
              }`}>
                r = {correlation.toFixed(3)}
              </div>
              <div className="text-xs text-muted-foreground">
                {Math.abs(correlation) > 0.7 ? 'Strong' :
                 Math.abs(correlation) > 0.4 ? 'Moderate' : 'Weak'}
                {correlation > 0 ? ' Positive' : ' Negative'}
              </div>
            </div>

            {scatterData.regression && (
              <div className="text-center">
                <div className="font-medium">R-Squared</div>
                <div className="text-lg font-bold text-blue-600">
                  R² = {scatterData.regression.rSquared.toFixed(3)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(scatterData.regression.rSquared * 100).toFixed(1)}% explained
                </div>
              </div>
            )}

            {scatterData.regression && (
              <div className="text-center">
                <div className="font-medium">Trend</div>
                <div className="text-lg font-bold text-purple-600">
                  {scatterData.regression.slope > 0 ? '↗️' : '↘️'}
                </div>
                <div className="text-xs text-muted-foreground">
                  Slope: {scatterData.regression.slope.toFixed(3)}
                </div>
              </div>
            )}

            <div className="text-center">
              <div className="font-medium">Sample Size</div>
              <div className="text-lg font-bold text-gray-600">
                n = {scatterData.points.length}
              </div>
              <div className="text-xs text-muted-foreground">
                Athletes
              </div>
            </div>
          </div>
        )}

        {/* Performance Quadrants Analysis */}
        {showQuadrants && statistics && scatterData.xMetric && scatterData.yMetric && (
          <div className="mt-4 bg-gray-50 rounded-lg p-3">
            <div className="text-sm font-medium text-center mb-2">Performance Quadrants</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(() => {
                const xMean = statistics[scatterData.xMetric]?.mean || 0;
                const yMean = statistics[scatterData.yMetric]?.mean || 0;
                const labels = getPerformanceQuadrantLabels(scatterData.xMetric, scatterData.yMetric);

                const quadrants = {
                  topRight: scatterData.points.filter((p: any) => p.x >= xMean && p.y >= yMean).length,
                  topLeft: scatterData.points.filter((p: any) => p.x < xMean && p.y >= yMean).length,
                  bottomRight: scatterData.points.filter((p: any) => p.x >= xMean && p.y < yMean).length,
                  bottomLeft: scatterData.points.filter((p: any) => p.x < xMean && p.y < yMean).length
                };

                const colorClasses = {
                  green: 'bg-green-100 text-green-800',
                  yellow: 'bg-yellow-100 text-yellow-800',
                  orange: 'bg-orange-100 text-orange-800',
                  red: 'bg-red-100 text-red-800'
                };

                return (
                  <>
                    <div className={`${colorClasses[labels.topRight.color as keyof typeof colorClasses]} p-2 rounded text-center`}>
                      <div className="font-medium">{labels.topRight.label}</div>
                      <div className="text-xs opacity-75">{labels.topRight.description}</div>
                      <div className="font-semibold">{quadrants.topRight} athletes</div>
                    </div>
                    <div className={`${colorClasses[labels.topLeft.color as keyof typeof colorClasses]} p-2 rounded text-center`}>
                      <div className="font-medium">{labels.topLeft.label}</div>
                      <div className="text-xs opacity-75">{labels.topLeft.description}</div>
                      <div className="font-semibold">{quadrants.topLeft} athletes</div>
                    </div>
                    <div className={`${colorClasses[labels.bottomRight.color as keyof typeof colorClasses]} p-2 rounded text-center`}>
                      <div className="font-medium">{labels.bottomRight.label}</div>
                      <div className="text-xs opacity-75">{labels.bottomRight.description}</div>
                      <div className="font-semibold">{quadrants.bottomRight} athletes</div>
                    </div>
                    <div className={`${colorClasses[labels.bottomLeft.color as keyof typeof colorClasses]} p-2 rounded text-center`}>
                      <div className="font-medium">{labels.bottomLeft.label}</div>
                      <div className="text-xs opacity-75">{labels.bottomLeft.description}</div>
                      <div className="font-semibold">{quadrants.bottomLeft} athletes</div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ScatterPlotChart;