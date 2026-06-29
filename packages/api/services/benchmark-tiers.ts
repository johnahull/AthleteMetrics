import type { BenchmarkComparison } from '@shared/benchmark-types';
import { deriveTierGroupName } from '@shared/benchmark-utils';

/**
 * Shape of a raw benchmark/tier row as stored in the database and passed to
 * {@link evaluateTierBenchmark}. Decimal columns (`minValue`, `maxValue`,
 * `benchmarkValue`) arrive as strings, which is why this function `parseFloat`s
 * them. Distinct from the shared `TierInfo` (whose min/max are already numbers).
 */
export interface TierBenchmarkRow {
  tierName?: string | null;
  name?: string | null;
  tierColor?: string | null;
  tierOrder?: number | null;
  minValue?: string | number | null;
  maxValue?: string | number | null;
  benchmarkValue?: string | number | null;
  comparisonOperator?: string | null;
  tierGroupId?: string | null;
  coachingNote?: string | null;
}

/** A tier row tagged with its source table + group, as fetched for grouping. */
export interface SourcedTierRow extends TierBenchmarkRow {
  _source?: string;
  tierGroupId?: string | null;
  displayOrder?: number | null;
}

/** Group sourced tier rows by `${_source}:${tierGroupId}`, pick ONE group
 *  deterministically (lowest min displayOrder, then group key), and return that
 *  group's rows sorted ascending by tierOrder. Returns [] when there are none. */
