import React, { useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  ScatterController,
  PointElement,
  LineElement
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type {
  TrendData,
  ChartConfiguration,
  StatisticalSummary
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { TIME_SERIES_CHART_CONSTANTS, ATHLETE_COLORS, BOX_PLOT_COLORS, PERSONAL_BEST } from './constants/timeSeriesChartConstants';
import { calculateBoxPlotStatistics, safeParseDate, generateDeterministicJitter } from './utils/boxPlotStatistics';
import { resolveLabelCollisions } from './utils/labelCollisionResolver';
import type { AthleteDataPoint, ChartDataPoint, LabelPosition, ChartInstance, TooltipItem, ChartContext, ChartScale } from './types/timeSeriesChartTypes';

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

interface TimeSeriesBoxSwarmProps {
  data: TrendData[];
  config: ChartConfiguration;
  selectedDates: string[];
  metric: string;
  statistics?: Record<string, StatisticalSummary>;
  showAthleteNames?: boolean;
}

// Extract constants to improve maintainability
const { BOX_WIDTH, POINT_RADIUS, JITTER_RANGE, BASE_OFFSET_X, ANIMATION_DURATION, LAYOUT_PADDING } = TIME_SERIES_CHART_CONSTANTS;

export function TimeSeriesBoxSwarmChart({
  data,
  config,
  selectedDates,
  metric,
  statistics,
  showAthleteNames = false
}: TimeSeriesBoxSwarmProps) {
  const chartRef = useRef<any>(null);
  const [localShowAthleteNames, setLocalShowAthleteNames] = useState(showAthleteNames);

  // Process data for time-series box+swarm visualization
  const chartData = useMemo(() => {
    if (!data || data.length === 0 || selectedDates.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
    const unit = metricConfig?.unit || '';

    // Sort selected dates chronologically
    const sortedDates = [...selectedDates].sort();

    // Group data by date with improved type safety
    const dateDataMap = new Map<string, AthleteDataPoint[]>();

    data.forEach(trend => {
      trend.data.forEach(point => {
        const date = safeParseDate(point.date);
        const dateStr = date.toISOString().split('T')[0];

        if (selectedDates.includes(dateStr)) {
          if (!dateDataMap.has(dateStr)) {
            dateDataMap.set(dateStr, []);
          }
          const dateDataArray = dateDataMap.get(dateStr);
          if (dateDataArray) {
            dateDataArray.push({
              athleteId: trend.athleteId,
              athleteName: trend.athleteName,
              value: point.value,
              isPersonalBest: point.isPersonalBest
            });
          }
        }
      });
    });

    // Create athlete color mapping
    const uniqueAthletes = [...new Set(data.map(trend => trend.athleteId))];
    const athleteColorMap = new Map<string, string>();
    uniqueAthletes.forEach((athleteId, index) => {
      athleteColorMap.set(athleteId, ATHLETE_COLORS[index % ATHLETE_COLORS.length]);
    });

    const datasets: any[] = [];
    const dateLabels = sortedDates.map(dateStr => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // Create box plot and swarm plot datasets for each date
    sortedDates.forEach((dateStr, dateIndex) => {
      const dateData = dateDataMap.get(dateStr) || [];
      if (dateData.length === 0) return;

      const values = dateData.map(d => d.value);
      values.sort((a, b) => a - b);
      const dateLabel = dateLabels[dateIndex];

      if (values.length > 0) {
        // Calculate box plot statistics using extracted utility
        const statistics = calculateBoxPlotStatistics(values);
        const { min, max, q1, median, q3, mean } = statistics;

        // Box plot components using numeric x-coordinates for proper rendering
        const dateOffset = dateIndex; // Use numeric position

        // 1. Box rectangle (Q1 to Q3) - drawn as rectangle outline
        datasets.push({
          label: `Box-${dateIndex}`,
          data: [
            { x: dateOffset - BOX_WIDTH/2, y: q1 },
            { x: dateOffset + BOX_WIDTH/2, y: q1 },
            { x: dateOffset + BOX_WIDTH/2, y: q3 },
            { x: dateOffset - BOX_WIDTH/2, y: q3 },
            { x: dateOffset - BOX_WIDTH/2, y: q1 }
          ],
          type: 'line',
          borderColor: BOX_PLOT_COLORS.BOX_BORDER,
          backgroundColor: BOX_PLOT_COLORS.BOX_BACKGROUND,
          borderWidth: 2,
          pointRadius: 0,
          showLine: true,
          fill: true,
          order: 2,
          tension: 0
        });

        // 2. Median line (horizontal line across box)
        datasets.push({
          label: `Median-${dateIndex}`,
          data: [
            { x: dateOffset - BOX_WIDTH/2, y: median },
            { x: dateOffset + BOX_WIDTH/2, y: median }
          ],
          type: 'line',
          borderColor: 'rgba(75, 85, 99, 1)',
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 0,
          showLine: true,
          order: 1
        });

        // 3. Mean line (horizontal dashed line across box)
        datasets.push({
          label: `Mean-${dateIndex}`,
          data: [
            { x: dateOffset - BOX_WIDTH/2, y: mean },
            { x: dateOffset + BOX_WIDTH/2, y: mean }
          ],
          type: 'line',
          borderColor: 'rgba(239, 68, 68, 1)',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          showLine: true,
          order: 1
        });

        // 4. Lower whisker (min to Q1)
        datasets.push({
          label: `LowerWhisker-${dateIndex}`,
          data: [
            { x: dateOffset, y: min },
            { x: dateOffset, y: q1 }
          ],
          type: 'line',
          borderColor: 'rgba(75, 85, 99, 0.6)',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          showLine: true,
          order: 2
        });

        // 5. Upper whisker (Q3 to max)
        datasets.push({
          label: `UpperWhisker-${dateIndex}`,
          data: [
            { x: dateOffset, y: q3 },
            { x: dateOffset, y: max }
          ],
          type: 'line',
          borderColor: 'rgba(75, 85, 99, 0.6)',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          showLine: true,
          order: 2
        });

        // 6. Whisker caps (horizontal lines at min and max)
        const capWidth = BOX_WIDTH * TIME_SERIES_CHART_CONSTANTS.CAP_WIDTH_RATIO;
        datasets.push({
          label: `MinCap-${dateIndex}`,
          data: [
            { x: dateOffset - capWidth/2, y: min },
            { x: dateOffset + capWidth/2, y: min }
          ],
          type: 'line',
          borderColor: 'rgba(75, 85, 99, 0.8)',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          showLine: true,
          order: 2
        });

        datasets.push({
          label: `MaxCap-${dateIndex}`,
          data: [
            { x: dateOffset - capWidth/2, y: max },
            { x: dateOffset + capWidth/2, y: max }
          ],
          type: 'line',
          borderColor: 'rgba(75, 85, 99, 0.8)',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          showLine: true,
          order: 2
        });

        // 7. Swarm plot - individual athlete points
        dateData.forEach((athleteData, athleteIndex) => {
          // Use deterministic jitter based on athlete ID hash to prevent jumping on re-render
          const hash = athleteData.athleteId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
          const jitter = ((hash % 100) / 100 - 0.5) * 0.3;
          const color = athleteColorMap.get(athleteData.athleteId) || 'rgba(75, 85, 99, 0.8)';

          // Capture the current iteration's date values to avoid closure issues
          const currentDateStr = dateStr;
          const currentDateLabel = dateLabel;

          datasets.push({
            label: athleteData.athleteName,
            data: [{
              x: dateOffset + jitter,
              y: athleteData.value,
              // Store the actual date and date index for tooltip
              dateStr: currentDateStr,
              dateLabel: currentDateLabel,
              isPersonalBest: athleteData.isPersonalBest,
              athleteId: athleteData.athleteId,
              athleteName: athleteData.athleteName
            }],
            type: 'scatter',
            backgroundColor: athleteData.isPersonalBest ? 'gold' : color,
            borderColor: 'transparent',
            borderWidth: 0,
            pointRadius: 6,
            order: 0
          });
        });
      }
    });

    return {
      labels: dateLabels,
      datasets
    };
  }, [data, selectedDates, metric]);

  const chartOptions = useMemo(() => {
    const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
    const unit = metricConfig?.unit || '';
    const metricLabel = metricConfig?.label || metric;

    // Create date labels inside chartOptions to avoid closure issues
    const sortedDates = [...selectedDates].sort();
    const currentDateLabels = sortedDates.map(dateStr => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: !!config.title,
          text: config.title
        },
        legend: {
          display: false // Too many athletes for useful legend
        },
        tooltip: {
          filter: (tooltipItem: any) => {
            // Only show tooltips for athlete points, not box plot components
            const label = tooltipItem.dataset.label || '';
            return tooltipItem.dataset.type === 'scatter' &&
                   !label.includes('Box-') &&
                   !label.includes('Median-') &&
                   !label.includes('Mean-') &&
                   !label.includes('LowerWhisker-') &&
                   !label.includes('UpperWhisker-') &&
                   !label.includes('MinCap-') &&
                   !label.includes('MaxCap-');
          },
          callbacks: {
            title: (tooltipItems: any[]) => {
              // Show the correct date in the tooltip title
              if (tooltipItems.length > 0) {
                const item = tooltipItems[0];
                const dataPoint = item.raw;
                if (dataPoint && dataPoint.dateLabel) {
                  return dataPoint.dateLabel;
                }
              }
              return 'Date';
            },
            label: (context: any) => {
              const datasetLabel = context.dataset.label;
              const value = context.parsed.y;
              const dataPoint = context.raw;

              // Build the tooltip line with athlete name, value, and personal best indicator
              let label = `${datasetLabel}: ${value}${unit}`;
              if (dataPoint && dataPoint.isPersonalBest) {
                label += ' ⭐ (Personal Best)';
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear' as const,
          title: {
            display: true,
            text: 'Measurement Date'
          },
          grid: {
            display: false
          },
          afterBuildTicks: function(scale: any) {
            // Force ticks to be at integer positions where box plots are located
            scale.ticks = [];
            for (let i = 0; i < selectedDates.length; i++) {
              scale.ticks.push({ value: i });
            }
          },
          ticks: {
            callback: function(value: any) {
              // Only show labels at integer positions where box plots are located
              if (Number.isInteger(value) && value >= 0 && value < selectedDates.length) {
                const label = currentDateLabels[value] || '';
                return label;
              }
              return '';
            }
          },
          min: -0.5,
          max: selectedDates.length - 0.5
        },
        y: {
          type: 'linear' as const,
          title: {
            display: true,
            text: `${metricLabel} (${unit})`
          },
          grid: {
            color: 'rgba(75, 85, 99, 0.1)'
          },
          // Add padding to y-axis to prevent edge rendering
          grace: '5%'
        }
      },
      interaction: {
        mode: 'nearest' as const,
        intersect: false
      },
      animation: {
        duration: 750,
        onComplete: function() {
          // Render athlete names if enabled
          if (localShowAthleteNames && chartRef.current) {
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
                if (dataset.data && Array.isArray(dataset.data) && dataset.type === 'scatter') {
                  dataset.data.forEach((point: any, pointIndex: number) => {
                    if (point && typeof point === 'object' && point.athleteName) {
                      const meta = chart.getDatasetMeta(datasetIndex);
                      const element = meta.data[pointIndex];

                      if (element && element.x !== undefined && element.y !== undefined) {
                        const textWidth = ctx.measureText(point.athleteName).width;
                        const textHeight = 12;
                        const baseOffsetX = 8;

                        // Position text to the right of the point
                        let textX = element.x + baseOffsetX;
                        let textY = element.y;

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
              const resolvedPositions = resolveLabelCollisions(labelPositions, chartArea);

              // Helper function for sophisticated label collision resolution
              function resolveLabelCollisions(
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
                const maxIterations = 25; // Increased for time-series charts which may have more points
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
                          { x: labelB.originalX + 30, y: labelB.originalY },
                          // Strategy 8: Move further left
                          { x: labelB.originalX - labelB.width - 20, y: labelB.originalY },
                          // Strategy 9: Move vertically away from center
                          { x: labelB.x, y: labelB.originalY + (labelB.originalY > (chartBounds.top + chartBounds.bottom) / 2 ? 20 : -20) },
                          // Strategy 10: Move with larger spacing
                          { x: labelB.originalX + 40, y: labelB.originalY + 15 }
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
                          const verticalOffset = (textHeight + padding * 3) * (j % 4);
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
      // Add layout padding to prevent edge rendering
      layout: {
        padding: {
          left: 10,
          right: 10,
          top: 10,
          bottom: 10
        }
      }
    };
  }, [config, metric, selectedDates, localShowAthleteNames]);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <p className="text-lg font-medium">No Data Available</p>
          <p className="text-sm">Select measurement dates to view the time-series box+swarm chart.</p>
        </div>
      </div>
    );
  }

  if (selectedDates.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <p className="text-lg font-medium">No Dates Selected</p>
          <p className="text-sm">Please select measurement dates to view the chart.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Toggle control for athlete names */}
      <div className="flex items-center space-x-2 mb-4 px-2">
        <Switch
          id="show-names-timeseries"
          checked={localShowAthleteNames}
          onCheckedChange={setLocalShowAthleteNames}
        />
        <Label htmlFor="show-names-timeseries" className="text-sm font-medium cursor-pointer">
          Show athlete names
        </Label>
      </div>

      <Chart
        ref={chartRef}
        type="line"
        data={chartData}
        options={chartOptions}
      />

      {/* Legend for understanding the visualization */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span>Athlete Performance</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>Personal Best</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 border border-gray-600 bg-gray-100"></div>
            <span>Box Plot (Q1-Q3)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-gray-800"></div>
            <span>Median</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-red-500" style={{ borderTop: '1px dashed' }}></div>
            <span>Mean</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-gray-500"></div>
            <span>Whiskers (Min/Max)</span>
          </div>
        </div>
      </div>
    </div>
  );
}