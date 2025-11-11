export interface Benchmark {
  name: string;
  value: number;
}

export interface TopPerformer {
  userName: string;
  value: number;
}

export interface TeamStatistic {
  metric: string;
  units?: string;
  average: number | null;
  min: number | null;
  max: number | null;
  topPerformer: TopPerformer | null;
  benchmarks?: Benchmark[];
}

export interface BenchmarkComparison {
  benchmarkName: string;
  benchmarkValue: number;
  meetsOrExceeds: boolean;
}

export interface AthleteRanking {
  userId: string;
  userName: string;
  compositeIndex?: number;
  measurements: Record<string, number>;
  percentiles?: Record<string, number>;
  benchmarkComparisons?: Record<string, BenchmarkComparison[]>;
}

export interface CoachReportConfig {
  teamIds?: string[];
  metrics: string[];
  includeCompositeIndex?: boolean;
  benchmarks?: Array<{
    name: string;
    metricCode: string;
    value: number;
  }>;
}

export interface CoachReportData {
  teamStatistics: TeamStatistic[];
  athleteRankings: AthleteRanking[];
  generatedAt: string;
}

export interface Report {
  id: string;
  organizationId: string;
  createdBy: string;
  name: string;
  description?: string;
  reportType: "coach" | "individual";
  config: CoachReportConfig;
  isTemplate: boolean;
  createdAt: string;
  updatedAt?: string;
}
