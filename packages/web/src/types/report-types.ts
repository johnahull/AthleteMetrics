import type { MetricExplanation } from '@shared/metric-explanations';
import type { ReportTrends } from '@shared/report-trends-types';
import type { BenchmarkComparison } from '@shared/benchmark-types';

export interface Benchmark {
  name: string;
  value: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  comparisonOperator?: 'lte' | 'gte' | 'eq' | 'range';
  tierName?: string;
  tierColor?: string;
  tierGroupId?: string;
  tierOrder?: number;
}

export interface TopPerformer {
  userName: string;
  value: number;
}

export interface TeamStatistic {
  metric: string;
  units?: string;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  standardDeviation: number | null;
  topPerformer: TopPerformer | null;
  benchmarks?: Benchmark[];
}

export type { BenchmarkComparison };

export interface AthleteRanking {
  userId: string;
  userName: string;
  compositeIndex?: number;
  measurements: Record<string, number>;
  percentiles?: Record<string, number>;
  benchmarkComparisons?: Record<string, BenchmarkComparison[]>;
}

export interface TimeframeConfig {
  type: 'preset' | 'custom';
  preset?: 'season' | 'year' | 'all_time';
  customStart?: string;
  customEnd?: string;
}

export interface ReportFilters {
  teamIds?: string[];
  gender?: string;
  positions?: string[];
}

export interface TeamReportConfig {
  timeframe: TimeframeConfig;
  metrics: string[];
  filters?: ReportFilters;
  includeCompositeIndex?: boolean;
  audience?: 'coach' | 'athlete' | 'parent';
  benchmarks?: {
    site?: string[]; // Site benchmark IDs
    custom?: string[]; // Custom benchmark IDs
    userDefined?: Array<{
      metricCode: string;
      value: number;
      label: string;
    }>;
  };
  compositeIndex?: {
    enabled: boolean;
    weights?: Record<string, number>;
  };
}

export interface IndividualReportConfig {
  athleteId?: string;
  athleteIds?: string[];
  timeframe: TimeframeConfig;
  metrics: string[];
  audience?: 'coach' | 'athlete' | 'parent';
  benchmarks?: {
    site?: string[]; // Site benchmark IDs
    custom?: string[]; // Custom benchmark IDs
    userDefined?: Array<{
      metricCode: string;
      value: number;
      label: string;
    }>;
  };
  showTrends?: boolean;
}

export interface OrgBranding {
  tagline?: string | null;
  orgName?: string | null;
}

export interface TeamReportData {
  reportType: 'team';
  reportConfig: TeamReportConfig;
  teamStatistics: TeamStatistic[];
  athleteRankings: AthleteRanking[];
  athleteCount: number;
  teamIds: string[];
  generatedAt: string;
  metricLabels?: Record<string, string>;
  metricUnits?: Record<string, string>;
  metricExplanations?: Record<string, MetricExplanation>;
  orgBranding?: OrgBranding;
}

export interface IndividualAthleteData {
  userName: string;
  age?: number;
  gender?: string;
  sports?: string[];
  teams?: string[];
  email?: string;
  measurements: Record<string, number>;
  percentiles: Record<string, number>;
  teamAverages?: Record<string, number>;
  benchmarkComparisons: Record<string, BenchmarkComparison[]>;
}

export interface IndividualReportData {
  athlete: IndividualAthleteData;
  generatedAt: string;
  metricLabels?: Record<string, string>;
  metricUnits?: Record<string, string>;
  metricExplanations?: Record<string, MetricExplanation>;
  orgBranding?: OrgBranding;
  trends?: ReportTrends;
}

export type PdfFormat = 'visual' | 'simplified';

export interface Report {
  id: string;
  organizationId: string;
  createdBy: string;
  name: string;
  description?: string;
  reportType: "team" | "individual";
  config: TeamReportConfig | IndividualReportConfig;
  isTemplate: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt?: string;
  coachingInsights?: string | null;
  coachingInsightsGeneratedAt?: string | null;
  coachingInsightsModel?: string | null;
  archivedAt?: string | null;
}

/**
 * Extended Report type with sent-to-athlete tracking information.
 * Used in report list views to show which reports have been shared.
 */
export interface ReportWithSentStatus extends Report {
  targetAthleteName?: string;
  sentToAthlete?: {
    sentAt: string;
    athleteName: string;
  } | null;
}
