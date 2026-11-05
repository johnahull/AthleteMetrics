/** Smallest reference sample a percentile is reported from; below this the answer is null (AM-FEAT-024). */
export const MIN_NORM_N = 30;

/** Mid-rank percentile (0-100; 0 for an empty sample) of x in an ascending `sorted` sample: (below + 0.5 * equal) / n. */
export function midRankPercentile(sorted: number[], x: number): number {
  if (sorted.length === 0) return 0; // no sample to rank against; avoids 0/0 = NaN
  const lowerBound = (target: number, strict: boolean) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (strict ? sorted[mid] <= target : sorted[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const below = lowerBound(x, false);
  const equal = lowerBound(x, true) - below;
  return ((below + 0.5 * equal) / sorted.length) * 100;
}

/**
 * Where x sits in a reference sample, 0-100 with higher = better. Null when the sample is smaller than
 * minN, x is not finite, or any sample value is NaN. Values outside the sample range give 0 / 100, not null.
 */
export function percentile(
  values: number[],
  x: number,
  direction: "lower_is_better" | "higher_is_better",
  minN: number = MIN_NORM_N,
): number | null {
  if (values.length === 0 || values.length < minN || !Number.isFinite(x) || values.some(Number.isNaN)) return null;
  const p = midRankPercentile([...values].sort((a, b) => a - b), x);
  return direction === "lower_is_better" ? 100 - p : p;
}
