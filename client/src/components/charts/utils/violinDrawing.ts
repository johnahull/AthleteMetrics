/**
 * Canvas drawing utilities for violin plots
 * Handles all rendering logic for violin shapes, statistics, and athlete points
 */

import { devLog } from '@/utils/dev-logger';
import type { ViolinDrawingContext, ViolinDrawParams, ProcessedGroupData } from '../types/violin';

/**
 * Initialize canvas with proper dimensions and pixel ratio scaling
 * @param canvas - HTMLCanvasElement to initialize
 * @param container - Parent container element
 * @returns CanvasRenderingContext2D or null if initialization fails
 */
export function initializeCanvas(
  canvas: HTMLCanvasElement,
  container: HTMLElement | null
): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d');
  if (!ctx || !container) {
    devLog.error('ViolinChart: Could not get canvas context');
    return null;
  }

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

  return ctx;
}

/**
 * Create drawing context with calculated dimensions and scales
 * @param ctx - Canvas rendering context
 * @param canvas - Canvas element
 * @param processedData - Processed group data
 * @param container - Parent container element
 * @returns ViolinDrawingContext with all necessary drawing parameters
 */
export function createDrawingContext(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  processedData: ProcessedGroupData[],
  container: HTMLElement | null
): ViolinDrawingContext {
  const padding = 60;
  const displayWidth = container?.clientWidth || 600;
  const displayHeight = 400;
  const chartWidth = displayWidth - 2 * padding;
  const chartHeight = displayHeight - 2 * padding;

  // Find global min/max for y-axis scaling
  const allValues = processedData.flatMap(group => group.values);
  const dataMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : 100;
  const dataRange = dataMax - dataMin || 1;

  // Add 5% padding to the data range
  const padding_percent = 0.05;
  const rangePadding = dataRange * padding_percent;
  const globalMin = dataMin - rangePadding;
  const globalMax = dataMax + rangePadding;
  const valueRange = globalMax - globalMin;

  return {
    ctx,
    canvas,
    padding,
    displayWidth,
    displayHeight,
    chartWidth,
    chartHeight,
    globalMin,
    globalMax,
    valueRange
  };
}

/**
 * Convert a data value to y-coordinate on canvas
 * @param value - Data value to convert
 * @param drawingContext - Drawing context with scale parameters
 * @returns Y-coordinate on canvas
 */
export function valueToY(value: number, drawingContext: ViolinDrawingContext): number {
  const { padding, chartHeight, globalMin, valueRange } = drawingContext;
  return padding + chartHeight - ((value - globalMin) / valueRange) * chartHeight;
}

/**
 * Draw a complete violin plot for one group
 * @param params - Drawing parameters including group data and context
 */
export function drawViolin(params: ViolinDrawParams): void {
  const { group, groupIndex, groupWidth, centerX, drawingContext, highlightAthlete } = params;
  const { ctx } = drawingContext;

  // Safety checks
  if (!group || !group.density || group.density.length === 0) {
    devLog.warn('ViolinChart: Invalid group data', group);
    return;
  }

  const densityValues = group.density.map(d => d.y).filter(y => isFinite(y));
  const maxDensity = densityValues.length > 0 ? Math.max(...densityValues) : 1;

  devLog.log('Drawing violin for group', {
    group: group.group,
    densityPoints: group.density.length,
    maxDensity,
    centerX,
    groupWidth
  });

  // Draw violin shape (density curve)
  drawViolinShape(group, centerX, groupWidth, maxDensity, drawingContext);

  // Draw individual athlete points
  drawAthletePoints(group, centerX, groupWidth, highlightAthlete, drawingContext);

  // Draw statistical lines
  drawStatisticalLines(group, centerX, groupWidth, drawingContext);

  // Draw whiskers
  drawWhiskers(group, centerX, drawingContext);

  // Draw mean point
  drawMeanPoint(group, centerX, drawingContext);

  // Draw group label
  drawGroupLabel(group, centerX, drawingContext);
}

/**
 * Draw the violin shape (KDE density curve)
 */