export function selectTierGroup(rows: SourcedTierRow[]): SourcedTierRow[] {
  const groups = new Map<string, SourcedTierRow[]>();
  for (const row of rows) {
    const key = `${row._source}:${row.tierGroupId}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  if (groups.size === 0) return [];
  const minOrder = (g: SourcedTierRow[]) => Math.min(...g.map((t) => t.displayOrder ?? 999));
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const da = minOrder(groups.get(a)!);
    const dbOrder = minOrder(groups.get(b)!);
    if (da !== dbOrder) return da - dbOrder;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return groups.get(sortedKeys[0])!.slice().sort((x, y) => (x.tierOrder ?? 0) - (y.tierOrder ?? 0));
}

/**
 * Pure tier-evaluation logic extracted from ReportService.
 *
 * Given an athlete value, whether lower values are better, and the set of tiers
 * for a tier group, determines which tier the athlete falls into and the
 * distance to the next better tier. Synchronous and side-effect free.
 */
export function evaluateTierBenchmark(
  athleteValue: number,
  lowerIsBetter: boolean,
  allTiers: TierBenchmarkRow[]
): BenchmarkComparison | null {
  if (allTiers.length === 0) return null;

  // Find which tier the athlete falls into.
  // Tiers are sorted by tierOrder (1 = best). For adjacent tiers with shared
  // boundaries (e.g., Tier 1: 1.00–1.20, Tier 2: 1.20–1.40), the inclusive
  // range check (>= min && <= max) matches both — first match wins, assigning
  // the better tier. This is intentional: boundary values favor the better tier.
  let matchedTier: TierBenchmarkRow | null = null;
  for (const tier of allTiers) {
    const minVal = tier.minValue != null ? parseFloat(String(tier.minValue)) : null;
    const maxVal = tier.maxValue != null ? parseFloat(String(tier.maxValue)) : null;

    if (minVal !== null && maxVal !== null) {
      if (athleteValue >= minVal && athleteValue <= maxVal) {
        matchedTier = tier;
        break;
      }
    } else if (tier.benchmarkValue != null) {
      // Single-value tier with comparison operator
      const bv = parseFloat(String(tier.benchmarkValue));
      if (tier.comparisonOperator === 'lte' && athleteValue <= bv) {
        matchedTier = tier;
        break;
      }
      if (tier.comparisonOperator === 'gte' && athleteValue >= bv) {
        matchedTier = tier;
        break;
      }
      if (tier.comparisonOperator === 'eq' && Math.abs(athleteValue - bv) < 0.01) {
        matchedTier = tier;
        break;
      }
    }
  }

  // If no tier matched, athlete is outside all defined ranges or in a gap
  // between non-contiguous ranges. Find the nearest tier by boundary distance.
  if (!matchedTier) {
    const bestTier = allTiers[0]; // tierOrder 1 = best
    const worstTier = allTiers[allTiers.length - 1];
    const bestMin = bestTier.minValue != null ? parseFloat(String(bestTier.minValue)) : null;
    const bestMax = bestTier.maxValue != null ? parseFloat(String(bestTier.maxValue)) : null;

    // Check if athlete exceeds the best tier
    let beatsBest = false;
    if (lowerIsBetter) {
      beatsBest = bestMin !== null ? athleteValue < bestMin
                : bestMax !== null ? athleteValue <= bestMax
                : false;
    } else {
      beatsBest = bestMax !== null ? athleteValue > bestMax
                : bestMin !== null ? athleteValue >= bestMin
                : false;
    }

    if (beatsBest) {
      matchedTier = bestTier;
    } else {
      // Find nearest tier by minimum distance to any boundary
      let minDistance = Infinity;
      for (const tier of allTiers) {
        const tMin = tier.minValue != null ? parseFloat(String(tier.minValue)) : null;
        const tMax = tier.maxValue != null ? parseFloat(String(tier.maxValue)) : null;
        if (tMin !== null) {
          const d = Math.abs(athleteValue - tMin);
          if (d < minDistance) { minDistance = d; matchedTier = tier; }
        }
        if (tMax !== null) {
          const d = Math.abs(athleteValue - tMax);
          if (d < minDistance) { minDistance = d; matchedTier = tier; }
        }
      }
      // Final fallback if no boundaries found at all
      if (!matchedTier) matchedTier = worstTier;
    }
  }

  // Find the next better tier (lower tierOrder = better)
  const matchedOrder = matchedTier.tierOrder ?? Number.MAX_SAFE_INTEGER;
  const isBestTier = matchedOrder === 1;
  let nextTierName: string | null = null;
  let distanceToNextTier: number | null = null;

  if (!isBestTier) {
    // Find the next better tier (largest tierOrder strictly less than matchedOrder).
    // Handles non-sequential tier orders (e.g., 1, 5, 10) — allTiers is sorted ascending.
    const nextTier = allTiers
      .filter((t) => (t.tierOrder ?? Number.MAX_SAFE_INTEGER) < matchedOrder)
      .at(-1);
    if (nextTier) {
      nextTierName = nextTier.tierName || null;
      // Calculate distance to the boundary of the next tier
      if (lowerIsBetter) {
        // For time-based metrics, athlete needs to decrease to reach next tier's maxValue
        const boundary = nextTier.maxValue != null ? parseFloat(String(nextTier.maxValue)) :
                        nextTier.benchmarkValue != null ? parseFloat(String(nextTier.benchmarkValue)) : null;
        if (boundary !== null) {
          distanceToNextTier = Math.abs(athleteValue - boundary);
        }
      } else {
        // For higher-is-better metrics, athlete needs to increase to reach next tier's minValue
        const boundary = nextTier.minValue != null ? parseFloat(String(nextTier.minValue)) :
                        nextTier.benchmarkValue != null ? parseFloat(String(nextTier.benchmarkValue)) : null;
        if (boundary !== null) {
          distanceToNextTier = Math.abs(boundary - athleteValue);
        }
      }
    }
  }

  // Use the tier group's base name (derive from first tier's name minus tier-specific suffix)
  const tierGroupName: string = (matchedTier.tierGroupId
    ? deriveTierGroupName(allTiers[0]?.name || matchedTier.name || '')
    : matchedTier.name) ?? '';

  // Use midpoint of range as benchmarkValue for compatibility
  const minVal = matchedTier.minValue != null ? parseFloat(String(matchedTier.minValue)) : null;
  const maxVal = matchedTier.maxValue != null ? parseFloat(String(matchedTier.maxValue)) : null;
  const displayValue = matchedTier.benchmarkValue != null
    ? parseFloat(String(matchedTier.benchmarkValue))
    : (minVal !== null && maxVal !== null ? (minVal + maxVal) / 2 : 0);

  return {
    benchmarkName: tierGroupName,
    benchmarkValue: displayValue,
    athleteValue,
    meetsOrExceeds: isBestTier || matchedOrder <= Math.ceil(allTiers.length / 2),
    percentageDiff: 0,
    comparisonOperator: 'range',
    tierName: matchedTier.tierName || matchedTier.name || undefined,
    tierColor: matchedTier.tierColor || 'gray',
    tierOrder: matchedTier.tierOrder ?? undefined,
    tierGroupName,
    distanceToNextTier,
    nextTierName,
    isBestTier,
    coachingNote: matchedTier.coachingNote ?? null,
    allTiers: allTiers.map((t) => ({
      tierName: t.tierName || t.name || '',
      tierColor: t.tierColor || 'gray',
      tierOrder: t.tierOrder || 0,
      minValue: t.minValue != null ? parseFloat(String(t.minValue)) : null,
      maxValue: t.maxValue != null ? parseFloat(String(t.maxValue)) : null,
    })),
  };
}
