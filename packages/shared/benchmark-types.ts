// packages/shared/benchmark-types.ts

/** One tier band in a tier group. */
export interface TierInfo {
  tierName: string;
  tierColor: string;
  tierOrder: number;
  minValue: number | null;
  maxValue: number | null;
}

/** Result of comparing an athlete value to a benchmark (single-value or tiered). */
export interface BenchmarkComparison {
  benchmarkName: string;
  benchmarkValue: number;
  athleteValue: number;
  meetsOrExceeds: boolean;
  percentageDiff: number;
  comparisonOperator: string;
  tierName?: string;
  tierColor?: string;
  tierOrder?: number;
  tierGroupName?: string;
  distanceToNextTier?: number | null;
  nextTierName?: string | null;
  isBestTier?: boolean;
  coachingNote?: string | null;
  allTiers?: TierInfo[];
}
