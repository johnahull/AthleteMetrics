/**
 * TimeSeriesViolinChart Component - Time-series violin plots for multi-athlete trends
 * Shows distribution density at each selected measurement date
 */

import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import type { TrendData, ChartConfiguration, StatisticalSummary } from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { devLog } from '@/utils/dev-logger';
import { isFly10Metric, formatFly10Dual } from '@/utils/fly10-conversion';
import { Button } from '@/components/ui/button';
import { ChevronUpIcon, ChevronDownIcon } from 'lucide-react';

// Chart configuration constants
const TIME_SERIES_VIOLIN_CONFIG = {
  // KDE Calculation
  ARTIFICIAL_BANDWIDTH_FACTOR: 0.1,
  MIN_BANDWIDTH_FACTOR: 0.05,
  MAX_SAMPLE_SIZE: 1000,
  KDE_POINTS: 200,

  // Chart Layout
  Y_AXIS_PADDING_PERCENT: 0.05,
  VIOLIN_WIDTH_FACTOR: 0.3,
  JITTER_RANGE_FACTOR: 0.25,

  // Visual Styling
  CHART_PADDING: 60,
  CANVAS_HEIGHT: 400,
  POINT_RADIUS: 5,
  POINT_RADIUS_HIGHLIGHTED: 6,
  POINT_BORDER_WIDTH: 2,
  PERSONAL_BEST_COLOR: 'gold',

  // Interaction
  HOVER_THRESHOLD: 8,
  RESIZE_DEBOUNCE: 150,
} as const;

