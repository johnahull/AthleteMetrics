import React, { useMemo, useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ScatterController,
  PointElement,
  LineElement
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import type { 
  ChartDataPoint, 
  ChartConfiguration, 
  StatisticalSummary,
  BoxPlotData 
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  ScatterController,
  PointElement,
  LineElement
);

interface BoxPlotChartProps {
  data: ChartDataPoint[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
  showAllPoints?: boolean; // Option to show all data points (swarm style)
}

export function BoxPlotChart({
  data,
  config,
  statistics,
  highlightAthlete,
  showAllPoints = false
}: BoxPlotChartProps) {
  const chartRef = useRef<any>(null);

  // Transform data for box plot visualization
  const boxPlotData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Group data by metric
    const metricGroups = data.reduce((groups, point) => {
      if (!groups[point.metric]) {
        groups[point.metric] = [];
      }
      groups[point.metric].push(point.value);
      return groups;
    }, {} as Record<string, number[]>);

    const datasets: any[] = [];
    const labels = Object.keys(metricGroups);

    // Create box plot data for each metric
    labels.forEach((metric, index) => {
      const values = metricGroups[metric].sort((a, b) => a - b);
      const stats = statistics?.[metric];

      if (stats && values.length > 0) {
        const boxWidth = 0.4;
        const xPos = index;

        // Box rectangle (Q1 to Q3)
        datasets.push({
          label: `${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Box`,
          data: [
            // Bottom left corner of box
            { x: xPos - boxWidth/2, y: stats.percentiles.p25 },
            // Bottom right corner of box
            { x: xPos + boxWidth/2, y: stats.percentiles.p25 },
            // Top right corner of box
            { x: xPos + boxWidth/2, y: stats.percentiles.p75 },
            // Top left corner of box
            { x: xPos - boxWidth/2, y: stats.percentiles.p75 },
            // Close the box
            { x: xPos - boxWidth/2, y: stats.percentiles.p25 }
          ],
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          borderColor: 'rgba(59, 130, 246, 0.8)',
          borderWidth: 2,
          pointRadius: 0,
          showLine: true,
          fill: true,
          order: 3
        });

        // Median line
        datasets.push({
          label: `${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Median`,
          data: [
            { x: xPos - boxWidth/2, y: stats.percentiles.p50 },
            { x: xPos + boxWidth/2, y: stats.percentiles.p50 }
          ],
          backgroundColor: 'rgba(59, 130, 246, 1)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 3,
          pointRadius: 0,
          showLine: true,
          order: 2
        });

        // Whiskers (vertical lines from box to min/max)
        const iqr = stats.percentiles.p75 - stats.percentiles.p25;
        const lowerWhisker = Math.max(stats.min, stats.percentiles.p25 - 1.5 * iqr);
        const upperWhisker = Math.min(stats.max, stats.percentiles.p75 + 1.5 * iqr);

        // Lower whisker (enhanced visibility)
        datasets.push({
          label: `${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Lower Whisker`,
          data: [
            { x: xPos, y: stats.percentiles.p25 },
            { x: xPos, y: lowerWhisker }
          ],
          backgroundColor: 'rgba(59, 130, 246, 1)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 3, // Increased from 2
          pointRadius: 0,
          showLine: true,
          order: 4
        });

        // Upper whisker (enhanced visibility)
        datasets.push({
          label: `${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Upper Whisker`,
          data: [
            { x: xPos, y: stats.percentiles.p75 },
            { x: xPos, y: upperWhisker }
          ],
          backgroundColor: 'rgba(59, 130, 246, 1)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 3, // Increased from 2
          pointRadius: 0,
          showLine: true,
          order: 4
        });

        // Whisker caps (enhanced visibility)
        datasets.push({
          label: `${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Whisker Caps`,
          data: [
            { x: xPos - 0.15, y: lowerWhisker }, // Wider caps
            { x: xPos + 0.15, y: lowerWhisker },
            { x: xPos - 0.15, y: upperWhisker },
            { x: xPos + 0.15, y: upperWhisker }
          ],
          backgroundColor: 'rgba(59, 130, 246, 1)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 3, // Increased from 2
          pointRadius: 2, // Small points for cap ends
          showLine: false,
          order: 4
        });

        // Individual points for outliers
        const outliers = values.filter(v =>
          v < stats.percentiles.p25 - 1.5 * iqr ||
          v > stats.percentiles.p75 + 1.5 * iqr
        );

        if (showAllPoints) {
          // Show all data points with jitter to avoid overlap
          const allPoints = data
            .filter(d => d.metric === metric)
            .map((point, pointIndex) => {
              const jitterRange = 0.25;
              const jitter = (Math.random() - 0.5) * jitterRange;
              const isOutlier = outliers.includes(point.value);

              return {
                x: xPos + jitter,
                y: point.value,
                athleteId: point.athleteId,
                athleteName: point.athleteName,
                teamName: point.teamName,
                isOutlier
              };
            });

          // Regular data points (non-outliers)
          const regularPoints = allPoints.filter(p => !p.isOutlier);
          if (regularPoints.length > 0) {
            datasets.push({
              label: `${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Data Points`,
              data: regularPoints,
              backgroundColor: 'rgba(59, 130, 246, 0.4)',
              borderColor: 'rgba(59, 130, 246, 0.7)',
              borderWidth: 1,
              pointRadius: 3,
              showLine: false,
              order: 5
            });
          }

          // Outlier points (if any)
          const outlierPoints = allPoints.filter(p => p.isOutlier);
          if (outlierPoints.length > 0) {
            datasets.push({
              label: `${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Outliers`,
              data: outlierPoints,
              backgroundColor: 'rgba(239, 68, 68, 0.6)',
              borderColor: 'rgba(239, 68, 68, 1)',
              borderWidth: 1,
              pointRadius: 4,
              showLine: false,
              order: 1
            });
          }
        } else {
          // Original behavior - only show outliers
          if (outliers.length > 0) {
            datasets.push({
              label: `${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Outliers`,
              data: outliers.map(value => ({ x: xPos, y: value })),
              backgroundColor: 'rgba(239, 68, 68, 0.6)',
              borderColor: 'rgba(239, 68, 68, 1)',
              borderWidth: 1,
              pointRadius: 4,
              showLine: false,
              order: 1
            });
          }
        }

        // Highlight specific athlete if provided
        if (highlightAthlete) {
          const athleteData = data.find(d =>
            d.athleteId === highlightAthlete && d.metric === metric
          );

          if (athleteData) {
            datasets.push({
              label: `${athleteData.athleteName}`,
              data: [{ x: xPos, y: athleteData.value }],
              backgroundColor: 'rgba(16, 185, 129, 1)',
              borderColor: 'rgba(16, 185, 129, 1)',
              borderWidth: 3,
              pointRadius: 8,
              pointStyle: 'star',
              showLine: false,
              order: 0
            });
          }
        }
      }
    });

    return {
      labels: labels.map(metric => 
        METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric
      ),
      datasets
    };
  }, [data, statistics, highlightAthlete, showAllPoints]);

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
            const point = context[0];
            const rawData = context[0].raw as any;

            // Check if this is an individual data point with athlete info
            if (rawData && rawData.athleteName) {
              return rawData.athleteName;
            }

            return `${point.dataset.label}`;
          },
          label: (context) => {
            const metric = Object.keys(statistics || {})[context.parsed.x];
            const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
            const rawData = context.raw as any;

            // Enhanced label for individual athlete points
            if (rawData && rawData.athleteName) {
              return `${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric}: ${context.parsed.y.toFixed(2)}${unit}`;
            }

            return `Value: ${context.parsed.y.toFixed(2)}${unit}`;
          },
          afterLabel: (context) => {
            const metric = Object.keys(statistics || {})[context.parsed.x];
            const stats = statistics?.[metric];
            const rawData = context.raw as any;
            const result = [];

            // Add team info for individual athlete points
            if (rawData && rawData.athleteName) {
              result.push(`Team: ${rawData.teamName || 'Independent'}`);

              // Add percentile information
              if (stats) {
                const allValues = data
                  .filter(d => d.metric === metric)
                  .map(d => d.value)
                  .sort((a, b) => a - b);
                const rank = allValues.filter(v => v < context.parsed.y).length;
                const percentile = (rank / allValues.length) * 100;
                result.push(`Percentile: ${percentile.toFixed(0)}%`);
              }
            }

            // Add statistical summary for all points
            if (stats) {
              result.push(
                `Mean: ${stats.mean.toFixed(2)}${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || ''}`,
                `Median: ${stats.median.toFixed(2)}${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || ''}`,
                `Std Dev: ${stats.std.toFixed(2)}${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || ''}`
              );
            }

            return result;
          }
        }
      },
      legend: {
        display: config.showLegend,
        position: 'top' as const,
        labels: {
          filter: (item) => {
            // Only show main labels, hide box components and internal data point labels
            return !item.text.includes('Box') &&
                   !item.text.includes('Median') &&
                   !item.text.includes('Whisker') &&
                   !item.text.includes('Caps') &&
                   !item.text.includes('Data Points'); // Hide generic data points from legend
          }
        }
      }
    },
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        min: -0.5,
        max: Object.keys(statistics || {}).length - 0.5,
        ticks: {
          stepSize: 1,
          callback: (value) => {
            const index = Number(value);
            const metrics = Object.keys(statistics || {});
            const metric = metrics[index];
            return metric ? 
              METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric : 
              '';
          }
        },
        title: {
          display: true,
          text: 'Metrics'
        }
      },
      y: {
        type: 'linear',
        beginAtZero: false,
        title: {
          display: true,
          text: 'Value'
        },
        ticks: {
          callback: (value) => {
            // Format based on metric type
            const metrics = Object.keys(statistics || {});
            if (metrics.length === 1) {
              const metric = metrics[0];
              const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
              return `${Number(value).toFixed(2)}${unit}`;
            }
            return Number(value).toFixed(2);
          }
        }
      }
    },
    elements: {
      point: {
        hoverRadius: 6
      }
    },
    interaction: {
      intersect: false,
      mode: 'point'
    }
  };

  if (!boxPlotData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available for box plot
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Chart
        ref={chartRef}
        type="scatter"
        data={boxPlotData}
        options={options}
      />
    </div>
  );
}

// Utility function to calculate box plot statistics
export function calculateBoxPlotStats(values: number[]): BoxPlotData {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  
  const min = sorted[0];
  const max = sorted[n - 1];
  
  const q1Index = Math.floor(n * 0.25);
  const medianIndex = Math.floor(n * 0.5);
  const q3Index = Math.floor(n * 0.75);
  
  const q1 = sorted[q1Index];
  const median = n % 2 === 0 ? 
    (sorted[medianIndex - 1] + sorted[medianIndex]) / 2 : 
    sorted[medianIndex];
  const q3 = sorted[q3Index];
  
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  
  const outliers = sorted.filter(v => v < lowerFence || v > upperFence);
  
  return {
    min,
    q1,
    median,
    q3,
    max,
    outliers
  };
}

export default BoxPlotChart;