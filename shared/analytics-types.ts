/**
 * Advanced Analytics Type Definitions
 * Comprehensive type system for sophisticated analytics and charting
 */

// Core analysis types
export type AnalysisType = 'individual' | 'intra_group' | 'inter_group';
export type TimeframeType = 'best' | 'trends';
export type TimePeriod = 'this_year' | 'last_7_days' | 'last_30_days' | 'last_90_days' | 'all_time' | 'custom';

// Grouping dimensions for analysis
export interface GroupingDimensions {
  teams?: string[];
  birthYears?: number[];
  birthYearFrom?: number;
  birthYearTo?: number;
  ages?: number[];
  genders?: ('Male' | 'Female' | 'Not Specified')[];
  sports?: string[];
  positions?: string[];
  schools?: string[];
  graduationYears?: number[];
  schoolGrades?: string[];
}

// Enhanced analytics filters
export interface AnalyticsFilters extends GroupingDimensions {
  organizationId: string;
  athleteIds?: string[]; // For specific athlete selection
}

// Metrics selection with priority
export interface MetricSelection {
  primary: string; // Default: 'FLY10_TIME'
  additional: string[]; // Up to 5 more (max 6 total)
}

// Timeframe configuration
export interface TimeframeConfig {
  type: TimeframeType;
  period: TimePeriod;
  startDate?: Date;
  endDate?: Date;
}

// Chart data point structure
export interface ChartDataPoint {
  athleteId: string;
  athleteName: string;
  value: number;
  date: Date;
  metric: string;
  grouping?: string;
  teamName?: string;
  additionalData?: Record<string, any>;
}

// Statistical summary for groups
export interface StatisticalSummary {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
  variance: number;
  percentiles: {
    p5: number;
    p10: number;
    p25: number;
    p50: number; // Same as median
    p75: number;
    p90: number;
    p95: number;
  };
}

// Multi-metric data for radar charts
export interface MultiMetricData {
  athleteId: string;
  athleteName: string;
  metrics: Record<string, number>;
  percentileRanks: Record<string, number>; // Percentile within group
}

// Trend data for time-series analysis
export interface TrendDataPoint {
  date: Date;
  value: number;
  isPersonalBest?: boolean;
  groupAverage?: number;
  groupMedian?: number;
}

export interface TrendData {
  athleteId: string;
  athleteName: string;
  metric: string;
  data: TrendDataPoint[];
  teamName?: string;
}

// Chart configuration types
export type ChartType =
  | 'box_plot'
  | 'distribution'
  | 'bar_chart'
  | 'line_chart'
  | 'scatter_plot'
  | 'radar_chart'
  | 'swarm_plot'
  | 'connected_scatter'
  | 'multi_line'
  | 'box_swarm_combo'
  | 'time_series_box_swarm';

export interface ChartConfiguration {
  type: ChartType;
  title: string;
  subtitle?: string;
  showLegend: boolean;
  showTooltips: boolean;
  responsive: boolean;
  aspectRatio?: number;
  customOptions?: Record<string, any>;
}

// Analytics request/response types
export interface AnalyticsRequest {
  analysisType: AnalysisType;
  filters: AnalyticsFilters;
  metrics: MetricSelection;
  timeframe: TimeframeConfig;
  athleteId?: string; // For individual analysis
  chartConfigs?: Partial<ChartConfiguration>[];
}

export interface AnalyticsResponse {
  data: ChartDataPoint[];
  trends?: TrendData[];
  multiMetric?: MultiMetricData[];
  statistics: Record<string, StatisticalSummary>;
  groupings: Record<string, ChartDataPoint[]>;
  meta: {
    totalAthletes: number;
    totalMeasurements: number;
    dateRange: {
      start: Date;
      end: Date;
    };
    appliedFilters: AnalyticsFilters;
    recommendedCharts: ChartType[];
  };
}

// Dashboard layout configuration
export interface DashboardLayout {
  analysisType: AnalysisType;
  metricCount: number;
  timeframeType: TimeframeType;
  recommendedCharts: {
    primary: ChartType;
    secondary?: ChartType[];
  };
}

// User preferences for analytics
export interface AnalyticsPreferences {
  defaultAnalysisType: AnalysisType;
  defaultMetrics: string[];
  defaultTimeframe: TimeframeConfig;
  defaultGrouping: keyof GroupingDimensions;
  chartPreferences: {
    theme: 'light' | 'dark';
    colorScheme: string;
    showGridLines: boolean;
    animationDuration: number;
  };
}

// Performance optimization types
export interface AnalyticsCache {
  key: string;
  data: AnalyticsResponse;
  timestamp: Date;
  expiresAt: Date;
  filters: AnalyticsFilters;
}

// Export/sharing types
export interface ExportConfig {
  format: 'pdf' | 'png' | 'csv' | 'xlsx';
  includeCharts: boolean;
  includeRawData: boolean;
  includeStatistics: boolean;
  customTitle?: string;
}

