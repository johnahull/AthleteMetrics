/**
 * Advanced Analytics Type Definitions
 * Comprehensive type system for sophisticated analytics and charting
 */

import type { DisplayFormat } from './duration-format';

// Core analysis types
export type AnalysisType = 'individual' | 'intra_group' | 'multi_group';
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

/**
 * Simplified analytics filters - only essential fields used by the system
 */
export interface AnalyticsFilters {
  /** Organization context for all queries */
  organizationId: string;

  /** For specific athlete selection */
  athleteIds?: string[];

  /** Filter by team membership */
  teams?: string[];

  /** Filter by gender */
  genders?: ('Male' | 'Female' | 'Not Specified')[];

  /** Birth year range start */
  birthYearFrom?: number;

  /** Birth year range end */
  birthYearTo?: number;

  /**
   * Whether to include athletes with NULL birthDate in results when filtering by birth year.
   *
   * @default false - Athletes with unknown birth years are excluded from filtered results
   * @example true - Include athletes without birth dates in filtered results
   */
  includeUnknownBirthYear?: boolean;
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

// Group definition for multi-group comparisons
export interface GroupDefinition {
  id: string;
  name: string;
  type: 'team' | 'age' | 'custom';
  memberIds: string[];
  color?: string;
  criteria?: {
    teams?: string[];
    teamIds?: string[]; // Added for robust team identification
    ageFrom?: number;
    ageTo?: number;
    graduationYears?: number[];
    athleteIds?: string[];
  };
}

// Group comparison data for multi-group analysis
export interface GroupComparisonData {
  groups: GroupDefinition[];
  metrics: string[];
  aggregations: Record<string, Record<string, {
    mean: number;
    median: number;
    min: number;
    max: number;
    stdDev: number;
    count: number;
    values: number[];
  }>>;
  statistics?: Record<string, StatisticalSummary>;
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
  teamId?: string; // Added for robust team identification
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
    p20: number;
    p25: number;
    p30: number;
    p40: number;
    p50: number; // Same as median
    p60: number;
    p70: number;
    p75: number;
    p80: number;
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
  | 'time_series_box_swarm'
  | 'time_series_violin'
  | 'violin_plot'
  | 'tier_progress';

export interface ChartConfiguration {
  type: ChartType;
  title: string;
  subtitle?: string;
  showLegend: boolean;
  showTooltips: boolean;
  responsive: boolean;
  aspectRatio?: number;
  plugins?: Record<string, any>; // Chart.js plugin configurations (e.g., zoom)
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
  metricsAvailability?: Record<string, number>;
  maxMetricCount?: number; // Maximum count across all metrics for normalization
  metricsAvailabilityError?: boolean; // True if there was an error fetching metrics availability
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
      best: ['box_swarm_combo', 'distribution', 'tier_progress'],
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
      trends: ['time_series_box_swarm', 'multi_line']
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
  multi_group: {
    '1': {
      best: ['box_swarm_combo', 'violin_plot'],
      trends: ['time_series_box_swarm', 'multi_line']
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

// Metric type definition
export type MetricType = 'lower_is_better' | 'higher_is_better' | 'tracking';

// Dynamic metric configuration interface
export interface DynamicMetricConfig {
  code: string;
  label: string;
  category?: string;
  unit: string;
  metricType: MetricType;
  color?: string;
  icon?: string;
  description?: string;
  isActive: boolean;
  isSystemDefault: boolean;
  isDerived?: boolean;
  formula?: string;
  dependentMetrics?: string[];
  displayFormat?: DisplayFormat;
  decimalPrecision?: number;
}

// Organization-specific metric configuration
export interface OrganizationMetricConfig extends DynamicMetricConfig {
  isEnabled: boolean;
  customLabel?: string;
  displayOrder?: number;
}

/**
 * LAST-RESORT FALLBACK ONLY. The metric's own `metricType` (site_metrics /
 * custom_org_metrics row, e.g. `useMetricLabels().types`) always wins.
 *
 * Built-in time codes that are lower_is_better in site_metrics, used only for
 * a code with no known type: the first paint while the metric list loads, or
 * a code the viewer's list omits (org-disabled, inactive, another org's).
 * Read it only through `resolveMetricType`; it is deliberately not exported.
 */
const LOWER_IS_BETTER_METRICS: readonly string[] = [
  'FLY10_TIME',
  'FLY10_TIME_RI5',
  'FLY10_TIME_RI10',
  'FLY10_TIME_RI15',
  'FLY10_TIME_RI30',
  'AGILITY_505_M',
  'AGILITY_505_YD',
  'AGILITY_505_M_L',
  'AGILITY_505_M_R',
  'AGILITY_505_YD_L',
  'AGILITY_505_YD_R',
  'AGILITY_COD_DEFICIT_M',
  'AGILITY_COD_DEFICIT_YD',
  'AGILITY_COD_DEFICIT_M_INTERP',
  'AGILITY_5105',
  'AGILITY_5105_L',
  'AGILITY_5105_R',
  'T_TEST',
  'DASH_40YD',
  'DASH_10YD',
  'DASH_5YD',
  'DASH_20YD',
  'DASH_30YD',
  'DASH_10M',
  'DASH_20M',
  'DASH_30M',
  'DASH_40M',
  'FLY10M_TIME',
];

/**
 * The one place that decides a metric's direction from its code and type.
 * The given type (from the metric's DB row) wins; without one, a built-in time
 * code is lower_is_better and anything else is higher_is_better.
 */
export function resolveMetricType(code: string, metricType?: MetricType | null): MetricType {
  return metricType ?? (LOWER_IS_BETTER_METRICS.includes(code) ? 'lower_is_better' : 'higher_is_better');
}

/** True when lower values are better for this metric (see `resolveMetricType`). */
export function isLowerBetterType(code: string, metricType?: MetricType | null): boolean {
  return resolveMetricType(code, metricType) === 'lower_is_better';
}

// Color schemes for charts
export const CHART_COLOR_SCHEMES = {
  primary: ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'],
  secondary: ['#60A5FA', '#F87171', '#34D399', '#FBBF24', '#A78BFA', '#F472B6'],
  monochromatic: ['#1E40AF', '#3B82F6', '#60A5FA', '#93C5FD', '#DBEAFE', '#EFF6FF']
} as const;

// Benchmark overlay types for charts
export interface BenchmarkLine {
  id: string;
  name: string;
  value: number | null;       // Allow null for tier group benchmarks (they use minValue/maxValue instead)
  minValue?: number;          // For range benchmarks
  maxValue?: number;          // For range benchmarks
  comparisonOperator: 'lte' | 'gte' | 'eq' | 'range';
  color?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  metricCode?: string;        // Metric code for axis matching in scatter plots
  filters?: {
    gender?: string;
    ageMin?: number;
    ageMax?: number;
    position?: string;
  };
}
