import type { BenchmarkComparison, TierInfo } from '@shared/benchmark-types';

/** Tiers ordered worst->best (descending tierOrder) for left->right bars. */
export function tierSegments(cmp: BenchmarkComparison): TierInfo[] {
  return [...(cmp.allTiers ?? [])].sort((a, b) => b.tierOrder - a.tierOrder);
}

/**
 * Athlete position 0..1, aligned to the equal-width tier segments rendered by
 * TierProgressChart (each segment is `flex-1`). The marker lands inside the
 * athlete's actual tier segment regardless of unequal or open-ended band widths.
 *
 * Returns `(segmentIndex + intraSegmentFraction) / segmentCount`.
 */
export function athletePositionPct(cmp: BenchmarkComparison): number {
  const segs = tierSegments(cmp);
  const n = segs.length;
  if (n === 0) return 0;

  const v = cmp.athleteValue;
  const lo = (s: TierInfo) => s.minValue ?? -Infinity;
  const hi = (s: TierInfo) => s.maxValue ?? Infinity;

  // Find the segment whose [min, max] band contains the athlete value.
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

/** "2.5 in to Elite" / "Top tier ✓". */
export function nextTierCaption(cmp: BenchmarkComparison, unit?: string): string {
  if (cmp.isBestTier || !cmp.nextTierName || cmp.distanceToNextTier == null) return 'Top tier ✓';
  const u = unit ? ` ${unit}` : '';
  return `${Math.round(cmp.distanceToNextTier * 100) / 100}${u} to ${cmp.nextTierName}`;
}
