/**
 * Shared benchmark utility functions.
 * Used by both API (PDF generation) and Web (report rendering).
 * Pure functions — no DB, no browser APIs.
 */

/**
 * Derives a tier group display name from an individual tier benchmark name.
 * Strips the last " - Segment" suffix (e.g., "40yd Dash - Elite" → "40yd Dash").
 */
export function deriveTierGroupName(tierBenchmarkName: string): string {
  return tierBenchmarkName.replace(/ - [^-]+$/, '');
}

export interface TierDistribution {
  metricCode: string;
  tierGroupName: string;
  tiers: Array<{ tierName: string; tierColor: string; tierOrder: number; count: number }>;
}

/**
 * Calculate tier distribution across athletes for team reports.
 * Returns how many athletes fall into each tier for each tier group.
 */
export function calculateTierDistributions(athleteRankings: Array<{
  benchmarkComparisons?: Record<string, Array<{
    tierName?: string;
    tierColor?: string;
    tierOrder?: number;
    tierGroupName?: string;
  }>>;
}>): TierDistribution[] {
  if (!athleteRankings || athleteRankings.length === 0) return [];

  const groupMap = new Map<string, {
    metricCode: string;
    tierGroupName: string;
    tiers: Map<string, { tierColor: string; tierOrder: number; count: number }>;
  }>();

  for (const athlete of athleteRankings) {
    if (!athlete.benchmarkComparisons) continue;
    for (const [metric, comparisons] of Object.entries(athlete.benchmarkComparisons)) {
      for (const comp of comparisons) {
        if (!comp.tierName || !comp.tierGroupName) continue;
        const key = `${metric}:${comp.tierGroupName}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            metricCode: metric,
            tierGroupName: comp.tierGroupName,
            tiers: new Map(),
          });
        }
        const group = groupMap.get(key)!;
        if (!group.tiers.has(comp.tierName)) {
          group.tiers.set(comp.tierName, {
            tierColor: comp.tierColor || 'gray',
            tierOrder: comp.tierOrder || 99,
            count: 0,
          });
        }
        group.tiers.get(comp.tierName)!.count++;
      }
    }
  }

  return Array.from(groupMap.values()).map(({ metricCode, tierGroupName, tiers }) => ({
    metricCode,
    tierGroupName,
    tiers: Array.from(tiers.entries())
      .map(([tierName, data]) => ({ tierName, ...data }))
      .sort((a, b) => a.tierOrder - b.tierOrder),
  }));
}

// Benchmark ids are UUIDs (custom) or text slugs (seeded site benchmarks, e.g. d1-soc-dash40-d1-avg)
const BENCHMARK_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * True if the value is a well-formed benchmark id (UUID or seeded slug). Format only; existence is checked elsewhere.
 */
export function isValidBenchmarkId(value: string): boolean {
  return BENCHMARK_ID_PATTERN.test(value);
}
