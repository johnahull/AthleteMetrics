import type { BenchmarkComparison, TierInfo } from '@shared/benchmark-types';

/** Tiers ordered worst->best (descending tierOrder) for left->right bars. */
export function tierSegments(cmp: BenchmarkComparison): TierInfo[] {
  return [...(cmp.allTiers ?? [])].sort((a, b) => b.tierOrder - a.tierOrder);
}

/**
 * Core of {@link athletePositionPct}, parameterized on a raw `value` and an
 * already worst->best sorted `segs` array so it can be reused for arbitrary
 * values (e.g. individual athlete measurements plotted alongside a team
 * average), not just `cmp.athleteValue`.
 *
 * Athlete position 0..1, aligned to the equal-width tier segments rendered by
 * TierProgressChart (each segment is `flex-1`). The marker lands inside the
 * value's actual tier segment regardless of unequal or open-ended band widths.
 *
 * Returns `(segmentIndex + intraSegmentFraction) / segmentCount`.
 */
export function athletePositionPctForValue(value: number, segs: TierInfo[]): number {
  const n = segs.length;
  if (n === 0) return 0;

  const v = value;
  const lo = (s: TierInfo) => s.minValue ?? -Infinity;
  const hi = (s: TierInfo) => s.maxValue ?? Infinity;

  // Find the segment whose [min, max] band contains the value.
  let index = segs.findIndex(s => v >= lo(s) && v <= hi(s));

  if (index === -1) {
    // Not contained by any band: clamp below first / above last, else nearest boundary.
    if (v < lo(segs[0])) {
      index = 0;
    } else if (v > hi(segs[n - 1])) {
      index = n - 1;
    } else {
      let bestDist = Infinity;
      segs.forEach((s, i) => {
        const d = Math.min(Math.abs(v - lo(s)), Math.abs(v - hi(s)));
        if (d < bestDist) { bestDist = d; index = i; }
      });
    }
  }

  const seg = segs[index];
  // Intra-segment fraction; open-ended (null bound) or degenerate bands use the center.
  let f = 0.5;
  if (seg.minValue != null && seg.maxValue != null && seg.maxValue !== seg.minValue) {
    f = (v - seg.minValue) / (seg.maxValue - seg.minValue);
  }
  f = Math.max(0, Math.min(1, f));

  return (index + f) / n;
}

/** Athlete position 0..1 for `cmp.athleteValue`. See {@link athletePositionPctForValue}. */
export function athletePositionPct(cmp: BenchmarkComparison): number {
  return athletePositionPctForValue(cmp.athleteValue, tierSegments(cmp));
}

/**
 * Core of {@link benchmarkStandingPct}, parameterized on a raw `value` instead
 * of `cmp.athleteValue` so it can be reused for arbitrary values (e.g.
 * individual athlete measurements plotted alongside a team average).
 *
 * Marker position 0..1 on a track centered on the benchmark (0.5).
 * The benchmark sits at center (0.5); the marker reflects the TRUE
 * value relationship (right = higher value than the benchmark, left = lower),
 * so the bar reads like a real value axis regardless of metric direction.
 * Clamped to [0.05, 0.95].
 */
export function benchmarkStandingPctForValue(value: number, benchmarkValue: number): number {
  const bv = Math.abs(benchmarkValue);
  const rel = bv === 0 ? 0 : Math.max(-0.45, Math.min(0.45, (value - benchmarkValue) / bv));
  return 0.5 + rel;
}

/** Marker position 0..1 for `cmp.athleteValue`. See {@link benchmarkStandingPctForValue}. */
export function benchmarkStandingPct(cmp: BenchmarkComparison): number {
  return benchmarkStandingPctForValue(cmp.athleteValue, cmp.benchmarkValue);
}

/** Which direction is "better" for this benchmark, inferred from its operator:
 *  gte → higher is better, lte → lower is better, eq/other → neither. This is
 *  the same operator the backend uses to compute meetsOrExceeds, so the bar's
 *  shaded "better" side always agrees with the meets/below result. */
export function benchmarkBetterDirection(cmp: BenchmarkComparison): 'higher' | 'lower' | 'none' {
  if (cmp.comparisonOperator === 'gte') return 'higher';
  if (cmp.comparisonOperator === 'lte') return 'lower';
  return 'none';
}

/** "✓ Meets (by 0.03 s)" / "✗ Misses by 0.03 s" with absolute difference. */
export function benchmarkStandingCaption(cmp: BenchmarkComparison, unit?: string): string {
  const u = unit ? ` ${unit}` : '';
  const diff = Math.round(Math.abs(cmp.athleteValue - cmp.benchmarkValue) * 100) / 100;
  return cmp.meetsOrExceeds ? `✓ Meets (by ${diff}${u})` : `✗ Misses by ${diff}${u}`;
}

