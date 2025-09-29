/**
 * ViolinChart Component - Shows distribution shape and data density for group comparisons
 * Combines box plot statistics with kernel density estimation
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, Title, Tooltip, Legend } from 'chart.js';
import type { ChartDataPoint, ChartConfiguration, StatisticalSummary, GroupDefinition } from '@shared/analytics-types';
import { devLog } from '@/utils/dev-logger';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { getDateKey } from '@/utils/date-utils';

ChartJS.register(CategoryScale, LinearScale, Title, Tooltip, Legend);

interface ViolinChartProps {
  data: ChartDataPoint[];
  rawData?: ChartDataPoint[]; // Raw individual athlete data for individual points
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
  className?: string;
  selectedGroups?: GroupDefinition[]; // For multi-group analysis
}

export function ViolinChart({
  data,
  rawData,
  config,
  statistics,
  highlightAthlete,
  className,
  selectedGroups
}: ViolinChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  // Process data by groups - use rawData for individual athletes like BoxPlotChart
  const processedData = useMemo(() => {
    // Check if this is multi-group analysis with pre-aggregated data
    const isPreAggregated = data && data.length > 0 && data[0].athleteId?.startsWith?.('group-');

    // Use rawData for individual athlete points if available, otherwise fall back to data
    const sourceData = rawData && rawData.length > 0 ? rawData : data;

    if (!sourceData || sourceData.length === 0) return [];

    devLog.log('ViolinChart data processing', {
      isPreAggregated,
      hasRawData: !!rawData,
      rawDataLength: rawData?.length || 0,
      dataLength: data?.length || 0,
      sourceDataLength: sourceData.length,
      hasSelectedGroups: !!selectedGroups,
      selectedGroupsCount: selectedGroups?.length || 0,
      firstSourcePoint: sourceData[0]
    });

    try {
      // If selectedGroups is provided, use it to filter data (multi-group analysis)
      if (selectedGroups && selectedGroups.length > 0) {
        return selectedGroups.map((group, index) => {
          // Filter data for this group by memberIds
          const groupData = sourceData.filter(point => 
            group.memberIds && group.memberIds.includes(point.athleteId)
          );

          if (groupData.length === 0) {
            devLog.warn('ViolinChart: No data points for group', group.name);
            return null;
          }

          // Extract values and athlete info
          const values: number[] = [];
          const athletes: Array<{ athleteId: string, athleteName: string, value: number, teamName?: string }> = [];

          groupData.forEach(point => {
            if (point && typeof point.value === 'number' && !isNaN(point.value)) {
              values.push(point.value);
              athletes.push({
                athleteId: point.athleteId,
                athleteName: point.athleteName,
                value: point.value,
                teamName: point.teamName
              });
            }
          });

          if (values.length === 0) {
            devLog.warn('ViolinChart: No valid values for group', group.name);
            return null;
          }

          const sortedValues = [...values].sort((a, b) => a - b);
          const q1 = percentile(sortedValues, 25);
          const median = percentile(sortedValues, 50);
          const q3 = percentile(sortedValues, 75);
          const min = Math.min(...sortedValues);
          const max = Math.max(...sortedValues);
          const mean = sortedValues.reduce((a, b) => a + b, 0) / sortedValues.length;
          const count = sortedValues.length;
          const std = Math.sqrt(sortedValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / sortedValues.length);

          // Generate kernel density estimation for violin shape
          const density = calculateKDE(sortedValues);

          // Ensure density points are sorted by x-value for proper drawing
          density.sort((a, b) => a.x - b.x);

          devLog.log('Processed group data', {
            group: group.name,
            memberCount: group.memberIds?.length || 0,
            valueCount: sortedValues.length,
            athleteCount: athletes.length,
            stats: { min, q1, median, q3, max, mean, count, std },
            firstFewAthletes: athletes.slice(0, 3)
          });

          return {
            group: group.name,
            values: sortedValues,
            athletes,
            stats: { min, q1, median, q3, max, mean, count, std },
            density,
            color: getGroupColor(index)
          };
        }).filter((group): group is NonNullable<typeof group> => group !== null);
      }

      // Fallback: Group data by grouping field (for non-multi-group analysis)
      const groups = sourceData.reduce((acc, point) => {
        // Validate point data
        if (!point || typeof point.value !== 'number' || isNaN(point.value)) {
          devLog.warn('ViolinChart: Invalid data point', point);
          return acc;
        }

        const groupKey = point.grouping || point.teamName || 'All Athletes';
        if (!acc[groupKey]) {
          acc[groupKey] = { values: [], athletes: [] };
        }
        acc[groupKey].values.push(point.value);
        acc[groupKey].athletes.push({
          athleteId: point.athleteId,
          athleteName: point.athleteName,
          value: point.value,
          teamName: point.teamName
        });
        return acc;
      }, {} as Record<string, { values: number[], athletes: Array<{ athleteId: string, athleteName: string, value: number, teamName?: string }> }>);

    return Object.entries(groups).map(([groupName, groupData], index) => {
        if (!groupData || !groupData.values || groupData.values.length === 0) {
          devLog.warn('ViolinChart: No valid values for group', groupName);
          return null;
        }

        const sortedValues = [...groupData.values].sort((a, b) => a - b);
        const q1 = percentile(sortedValues, 25);
        const median = percentile(sortedValues, 50);
        const q3 = percentile(sortedValues, 75);
        const min = Math.min(...sortedValues);
        const max = Math.max(...sortedValues);
        const mean = sortedValues.reduce((a, b) => a + b, 0) / sortedValues.length;
        const count = sortedValues.length;
        const std = Math.sqrt(sortedValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / sortedValues.length);

        // Generate kernel density estimation for violin shape
        const density = calculateKDE(sortedValues);

        // Ensure density points are sorted by x-value for proper drawing
        density.sort((a, b) => a.x - b.x);

        devLog.log('Processed group data', {
          group: groupName,
          valueCount: sortedValues.length,
          athleteCount: groupData.athletes.length,
          stats: { min, q1, median, q3, max, mean, count, std },
          firstFewAthletes: groupData.athletes.slice(0, 3)
        });

        return {
          group: groupName,
          values: sortedValues,
          athletes: groupData.athletes,
          stats: { min, q1, median, q3, max, mean, count, std },
          density,
          color: getGroupColor(index)
        };
      }).filter((group): group is NonNullable<typeof group> => group !== null);
    } catch (error) {
      devLog.error('ViolinChart: Error processing data', error);
      return [];
    }
  }, [data, rawData, selectedGroups]);


  // Kernel Density Estimation for violin shape
  function calculateKDE(values: number[]): Array<{ x: number; y: number }> {
    if (values.length === 0) return [];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    // Handle edge case where all values are the same
    if (range === 0) {
      // Create a narrow bell curve centered at the single value
      const center = min;
      const artificialBandwidth = Math.abs(min) * 0.1 || 1;
      const kde: Array<{ x: number; y: number }> = [];
      for (let i = -50; i <= 50; i++) {
        const x = center + (i / 50) * artificialBandwidth;
        const u = i / 50;
        const density = Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
        kde.push({ x, y: density });
      }
      return kde;
    }

    // Use Silverman's rule of thumb for bandwidth selection
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n);
    const sortedValues = [...values].sort((a, b) => a - b);
    const iqr = percentile(sortedValues, 75) - percentile(sortedValues, 25);

    // Calculate bandwidth using Silverman's rule, with fallbacks
    let bandwidth = 0.9 * Math.min(std, iqr / 1.34) * Math.pow(n, -0.2);

    // Ensure bandwidth is valid and reasonable
    if (!isFinite(bandwidth) || bandwidth <= 0) {
      bandwidth = range * 0.1; // Fallback to 10% of range
    }

    // Make sure bandwidth is not too small
    bandwidth = Math.max(bandwidth, range * 0.05);

    const step = range / 100; // 100 points along the range

    devLog.log('KDE calculation', {
      valuesCount: values.length,
      min, max, range,
      std, iqr, bandwidth,
      step
    });

    const kde: Array<{ x: number; y: number }> = [];

    // Extend range by 2 * bandwidth for better visualization
    const extendedMin = min - bandwidth * 2;
    const extendedMax = max + bandwidth * 2;
    const extendedRange = extendedMax - extendedMin;
    const adjustedStep = extendedRange / 200; // More points for smoother curve

    for (let x = extendedMin; x <= extendedMax; x += adjustedStep) {
      let density = 0;
      for (const value of values) {
        // Gaussian kernel
        const u = (x - value) / bandwidth;
        density += Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
      }
      density = density / (values.length * bandwidth);

      // Ensure density is a valid number
      if (isFinite(density)) {
        kde.push({ x, y: density });
      }
    }

    devLog.log('KDE results', {
      kdePoints: kde.length,
      densityRange: kde.length > 0 ? [Math.min(...kde.map(p => p.y)), Math.max(...kde.map(p => p.y))] : [0, 0]
    });

    return kde.length > 0 ? kde : [{ x: min, y: 1 }];
  }

  function percentile(arr: number[], p: number): number {
    const index = (p / 100) * (arr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (upper >= arr.length) return arr[arr.length - 1];
    if (lower === upper) return arr[lower];

    return arr[lower] * (upper - index) + arr[upper] * (index - lower);
  }

  function getGroupColor(index: number): string {
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
    return colors[index % colors.length];
  }

  // Generate deterministic jitter for consistent positioning
  function generateJitter(athleteId: string, range: number): number {
    let hash = 0;
    for (let i = 0; i < athleteId.length; i++) {
      const char = athleteId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to range [-range/2, range/2]
    return ((hash % 1000) / 1000 - 0.5) * range;
  }

  // Custom drawing logic for violin chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || processedData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      devLog.error('ViolinChart: Could not get canvas context');
      return;
    }

    // Set canvas size to match container
    const container = canvas.parentElement;
    if (container) {
      const containerWidth = container.clientWidth;
      const dpr = window.devicePixelRatio || 1;

      // Set actual canvas size for high DPI displays
      canvas.width = containerWidth * dpr;
      canvas.height = 400 * dpr;

      // Scale canvas back down using CSS
      canvas.style.width = containerWidth + 'px';
      canvas.style.height = '400px';

      // Scale the drawing context
      ctx.scale(dpr, dpr);
    }

    try {

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));

    const padding = 60;
    const displayWidth = container?.clientWidth || 600;
    const displayHeight = 400;
    const chartWidth = displayWidth - 2 * padding;
    const chartHeight = displayHeight - 2 * padding;
    const groupWidth = chartWidth / processedData.length;

    // Find global min/max for y-axis scaling
    const allValues = processedData.flatMap(group => group.values);
    const dataMin = allValues.length > 0 ? Math.min(...allValues) : 0;
    const dataMax = allValues.length > 0 ? Math.max(...allValues) : 100;
    const dataRange = dataMax - dataMin || 1;

    // Add 5% padding to the data range to ensure full utilization of chart height
    const padding_percent = 0.05;
    const rangePadding = dataRange * padding_percent;
    const globalMin = dataMin - rangePadding;
    const globalMax = dataMax + rangePadding;
    const valueRange = globalMax - globalMin;

    // Helper function to convert value to y-coordinate (uses full chart height)
    const valueToY = (value: number) => {
      return padding + chartHeight - ((value - globalMin) / valueRange) * chartHeight;
    };

    // Draw each violin
    processedData.forEach((group, groupIndex) => {
      // Safety checks for group data
      if (!group || !group.density || group.density.length === 0) {
        devLog.warn('ViolinChart: Invalid group data', group);
        return;
      }

      const centerX = padding + groupIndex * groupWidth + groupWidth / 2;
      const densityValues = group.density.map(d => d.y).filter(y => isFinite(y));
      const maxDensity = densityValues.length > 0 ? Math.max(...densityValues) : 1;

      devLog.log('Drawing violin for group', {
        group: group.group,
        densityPoints: group.density.length,
        densityValues: densityValues.slice(0, 5), // First 5 values for debugging
        maxDensity,
        centerX,
        groupWidth
      });

      // Draw violin shape (density curve)
      ctx.fillStyle = group.color + '40'; // Semi-transparent
      ctx.strokeStyle = group.color;
      ctx.lineWidth = 2;

      ctx.beginPath();

      // Start from the center line at the bottom
      const startY = valueToY(group.density[0]?.x || globalMin);
      ctx.moveTo(centerX, startY);

      // Right side of violin (going up)
      group.density.forEach((point, i) => {
        if (!point || !isFinite(point.x) || !isFinite(point.y)) return;

        const x = centerX + (point.y / maxDensity) * (groupWidth * 0.3);
        const y = valueToY(point.x);

        if (!isFinite(x) || !isFinite(y)) return;

        ctx.lineTo(x, y);
      });

      // Connect to center at top
      const endY = valueToY(group.density[group.density.length - 1]?.x || globalMax);
      ctx.lineTo(centerX, endY);

      // Left side of violin (going down)
      for (let i = group.density.length - 1; i >= 0; i--) {
        const point = group.density[i];
        if (!point || !isFinite(point.x) || !isFinite(point.y)) continue;

        const x = centerX - (point.y / maxDensity) * (groupWidth * 0.3);
        const y = valueToY(point.x);

        if (!isFinite(x) || !isFinite(y)) continue;

        ctx.lineTo(x, y);
      }

      // Close the path back to start
      ctx.lineTo(centerX, startY);

      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw individual athlete points with jitter
      devLog.log('Drawing athlete points for group', {
        group: group.group,
        athleteCount: group.athletes?.length || 0,
        hasAthletes: !!group.athletes
      });

      if (group.athletes && group.athletes.length > 0) {
        group.athletes.forEach((athlete) => {
          const jitterRange = groupWidth * 0.25; // 25% of group width for jitter
          const jitter = generateJitter(athlete.athleteId, jitterRange);
          const x = centerX + jitter;
          const y = valueToY(athlete.value);

          if (isFinite(x) && isFinite(y)) {
            // Check if this athlete is highlighted
            const isHighlighted = athlete.athleteId === highlightAthlete;

            ctx.save(); // Save context state
            ctx.fillStyle = isHighlighted
              ? '#10B981' // Green for highlighted athlete
              : '#000000'; // Black for debugging visibility

            ctx.beginPath();
            ctx.arc(x, y, isHighlighted ? 6 : 5, 0, 2 * Math.PI); // Larger for visibility
            ctx.fill();

            // Add border for all points to make them more visible
            ctx.strokeStyle = isHighlighted ? '#10B981' : '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.restore(); // Restore context state

            devLog.log('Drew athlete point', {
              athlete: athlete.athleteName,
              x, y,
              value: athlete.value,
              isHighlighted
            });
          } else {
            devLog.warn('Invalid athlete point coordinates', {
              athlete: athlete.athleteName,
              x, y,
              value: athlete.value
            });
          }
        });
      }

      // Draw statistical lines spanning full violin width instead of box plot
      const { stats } = group;

      // Safety check for stats
      devLog.log('Drawing statistical lines for group', {
        group: group.group,
        stats: stats,
        hasStats: !!stats,
        q1: stats?.q1,
        q3: stats?.q3,
        median: stats?.median
      });

      if (!stats || !isFinite(stats.q1) || !isFinite(stats.q3) || !isFinite(stats.median)) {
        devLog.warn('ViolinChart: Invalid stats for group', group.group, stats);
        return;
      }

      // Calculate violin width at different heights for full-width lines
      const violinWidth = groupWidth * 0.3;

      const q1Y = valueToY(stats.q1);
      const q3Y = valueToY(stats.q3);
      const medianY = valueToY(stats.median);

      devLog.log('Drawing lines at positions', {
        q1Y, q3Y, medianY,
        centerX, violinWidth,
        leftX: centerX - violinWidth,
        rightX: centerX + violinWidth
      });

      // Q1 line (dotted) - using orange for visibility
      if (isFinite(q1Y)) {
        ctx.save(); // Save context state
        ctx.strokeStyle = '#F59E0B'; // Orange for debugging
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]); // Dotted line
        ctx.beginPath();
        ctx.moveTo(centerX - violinWidth, q1Y);
        ctx.lineTo(centerX + violinWidth, q1Y);
        ctx.stroke();
        ctx.restore(); // Restore context state
        devLog.log('Drew Q1 line at y:', q1Y);
      }

      // Q3 line (dotted) - using orange for visibility
      if (isFinite(q3Y)) {
        ctx.save(); // Save context state
        ctx.strokeStyle = '#F59E0B'; // Orange for debugging
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]); // Dotted line
        ctx.beginPath();
        ctx.moveTo(centerX - violinWidth, q3Y);
        ctx.lineTo(centerX + violinWidth, q3Y);
        ctx.stroke();
        ctx.restore(); // Restore context state
        devLog.log('Drew Q3 line at y:', q3Y);
      }

      // Median line (solid, prominent) - using red for visibility
      if (isFinite(medianY)) {
        ctx.save(); // Save context state
        ctx.strokeStyle = '#DC2626'; // Red for debugging
        ctx.lineWidth = 4;
        ctx.setLineDash([]); // Solid line
        ctx.beginPath();
        ctx.moveTo(centerX - violinWidth, medianY);
        ctx.lineTo(centerX + violinWidth, medianY);
        ctx.stroke();
        ctx.restore(); // Restore context state
        devLog.log('Drew median line at y:', medianY);
      }

      // Whiskers
      ctx.strokeStyle = group.color;
      ctx.lineWidth = 1;

      // Min whisker
      if (isFinite(stats.min)) {
        const minY = valueToY(stats.min);
        if (isFinite(minY) && isFinite(q1Y)) {
          ctx.beginPath();
          ctx.moveTo(centerX, q1Y);
          ctx.lineTo(centerX, minY);
          ctx.moveTo(centerX - 4, minY);
          ctx.lineTo(centerX + 4, minY);
          ctx.stroke();
        }
      }

      // Max whisker
      if (isFinite(stats.max)) {
        const maxY = valueToY(stats.max);
        if (isFinite(maxY) && isFinite(q3Y)) {
          ctx.beginPath();
          ctx.moveTo(centerX, q3Y);
          ctx.lineTo(centerX, maxY);
          ctx.moveTo(centerX - 4, maxY);
          ctx.lineTo(centerX + 4, maxY);
          ctx.stroke();
        }
      }

      // Mean point
      if (isFinite(stats.mean)) {
        const meanY = valueToY(stats.mean);
        if (isFinite(meanY)) {
          ctx.fillStyle = '#ff0000';
          ctx.beginPath();
          ctx.arc(centerX, meanY, 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      // Group label
      ctx.fillStyle = '#374151';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(group.group, centerX, canvas.height - 20);
    });

    // Draw y-axis
    ctx.strokeStyle = '#6B7280';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + chartHeight);
    ctx.stroke();

    // Y-axis labels - use nice round numbers and ensure full height usage
    const numTicks = 6; // More ticks for better granularity
    ctx.fillStyle = '#6B7280';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= numTicks; i++) {
      const value = globalMin + (valueRange * i) / numTicks;
      const y = valueToY(value);

      // Format numbers nicely
      const displayValue = value < 0.1 && value > -0.1 ? value.toFixed(3) : value.toFixed(2);
      ctx.fillText(displayValue, padding - 10, y + 4);

      // Tick marks
      ctx.strokeStyle = '#6B7280';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding - 5, y);
      ctx.lineTo(padding, y);
      ctx.stroke();

      // Add grid lines for better readability (subtle)
      if (i > 0 && i < numTicks) {
        ctx.strokeStyle = '#E5E7EB';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(padding + chartWidth, y);
        ctx.stroke();
      }
    }

    } catch (error) {
      devLog.error('ViolinChart: Error drawing chart', error);
      // Clear canvas on error
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw error message
        ctx.fillStyle = '#6B7280';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Error rendering violin chart', canvas.width / 2, canvas.height / 2);
      }
    }
  }, [processedData]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      // Trigger a redraw when window resizes
      const canvas = canvasRef.current;
      if (canvas && processedData.length > 0) {
        // Small delay to ensure container has updated its size
        setTimeout(() => {
          const event = new Event('resize');
          window.dispatchEvent(event);
        }, 100);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [processedData]);

  const metric = data && data.length > 0 ? data[0]?.metric : undefined;
  const metricConfig = metric ? METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG] : null;

  devLog.log('ViolinChart render', {
    dataLength: data.length,
    processedGroups: processedData.length,
    metric
  });

  // Early return if no data to display
  if (!data || data.length === 0 || processedData.length === 0) {
    return (
      <div className={`${className} flex items-center justify-center h-96`}>
        <div className="text-center">
          {!data || data.length === 0 ? (
            <>
              <h3 className="text-lg font-medium mb-2">No data available</h3>
              <p className="text-sm text-muted-foreground">
                No data available for violin chart
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium mb-2">Unable to render violin chart</h3>
              <p className="text-sm text-muted-foreground">
                The data could not be processed for violin visualization.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-auto border rounded"
          style={{ height: '400px' }}
        />

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span>Distribution Shape</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full opacity-50"></div>
            <span>Individual Athletes</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-white"></div>
            <span>Median</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-white border-dashed border-t-2 border-white"></div>
            <span>Quartiles (Q1, Q3)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span>Mean</span>
          </div>
        </div>
      </div>

      {/* Statistical summary by team */}
      {processedData.length > 0 && metricConfig && (
        <div className="mt-4">
          <div className="grid gap-4 text-sm" style={{ gridTemplateColumns: `auto repeat(${processedData.length}, 1fr)` }}>
            {/* Header row */}
            <div className="font-medium"></div>
            {processedData.map((group, index) => (
              <div key={index} className="font-medium text-center" style={{ color: group.color }}>
                {group.group}
              </div>
            ))}

            {/* Count row */}
            <div className="font-medium text-right pr-4">Count</div>
            {processedData.map((group, index) => (
              <div key={index} className="text-lg font-bold text-center">
                {group.stats.count}
              </div>
            ))}

            {/* Mean row */}
            <div className="font-medium text-right pr-4">Mean</div>
            {processedData.map((group, index) => (
              <div key={index} className="text-lg font-bold text-red-600 text-center">
                {group.stats.mean.toFixed(2)}{metricConfig.unit}
              </div>
            ))}

            {/* Median row */}
            <div className="font-medium text-right pr-4">Median</div>
            {processedData.map((group, index) => (
              <div key={index} className="text-lg font-bold text-yellow-600 text-center">
                {group.stats.median.toFixed(2)}{metricConfig.unit}
              </div>
            ))}

            {/* Std Dev row */}
            <div className="font-medium text-right pr-4">Std Dev</div>
            {processedData.map((group, index) => (
              <div key={index} className="text-lg font-bold text-gray-600 text-center">
                {group.stats.std.toFixed(2)}{metricConfig.unit}
              </div>
            ))}

            {/* Range row */}
            <div className="font-medium text-right pr-4">Range</div>
            {processedData.map((group, index) => (
              <div key={index} className="text-lg font-bold text-gray-600 text-center">
                {(group.stats.max - group.stats.min).toFixed(2)}{metricConfig.unit}
              </div>
            ))}
          </div>
        </div>
      )}

      {metricConfig && (
        <p className="text-xs text-muted-foreground mt-2">
          {metricConfig.label} ({metricConfig.unit})
          {metricConfig.lowerIsBetter ? ' - Lower is better' : ' - Higher is better'}
        </p>
      )}
    </div>
  );
}

export default ViolinChart;