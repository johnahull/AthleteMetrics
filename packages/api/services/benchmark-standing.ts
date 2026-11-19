/**
 * The one definition of "below average" for the insights: a benchmark comparison already computed for the athlete.
 * A tier is below average in the bottom half of its group, a single-threshold benchmark when it is failed; the percentile
 * counts only for a metric with no usable benchmark comparison at all. Used by the report data, the prompt and the
 * metric relationships, so they cannot disagree.
 */

export interface ComparisonLike {
  comparisonOperator?: string;
  tierName?: string;
  allTiers?: ReadonlyArray<{ tierName: string }>;
  meetsOrExceeds?: boolean;
}

/** Percentile under this, for a metric with no benchmark comparison, is below average. */
export const BELOW_AVERAGE_PERCENTILE = 50;

/** Where a tier row sits inside its own group (best first); undefined for a single-tier group or an unknown tier. */
export function tierPlace(c: ComparisonLike): { i: number; n: number; bottom: boolean } | undefined {
  if (c.comparisonOperator !== 'range') return undefined;
  const n = c.allTiers?.length ?? 0;
  const i = c.allTiers?.findIndex((t) => t.tierName === c.tierName) ?? -1;
  return n > 1 && i >= 0 ? { i, n, bottom: i === n - 1 } : undefined;
}

/** True/false for one comparison, undefined when it says nothing. */
export function isBelowAverageComparison(c: ComparisonLike): boolean | undefined {
  if (c.comparisonOperator === 'range') {
    const p = tierPlace(c);
    return p ? p.i >= p.n / 2 : undefined;
  }
  return typeof c.meetsOrExceeds === 'boolean' ? !c.meetsOrExceeds : undefined;
}

/** Below average (true), not (false), or unknown (undefined) for one metric. */
export function belowAverageStanding(comparisons: ReadonlyArray<ComparisonLike> | undefined, percentile?: number): boolean | undefined {
  const verdicts = (comparisons ?? []).map(isBelowAverageComparison).filter((v): v is boolean => v !== undefined);
  if (verdicts.length > 0) return verdicts.some(Boolean);
  if (percentile === undefined) return undefined;
  return percentile < BELOW_AVERAGE_PERCENTILE;
}