/** "2.5 in to Elite" / "Top tier ✓". */
export function nextTierCaption(cmp: BenchmarkComparison, unit?: string): string {
  if (cmp.isBestTier || !cmp.nextTierName || cmp.distanceToNextTier == null) return 'Top tier ✓';
  const u = unit ? ` ${unit}` : '';
  return `${Math.round(cmp.distanceToNextTier * 100) / 100}${u} to ${cmp.nextTierName}`;
}

/**
 * Evaluate an arbitrary value (e.g. a team average, not a single athlete's own
 * measurement) against a tier group, producing a synthetic {@link
 * BenchmarkComparison} that TierProgressChart can render as-is. Mirrors the
 * tierOrder convention used throughout this codebase (1 = best tier,
 * ascending = worse) and the same "inclusive range, first match wins" and
 * "clamp outside the defined bands" rules as the backend's per-athlete
 * evaluator (`evaluateTierBenchmark` in packages/api/services/benchmark-tiers.ts),
 * adapted for the already-numeric {@link TierInfo} shape used client-side.
 *
 * Only the fields TierProgressChart actually reads (tierName, allTiers,
 * isBestTier, nextTierName, distanceToNextTier, athleteValue) are guaranteed
 * meaningful; benchmarkName/benchmarkValue/comparisonOperator/percentageDiff
 * are filled with reasonable placeholders to satisfy the BenchmarkComparison
 * shape (BenchmarkStandingBar, which relies on those, is used for the
 * non-tiered case instead — see buildTeamBenchmarkComparisons).
 */
export function evaluateTierStanding(
  value: number,
  allTiers: TierInfo[],
  tierGroupName?: string,
  lowerIsBetter = false,
): BenchmarkComparison {
  const sorted = [...allTiers].sort((a, b) => a.tierOrder - b.tierOrder); // ascending: 1 (best) first

  const inBand = (t: TierInfo) =>
    (t.minValue == null || value >= t.minValue) && (t.maxValue == null || value <= t.maxValue);

  let matched = sorted.find(inBand) ?? null;

  if (!matched && sorted.length > 0) {
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    // Direction-aware: for lower-is-better metrics, "beating the best tier"
    // means falling BELOW its min (or at/under its max), the mirror image of
    // the higher-is-better case. Matches evaluateTierBenchmark in
    // packages/api/services/benchmark-tiers.ts.
    const beatsBest = lowerIsBetter
      ? (best.minValue != null ? value < best.minValue : best.maxValue != null ? value <= best.maxValue : false)
      : (best.maxValue != null ? value > best.maxValue : best.minValue != null ? value >= best.minValue : false);
    if (beatsBest) {
      matched = best;
    } else {
      let minDistance = Infinity;
      for (const t of sorted) {
        if (t.minValue != null) {
          const d = Math.abs(value - t.minValue);
          if (d < minDistance) { minDistance = d; matched = t; }
        }
        if (t.maxValue != null) {
          const d = Math.abs(value - t.maxValue);
          if (d < minDistance) { minDistance = d; matched = t; }
        }
      }
      if (!matched) matched = worst;
    }
  }

  const isBestTier = !!matched && matched.tierOrder === sorted[0]?.tierOrder;
  let nextTierName: string | undefined;
  let distanceToNextTier: number | null = null;

  if (matched && !isBestTier) {
    const idx = sorted.findIndex((t) => t.tierOrder === matched!.tierOrder);
    const next = sorted[idx - 1]; // one step better (ascending order, lower index = better)
    if (next) {
      nextTierName = next.tierName;
      // Direction-aware boundary: the value must move toward the NEXT
      // (better) tier's own boundary — its maxValue if lower-is-better
      // (need to decrease), its minValue if higher-is-better (need to
      // increase). Matches evaluateTierBenchmark's distanceToNextTier logic.
      const boundary = lowerIsBetter ? (next.maxValue ?? next.minValue) : (next.minValue ?? next.maxValue);
      if (boundary != null) distanceToNextTier = Math.round(Math.abs(boundary - value) * 100) / 100;
    }
  }

  return {
    benchmarkName: tierGroupName || matched?.tierName || 'Tier',
    benchmarkValue: value,
    athleteValue: value,
    meetsOrExceeds: isBestTier,
    percentageDiff: 0,
    comparisonOperator: 'range',
    tierName: matched?.tierName,
    tierColor: matched?.tierColor,
    tierOrder: matched?.tierOrder,
    tierGroupName,
    distanceToNextTier,
    nextTierName,
    isBestTier,
    allTiers: sorted,
  };
}
