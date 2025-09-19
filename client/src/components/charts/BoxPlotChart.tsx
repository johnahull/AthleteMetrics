import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ScatterController,
  LineController,
  PointElement,
  LineElement
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
  LineController,
  PointElement,
  LineElement
);

interface BoxPlotChartProps {
  data: ChartDataPoint[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
  showAllPoints?: boolean; // Option to show all data points (swarm style)
  showAthleteNames?: boolean; // Option to show athlete names next to points
}

export const BoxPlotChart = React.memo(function BoxPlotChart({
  data,
  config,
  statistics,
  highlightAthlete,
  showAllPoints = false,
  showAthleteNames = false
}: BoxPlotChartProps) {
  const chartRef = useRef<any>(null);
  const [localShowAthleteNames, setLocalShowAthleteNames] = useState(showAthleteNames);

  // Transform data for box plot visualization
  const boxPlotData = useMemo(() => {
    if (!data || data.length === 0) return null;


    // Group data by metric
    const metricGroups = data.reduce((groups, point) => {
      if (!groups[point.metric]) {
        groups[point.metric] = [];
      }
      // Convert value to number to handle string values
      const numericValue = typeof point.value === 'string' ? parseFloat(point.value) : point.value;
      if (!isNaN(numericValue)) {
        groups[point.metric].push(numericValue);
      }
      return groups;
    }, {} as Record<string, number[]>);


    const datasets: any[] = [];
    const labels = Object.keys(metricGroups);

    // Create box plot data for each metric
    labels.forEach((metric, index) => {
      const values = metricGroups[metric].sort((a, b) => a - b);
      let stats = statistics?.[metric];

      // Check if server stats are valid - simple check for valid mean value
      const hasValidStats = stats && stats.count > 0 && typeof stats.mean === 'number' && !isNaN(stats.mean);

      if (!hasValidStats && values.length > 0) {
        // Calculate statistics on client side as fallback
        // Convert to numbers first to handle string values
        const numericValues = values.map(v => typeof v === 'string' ? parseFloat(v) : v).filter(v => !isNaN(v));
        const sortedValues = [...numericValues].sort((a, b) => a - b);
        const count = sortedValues.length;
        const sum = sortedValues.reduce((acc, val) => acc + val, 0);
        const mean = sum / count;
        const min = Math.min(...sortedValues);
        const max = Math.max(...sortedValues);

        // Calculate percentiles
        const getPercentile = (p: number) => {
          const index = (p / 100) * (count - 1);
          const lower = Math.floor(index);
          const upper = Math.ceil(index);
          if (lower === upper) return sortedValues[lower];
          const weight = index - lower;
          return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
        };

        stats = {
          count,
          mean,
          median: getPercentile(50),
          min,
          max,
          std: 0, // Not needed for box plot
          variance: 0, // Not needed for box plot
          percentiles: {
            p5: getPercentile(5),
            p10: getPercentile(10),
            p25: getPercentile(25),
            p50: getPercentile(50),
            p75: getPercentile(75),
            p90: getPercentile(90),
            p95: getPercentile(95)
          }
        };
      }

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
          type: 'line',
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
          type: 'line',
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
          type: 'line',
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
          type: 'line',
          backgroundColor: 'rgba(59, 130, 246, 1)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 3, // Increased from 2
          pointRadius: 0,
          showLine: true,
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
              // Convert value to number to handle string values
              const numericValue = typeof point.value === 'string' ? parseFloat(point.value) : point.value;
              const isOutlier = outliers.includes(numericValue);

              return {
                x: xPos + jitter,
                y: numericValue,
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
              type: 'scatter',
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
              type: 'scatter',
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
              type: 'scatter',
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
            // Convert value to number to handle string values
            const numericValue = typeof athleteData.value === 'string' ? parseFloat(athleteData.value) : athleteData.value;
            datasets.push({
              label: `${athleteData.athleteName}`,
              data: [{ x: xPos, y: numericValue }],
              type: 'scatter',
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
  }, [data, statistics, highlightAthlete, showAllPoints, showAthleteNames]);

  // Chart options
  const options: ChartOptions<'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      onComplete: function() {
        // Render athlete names if enabled
        if (localShowAthleteNames && showAllPoints && chartRef.current) {
          const chart = chartRef.current;
          const ctx = chart.ctx;
          const chartArea = chart.chartArea;

          if (ctx && chartArea) {
            // Save current context state
            ctx.save();

            // Set text styling
            ctx.font = '10px Arial';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            // Collect all label positions for collision detection
            const labelPositions: Array<{
              x: number;
              y: number;
              width: number;
              height: number;
              text: string;
              originalX: number;
              originalY: number;
            }> = [];

            // First pass: collect all potential label positions
            chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
              if (dataset.data && Array.isArray(dataset.data)) {
                dataset.data.forEach((point: any, pointIndex: number) => {
                  if (point && typeof point === 'object' && point.athleteName) {
                    const meta = chart.getDatasetMeta(datasetIndex);
                    const element = meta.data[pointIndex];

                    if (element && element.x !== undefined && element.y !== undefined) {
                      const textWidth = ctx.measureText(point.athleteName).width;
                      const textHeight = 12;
                      const baseOffsetX = 8;

                      // Calculate distance from metric center to determine safe positioning
                      const metricIndex = Math.round(element.x);
                      const distanceFromCenter = Math.abs(element.x - metricIndex);

                      // Position text based on point location relative to box center
                      let textX = element.x + baseOffsetX;
                      let textY = element.y;

                      // If point is close to center (within box area), position further right
                      if (distanceFromCenter < 0.3) {
                        textX = element.x + 15;
                      }

                      // Avoid positioning text too close to chart edges
                      if (textX + textWidth > chartArea.right - 10) {
                        // If text would overflow right, position to the left instead
                        textX = element.x - textWidth - 8;
                      }

                      // Only add if within chart bounds
                      if (textX >= chartArea.left &&
                          textX + textWidth <= chartArea.right &&
                          textY >= chartArea.top &&
                          textY <= chartArea.bottom) {

                        labelPositions.push({
                          x: textX,
                          y: textY,
                          width: textWidth,
                          height: textHeight,
                          text: point.athleteName,
                          originalX: element.x,
                          originalY: element.y
                        });
                      }
                    }
                  }
                });
              }
            });

            // Simple and efficient collision resolution
            const resolvedPositions = resolveLabelsEfficiently(labelPositions, chartArea);

            // Efficient O(n log n) label collision resolution
            function resolveLabelsEfficiently(
              labels: Array<{
                x: number;
                y: number;
                width: number;
                height: number;
                text: string;
                originalX: number;
                originalY: number;
              }>,
              chartBounds: { left: number; top: number; right: number; bottom: number }
            ) {
              if (labels.length === 0) return [];

              const padding = 6;
              const textHeight = 12;

              // Sort labels by Y position for easier vertical spacing
              const sorted = [...labels].sort((a, b) => a.y - b.y);
              const resolved = [];

              for (let i = 0; i < sorted.length; i++) {
                const label = { ...sorted[i] };

                // Check against already placed labels
                let hasCollision = false;
                for (const placed of resolved) {
                  const overlapsX = label.x < placed.x + placed.width + padding &&
                                   placed.x < label.x + label.width + padding;
                  const overlapsY = Math.abs(label.y - placed.y) < textHeight + padding;

                  if (overlapsX && overlapsY) {
                    hasCollision = true;
                    // Simple strategy: move down
                    label.y = placed.y + textHeight + padding;
                    break;
                  }
                }

                // Check bounds and add if valid
                if (label.x >= chartBounds.left &&
                    label.x + label.width <= chartBounds.right - 5 &&
                    label.y >= chartBounds.top + 6 &&
                    label.y <= chartBounds.bottom - 6) {
                  resolved.push(label);
                }

                // Limit total labels for performance
                if (resolved.length >= 20) break;
              }

              return resolved;
            }

            // Second pass: render all labels with resolved positions
            resolvedPositions.forEach(label => {
              const padding = 2;

              // Add a subtle background for better readability
              ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
              ctx.fillRect(label.x - padding, label.y - 6, label.width + 2 * padding, 12);

              // Restore text color and draw text
              ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
              ctx.fillText(label.text, label.x, label.y);
            });

            // Restore context state
            ctx.restore();
          }
        }
      }
    },
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
      {/* Toggle control for athlete names - only show when swarm mode is enabled */}
      {showAllPoints && (
        <div className="flex items-center space-x-2 mb-4 px-2">
          <Switch
            id="show-names"
            checked={localShowAthleteNames}
            onCheckedChange={setLocalShowAthleteNames}
          />
          <Label htmlFor="show-names" className="text-sm font-medium cursor-pointer">
            Show athlete names
          </Label>
        </div>
      )}

      <Chart
        ref={chartRef}
        type="scatter"
        data={boxPlotData}
        options={options}
      />
    </div>
  );
});

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