// Helper functions
function percentile(arr: number[], p: number): number {
  const index = (p / 100) * (arr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (upper >= arr.length) return arr[arr.length - 1];
  if (lower === upper) return arr[lower];

  return arr[lower] * (upper - index) + arr[upper] * (index - lower);
}

function getDateColor(index: number): string {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  return colors[index % colors.length];
}

interface TimeSeriesViolinChartProps {
  data: TrendData[];
  selectedDates: string[];
  metric: string;
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
}

export function TimeSeriesViolinChart({
  data,
  selectedDates,
  metric,
  config,
  statistics
}: TimeSeriesViolinChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [resizeKey, setResizeKey] = useState(0);
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    athleteName: string;
    value: number;
    date: string;
    isPersonalBest?: boolean;
  } | null>(null);

  // Canvas dimensions for coordinate calculations
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(TIME_SERIES_VIOLIN_CONFIG.CANVAS_HEIGHT);

  // Kernel Density Estimation for violin shape
  const calculateKDE = useCallback((values: number[]): Array<{ x: number; y: number }> => {
    if (values.length === 0) return [];

    // Handle single-value dataset
    if (values.length === 1) {
      const singleValue = values[0];
      const bandwidth = Math.abs(singleValue) * TIME_SERIES_VIOLIN_CONFIG.ARTIFICIAL_BANDWIDTH_FACTOR || 1;
      const kde: Array<{ x: number; y: number }> = [];
      for (let i = -50; i <= 50; i++) {
        const x = singleValue + (i / 50) * bandwidth;
        const u = i / 50;
        const gaussianValue = Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
        kde.push({ x, y: gaussianValue });
      }
      return kde;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    // Handle edge case where all values are the same
    if (range === 0) {
      const center = min;
      const artificialBandwidth = Math.abs(min) * TIME_SERIES_VIOLIN_CONFIG.ARTIFICIAL_BANDWIDTH_FACTOR || 1;
      const kde: Array<{ x: number; y: number }> = [];
      for (let i = -50; i <= 50; i++) {
        const x = center + (i / 50) * artificialBandwidth;
        const u = i / 50;
        const density = Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
        kde.push({ x, y: density });
      }
      return kde;
    }

    // For large datasets, sample to improve performance
    let sampledValues = values;
    if (values.length > TIME_SERIES_VIOLIN_CONFIG.MAX_SAMPLE_SIZE) {
      const step = Math.floor(values.length / TIME_SERIES_VIOLIN_CONFIG.MAX_SAMPLE_SIZE);
      sampledValues = values.filter((_, i) => i % step === 0).slice(0, TIME_SERIES_VIOLIN_CONFIG.MAX_SAMPLE_SIZE);
    }

    // Use Silverman's rule of thumb for bandwidth selection
    const n = sampledValues.length;
    const mean = sampledValues.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(sampledValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n);
    const sortedValues = [...sampledValues].sort((a, b) => a - b);
    const iqr = percentile(sortedValues, 75) - percentile(sortedValues, 25);

    let bandwidth = 0.9 * Math.min(std, iqr / 1.34) * Math.pow(n, -0.2);

    if (!isFinite(bandwidth) || bandwidth <= 0) {
      bandwidth = range * TIME_SERIES_VIOLIN_CONFIG.ARTIFICIAL_BANDWIDTH_FACTOR;
    }

    bandwidth = Math.max(bandwidth, range * TIME_SERIES_VIOLIN_CONFIG.MIN_BANDWIDTH_FACTOR);

    if (bandwidth <= 0 || !isFinite(bandwidth)) {
      return [{ x: min, y: 1 }];
    }

    const kde: Array<{ x: number; y: number }> = [];
    const extendedMin = min - bandwidth * 2;
    const extendedMax = max + bandwidth * 2;
    const extendedRange = extendedMax - extendedMin;
    const adjustedStep = extendedRange / TIME_SERIES_VIOLIN_CONFIG.KDE_POINTS;

    const gaussianNorm = 1 / Math.sqrt(2 * Math.PI);
    const denominator = sampledValues.length * bandwidth;

    if (denominator <= 0 || !isFinite(denominator)) {
      return [{ x: min, y: 1 }];
    }

    for (let x = extendedMin; x <= extendedMax; x += adjustedStep) {
      let density = 0;
      for (const value of sampledValues) {
        const u = (x - value) / bandwidth;
        if (Math.abs(u) > 3) continue;
        density += Math.exp(-0.5 * u * u) * gaussianNorm;
      }
      density = density / denominator;

      if (isFinite(density)) {
        kde.push({ x, y: density });
      }
    }

    return kde.length > 0 ? kde : [{ x: min, y: 1 }];
  }, []);

  // Process data by dates
  const processedData = useMemo(() => {
    if (!data || data.length === 0 || selectedDates.length === 0) {
      return [];
    }

    try {
      return selectedDates.map((dateStr, index) => {
        const dateKey = dateStr;
        const athletes: Array<{
          athleteId: string;
          athleteName: string;
          value: number;
          isPersonalBest?: boolean;
        }> = [];

        // Collect all athlete values for this date
        data.forEach(trend => {
          trend.data.forEach(point => {
            const pointDate = point.date instanceof Date
              ? point.date.toISOString().split('T')[0]
              : new Date(point.date).toISOString().split('T')[0];

            if (pointDate === dateKey) {
              athletes.push({
                athleteId: trend.athleteId,
                athleteName: trend.athleteName,
                value: point.value,
                isPersonalBest: point.isPersonalBest
              });
            }
          });
        });

        if (athletes.length === 0) {
          return null;
        }

        const values = athletes.map(a => a.value).sort((a, b) => a - b);
        const q1 = percentile(values, 25);
        const median = percentile(values, 50);
        const q3 = percentile(values, 75);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const count = values.length;
        const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);

        const density = calculateKDE(values);
        density.sort((a, b) => a.x - b.x);

        return {
          date: dateStr,
          dateLabel: new Date(dateStr).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }),
          athletes,
          values,
          stats: { min, max, q1, median, q3, mean, count, std },
          density,
          color: getDateColor(index)
        };
      }).filter((d): d is NonNullable<typeof d> => d !== null);
    } catch (error) {
      devLog.error('TimeSeriesViolinChart: Error processing data', error);
      setError('Unable to process data for visualization.');
      return [];
    }
  }, [data, selectedDates, calculateKDE]);

  // Generate deterministic jitter
  function generateJitter(athleteId: string, range: number): number {
    let hash = 0;
    for (let i = 0; i < athleteId.length; i++) {
      const char = athleteId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const unsignedHash = hash >>> 0;
    return ((unsignedHash % 1000) / 1000 - 0.5) * range;
  }

  // Pre-calculate athlete point coordinates for efficient mouse hover (Fix #1)
  const coordinateMap = useMemo(() => {
    if (!processedData || processedData.length === 0 || canvasWidth === 0) return [];

    const padding = TIME_SERIES_VIOLIN_CONFIG.CHART_PADDING;
    const displayWidth = canvasWidth;
    const displayHeight = TIME_SERIES_VIOLIN_CONFIG.CANVAS_HEIGHT;
    const chartWidth = displayWidth - 2 * padding;
    const chartHeight = displayHeight - 2 * padding;
    const groupWidth = chartWidth / processedData.length;

    const allValues = processedData.flatMap(d => d.values);
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const dataRange = dataMax - dataMin || 1;

    const rangePadding = dataRange * TIME_SERIES_VIOLIN_CONFIG.Y_AXIS_PADDING_PERCENT;
    const globalMin = dataMin - rangePadding;
    const globalMax = dataMax + rangePadding;
    const valueRange = globalMax - globalMin;

    const valueToY = (value: number) => {
      return padding + chartHeight - ((value - globalMin) / valueRange) * chartHeight;
    };

    return processedData.flatMap((dateData, dateIndex) => {
      const centerX = padding + dateIndex * groupWidth + groupWidth / 2;
      const jitterRange = groupWidth * TIME_SERIES_VIOLIN_CONFIG.JITTER_RANGE_FACTOR;

      return dateData.athletes.map(athlete => ({
        athleteId: athlete.athleteId,
        x: centerX + generateJitter(athlete.athleteId, jitterRange),
        y: valueToY(athlete.value),
        athleteName: athlete.athleteName,
        value: athlete.value,
        date: dateData.dateLabel,
        isPersonalBest: athlete.isPersonalBest
      }));
    });
  }, [processedData, canvasWidth]);

  // Custom drawing logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || processedData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      devLog.error('TimeSeriesViolinChart: Could not get canvas context');
      return;
    }

    try {
      // Set canvas size
      const container = canvas.parentElement;
      if (container) {
        const containerWidth = container.clientWidth;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = containerWidth * dpr;
        canvas.height = TIME_SERIES_VIOLIN_CONFIG.CANVAS_HEIGHT * dpr;

        canvas.style.width = containerWidth + 'px';
        canvas.style.height = `${TIME_SERIES_VIOLIN_CONFIG.CANVAS_HEIGHT}px`;

        ctx.scale(dpr, dpr);

        // Update canvas dimensions for coordinate map calculation
        setCanvasWidth(containerWidth);
        setCanvasHeight(TIME_SERIES_VIOLIN_CONFIG.CANVAS_HEIGHT);
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));

      const padding = TIME_SERIES_VIOLIN_CONFIG.CHART_PADDING;
      const displayWidth = container?.clientWidth || 600;
      const displayHeight = TIME_SERIES_VIOLIN_CONFIG.CANVAS_HEIGHT;
      const chartWidth = displayWidth - 2 * padding;
      const chartHeight = displayHeight - 2 * padding;
      const groupWidth = chartWidth / processedData.length;

      // Find global min/max for y-axis scaling
      const allValues = processedData.flatMap(d => d.values);
      const dataMin = Math.min(...allValues);
      const dataMax = Math.max(...allValues);
      const dataRange = dataMax - dataMin || 1;

      const rangePadding = dataRange * TIME_SERIES_VIOLIN_CONFIG.Y_AXIS_PADDING_PERCENT;
      const globalMin = dataMin - rangePadding;
      const globalMax = dataMax + rangePadding;
      const valueRange = globalMax - globalMin;

      const valueToY = (value: number) => {
        return padding + chartHeight - ((value - globalMin) / valueRange) * chartHeight;
      };

      // Draw each violin
      processedData.forEach((dateData, dateIndex) => {
        const centerX = padding + dateIndex * groupWidth + groupWidth / 2;
        const maxDensity = Math.max(...dateData.density.map(d => d.y).filter(y => isFinite(y)));

        // Draw violin shape
        ctx.fillStyle = dateData.color + '40'; // Semi-transparent (25% opacity) to match ViolinChart
        ctx.strokeStyle = dateData.color;
        ctx.lineWidth = 2;

        ctx.beginPath();

        const startY = valueToY(dateData.density[0]?.x || globalMin);
        ctx.moveTo(centerX, startY);

        // Right side
        dateData.density.forEach(point => {
          if (!point || !isFinite(point.x) || !isFinite(point.y)) return;
          const x = centerX + (point.y / maxDensity) * (groupWidth * TIME_SERIES_VIOLIN_CONFIG.VIOLIN_WIDTH_FACTOR);
          const y = valueToY(point.x);
          if (isFinite(x) && isFinite(y)) {
            ctx.lineTo(x, y);
          }
        });

        const endY = valueToY(dateData.density[dateData.density.length - 1]?.x || globalMax);
        ctx.lineTo(centerX, endY);

        // Left side
        for (let i = dateData.density.length - 1; i >= 0; i--) {
          const point = dateData.density[i];
          if (!point || !isFinite(point.x) || !isFinite(point.y)) continue;
          const x = centerX - (point.y / maxDensity) * (groupWidth * TIME_SERIES_VIOLIN_CONFIG.VIOLIN_WIDTH_FACTOR);
          const y = valueToY(point.x);
          if (isFinite(x) && isFinite(y)) {
            ctx.lineTo(x, y);
          }
        }

        ctx.lineTo(centerX, startY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw individual athlete points
        dateData.athletes.forEach(athlete => {
          const jitterRange = groupWidth * TIME_SERIES_VIOLIN_CONFIG.JITTER_RANGE_FACTOR;
          const jitter = generateJitter(athlete.athleteId, jitterRange);
          const x = centerX + jitter;
          const y = valueToY(athlete.value);

          if (isFinite(x) && isFinite(y)) {
            ctx.save();
            ctx.fillStyle = athlete.isPersonalBest ? TIME_SERIES_VIOLIN_CONFIG.PERSONAL_BEST_COLOR : '#000000';
            ctx.beginPath();
            ctx.arc(x, y, TIME_SERIES_VIOLIN_CONFIG.POINT_RADIUS, 0, 2 * Math.PI);
            ctx.fill();
            // Fix #7: Use darker gold for better contrast on personal bests
            ctx.strokeStyle = athlete.isPersonalBest ? '#B8860B' : '#ffffff';
            ctx.lineWidth = TIME_SERIES_VIOLIN_CONFIG.POINT_BORDER_WIDTH;
            ctx.stroke();
            ctx.restore();
          }
        });

        // Draw statistical lines
        const { stats } = dateData;
        const violinWidth = groupWidth * TIME_SERIES_VIOLIN_CONFIG.VIOLIN_WIDTH_FACTOR;

        // Median line (solid red)
        const medianY = valueToY(stats.median);
        if (isFinite(medianY)) {
          ctx.save();
          ctx.strokeStyle = '#DC2626';
          ctx.lineWidth = 4;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(centerX - violinWidth, medianY);
          ctx.lineTo(centerX + violinWidth, medianY);
          ctx.stroke();
          ctx.restore();
        }

        // Quartile lines (dashed orange)
        const q1Y = valueToY(stats.q1);
        const q3Y = valueToY(stats.q3);

        if (isFinite(q1Y)) {
          ctx.save();
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(centerX - violinWidth, q1Y);
          ctx.lineTo(centerX + violinWidth, q1Y);
          ctx.stroke();
          ctx.restore();
        }

        if (isFinite(q3Y)) {
          ctx.save();
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(centerX - violinWidth, q3Y);
          ctx.lineTo(centerX + violinWidth, q3Y);
          ctx.stroke();
          ctx.restore();
        }

        // Whiskers
        ctx.strokeStyle = dateData.color;
        ctx.lineWidth = 1;

        const minY = valueToY(stats.min);
        const maxY = valueToY(stats.max);

        if (isFinite(minY) && isFinite(q1Y)) {
          ctx.beginPath();
          ctx.moveTo(centerX, q1Y);
          ctx.lineTo(centerX, minY);
          ctx.moveTo(centerX - 4, minY);
          ctx.lineTo(centerX + 4, minY);
          ctx.stroke();
        }

        if (isFinite(maxY) && isFinite(q3Y)) {
          ctx.beginPath();
          ctx.moveTo(centerX, q3Y);
          ctx.lineTo(centerX, maxY);
          ctx.moveTo(centerX - 4, maxY);
          ctx.lineTo(centerX + 4, maxY);
          ctx.stroke();
        }

        // Mean point (Fix #8: purple instead of red to avoid confusion with median line)
        const meanY = valueToY(stats.mean);
        if (isFinite(meanY)) {
          ctx.fillStyle = '#8B5CF6';
          ctx.beginPath();
          ctx.arc(centerX, meanY, 3, 0, 2 * Math.PI);
          ctx.fill();
        }

        // Date label
        ctx.fillStyle = '#374151';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(dateData.dateLabel, centerX, displayHeight - 20);
      });

      // Draw y-axis
      ctx.strokeStyle = '#6B7280';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, padding);
      ctx.lineTo(padding, padding + chartHeight);
      ctx.stroke();

      // Y-axis labels
      const numTicks = 6;
      ctx.fillStyle = '#6B7280';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';

      for (let i = 0; i <= numTicks; i++) {
        const value = globalMin + (valueRange * i) / numTicks;
        const y = valueToY(value);

        const displayValue = value < 0.1 && value > -0.1 ? value.toFixed(3) : value.toFixed(2);
        ctx.fillText(displayValue, padding - 10, y + 4);

        ctx.strokeStyle = '#6B7280';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding - 5, y);
        ctx.lineTo(padding, y);
        ctx.stroke();

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
      devLog.error('TimeSeriesViolinChart: Error drawing chart', error);
      setError('Unable to render the chart.');
    }
  }, [processedData, resizeKey]);

  // Handle window resize
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setResizeKey(prev => prev + 1);
      }, TIME_SERIES_VIOLIN_CONFIG.RESIZE_DEBOUNCE);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  // Handle mouse hover - optimized with pre-calculated coordinates (Fix #1)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || coordinateMap.length === 0) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const hoverThreshold = TIME_SERIES_VIOLIN_CONFIG.HOVER_THRESHOLD;

      // O(n) search through pre-calculated coordinates instead of O(n×m) recalculation
      const found = coordinateMap.find(point => {
        const distance = Math.sqrt(Math.pow(mouseX - point.x, 2) + Math.pow(mouseY - point.y, 2));
        return distance <= hoverThreshold;
      });

      if (found) {
        setTooltip({
          visible: true,
          x: mouseX,
          y: mouseY,
          athleteName: found.athleteName,
          value: found.value,
          date: found.date,
          isPersonalBest: found.isPersonalBest
        });
      } else {
        setTooltip(null);
      }
    };

    const handleMouseLeave = () => {
      setTooltip(null);
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [coordinateMap]);

  const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center max-w-md">
          <div className="mb-4 p-2 bg-destructive/10 text-destructive rounded-full inline-block">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium mb-2">Chart Error</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="mb-4 p-3 bg-muted rounded-full inline-block">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium mb-2">No Data Available</h3>
          <p className="text-sm text-muted-foreground">
            Select dates and athletes to display the time-series violin chart.
          </p>
        </div>
      </div>
    );
  }

  if (selectedDates.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="mb-4 p-3 bg-muted rounded-full inline-block">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium mb-2">No Dates Selected</h3>
          <p className="text-sm text-muted-foreground">
            Please select measurement dates to view the chart.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Time-series violin chart showing ${metricConfig?.label} distribution across ${selectedDates.length} dates with ${processedData.reduce((sum, d) => sum + d.athletes.length, 0)} total measurements`}
          tabIndex={0}
          className="w-full h-auto border rounded focus:ring-2 focus:ring-blue-500"
          style={{ height: `${TIME_SERIES_VIOLIN_CONFIG.CANVAS_HEIGHT}px` }}
        />

        {/* Tooltip with boundary detection (Fix #3) */}
        {tooltip && tooltip.visible && (() => {
          const tooltipX = Math.max(50, Math.min(tooltip.x, canvasWidth - 50));
          const tooltipHeight = 80; // Approximate tooltip height
          const tooltipY = Math.max(tooltipHeight + 20, tooltip.y - 10);

          return (
            <div
              className="absolute z-50 bg-gray-900 text-white px-3 py-2 rounded shadow-lg text-sm pointer-events-none"
              style={{
                left: `${tooltipX}px`,
                top: `${tooltipY}px`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="font-semibold">{tooltip.athleteName}</div>
              <div className="text-xs text-gray-300">{tooltip.date}</div>
              <div className="mt-1">
                <span className="font-bold">
                  {isFly10Metric(metric)
                    ? formatFly10Dual(tooltip.value, 'time-first')
                    : `${tooltip.value.toFixed(2)}${metricConfig?.unit || ''}`}
                </span>
                {tooltip.isPersonalBest && <span className="ml-2">⭐</span>}
              </div>
            </div>
          );
        })()}

        {/* Legend with date-specific colors (Fix #4) */}
        <div className="mt-4">
          {/* Date-specific colors */}
          {processedData.length > 1 && (
            <div className="flex flex-wrap gap-4 text-sm mb-2">
              {processedData.map((dateData, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: dateData.color }}></div>
                  <span>{dateData.dateLabel}</span>
                </div>
              ))}
            </div>
          )}
          {/* Statistical legend items */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span>Distribution Shape</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-gray-700 rounded-full"></div>
              <span>Individual Athletes</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TIME_SERIES_VIOLIN_CONFIG.PERSONAL_BEST_COLOR }}></div>
              <span>Personal Best</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-0.5 bg-red-600"></div>
              <span>Median</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-0.5 bg-orange-500 border-dashed border-t-2 border-orange-500"></div>
              <span>Quartiles (Q1, Q3)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
              <span>Mean</span>
            </div>
          </div>
        </div>
      </div>

      {/* Statistical summary by date */}
      {processedData.length > 0 && metricConfig && (
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsStatsExpanded(!isStatsExpanded)}
            className="flex items-center justify-between w-full p-3 h-auto text-sm font-medium bg-gray-50 rounded-lg border hover:bg-gray-100 mb-3"
            aria-expanded={isStatsExpanded}
          >
            <span>Date Statistics Summary</span>
            {isStatsExpanded ? (
              <ChevronUpIcon className="h-4 w-4 ml-2" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 ml-2" />
            )}
          </Button>

          {isStatsExpanded && (
            <div className="grid gap-4 text-sm" style={{ gridTemplateColumns: `auto repeat(${processedData.length}, 1fr)` }}>
              {/* Header row */}
              <div className="font-medium"></div>
              {processedData.map((dateData, index) => (
                <div key={index} className="font-medium text-center">
                  {dateData.dateLabel}
                </div>
              ))}

              {/* Count row */}
              <div className="font-medium text-right pr-4">Count</div>
              {processedData.map((dateData, index) => (
                <div key={index} className="text-lg font-bold text-center">
                  {dateData.stats.count}
                </div>
              ))}

              {/* Mean row (Fix #8: purple color) */}
              <div className="font-medium text-right pr-4">Mean</div>
              {processedData.map((dateData, index) => (
                <div key={index} className="text-lg font-bold text-purple-600 text-center">
                  {dateData.stats.mean.toFixed(2)}{metricConfig.unit}
                </div>
              ))}

              {/* Median row */}
              <div className="font-medium text-right pr-4">Median</div>
              {processedData.map((dateData, index) => (
                <div key={index} className="text-lg font-bold text-yellow-600 text-center">
                  {dateData.stats.median.toFixed(2)}{metricConfig.unit}
                </div>
              ))}

              {/* Q1 row (Fix #5) */}
              <div className="font-medium text-right pr-4">Q1 (25th %ile)</div>
              {processedData.map((dateData, index) => (
                <div key={index} className="text-lg font-bold text-orange-500 text-center">
                  {dateData.stats.q1.toFixed(2)}{metricConfig.unit}
                </div>
              ))}

              {/* Q3 row (Fix #5) */}
              <div className="font-medium text-right pr-4">Q3 (75th %ile)</div>
              {processedData.map((dateData, index) => (
                <div key={index} className="text-lg font-bold text-orange-500 text-center">
                  {dateData.stats.q3.toFixed(2)}{metricConfig.unit}
                </div>
              ))}

              {/* Std Dev row */}
              <div className="font-medium text-right pr-4">Std Dev</div>
              {processedData.map((dateData, index) => (
                <div key={index} className="text-lg font-bold text-gray-600 text-center">
                  {dateData.stats.std.toFixed(2)}{metricConfig.unit}
                </div>
              ))}

              {/* Range row */}
              <div className="font-medium text-right pr-4">Range</div>
              {processedData.map((dateData, index) => (
                <div key={index} className="text-lg font-bold text-gray-600 text-center">
                  {(dateData.stats.max - dateData.stats.min).toFixed(2)}{metricConfig.unit}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {metricConfig && (
        <p className="text-xs text-muted-foreground mt-2">
          {metricConfig.label} ({isFly10Metric(metric) ? 's / mph' : metricConfig.unit})
          {metricConfig.lowerIsBetter ? ' - Lower is better' : ' - Higher is better'}
        </p>
      )}
    </div>
  );
}

export default TimeSeriesViolinChart;