// Real-time update types
export interface AnalyticsUpdate {
  type: 'new_measurement' | 'athlete_updated' | 'team_updated';
  affectedAthletes: string[];
  metrics: string[];
  timestamp: Date;
}

// Chart-specific data types
export interface BoxPlotData {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
  individualValue?: number; // For highlighting specific athlete
}

export interface RadarChartData {
  athlete: MultiMetricData;
  groupAverage: Record<string, number>;
  maxValues: Record<string, number>;
  labels: string[];
}

export interface ScatterPlotData {
  points: {
    x: number;
    y: number;
    athleteId: string;
    athleteName: string;
    isHighlighted?: boolean;
  }[];
  xMetric: string;
  yMetric: string;
  groupAverages?: {
    x: number;
    y: number;
  };
}

// Validation types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AnalyticsValidator {
  validateFilters(filters: AnalyticsFilters): ValidationResult;
  validateMetrics(metrics: MetricSelection): ValidationResult;
  validateTimeframe(timeframe: TimeframeConfig): ValidationResult;
  validateRequest(request: AnalyticsRequest): ValidationResult;
}

// Utility types for chart data transformation
export type DataTransformer<T, U> = (data: T[], config: ChartConfiguration) => U;

export interface ChartDataTransformers {
  toBoxPlot: DataTransformer<ChartDataPoint, BoxPlotData>;
  toRadar: DataTransformer<MultiMetricData, RadarChartData>;
  toScatter: DataTransformer<ChartDataPoint, ScatterPlotData>;
  toTimeSeries: DataTransformer<TrendDataPoint, any>;
}

// API endpoint response types
export interface AnalyticsEndpoints {
  '/api/analytics/dashboard': {
    GET: {
      query: AnalyticsRequest;
      response: AnalyticsResponse;
    };
  };
  '/api/analytics/statistics/:metric': {
    GET: {
      params: { metric: string };
      query: Pick<AnalyticsRequest, 'filters' | 'timeframe'>;
      response: StatisticalSummary;
    };
  };
  '/api/analytics/trends/:athleteId': {
    GET: {
      params: { athleteId: string };
      query: Pick<AnalyticsRequest, 'metrics' | 'timeframe'>;
      response: TrendData[];
    };
  };
  '/api/analytics/export': {
    POST: {
      body: AnalyticsRequest & { exportConfig: ExportConfig };
      response: { downloadUrl: string };
    };
  };
}

// Constants for chart selection logic
export const CHART_SELECTION_MATRIX: Record<string, Record<string, Record<string, ChartType[]>>> = {
  individual: {
    '1': {
      best: ['box_swarm_combo', 'distribution'],
      trends: ['line_chart']
    },
    '2': {
      best: ['scatter_plot'],
      trends: ['connected_scatter', 'multi_line']
    },
    '3+': {
      best: ['radar_chart'],
      trends: ['multi_line', 'radar_chart']
    }
  },
  intra_group: {
    '1': {
      best: ['distribution', 'bar_chart', 'box_swarm_combo'],
      trends: ['multi_line']
    },
    '2': {
      best: ['scatter_plot'],
      trends: ['connected_scatter']
    },
    '3+': {
      best: ['radar_chart'],
      trends: ['multi_line']
    }
  },
  inter_group: {
    '1': {
      best: ['box_swarm_combo', 'distribution'],
      trends: ['multi_line']
    },
    '2': {
      best: ['scatter_plot'],
      trends: ['connected_scatter']
    },
    '3+': {
      best: ['radar_chart'],
      trends: ['multi_line']
    }
  }
};

// Metric units and labels
export const METRIC_CONFIG = {
  FLY10_TIME: { label: '10-Yard Fly Time', unit: 's', lowerIsBetter: true },
  VERTICAL_JUMP: { label: 'Vertical Jump', unit: 'in', lowerIsBetter: false },
  AGILITY_505: { label: '5-0-5 Agility', unit: 's', lowerIsBetter: true },
  AGILITY_5105: { label: '5-10-5 Agility', unit: 's', lowerIsBetter: true },
  T_TEST: { label: 'T-Test Agility', unit: 's', lowerIsBetter: true },
  DASH_40YD: { label: '40-Yard Dash', unit: 's', lowerIsBetter: true },
  RSI: { label: 'Reactive Strength Index', unit: '', lowerIsBetter: false }
} as const;

// Color schemes for charts
export const CHART_COLOR_SCHEMES = {
  primary: ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'],
  secondary: ['#60A5FA', '#F87171', '#34D399', '#FBBF24', '#A78BFA', '#F472B6'],
  monochromatic: ['#1E40AF', '#3B82F6', '#60A5FA', '#93C5FD', '#DBEAFE', '#EFF6FF']
} as const;