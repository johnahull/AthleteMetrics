/**
 * Advanced Analytics Type Definitions
 * Comprehensive type system for sophisticated analytics and charting
 */

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
// This replaces the hardcoded METRIC_CONFIG with API-fetched data
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
}

// Organization-specific metric configuration
export interface OrganizationMetricConfig extends DynamicMetricConfig {
  isEnabled: boolean;
  customLabel?: string;
  displayOrder?: number;
}

// Legacy: Metric units and labels (DEPRECATED - use API-fetched metrics instead)
// Database (site_metrics table) is now the single source of truth
// Use useMetricConfig hook to fetch metric configuration
export const METRIC_CONFIG: Record<string, { label: string; unit: string; metricType: MetricType }> = {};

/**
 * Canonical list of time-based metrics where lower values indicate better performance.
 * Used as fallback when database config is not available.
 *
 * IMPORTANT: This is the SINGLE SOURCE OF TRUTH for this list.
 * All other files should import from here to avoid duplication.
 */
export const LOWER_IS_BETTER_METRICS = [
  'FLY10_TIME',
  'AGILITY_505',
  'AGILITY_5105',
  'T_TEST',
  'DASH_40YD',
  'DASH_10YD',
] as const;

export type LowerIsBetterMetric = typeof LOWER_IS_BETTER_METRICS[number];

/**
 * Type-safe check if a metric code is in the LOWER_IS_BETTER_METRICS list
 *
 * This is a type guard that narrows the type to LowerIsBetterMetric.
 * For general metric type detection, prefer getMetricTypeWithFallback() which
 * also checks METRIC_CONFIG and provides default behavior.
 *
 * @param metric - Metric code to check (e.g., 'FLY10_TIME', 'DASH_40YD')
 * @returns true if metric is in the LOWER_IS_BETTER_METRICS list
 *
 * @example
 * ```typescript
 * if (isLowerIsBetterMetric('FLY10_TIME')) {
 *   // TypeScript knows metric is LowerIsBetterMetric here
 *   console.log('Lower is better for this metric');
 * }
 * ```
 */
export function isLowerIsBetterMetric(metric: string): metric is LowerIsBetterMetric {
  return (LOWER_IS_BETTER_METRICS as readonly string[]).includes(metric);
}

/**
 * Get the metric type with fallback to LOWER_IS_BETTER_METRICS list
 *
 * This is the canonical implementation used across the codebase for determining
 * metric types when database configuration is unavailable. It provides a robust
 * fallback chain to ensure consistent behavior.
 *
 * **Fallback chain:**
 * 1. Check METRIC_CONFIG (static definitions, may be empty after database migration)
 * 2. Check LOWER_IS_BETTER_METRICS list (time-based metrics)
 * 3. Default to 'higher_is_better' (most performance metrics)
 *
 * **Note:** For React components, prefer using the `useMetricConfig` hook to fetch
 * metric types directly from the database (site_metrics table). This function is
 * provided for utility code that cannot use React hooks.
 *
 * @param metric - Metric code (e.g., 'FLY10_TIME', 'HEIGHT', 'TOP_SPEED_CALC')
 * @returns MetricType - 'lower_is_better', 'higher_is_better', or 'tracking'
 *
 * @example
 * ```typescript
 * // In utility functions (non-React code)
 * const metricType = getMetricTypeWithFallback('FLY10_TIME');
 * // Returns 'lower_is_better'
 *
 * const shouldSortAscending = metricType === 'lower_is_better';
 * ```
 *
 * @example
 * ```typescript
 * // In React components, prefer using the hook:
 * const { data: metrics } = useMetricConfig();
 * const metricConfig = metrics?.find(m => m.code === 'FLY10_TIME');
 * const metricType = metricConfig?.metricType ?? getMetricTypeWithFallback('FLY10_TIME');
 * ```
 */
export function getMetricTypeWithFallback(metric: string): MetricType {
  // Check METRIC_CONFIG first (may be empty after static metric removal)
  const config = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
  if (config?.metricType) {
    return config.metricType;
  }

  // Fall back to known lower-is-better metrics using type-safe check
  if (isLowerIsBetterMetric(metric)) {
    return 'lower_is_better';
  }

  // Default to higher_is_better (most performance metrics)
  return 'higher_is_better';
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
