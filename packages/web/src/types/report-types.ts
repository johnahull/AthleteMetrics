import type { MetricExplanation } from '@shared/metric-explanations';
import type { ReportTrends, ReportDistributions, TeamReportTrends, TeamReportDistributions } from '@shared/report-trends-types';
import type { ReportFvProfile } from '@shared/report-fv-types';
import type { BenchmarkComparison } from '@shared/benchmark-types';
import type { ChartSelection, TeamChartSelection } from '@shared/report-charts';

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
  // Partial<TeamChartSelection>, not ChartSelection: team configs don't have
  // radar/distribution, so this rejects those individual-only keys at compile
  // time instead of only filtering them out at wizard-submit time.
  charts?: Partial<TeamChartSelection>;
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
  };
  showTrends?: boolean;
  charts?: Partial<ChartSelection>;
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
  /** Per-metric direction ('lower' = lower-is-better), so client components can
   *  evaluate tier standing without needing authenticated org-scoped metric
   *  config — required for the public/anonymous report view. */
  metricDirections?: Record<string, 'higher' | 'lower'>;
  orgBranding?: OrgBranding;
  teamTrends?: TeamReportTrends;
  teamDistributions?: TeamReportDistributions;
  comparisonLabel?: string;
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
  distributions?: ReportDistributions;
  fvProfile?: ReportFvProfile; // present only when charts.fvProfile is selected and the sprint-FV flag is on
  comparisonLabel?: string; // cohort name for the "Where You Stand" caption (undefined = org-wide)
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
