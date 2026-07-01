/**
 * Pure binning helpers for the "Where you stand" distribution histogram.
 *
 * The histogram shows the whole org population (peer best-values PLUS the athlete)
 * bucketed into a few equal-width value ranges, so a parent or athlete can read
 * "most people are in the middle bars; I'm on the highlighted one" without any
 * statistics vocabulary. The athlete is counted in their own bar (the bar reflects
 * everyone, including them) and that bar is flagged for the "You" highlight.
 */

export interface HistogramBin {
  /** Inclusive lower edge of the value range. */
  start: number;
  /** Upper edge of the value range (inclusive on the final bin). */
  end: number;
  /** Number of athletes (peers + the athlete) whose value falls in this bin. */
  count: number;
  /** True for the single bin that contains the athlete's own value. */
  isAthlete: boolean;
}

/**
 * Bucket `peerValues` plus `athleteValue` into up to `binCount` equal-width bins.
 *
 * - The athlete is included in the population, so bar heights reflect everyone.
 * - The bin containing `athleteValue` is flagged `isAthlete` for the highlight.
 * - Bins never outnumber the people (avoids a comb of empty bars on small groups).
 * - All-equal values collapse to a single bin.
 */
export function computeHistogram(
  peerValues: number[],
  athleteValue: number,
  binCount = 8,
): HistogramBin[] {
  const population = [...peerValues, athleteValue];
  const min = Math.min(...population);
  const max = Math.max(...population);

  // Degenerate range: everyone scored the same → one bar.
  if (max === min) {
    return [{ start: min, end: max, count: population.length, isAthlete: true }];
  }

  const effectiveBins = Math.max(1, Math.min(binCount, population.length));
  const width = (max - min) / effectiveBins;

  const bins: HistogramBin[] = Array.from({ length: effectiveBins }, (_, i) => ({
    start: min + i * width,
    end: min + (i + 1) * width,
    count: 0,
    isAthlete: false,
  }));

  // Values at the maximum edge land in the last bin (clamp), not past it.
  const indexOf = (v: number) =>
    Math.min(effectiveBins - 1, Math.max(0, Math.floor((v - min) / width)));

  for (const v of population) {
    bins[indexOf(v)].count += 1;
  }
  bins[indexOf(athleteValue)].isAthlete = true;

  return bins;
}

/**
 * Fallback "better than X%" when the report's direction-normalized percentile is
 * unavailable. Counts the share of peer dots the athlete beats, respecting metric
 * direction (for lower-is-better, a smaller value is better). Returns 0..100.
 *
 * Prefer the report's `percentiles[metric]` (full-population, consistent with the
 * radar/benchmark charts) over this; it exists only as a self-contained backstop.
 */
export function percentBetterThanPeers(
  peerValues: number[],
  athleteValue: number,
  direction: 'higher' | 'lower',
): number {
  if (peerValues.length === 0) return 0;
  const beaten = peerValues.filter((v) =>
    direction === 'lower' ? v > athleteValue : v < athleteValue,
  ).length;
  return Math.round((beaten / peerValues.length) * 100);
}
