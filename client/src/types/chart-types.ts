/**
 * Comprehensive TypeScript interfaces for chart components
 *
 * Replaces all 'any' types with proper type definitions to improve
 * type safety and catch errors at compile time.
 */

export interface TrendDataPoint {
  value: number;
  date: Date;
  isPersonalBest?: boolean;
  groupAverage?: number;
}

export interface AthleteMetrics {
  [metricKey: string]: TrendDataPoint[];
}

export interface AthleteData {
  athleteId: string;
  athleteName: string;
  metrics: AthleteMetrics;
}

export interface ChartPoint {
  x: number;
  y: number;
  date: Date;
  isPersonalBest: boolean;
  hasActualData: boolean;
  isInterpolated: boolean;
}

export interface ProcessedAthleteData {
  athleteId: string;
  athleteName: string;
  metrics: {
    [metricKey: string]: TrendDataPoint[];
  };
}

export interface AthleteInfo {
  id: string;
  name: string;
  color: number;
}

export interface ChartDataset {
  label: string;
  data: ChartPoint[];
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  pointHoverRadius: number;
  pointBackgroundColor: (context: { raw: ChartPoint }) => string;
  pointRadius: (context: { raw: ChartPoint }) => number;
  pointBorderColor: string;
  pointBorderWidth: number;
  showLine: boolean;
  fill: boolean;
  tension: number;
}

export interface ChartAnalytics {
  correlation: number;
  xImprovement: number;
  yImprovement: number;
  xMean: number;
  yMean: number;
  dataPoints: number;
  athleteName: string;
}

export interface ProcessedChartData {
  datasets: ChartDataset[];
  xMetric: string;
  yMetric: string;
  xUnit: string;
  yUnit: string;
  xLabel: string;
  yLabel: string;
  athleteTrends: Record<string, ProcessedAthleteData>;
  analytics: ChartAnalytics | null;
  chartData: {
    datasets: ChartDataset[];
    analytics: ChartAnalytics | null;
  };
}

export interface PerformanceQuadrantLabel {
  label: string;
  color: 'green' | 'yellow' | 'orange' | 'red';
}

export interface PerformanceQuadrantLabels {
  topRight: PerformanceQuadrantLabel;
  topLeft: PerformanceQuadrantLabel;
  bottomRight: PerformanceQuadrantLabel;
  bottomLeft: PerformanceQuadrantLabel;
}

export interface GroupAveragePoint {
  x: number;
  y: number;
  date: Date;
}

export interface DateStringMap {
  [dateString: string]: boolean;
}

export interface AthleteValuesForDate {
  x: number;
  y: number;
}

export interface ChartCalculationParams {
  data: import('@shared/analytics-types').TrendData[];
  displayedAthletes: AthleteInfo[];
  highlightAthlete?: string;
  statistics?: Record<string, import('@shared/analytics-types').StatisticalSummary>;
}

export interface ChartCalculationResult {
  scatterData: ProcessedChartData | null;
  quadrantLabels: PerformanceQuadrantLabels | null;
}

export interface SafeValue {
  value: number;
  date: Date;
}

// Error boundary types
export interface ChartErrorInfo {
  componentStack?: string;
  errorBoundary?: string;
}

export interface ChartError extends Error {
  digest?: string;
}

// Chart context types
export interface ChartContextValue {
  isLoading: boolean;
  hasError: boolean;
  error: ChartError | null;
  setLoading: (loading: boolean) => void;
  setError: (error: ChartError | null) => void;
}

// Date handling types
export interface DateParseResult {
  success: boolean;
  date: Date | null;
  error?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}