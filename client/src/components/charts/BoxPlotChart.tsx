import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ChartData,
  Filler,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronUpIcon, ChevronDownIcon } from 'lucide-react';
import { sanitizeCanvasText, sanitizeTeamName } from '@/utils/text-sanitization';
import type {
  ChartDataPoint,
  ChartConfiguration,
  StatisticalSummary,
  BoxPlotData,
  GroupDefinition
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { CHART_CONFIG } from '@/constants/chart-config';
import { safeNumber, convertAthleteMetricValue } from '@shared/utils/number-conversion';
import { generateDeterministicJitter } from './utils/boxPlotStatistics';
import { resolveLabelsWithSpatialIndex, type LabelPosition } from '@/utils/spatial-index';
import { isFly10Metric, formatFly10Dual } from '@/utils/fly10-conversion';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface BoxPlotChartProps {
  data: ChartDataPoint[];
  rawData?: ChartDataPoint[]; // Raw individual athlete data for swarm points
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
  showAllPoints?: boolean; // Option to show all data points (swarm style)
  showAthleteNames?: boolean; // Option to show athlete names next to points
  selectedGroups?: GroupDefinition[]; // For multi-group analysis
}

export const BoxPlotChart = React.memo(function BoxPlotChart({
  data,
  rawData,
  config,
  statistics,
  highlightAthlete,
  showAllPoints = false,
  showAthleteNames = false,
  selectedGroups
}: BoxPlotChartProps) {
  const chartRef = useRef<ChartJS<'scatter'> | null>(null);
  const [localShowAthleteNames, setLocalShowAthleteNames] = useState(showAthleteNames);
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);

  // Sync local state when parent prop changes
  useEffect(() => {
    setLocalShowAthleteNames(showAthleteNames);
  }, [showAthleteNames]);


  // Memoized label positions cache to prevent recalculation on every render
  const labelPositionsCache = useRef<Map<string, LabelPosition[]>>(new Map());

  // Generate cache key for label positions based on relevant data
  const generateCacheKey = useCallback((chartData: any, chartArea: any) => {
    const dataPoints = chartData.datasets.flatMap((dataset: any, datasetIndex: number) =>
      dataset.data.filter((point: any) => point && point.athleteName)
        .map((point: any, pointIndex: number) => `${datasetIndex}-${pointIndex}-${point.athleteName}-${point.x}-${point.y}`)
    );
    const areaKey = `${chartArea.left}-${chartArea.top}-${chartArea.right}-${chartArea.bottom}`;
    return `${areaKey}-${dataPoints.join(',')}`;
  }, []);

  // Memoized label position calculation
  const calculateLabelPositions = useCallback((chart: ChartJS<'scatter'>, ctx: CanvasRenderingContext2D, chartArea: any): LabelPosition[] => {
    const cacheKey = generateCacheKey(chart.data, chartArea);

    // Check cache first
    if (labelPositionsCache.current.has(cacheKey)) {
      return labelPositionsCache.current.get(cacheKey)!;
    }

    // Calculate label positions
    const labelPositions: LabelPosition[] = [];

    chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
      if (dataset.data && Array.isArray(dataset.data)) {
        dataset.data.forEach((point: any, pointIndex: number) => {
          if (point && typeof point === 'object' && point.athleteName) {
            const meta = chart.getDatasetMeta(datasetIndex);
            const element = meta.data[pointIndex];

            if (element && element.x !== undefined && element.y !== undefined) {
              const textWidth = ctx.measureText(point.athleteName).width;
              const textHeight = CHART_CONFIG.ALGORITHM.COLLISION_DETECTION.TEXT_HEIGHT;
              const baseOffsetX = CHART_CONFIG.ALGORITHM.COLLISION_DETECTION.PADDING;

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
                textX = element.x - textWidth - baseOffsetX;
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

    // Cache the result
    labelPositionsCache.current.set(cacheKey, labelPositions);

    // Limit cache size to prevent memory leaks
    if (labelPositionsCache.current.size > 10) {
      const firstKey = labelPositionsCache.current.keys().next().value;
      if (firstKey) {
        labelPositionsCache.current.delete(firstKey);
      }
    }

    return labelPositions;
  }, [generateCacheKey]);

  // Transform data for box plot visualization
  const boxPlotData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Check if this is multi-group analysis
    const isMultiGroup = selectedGroups && selectedGroups.length >= 2;
    
    // Check if data is pre-aggregated (group comparison data)
    const isPreAggregated = data.length > 0 && data[0].athleteId.startsWith('group-');

    if (isMultiGroup && isPreAggregated) {
      // Handle pre-aggregated group data
      const datasets: any[] = [];
      const labels: string[] = [];
      
      // Group data by metric
      const metricGroups = data.reduce((groups, point) => {
        if (!groups[point.metric]) {
          groups[point.metric] = [];
        }
        groups[point.metric].push(point);
        return groups;
      }, {} as Record<string, any[]>);
      
      Object.keys(metricGroups).forEach((metric, metricIndex) => {
        labels[metricIndex] = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;
        
        metricGroups[metric].forEach((point, groupIndex) => {
          if (!point.additionalData?.groupStats) return;
          
          const stats = point.additionalData.groupStats;
          const groupName = point.athleteName;
          
          // Position calculation for multi-group layout - spread edge to edge like violin chart
          const numGroups = metricGroups[metric].length;
          const numMetrics = Object.keys(metricGroups).length;

          // Box width proportional to number of groups
          const boxWidth = Math.max(0.08, Math.min(0.2, 0.7 / numGroups));

          // Spacing between group centers - adjust for 2 groups vs many
          // For 2 groups, use tighter spacing; for 3+, spread wider
          const groupSpacing = numGroups === 2 ? 0.5 : 0.9 / Math.max(1, numGroups - 1);
          const baseX = metricIndex; // Metric position

          // Center groups and spread them edge to edge
          const xPos = baseX + (groupIndex - (numGroups - 1) / 2) * groupSpacing;

          // Group colors
          const groupColors = CHART_CONFIG.COLORS.SERIES;
          const groupColor = groupColors[groupIndex % groupColors.length];
          const groupColorLight = groupColor + '40';
          
          // Calculate percentiles from existing stats
          const q1 = stats.median - (stats.stdDev * 0.674); // Approximate Q1
          const q3 = stats.median + (stats.stdDev * 0.674); // Approximate Q3
          
          // Box rectangle (Q1 to Q3)
          datasets.push({
            label: `${groupName} - ${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Box`,
            data: [
              { x: xPos - boxWidth/2, y: q1 },
              { x: xPos + boxWidth/2, y: q1 },
              { x: xPos + boxWidth/2, y: q3 },
              { x: xPos - boxWidth/2, y: q3 },
              { x: xPos - boxWidth/2, y: q1 }
            ],
            type: 'line',
            backgroundColor: groupColorLight,
            borderColor: groupColor,
            borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.DEFAULT,
            pointRadius: 0,
            showLine: true,
            fill: true,
            order: 3
          });
          
          // Median line
          datasets.push({
            label: `${groupName} - ${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Median`,
            data: [
              { x: xPos - boxWidth/2, y: stats.median },
              { x: xPos + boxWidth/2, y: stats.median }
            ],
            type: 'line',
            backgroundColor: groupColor,
            borderColor: groupColor,
            borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
            pointRadius: 0,
            showLine: true,
            order: 2
          });
          
          // Whiskers (using min/max from stats)
          datasets.push({
            label: `${groupName} - ${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Lower Whisker`,
            data: [
              { x: xPos, y: q1 },
              { x: xPos, y: stats.min }
            ],
            type: 'line',
            backgroundColor: groupColor,
            borderColor: groupColor,
            borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
            pointRadius: 0,
            showLine: true,
            order: 4
          });
          
          datasets.push({
            label: `${groupName} - ${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Upper Whisker`,
            data: [
              { x: xPos, y: q3 },
              { x: xPos, y: stats.max }
            ],
            type: 'line',
            backgroundColor: groupColor,
            borderColor: groupColor,
            borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
            pointRadius: 0,
            showLine: true,
            order: 4
          });
          
          // Mean point
          datasets.push({
            label: `${groupName} - ${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Mean`,
            data: [{ x: xPos, y: stats.mean }],
            type: 'scatter',
            backgroundColor: 'white',
            borderColor: groupColor,
            borderWidth: 2,
            pointRadius: 4,
            order: 1
          });

          // Swarm points for all players in this group (if enabled)
          if (showAllPoints) {

            // Try to get individual points from additionalData first
            let individualPoints = point.additionalData?.individualPoints as Array<{
              athleteId: string;
              athleteName: string;
              value: number;
              teamName?: string;
            }> | undefined;

            // If no individual points in additionalData, use rawData if available
            if (!individualPoints && rawData) {
              // Function to check if data point matches the group
              const matchesGroup = (dataPoint: any) => {
                // For multi-group analysis, match by athlete ID being in the group's memberIds
                if (selectedGroups) {
                  const matchingGroup = selectedGroups.find(g => g.name === groupName);
                  if (matchingGroup?.memberIds && matchingGroup.memberIds.includes(dataPoint.athleteId)) {
                    return true;
                  }
                }

                // Legacy fallback: Match by team name (case-insensitive)
                if (dataPoint.teamName) {
                  return dataPoint.teamName.toLowerCase() === groupName.toLowerCase();
                }

                return false;
              };

              individualPoints = rawData
                .filter(d => d.metric === metric && matchesGroup(d))
                .map(d => ({
                  athleteId: d.athleteId,
                  athleteName: d.athleteName,
                  value: d.value,
                  teamName: d.teamName,
                  teamId: d.teamId
                }));
            }

            // Final fallback: filter main data to get individual points for this group and metric
            if (!individualPoints) {
              // Reuse the same matching logic for main data
              const matchesGroup = (dataPoint: any) => {
                // For multi-group analysis, match by athlete ID being in the group's memberIds
                if (selectedGroups) {
                  const matchingGroup = selectedGroups.find(g => g.name === groupName);
                  if (matchingGroup?.memberIds && matchingGroup.memberIds.includes(dataPoint.athleteId)) {
                    return true;
                  }
                }

                // Legacy fallback: Match by team name (case-insensitive)
                if (dataPoint.teamName) {
                  return dataPoint.teamName.toLowerCase() === groupName.toLowerCase();
                }

                return false;
              };

              individualPoints = data
                .filter(d => d.metric === metric && matchesGroup(d))
                .map(d => ({
                  athleteId: d.athleteId,
                  athleteName: d.athleteName,
                  value: d.value,
                  teamName: d.teamName,
                  teamId: d.teamId
                }));
            }


            if (individualPoints && individualPoints.length > 0) {

            const groupPoints = individualPoints
              .filter(p => safeNumber(p.value) && !isNaN(safeNumber(p.value)))
              .map((indivPoint) => {
                const jitterRange = boxWidth * 0.8; // Jitter within the box width
                const jitter = generateDeterministicJitter(indivPoint.athleteId, jitterRange);
                const numericValue = safeNumber(indivPoint.value);

                // Determine if outlier using same logic as main section
                const q1 = stats.percentiles?.p25 || (stats.median - (stats.std * 0.674));
                const q3 = stats.percentiles?.p75 || (stats.median + (stats.std * 0.674));
                const iqr = q3 - q1;
                const isOutlier = numericValue < q1 - 1.5 * iqr || numericValue > q3 + 1.5 * iqr;

                return {
                  x: xPos + jitter,
                  y: numericValue,
                  athleteId: indivPoint.athleteId,
                  athleteName: indivPoint.athleteName,
                  teamName: indivPoint.teamName,
                  groupName: groupName,
                  metric: metric,
                  isOutlier
                };
              });

            // Regular points
            const regularPoints = groupPoints.filter(p => !p.isOutlier);
            if (regularPoints.length > 0) {
              datasets.push({
                label: `${groupName} Players`,
                data: regularPoints,
                type: 'scatter',
                backgroundColor: groupColorLight,
                borderColor: groupColor,
                borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THIN,
                pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.SMALL,
                showLine: false,
                order: 5
              });
            }

            // Outlier points
            const outlierPoints = groupPoints.filter(p => p.isOutlier);
            if (outlierPoints.length > 0) {
              datasets.push({
                label: `${groupName} Outliers`,
                data: outlierPoints,
                type: 'scatter',
                backgroundColor: 'white',
                borderColor: groupColor,
                borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
                pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.DEFAULT,
                pointStyle: 'cross',
                showLine: false,
                order: 6
              });
            }
            }
          }
        });
      });
      
      return {
        labels,
        datasets
      };
    } else if (isMultiGroup) {
      // Multi-group box plot: one box per group (original logic for individual athlete data)
      const datasets: any[] = [];
      const labels: string[] = [];

      selectedGroups.forEach((group, groupIndex) => {
        // Filter data for this group
        const groupData = data.filter(point =>
          group.memberIds.includes(point.athleteId)
        );

        if (groupData.length === 0) return;

        // Group by metric for this group
        const metricGroups = groupData.reduce((groups, point) => {
          if (!groups[point.metric]) {
            groups[point.metric] = [];
          }
          const numericValue = safeNumber(point.value);
          if (!isNaN(numericValue)) {
            groups[point.metric].push(numericValue);
          }
          return groups;
        }, {} as Record<string, number[]>);

        // Process each metric for this group
        Object.keys(metricGroups).forEach((metric, metricIndex) => {
          if (groupIndex === 0) {
            // Only add label once (for first group)
            labels[metricIndex] = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;
          }

          const values = metricGroups[metric].sort((a, b) => a - b);
          if (values.length === 0) return;

          // Calculate statistics for this group
          const sortedValues = [...values].sort((a, b) => a - b);
          const count = sortedValues.length;
          const sum = sortedValues.reduce((acc, val) => acc + val, 0);
          const mean = sum / count;
          const min = Math.min(...sortedValues);
          const max = Math.max(...sortedValues);

          const getPercentile = (p: number) => {
            const index = (p / 100) * (count - 1);
            const lower = Math.floor(index);
            const upper = Math.ceil(index);
            if (lower === upper) return sortedValues[lower];
            const weight = index - lower;
            return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
          };

          const stats = {
            count,
            mean,
            median: getPercentile(50),
            min,
            max,
            std: 0,
            variance: 0,
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

          // Position calculation for multi-group layout - spread edge to edge like violin chart
          const numGroups = selectedGroups.length;
          const numMetrics = Object.keys(metricGroups).length;

          // Box width proportional to number of groups
          const boxWidth = Math.max(0.08, Math.min(0.2, 0.7 / numGroups));

          // Spacing between group centers - adjust for 2 groups vs many
          // For 2 groups, use tighter spacing; for 3+, spread wider
          const groupSpacing = numGroups === 2 ? 0.5 : 0.9 / Math.max(1, numGroups - 1);
          const baseX = metricIndex; // Metric position

          // Center groups and spread them edge to edge
          const xPos = baseX + (groupIndex - (numGroups - 1) / 2) * groupSpacing;

          // Group colors - use the SERIES array from chart config
          const groupColors = CHART_CONFIG.COLORS.SERIES;
          const groupColor = groupColors[groupIndex % groupColors.length];
          const groupColorLight = groupColor + '40'; // Add transparency

          // Box rectangle (Q1 to Q3)
          datasets.push({
            label: `${group.name} - ${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Box`,
            data: [
              { x: xPos - boxWidth/2, y: stats.percentiles.p25 },
              { x: xPos + boxWidth/2, y: stats.percentiles.p25 },
              { x: xPos + boxWidth/2, y: stats.percentiles.p75 },
              { x: xPos - boxWidth/2, y: stats.percentiles.p75 },
              { x: xPos - boxWidth/2, y: stats.percentiles.p25 }
            ],
            type: 'line',
            backgroundColor: groupColorLight,
            borderColor: groupColor,
            borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.DEFAULT,
            pointRadius: 0,
            showLine: true,
            fill: true,
            order: 3
          });

          // Median line
          datasets.push({
            label: `${group.name} - ${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Median`,
            data: [
              { x: xPos - boxWidth/2, y: stats.percentiles.p50 },
              { x: xPos + boxWidth/2, y: stats.percentiles.p50 }
            ],
            type: 'line',
            backgroundColor: groupColor,
            borderColor: groupColor,
            borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
            pointRadius: 0,
            showLine: true,
            order: 2
          });

          // Whiskers
          const iqr = stats.percentiles.p75 - stats.percentiles.p25;
          const lowerWhisker = Math.max(stats.min, stats.percentiles.p25 - 1.5 * iqr);
          const upperWhisker = Math.min(stats.max, stats.percentiles.p75 + 1.5 * iqr);

          // Lower whisker
          datasets.push({
            label: `${group.name} - ${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Lower Whisker`,
            data: [
              { x: xPos, y: stats.percentiles.p25 },
              { x: xPos, y: lowerWhisker }
            ],
            type: 'line',
            backgroundColor: groupColor,
            borderColor: groupColor,
            borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
            pointRadius: 0,
            showLine: true,
            order: 4
          });

          // Upper whisker
          datasets.push({
            label: `${group.name} - ${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Upper Whisker`,
            data: [
              { x: xPos, y: stats.percentiles.p75 },
              { x: xPos, y: upperWhisker }
            ],
            type: 'line',
            backgroundColor: groupColor,
            borderColor: groupColor,
            borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
            pointRadius: 0,
            showLine: true,
            order: 4
          });

          // Swarm points for all players in this group
          if (showAllPoints) {
            const groupPoints = groupData
              .filter(d => d.metric === metric)
              .map((point) => {
                const jitterRange = boxWidth * 0.8; // Jitter within the box width
                const jitter = generateDeterministicJitter(point.athleteId, jitterRange);
                const numericValue = safeNumber(point.value);

                if (isNaN(numericValue)) return null;

                const outliers = values.filter(v =>
                  v < stats.percentiles.p25 - 1.5 * iqr ||
                  v > stats.percentiles.p75 + 1.5 * iqr
                );
                const isOutlier = outliers.includes(numericValue);

                return {
                  x: xPos + jitter,
                  y: numericValue,
                  athleteId: point.athleteId,
                  athleteName: point.athleteName,
                  teamName: point.teamName,
                  groupName: group.name,
                  metric: metric,
                  isOutlier
                };
              })
              .filter((point): point is NonNullable<typeof point> => point !== null);

            // Regular points
            const regularPoints = groupPoints.filter(p => !p.isOutlier);
            if (regularPoints.length > 0) {
              datasets.push({
                label: `${group.name} Players`,
                data: regularPoints,
                type: 'scatter',
                backgroundColor: groupColorLight,
                borderColor: groupColor,
                borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THIN,
                pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.SMALL,
                showLine: false,
                order: 5
              });
            }

            // Outlier points
            const outlierPoints = groupPoints.filter(p => p.isOutlier);
            if (outlierPoints.length > 0) {
              datasets.push({
                label: `${group.name} Outliers`,
                data: outlierPoints,
                type: 'scatter',
                backgroundColor: CHART_CONFIG.COLORS.AVERAGE_ALPHA,
                borderColor: CHART_CONFIG.COLORS.AVERAGE,
                borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THIN,
                pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.SMALL,
                showLine: false,
                order: 1
              });
            }
          }

          // Highlight specific athlete if provided
          if (highlightAthlete) {
            const athleteData = groupData.find(d =>
              d.athleteId === highlightAthlete && d.metric === metric
            );

            if (athleteData) {
              const numericValue = safeNumber(athleteData.value);
              datasets.push({
                label: `${athleteData.athleteName}`,
                data: [{ x: xPos, y: numericValue }],
                type: 'scatter',
                backgroundColor: CHART_CONFIG.COLORS.HIGHLIGHT,
                borderColor: CHART_CONFIG.COLORS.HIGHLIGHT,
                borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
                pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.HIGHLIGHTED,
                pointStyle: 'star',
                showLine: false,
                order: 0
              });
            }
          }
        });
      });

      return {
        labels,
        datasets
      };
    }

    // Original single-group logic
    // Group data by metric
    const metricGroups = data.reduce((groups, point) => {
      if (!groups[point.metric]) {
        groups[point.metric] = [];
      }
      // Convert value to number to handle string values
      const numericValue = safeNumber(point.value);
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
        const numericValues = values.map(v => safeNumber(v)).filter(v => !isNaN(v));
        const sortedValues = [...numericValues].sort((a, b) => a - b);
        const count = sortedValues.length;
        if (count === 0) {
          return; // Skip metrics with no valid data
        }
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
        // Dynamic box width for single metric display
        const numMetrics = Object.keys(metricGroups).length;
        const dynamicBoxWidth = Math.min(0.4, 0.8 / Math.max(1, numMetrics));
        const boxWidth = dynamicBoxWidth;
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
          backgroundColor: CHART_CONFIG.COLORS.PRIMARY_LIGHT,
          borderColor: CHART_CONFIG.COLORS.PRIMARY_STRONG,
          borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.DEFAULT,
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
          backgroundColor: CHART_CONFIG.COLORS.PRIMARY,
          borderColor: CHART_CONFIG.COLORS.PRIMARY,
          borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
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
          backgroundColor: CHART_CONFIG.COLORS.PRIMARY,
          borderColor: CHART_CONFIG.COLORS.PRIMARY,
          borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK, // Increased from 2
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
          backgroundColor: CHART_CONFIG.COLORS.PRIMARY,
          borderColor: CHART_CONFIG.COLORS.PRIMARY,
          borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK, // Increased from 2
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
              const jitter = generateDeterministicJitter(point.athleteId, jitterRange);
              // Convert value to number to handle string values
              const numericValue = safeNumber(point.value);

              // Skip points with invalid numeric values
              if (isNaN(numericValue)) {
                return null;
              }

              const isOutlier = outliers.includes(numericValue);

              return {
                x: xPos + jitter,
                y: numericValue,
                athleteId: point.athleteId,
                athleteName: point.athleteName,
                teamName: point.teamName,
                metric: metric,
                isOutlier
              };
            })
            .filter((point): point is NonNullable<typeof point> => point !== null);

          // Regular data points (non-outliers)
          const regularPoints = allPoints.filter(p => !p.isOutlier);
          if (regularPoints.length > 0) {
            datasets.push({
              label: `${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric} Data Points`,
              data: regularPoints,
              type: 'scatter',
              backgroundColor: CHART_CONFIG.COLORS.PRIMARY_ALPHA,
              borderColor: CHART_CONFIG.COLORS.PRIMARY_STRONG,
              borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THIN,
              pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.SMALL,
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
              backgroundColor: CHART_CONFIG.COLORS.AVERAGE_ALPHA,
              borderColor: CHART_CONFIG.COLORS.AVERAGE,
              borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THIN,
              pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.SMALL,
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
              backgroundColor: CHART_CONFIG.COLORS.HIGHLIGHT,
              borderColor: CHART_CONFIG.COLORS.HIGHLIGHT,
              borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
              pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.HIGHLIGHTED,
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
  }, [data, statistics, highlightAthlete, showAllPoints, showAthleteNames, selectedGroups]);

  // Custom plugin for drawing team labels
  const multiGroupLabelsPlugin = {
    id: 'multiGroupLabels',
    afterRender: (chart: any) => {
      try {
        // Only draw team labels for multi-group analysis
        const isMultiGroup = selectedGroups && selectedGroups.length >= 2;
        if (!isMultiGroup) return;

        // Comprehensive safety checks to prevent ownerDocument errors
        if (!chart || !chart.canvas || !chart.ctx || !chart.chartArea) {
          return;
        }

        // Additional safety check for canvas DOM element with error handling
        try {
          if (!chart.canvas.ownerDocument) {
            return;
          }
        } catch (e) {
          // Canvas might not be in DOM yet
          console.warn('BoxPlotChart: Failed to access canvas context', e);
          return;
        }

        const ctx = chart.ctx;
        const chartArea = chart.chartArea;

      // Collect unique team positions from datasets
      const teamPositions: { [teamName: string]: number[] } = {};

      chart.data.datasets.forEach((dataset: any) => {
        if (dataset.data && Array.isArray(dataset.data) && dataset.label) {
          const teamMatch = dataset.label.match(/^([^-]+) -/);
          if (teamMatch) {
            const teamName = teamMatch[1].trim();
            if (!teamPositions[teamName]) {
              teamPositions[teamName] = [];
            }

            dataset.data.forEach((point: any) => {
              if (point && typeof point.x === 'number') {
                teamPositions[teamName].push(point.x);
              }
            });
          }
        }
      });

      // Calculate center position for each team and draw labels
      ctx.save();
      ctx.font = '12px Arial';
      ctx.fillStyle = '#374151';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      Object.keys(teamPositions).forEach(teamName => {
        const positions = teamPositions[teamName];
        if (positions.length > 0) {
          // Calculate average position for team label
          const avgPosition = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
          const pixelX = chart.scales.x.getPixelForValue(avgPosition);

          // Position label below the chart area
          const labelY = chartArea.bottom + 25;

          // Draw team name (sanitized to prevent XSS)
          ctx.fillText(sanitizeTeamName(teamName), pixelX, labelY);
        }
      });

      ctx.restore();
      } catch (error) {
        // Silently handle canvas access errors to prevent chart crashes
        console.warn('BoxPlotChart multiGroupLabelsPlugin error:', error);
      }
    }
  };

  // Chart options
  const options: ChartOptions<'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      onComplete: function() {
        try {
          // Render athlete names if enabled
          if (localShowAthleteNames && showAllPoints && chartRef.current) {
            const chart = chartRef.current;

            // Additional safety checks to prevent ownerDocument errors
            if (!chart || !chart.canvas) {
              return;
            }

            try {
              if (!chart.canvas.ownerDocument) {
                return;
              }
            } catch (e) {
              console.warn('BoxPlotChart: labelsPlugin canvas access failed', e);
              return;
            }

            const ctx = chart.ctx;
            const chartArea = chart.chartArea;

            if (ctx && chartArea && ctx.canvas) {
              // Check ownerDocument in try-catch
              try {
                if (!ctx.canvas.ownerDocument) {
                  return;
                }
              } catch (e) {
                console.warn('BoxPlotChart: Label collision detection canvas access failed', e);
                return;
              }
              // Save current context state
              ctx.save();

              // Set text styling
              ctx.font = `${CHART_CONFIG.RESPONSIVE.MOBILE_FONT_SIZE}px Arial`;
              ctx.fillStyle = CHART_CONFIG.ACCESSIBILITY.WCAG_COLORS.TEXT_ON_LIGHT;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';

              // Use memoized label position calculation
              const labelPositions = calculateLabelPositions(chart, ctx, chartArea);

              // Efficient collision resolution using spatial indexing
              const resolvedPositions = resolveLabelsWithSpatialIndex(labelPositions, chartArea, {
                maxLabels: CHART_CONFIG.ALGORITHM.COLLISION_DETECTION.MAX_LABELS,
                padding: CHART_CONFIG.ALGORITHM.COLLISION_DETECTION.PADDING,
                textHeight: CHART_CONFIG.ALGORITHM.COLLISION_DETECTION.TEXT_HEIGHT,
                gridSize: CHART_CONFIG.ALGORITHM.COLLISION_DETECTION.GRID_SIZE,
                maxIterations: CHART_CONFIG.ALGORITHM.COLLISION_DETECTION.MAX_ITERATIONS,
              });

              // Second pass: render all labels with resolved positions
              resolvedPositions.forEach(label => {
                const padding = 2;

                // Add a subtle background for better readability
                ctx.fillStyle = CHART_CONFIG.ACCESSIBILITY.WCAG_COLORS.TEXT_ON_DARK;
                ctx.fillRect(label.x - padding, label.y - 6, label.width + 2 * padding, 12);

                // Restore text color and draw text (sanitized to prevent XSS)
                ctx.fillStyle = CHART_CONFIG.ACCESSIBILITY.WCAG_COLORS.TEXT_ON_LIGHT;
                ctx.fillText(sanitizeCanvasText(label.text), label.x, label.y);
              });

              // Restore context state
              ctx.restore();
            }
          }
        } catch (error) {
          // Silently handle canvas access errors to prevent chart crashes
          console.warn('BoxPlotChart animation error:', error);
        }
      }
    },
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
            const point = context[0];
            const rawData = context[0].raw as any;

            // Check if this is an individual data point with athlete info
            if (rawData && rawData.athleteName) {
              return rawData.athleteName;
            }

            return `${point.dataset.label}`;
          },
          label: (context) => {
            const rawData = context.raw as any;
            // Get metric from rawData first, fallback to statistics keys
            const parsedX = context.parsed.x;
            const parsedY = context.parsed.y;
            if (parsedX === null || parsedY === null) return '';

            const metric = rawData?.metric || Object.keys(statistics || {})[parsedX];
            const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
            const value = parsedY;

            // Format value with dual display for FLY10_TIME
            const formattedValue = isFly10Metric(metric)
              ? formatFly10Dual(value, 'time-first')
              : `${value.toFixed(2)}${unit}`;

            // Enhanced label for individual athlete points
            if (rawData && rawData.athleteName) {
              const metricLabel = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric || 'Value';
              return `${metricLabel}: ${formattedValue}`;
            }

            return `Value: ${formattedValue}`;
          },
          afterLabel: (context) => {
            const rawData = context.raw as any;
            // Get metric from rawData first, fallback to statistics keys
            const parsedX = context.parsed.x;
            const parsedY = context.parsed.y;
            if (parsedX === null || parsedY === null) return [];

            const metric = rawData?.metric || Object.keys(statistics || {})[parsedX];
            const stats = statistics?.[metric];
            const result = [];

            // Add team and group info for individual athlete points
            if (rawData && rawData.athleteName) {
              result.push(`Team: ${rawData.teamName || 'Independent'}`);

              // Add group info for multi-group analysis
              if (rawData.groupName) {
                result.push(`Group: ${rawData.groupName}`);
              }

              // Add percentile information
              if (stats) {
                const allValues = data
                  .filter(d => d.metric === metric)
                  .map(d => d.value)
                  .sort((a, b) => a - b);
                const rank = allValues.filter(v => v < parsedY).length;

                // For "lower is better" metrics, invert percentile so high percentile = better performance
                const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
                const rawPercentile = (rank / allValues.length) * 100;
                const percentile = metricConfig?.lowerIsBetter ? 100 - rawPercentile : rawPercentile;

                // Add clarifying label for percentile meaning
                const percentileLabel = metricConfig?.lowerIsBetter
                  ? `${percentile.toFixed(0)}th percentile (faster than ${percentile.toFixed(0)}%)`
                  : `${percentile.toFixed(0)}th percentile (better than ${percentile.toFixed(0)}%)`;

                result.push(`Performance: ${percentileLabel}`);
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
        type: 'linear' as const,
        title: {
          display: true,
          text: selectedGroups ? 'Groups' : 'Categories'
        },
        grid: {
          display: false
        },
        ...(selectedGroups && selectedGroups.length >= 2 && {
          // For multi-group, adjust scale bounds dynamically based on groups
          min: -0.6,
          max: (boxPlotData?.labels?.length || 1) - 0.4,
          ticks: {
            stepSize: 1,
            maxTicksLimit: Math.min(10, (boxPlotData?.labels?.length || 1) + 2),
            callback: function(value: any) {
              const metricIndex = Math.round(value);
              if (metricIndex < 0 || metricIndex >= (boxPlotData?.labels?.length || 0)) {
                return '';
              }
              // Show only the metric name for multi-group
              return boxPlotData?.labels?.[metricIndex] || '';
            }
          }
        })
      },
      y: {
        type: 'linear',
        beginAtZero: false,
        title: {
          display: true,
          text: (() => {
            const metrics = Object.keys(statistics || {});
            if (metrics.length === 1) {
              const metric = metrics[0];
              if (isFly10Metric(metric)) {
                return `${METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || 'Value'} (s / mph)`;
              }
              const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
              const label = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || 'Value';
              return unit ? `${label} (${unit})` : label;
            }
            return 'Value';
          })()
        },
        ticks: {
          callback: (value) => {
            // Format based on metric type
            const metrics = Object.keys(statistics || {});
            if (metrics.length === 1) {
              const metric = metrics[0];
              if (isFly10Metric(metric)) {
                return formatFly10Dual(Number(value), 'time-first');
              }
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

  // Cleanup chart instance on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        try {
          // Just destroy the chart without checking ownerDocument
          // The destroy method handles cleanup internally
          chartRef.current.destroy?.();
        } catch (error) {
          // Ignore cleanup errors silently
        }
        // Clear the ref regardless
        chartRef.current = null;
      }
    };
  }, []);

  if (!boxPlotData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available for box plot
      </div>
    );
  }

  // Use the processed data for the chart
  const chartData = boxPlotData;
  const chartOptions = options;

  // Calculate multi-group statistics grid data
  const multiGroupStats = useMemo(() => {
    if (!selectedGroups || selectedGroups.length < 2 || !data || data.length === 0) {
      return null;
    }

    const currentMetric = data.length > 0 ? (data[0]?.metric ?? '') : '';
    const metricConfig = currentMetric ? METRIC_CONFIG[currentMetric as keyof typeof METRIC_CONFIG] : null;

    // Collect group stats for all groups
    const groupsWithStats = selectedGroups.map((group, index) => {
      const groupDataPoint = data.find(d =>
        d.grouping === group.id &&
        d.additionalData?.groupStats &&
        d.metric === currentMetric
      );

      let groupStats = groupDataPoint?.additionalData?.groupStats;
      let groupDataCount = group.memberIds?.length ||
        data.filter(d => d.grouping === group.id && d.metric === currentMetric && !d.additionalData?.groupStats).length;

      if (!groupStats) {
        // Calculate from raw data if not in additionalData
        const groupValues = data
          .filter(d => d.grouping === group.id && d.metric === currentMetric)
          .map(d => typeof d.value === 'string' ? parseFloat(d.value) : d.value)
          .filter(v => !isNaN(v))
          .sort((a, b) => a - b);

        if (groupValues.length === 0) return null;

        const mean = groupValues.reduce((a, b) => a + b, 0) / groupValues.length;
        const median = groupValues.length % 2 === 0
          ? (groupValues[Math.floor(groupValues.length / 2) - 1] + groupValues[Math.floor(groupValues.length / 2)]) / 2
          : groupValues[Math.floor(groupValues.length / 2)];

        const variance = groupValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / groupValues.length;
        const stdDev = Math.sqrt(variance);

        const q1Index = Math.floor(groupValues.length * 0.25);
        const q3Index = Math.floor(groupValues.length * 0.75);

        groupStats = {
          count: groupValues.length,
          mean,
          median,
          min: groupValues[0],
          max: groupValues[groupValues.length - 1],
          stdDev,
          std: stdDev,
          q1: groupValues[q1Index],
          q3: groupValues[q3Index]
        };
        groupDataCount = groupValues.length;
      }

      return {
        group,
        stats: groupStats,
        count: groupDataCount || groupStats.count || groupStats.groupSize || 0,
        color: group.color || CHART_CONFIG.COLORS.SERIES[index % CHART_CONFIG.COLORS.SERIES.length]
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null && item.stats !== undefined);

    // Format values based on metric type
    const formatValue = (value: number) => {
      if (typeof value !== 'number' || isNaN(value)) return '-';
      const isTimeMetric = currentMetric?.includes('TIME') || currentMetric?.includes('AGILITY') ||
                          currentMetric?.includes('TEST') || currentMetric?.includes('DASH');
      return isTimeMetric ? value.toFixed(2) : value.toFixed(1);
    };

    return {
      groupsWithStats,
      metricConfig,
      currentMetric,
      formatValue
    };
  }, [selectedGroups, data]); // METRIC_CONFIG is a static constant, not included in deps

  // Add error boundary wrapper for chart rendering
  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Toggle control for athlete names - only show when swarm mode is enabled */}
      {showAllPoints && (
        <div className="flex items-center space-x-2 mb-4 px-2 flex-shrink-0">
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

      <div className="flex-1 overflow-y-auto">
        <div style={{ position: 'relative', minHeight: '400px', width: '100%' }}>
          {(() => {
            try {
              // Render chart only if there's data and options
              if (!chartData || !chartOptions) {
                return (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">
                    <div className="text-center">
                      <div className="text-lg font-medium mb-2">No Data Available</div>
                      <div className="text-sm">
                        {selectedGroups && selectedGroups.length > 0
                          ? `No data found for the selected groups (${selectedGroups.map(g => g.name).join(', ')})`
                          : 'No measurement data available for visualization'}
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <Chart
                  type="scatter"
                  data={chartData}
                  options={chartOptions}
                  plugins={[multiGroupLabelsPlugin]}
                  ref={chartRef}
                  key={`boxplot-${selectedGroups?.length || 0}-${chartData.datasets?.length || 0}`}
                />
              );
            } catch (error) {
              console.error('Chart render error:', error);
              return (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <div className="text-lg font-medium mb-2">Chart Error</div>
                    <div className="text-sm">Unable to render chart. Please try refreshing.</div>
                  </div>
                </div>
              );
            }
          })()}
        </div>

        {/* Statistics Summary Grid for Multi-Group Comparison */}
        {multiGroupStats && (
          <div className="mt-6 pb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsStatsExpanded(!isStatsExpanded)}
              className="flex items-center justify-between w-full p-3 h-auto text-sm font-medium bg-gray-50 rounded-lg border hover:bg-gray-100 mb-3"
              aria-expanded={isStatsExpanded}
              aria-controls="group-stats-content"
            >
              <span>Group Statistics Summary</span>
              {isStatsExpanded ? (
                <ChevronUpIcon className="h-4 w-4 ml-2" />
              ) : (
                <ChevronDownIcon className="h-4 w-4 ml-2" />
              )}
            </Button>

            {isStatsExpanded && (
            <div className="grid gap-4 text-sm" style={{ gridTemplateColumns: `auto repeat(${multiGroupStats.groupsWithStats.length}, 1fr)` }}>
              {/* Header row */}
              <div className="font-medium"></div>
              {multiGroupStats.groupsWithStats.map((item, index) => (
                <div key={index} className="font-medium text-center" style={{ color: item.color }}>
                  {item.group.name}
                </div>
              ))}

              {/* Count row */}
              <div className="font-medium text-right pr-4">Count</div>
              {multiGroupStats.groupsWithStats.map((item, index) => (
                <div key={index} className="text-lg font-bold text-center">
                  {item.count}
                </div>
              ))}

              {/* Mean row */}
              <div className="font-medium text-right pr-4">Mean</div>
              {multiGroupStats.groupsWithStats.map((item, index) => (
                <div key={index} className="text-lg font-bold text-foreground text-center">
                  {multiGroupStats.formatValue(item.stats.mean)}{multiGroupStats.metricConfig?.unit || ''}
                </div>
              ))}

              {/* Median row */}
              <div className="font-medium text-right pr-4">Median</div>
              {multiGroupStats.groupsWithStats.map((item, index) => (
                <div key={index} className="text-lg font-bold text-foreground text-center">
                  {multiGroupStats.formatValue(item.stats.median)}{multiGroupStats.metricConfig?.unit || ''}
                </div>
              ))}

              {/* Min row */}
              <div className="font-medium text-right pr-4">Min</div>
              {multiGroupStats.groupsWithStats.map((item, index) => (
                <div key={index} className="text-lg font-bold text-muted-foreground text-center">
                  {multiGroupStats.formatValue(item.stats.min)}{multiGroupStats.metricConfig?.unit || ''}
                </div>
              ))}

              {/* Max row */}
              <div className="font-medium text-right pr-4">Max</div>
              {multiGroupStats.groupsWithStats.map((item, index) => (
                <div key={index} className="text-lg font-bold text-muted-foreground text-center">
                  {multiGroupStats.formatValue(item.stats.max)}{multiGroupStats.metricConfig?.unit || ''}
                </div>
              ))}

              {/* Std Dev row */}
              <div className="font-medium text-right pr-4">Std Dev</div>
              {multiGroupStats.groupsWithStats.map((item, index) => (
                <div key={index} className="text-lg font-bold text-muted-foreground text-center">
                  {multiGroupStats.formatValue(item.stats.stdDev || item.stats.std || 0)}{multiGroupStats.metricConfig?.unit || ''}
                </div>
              ))}

              {/* Q1 row */}
              <div className="font-medium text-right pr-4">Q1</div>
              {multiGroupStats.groupsWithStats.map((item, index) => (
                <div key={index} className="text-lg font-bold text-muted-foreground text-center">
                  {multiGroupStats.formatValue(item.stats.q1 || item.stats.percentiles?.p25 || (item.stats.median - (item.stats.stdDev || item.stats.std || 0) * 0.674))}{multiGroupStats.metricConfig?.unit || ''}
                </div>
              ))}

              {/* Q3 row */}
              <div className="font-medium text-right pr-4">Q3</div>
              {multiGroupStats.groupsWithStats.map((item, index) => (
                <div key={index} className="text-lg font-bold text-muted-foreground text-center">
                  {multiGroupStats.formatValue(item.stats.q3 || item.stats.percentiles?.p75 || (item.stats.median + (item.stats.stdDev || item.stats.std || 0) * 0.674))}{multiGroupStats.metricConfig?.unit || ''}
                </div>
              ))}
            </div>
            )}

            {/* Metric context */}
            {isStatsExpanded && multiGroupStats.metricConfig && (
              <p className="text-xs text-muted-foreground mt-2">
                {multiGroupStats.metricConfig.label} ({multiGroupStats.metricConfig.unit})
                {multiGroupStats.metricConfig.lowerIsBetter ? ' - Lower is better' : ' - Higher is better'}
              </p>
            )}
          </div>
        )}
      </div>
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