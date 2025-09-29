/**
 * Type definitions for ViolinChart component
 */

import type { ChartDataPoint, ChartConfiguration, StatisticalSummary, GroupDefinition } from '@shared/analytics-types';

/** Individual athlete data point for violin plot */
export interface AthletePoint {
  athleteId: string;
  athleteName: string;
  value: number;
  teamName?: string;
}

/** Statistical summary for a group */
export interface GroupStatistics {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  count: number;
  std: number;
}

/** Processed group data for violin visualization */
export interface ProcessedGroupData {
  group: string;
  values: number[];
  athletes: AthletePoint[];
  stats: GroupStatistics;
  density: KDEPoint[];
  color: string;
}

/** KDE (Kernel Density Estimation) point */
export interface KDEPoint {
  x: number;
  y: number;
}

/** Props for ViolinChart component */
export interface ViolinChartProps {
  data: ChartDataPoint[];
  rawData?: ChartDataPoint[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
  className?: string;
  selectedGroups?: GroupDefinition[];
}

/** Canvas drawing context with chart dimensions */
export interface ViolinDrawingContext {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  padding: number;
  displayWidth: number;
  displayHeight: number;
  chartWidth: number;
  chartHeight: number;
  globalMin: number;
  globalMax: number;
  valueRange: number;
}

/** Parameters for drawing a single violin */
export interface ViolinDrawParams {
  group: ProcessedGroupData;
  groupIndex: number;
  groupWidth: number;
  centerX: number;
  drawingContext: ViolinDrawingContext;
  highlightAthlete?: string;
  valueToY: (value: number) => number;
}