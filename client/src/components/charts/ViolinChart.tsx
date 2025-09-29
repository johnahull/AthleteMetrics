/**
 * ViolinChart Component - Shows distribution shape and data density for group comparisons
 * Combines box plot statistics with kernel density estimation
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, Title, Tooltip, Legend } from 'chart.js';
import type { ChartDataPoint, ChartConfiguration, StatisticalSummary } from '@shared/analytics-types';
import { devLog } from '@/utils/dev-logger';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { getDateKey } from '@/utils/date-utils';

ChartJS.register(CategoryScale, LinearScale, Title, Tooltip, Legend);

interface ViolinChartProps {
  data: ChartDataPoint[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
  className?: string;
}

export function ViolinChart({
  data,
  config,
  statistics,
  highlightAthlete,
  className
}: ViolinChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  // Process data by groups
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    try {
      // Group data by grouping field (for multi-group analysis)
      const groups = data.reduce((acc, point) => {
        // Validate point data
        if (!point || typeof point.value !== 'number' || isNaN(point.value)) {
          devLog.warn('ViolinChart: Invalid data point', point);
          return acc;
        }

        const groupKey = point.grouping || point.teamName || 'All Athletes';
        if (!acc[groupKey]) {
          acc[groupKey] = [];
        }
        acc[groupKey].push(point.value);
        return acc;
      }, {} as Record<string, number[]>);

    return Object.entries(groups).map(([groupName, values], index) => {
        if (!values || values.length === 0) {
          devLog.warn('ViolinChart: No valid values for group', groupName);
          return null;
        }

        const sortedValues = [...values].sort((a, b) => a - b);
        const q1 = percentile(sortedValues, 25);
        const median = percentile(sortedValues, 50);
        const q3 = percentile(sortedValues, 75);
        const min = Math.min(...sortedValues);
        const max = Math.max(...sortedValues);
        const mean = sortedValues.reduce((a, b) => a + b, 0) / sortedValues.length;

        // Generate kernel density estimation for violin shape
        const density = calculateKDE(sortedValues);

        return {
          group: groupName,
          values: sortedValues,
          stats: { min, q1, median, q3, max, mean },
          density,
          color: getGroupColor(index)
        };
      }).filter(Boolean);
    } catch (error) {
      devLog.error('ViolinChart: Error processing data', error);
      return [];
    }
  }, [data]);

  // Kernel Density Estimation for violin shape
  function calculateKDE(values: number[]): Array<{ x: number; y: number }> {
    if (values.length === 0) return [];

    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const range = max - min;
    const bandwidth = range * 0.2; // Simple bandwidth selection
    const step = range / 100;

    const kde: Array<{ x: number; y: number }> = [];

    for (let x = min - bandwidth; x <= max + bandwidth; x += step) {
      let density = 0;
      for (const value of values) {
        // Gaussian kernel
        const u = (x - value) / bandwidth;
        density += Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
      }
      density = density / (values.length * bandwidth);
      kde.push({ x, y: density });
    }

    return kde;
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

  // Custom drawing logic for violin chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || processedData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      devLog.error('ViolinChart: Could not get canvas context');
      return;
    }

    try {

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = 60;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    const groupWidth = chartWidth / processedData.length;

    // Find global min/max for y-axis scaling
    const allValues = processedData.flatMap(group => group.values);
    const globalMin = allValues.length > 0 ? Math.min(...allValues) : 0;
    const globalMax = allValues.length > 0 ? Math.max(...allValues) : 100;
    const valueRange = globalMax - globalMin || 1; // Prevent division by zero

    // Helper function to convert value to y-coordinate
    const valueToY = (value: number) => {
      return padding + chartHeight - ((value - globalMin) / valueRange) * chartHeight;
    };

    // Draw each violin
    processedData.forEach((group, groupIndex) => {
      const centerX = padding + groupIndex * groupWidth + groupWidth / 2;
      const densityValues = group.density.map(d => d.y);
      const maxDensity = densityValues.length > 0 ? Math.max(...densityValues) : 1;

      // Draw violin shape (density curve)
      ctx.fillStyle = group.color + '40'; // Semi-transparent
      ctx.strokeStyle = group.color;
      ctx.lineWidth = 2;

      ctx.beginPath();

      // Right side of violin
      group.density.forEach((point, i) => {
        const x = centerX + (point.y / maxDensity) * (groupWidth * 0.4);
        const y = valueToY(point.x);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      // Left side of violin (mirrored)
      for (let i = group.density.length - 1; i >= 0; i--) {
        const point = group.density[i];
        const x = centerX - (point.y / maxDensity) * (groupWidth * 0.4);
        const y = valueToY(point.x);
        ctx.lineTo(x, y);
      }

      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw box plot inside violin
      const boxWidth = 8;
      const { stats } = group;

      // Box (Q1 to Q3)
      ctx.fillStyle = group.color;
      ctx.fillRect(
        centerX - boxWidth / 2,
        valueToY(stats.q3),
        boxWidth,
        valueToY(stats.q1) - valueToY(stats.q3)
      );

      // Median line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX - boxWidth / 2, valueToY(stats.median));
      ctx.lineTo(centerX + boxWidth / 2, valueToY(stats.median));
      ctx.stroke();

      // Whiskers
      ctx.strokeStyle = group.color;
      ctx.lineWidth = 1;
      // Min whisker
      ctx.beginPath();
      ctx.moveTo(centerX, valueToY(stats.q1));
      ctx.lineTo(centerX, valueToY(stats.min));
      ctx.moveTo(centerX - 4, valueToY(stats.min));
      ctx.lineTo(centerX + 4, valueToY(stats.min));
      ctx.stroke();

      // Max whisker
      ctx.beginPath();
      ctx.moveTo(centerX, valueToY(stats.q3));
      ctx.lineTo(centerX, valueToY(stats.max));
      ctx.moveTo(centerX - 4, valueToY(stats.max));
      ctx.lineTo(centerX + 4, valueToY(stats.max));
      ctx.stroke();

      // Mean point
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(centerX, valueToY(stats.mean), 3, 0, 2 * Math.PI);
      ctx.fill();

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

    // Y-axis labels
    const numTicks = 5;
    ctx.fillStyle = '#6B7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';

      for (let i = 0; i <= numTicks; i++) {
        const value = globalMin + (valueRange * i) / numTicks;
        const y = valueToY(value);
        ctx.fillText(value.toFixed(2), padding - 10, y + 3);

        // Tick marks
        ctx.beginPath();
        ctx.moveTo(padding - 5, y);
        ctx.lineTo(padding, y);
        ctx.stroke();
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
      <div className="mb-4">
        <h3 className="text-lg font-medium">{config.title}</h3>
        {config.subtitle && (
          <p className="text-sm text-muted-foreground">{config.subtitle}</p>
        )}
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={600}
          height={400}
          className="max-w-full h-auto border rounded"
        />

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span>Distribution Shape</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-2 bg-blue-500"></div>
            <span>Box (Q1-Q3)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-white"></div>
            <span>Median</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span>Mean</span>
          </div>
        </div>
      </div>

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