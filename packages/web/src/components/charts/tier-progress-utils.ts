import type { BenchmarkComparison, TierInfo } from '@shared/benchmark-types';

/** Tiers ordered worst->best (descending tierOrder) for left->right bars. */
export function tierSegments(cmp: BenchmarkComparison): TierInfo[] {
  return [...(cmp.allTiers ?? [])].sort((a, b) => b.tierOrder - a.tierOrder);
}

/** Athlete position 0..1 across the combined min..max of all tier bands. */
export function athletePositionPct(cmp: BenchmarkComparison): number {
  const segs = tierSegments(cmp);
  const mins = segs.map(s => s.minValue).filter((v): v is number => v != null);
  const maxs = segs.map(s => s.maxValue).filter((v): v is number => v != null);
  if (!mins.length || !maxs.length) return 0;
  const lo = Math.min(...mins), hi = Math.max(...maxs);
  if (hi === lo) return 0;
  return Math.max(0, Math.min(1, (cmp.athleteValue - lo) / (hi - lo)));
}

/** "2.5 in to Elite" / "Top tier ✓". */
export function nextTierCaption(cmp: BenchmarkComparison, unit?: string): string {
  if (cmp.isBestTier || !cmp.nextTierName || cmp.distanceToNextTier == null) return 'Top tier ✓';
  const u = unit ? ` ${unit}` : '';
  return `${Math.round(cmp.distanceToNextTier * 100) / 100}${u} to ${cmp.nextTierName}`;
}
