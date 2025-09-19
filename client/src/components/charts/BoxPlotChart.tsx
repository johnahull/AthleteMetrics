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

export function BoxPlotChart({
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

            // Advanced collision detection and resolution
            const resolvedPositions = resolveLabeLCollisions(labelPositions, chartArea);

            // Helper function for sophisticated label collision resolution
            function resolveLabeLCollisions(
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
              const resolved = labels.map(label => ({ ...label }));
              const padding = 6;
              const textHeight = 12;
              const maxIterations = 20;
              let iteration = 0;

              // Priority-based processing: labels closer to their original position get priority
              resolved.sort((a, b) => {
                const distA = Math.sqrt(Math.pow(a.x - a.originalX, 2) + Math.pow(a.y - a.originalY, 2));
                const distB = Math.sqrt(Math.pow(b.x - b.originalX, 2) + Math.pow(b.y - b.originalY, 2));
                return distA - distB;
              });

              while (iteration < maxIterations) {
                let hasCollisions = false;

                for (let i = 0; i < resolved.length; i++) {
                  for (let j = i + 1; j < resolved.length; j++) {
                    const labelA = resolved[i];
                    const labelB = resolved[j];

                    // Check for collision with expanded bounds
                    const overlapsX = labelA.x < labelB.x + labelB.width + padding &&
                                     labelB.x < labelA.x + labelA.width + padding;
                    const overlapsY = Math.abs(labelA.y - labelB.y) < textHeight + padding;

                    if (overlapsX && overlapsY) {
                      hasCollisions = true;

                      // Try multiple positioning strategies for labelB
                      const strategies = [
                        // Strategy 1: Move down
                        { x: labelB.x, y: labelA.y + textHeight + padding },
                        // Strategy 2: Move up
                        { x: labelB.x, y: labelA.y - textHeight - padding },
                        // Strategy 3: Move right
                        { x: labelA.x + labelA.width + padding, y: labelB.y },
                        // Strategy 4: Move left
                        { x: labelA.x - labelB.width - padding, y: labelB.y },
                        // Strategy 5: Move diagonally down-right
                        { x: labelA.x + labelA.width + padding, y: labelA.y + textHeight + padding },
                        // Strategy 6: Move diagonally up-right
                        { x: labelA.x + labelA.width + padding, y: labelA.y - textHeight - padding },
                        // Strategy 7: Move further right
                        { x: labelB.originalX + 25, y: labelB.originalY },
                        // Strategy 8: Move further left
                        { x: labelB.originalX - labelB.width - 15, y: labelB.originalY }
                      ];

                      // Find the best valid strategy
                      let bestStrategy = null;
                      let bestScore = Infinity;

                      for (const strategy of strategies) {
                        // Check if strategy is within chart bounds
                        if (strategy.x >= chartBounds.left &&
                            strategy.x + labelB.width <= chartBounds.right - 5 &&
                            strategy.y >= chartBounds.top + 6 &&
                            strategy.y <= chartBounds.bottom - 6) {

                          // Check if this position conflicts with other labels
                          let conflicts = false;
                          for (let k = 0; k < resolved.length; k++) {
                            if (k === j) continue; // Skip self

                            const other = resolved[k];
                            const wouldOverlapX = strategy.x < other.x + other.width + padding &&
                                                 other.x < strategy.x + labelB.width + padding;
                            const wouldOverlapY = Math.abs(strategy.y - other.y) < textHeight + padding;

                            if (wouldOverlapX && wouldOverlapY) {
                              conflicts = true;
                              break;
                            }
                          }

                          if (!conflicts) {
                            // Calculate score based on distance from original position
                            const distance = Math.sqrt(
                              Math.pow(strategy.x - labelB.originalX, 2) +
                              Math.pow(strategy.y - labelB.originalY, 2)
                            );

                            if (distance < bestScore) {
                              bestScore = distance;
                              bestStrategy = strategy;
                            }
                          }
                        }
                      }

                      // Apply best strategy if found
                      if (bestStrategy) {
                        labelB.x = bestStrategy.x;
                        labelB.y = bestStrategy.y;
                      } else {
                        // Last resort: try to space vertically with larger gaps
                        const verticalOffset = (textHeight + padding * 2) * (j % 3);
                        const newY = labelB.originalY + verticalOffset;

                        if (newY >= chartBounds.top + 6 && newY <= chartBounds.bottom - 6) {
                          labelB.y = newY;
                        }
                      }
                    }
                  }
                }

                if (!hasCollisions) break;
                iteration++;
              }

              // Final pass: remove labels that are still overlapping or outside bounds
              return resolved.filter(label =>
                label.x >= chartBounds.left &&
                label.x + label.width <= chartBounds.right - 5 &&
                label.y >= chartBounds.top + 6 &&
                label.y <= chartBounds.bottom - 6
              );
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