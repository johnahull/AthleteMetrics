// TypeScript interfaces for TimeSeriesBoxSwarmChart

export interface AthleteDataPoint {
  athleteId: string;
  athleteName: string;
  value: number;
  isPersonalBest?: boolean;
}

export interface ChartDataPoint {
  x: number;
  y: number;
  dateStr: string;
  dateLabel: string;
  isPersonalBest?: boolean;
  athleteId: string;
  athleteName: string;
}

export interface BoxPlotStatistics {
  min: number;
  max: number;
  q1: number;
  median: number;
  q3: number;
  mean: number;
}

export interface LabelPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  originalX: number;
  originalY: number;
}

export interface ChartBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PositioningStrategy {
  x: number;
  y: number;
}

export interface ChartScale {
  ticks: Array<{ value: number }>;
}

export interface ChartContext {
  parsed: { y: number };
  dataset: { label: string };
  raw: ChartDataPoint;
}

export interface TooltipItem {
  raw: ChartDataPoint;
  dataset: { label: string; type: string };
}

export interface ChartElement {
  x: number;
  y: number;
}

export interface DatasetMeta {
  data: ChartElement[];
}

export interface ChartInstance {
  ctx: CanvasRenderingContext2D;
  chartArea: ChartBounds;
  data: {
    datasets: Array<{
      data: ChartDataPoint[];
      type: string;
      label?: string;
    }>;
  };
  getDatasetMeta: (index: number) => DatasetMeta;
}