function drawViolinShape(
  group: ProcessedGroupData,
  centerX: number,
  groupWidth: number,
  maxDensity: number,
  drawingContext: ViolinDrawingContext
): void {
  const { ctx } = drawingContext;
  const violinWidth = groupWidth * 0.3;

  ctx.fillStyle = group.color + '40'; // Semi-transparent
  ctx.strokeStyle = group.color;
  ctx.lineWidth = 2;

  ctx.beginPath();

  // Start from the center line at the bottom
  const startY = valueToY(group.density[0]?.x || drawingContext.globalMin, drawingContext);
  ctx.moveTo(centerX, startY);

  // Right side of violin (going up)
  group.density.forEach((point) => {
    if (!point || !isFinite(point.x) || !isFinite(point.y)) return;

    const x = centerX + (point.y / maxDensity) * violinWidth;
    const y = valueToY(point.x, drawingContext);

    if (!isFinite(x) || !isFinite(y)) return;
    ctx.lineTo(x, y);
  });

  // Connect to center at top
  const endY = valueToY(group.density[group.density.length - 1]?.x || drawingContext.globalMax, drawingContext);
  ctx.lineTo(centerX, endY);

  // Left side of violin (going down)
  for (let i = group.density.length - 1; i >= 0; i--) {
    const point = group.density[i];
    if (!point || !isFinite(point.x) || !isFinite(point.y)) continue;

    const x = centerX - (point.y / maxDensity) * violinWidth;
    const y = valueToY(point.x, drawingContext);

    if (!isFinite(x) || !isFinite(y)) continue;
    ctx.lineTo(x, y);
  }

  // Close the path
  ctx.lineTo(centerX, startY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/**
 * Draw individual athlete points with jitter
 */
function drawAthletePoints(
  group: ProcessedGroupData,
  centerX: number,
  groupWidth: number,
  highlightAthlete: string | undefined,
  drawingContext: ViolinDrawingContext
): void {
  const { ctx } = drawingContext;

  if (!group.athletes || group.athletes.length === 0) return;

  group.athletes.forEach((athlete) => {
    const jitterRange = groupWidth * 0.25;
    const jitter = generateJitter(athlete.athleteId, jitterRange);
    const x = centerX + jitter;
    const y = valueToY(athlete.value, drawingContext);

    if (!isFinite(x) || !isFinite(y)) return;

    const isHighlighted = athlete.athleteId === highlightAthlete;

    ctx.save();
    ctx.fillStyle = isHighlighted ? '#10B981' : '#000000';

    ctx.beginPath();
    ctx.arc(x, y, isHighlighted ? 6 : 5, 0, 2 * Math.PI);
    ctx.fill();

    // Add border
    ctx.strokeStyle = isHighlighted ? '#10B981' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  });
}

/**
 * Draw statistical lines (Q1, median, Q3)
 */
function drawStatisticalLines(
  group: ProcessedGroupData,
  centerX: number,
  groupWidth: number,
  drawingContext: ViolinDrawingContext
): void {
  const { ctx } = drawingContext;
  const { stats } = group;

  if (!stats || !isFinite(stats.q1) || !isFinite(stats.q3) || !isFinite(stats.median)) {
    devLog.warn('ViolinChart: Invalid stats for group', group.group, stats);
    return;
  }

  const violinWidth = groupWidth * 0.3;
  const q1Y = valueToY(stats.q1, drawingContext);
  const q3Y = valueToY(stats.q3, drawingContext);
  const medianY = valueToY(stats.median, drawingContext);

  // Q1 line (dotted)
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

  // Q3 line (dotted)
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

  // Median line (solid)
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
}

/**
 * Draw whiskers (min and max)
 */
function drawWhiskers(
  group: ProcessedGroupData,
  centerX: number,
  drawingContext: ViolinDrawingContext
): void {
  const { ctx } = drawingContext;
  const { stats } = group;

  ctx.strokeStyle = group.color;
  ctx.lineWidth = 1;

  const q1Y = valueToY(stats.q1, drawingContext);
  const q3Y = valueToY(stats.q3, drawingContext);

  // Min whisker
  if (isFinite(stats.min)) {
    const minY = valueToY(stats.min, drawingContext);
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
    const maxY = valueToY(stats.max, drawingContext);
    if (isFinite(maxY) && isFinite(q3Y)) {
      ctx.beginPath();
      ctx.moveTo(centerX, q3Y);
      ctx.lineTo(centerX, maxY);
      ctx.moveTo(centerX - 4, maxY);
      ctx.lineTo(centerX + 4, maxY);
      ctx.stroke();
    }
  }
}

/**
 * Draw mean point
 */
function drawMeanPoint(
  group: ProcessedGroupData,
  centerX: number,
  drawingContext: ViolinDrawingContext
): void {
  const { ctx } = drawingContext;
  const { stats } = group;

  if (isFinite(stats.mean)) {
    const meanY = valueToY(stats.mean, drawingContext);
    if (isFinite(meanY)) {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(centerX, meanY, 3, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}

/**
 * Draw group label
 */
function drawGroupLabel(
  group: ProcessedGroupData,
  centerX: number,
  drawingContext: ViolinDrawingContext
): void {
  const { ctx, canvas } = drawingContext;

  ctx.fillStyle = '#374151';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(group.group, centerX, canvas.height - 20);
}

/**
 * Draw Y-axis and labels
 */
export function drawYAxis(drawingContext: ViolinDrawingContext): void {
  const { ctx, padding, chartHeight, chartWidth, globalMin, valueRange } = drawingContext;

  // Y-axis line
  ctx.strokeStyle = '#6B7280';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, padding + chartHeight);
  ctx.stroke();

  // Y-axis labels and grid lines
  const numTicks = 6;
  ctx.fillStyle = '#6B7280';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';

  for (let i = 0; i <= numTicks; i++) {
    const value = globalMin + (valueRange * i) / numTicks;
    const y = valueToY(value, drawingContext);

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

    // Grid lines
    if (i > 0 && i < numTicks) {
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartWidth, y);
      ctx.stroke();
    }
  }
}

/**
 * Generate deterministic jitter for consistent athlete point positioning
 * @param athleteId - Unique athlete identifier
 * @param range - Jitter range in pixels
 * @returns Jitter offset in range [-range/2, range/2]
 */
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