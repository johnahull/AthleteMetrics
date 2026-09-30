// packages/api/services/__tests__/report-team-charts.test.ts
import { describe, it, expect } from 'vitest';
import { assembleTeamTrends, computeTeamDistribution } from '../report-team-charts';

// Minimal shape of a per-athlete measurement row used by assembleTeamTrends.
const row = (athleteId: string, athleteName: string, metric: string, date: string, value: number) => ({
  athleteId, athleteName, metric, date, value: String(value),
});

describe('assembleTeamTrends', () => {
  it('computes the team-average per date and preserves per-athlete series', () => {
    const rows = [
      row('a1', 'Alice', 'VJ', '2025-09-01', 20),
      row('a2', 'Bob', 'VJ', '2025-09-01', 24),
      row('a1', 'Alice', 'VJ', '2026-02-01', 26),
      row('a2', 'Bob', 'VJ', '2026-02-01', 30),
    ];
    const trends = assembleTeamTrends(rows, ['VJ'], { VJ: 'higher' }, { VJ: [] });

    expect(trends.VJ.teamSeries).toEqual([
      { date: '2025-09-01', value: 22 },
      { date: '2026-02-01', value: 28 },
    ]);

    expect(trends.VJ.athleteSeries).toHaveLength(2);
    const alice = trends.VJ.athleteSeries.find(s => s.athleteId === 'a1')!;
    expect(alice.athleteName).toBe('Alice');
    expect(alice.series).toEqual([
      { date: '2025-09-01', value: 20 },
      { date: '2026-02-01', value: 26 },
    ]);
    const bob = trends.VJ.athleteSeries.find(s => s.athleteId === 'a2')!;
    expect(bob.series.map(p => p.value)).toEqual([24, 30]);
  });

  it('computes positive improvement pct for a higher-is-better metric', () => {
    const rows = [
      row('a1', 'Alice', 'VJ', '2025-09-01', 20),
      row('a1', 'Alice', 'VJ', '2026-02-01', 25),
    ];
    const trends = assembleTeamTrends(rows, ['VJ'], { VJ: 'higher' }, { VJ: [] });
    expect(trends.VJ.direction).toBe('higher');
    expect(trends.VJ.delta.from).toBe(20);
    expect(trends.VJ.delta.to).toBe(25);
    expect(Math.round(trends.VJ.delta.pct)).toBe(25); // (25-20)/20*100
  });

  it('computes positive improvement pct for a lower-is-better metric', () => {
    const rows = [
      row('a1', 'Alice', 'DASH', '2025-09-01', 5.6),
      row('a1', 'Alice', 'DASH', '2026-02-01', 4.92),
    ];
    const trends = assembleTeamTrends(rows, ['DASH'], { DASH: 'lower' }, { DASH: [] });
    expect(trends.DASH.direction).toBe('lower');
    expect(trends.DASH.delta.from).toBe(5.6);
    expect(trends.DASH.delta.to).toBe(4.92);
    expect(Math.round(trends.DASH.delta.pct)).toBe(12); // (5.6-4.92)/5.6*100
  });

  it('derives the benchmark overlay from the metric comparisons via deriveOverlay', () => {
    const rows = [
      row('a1', 'Alice', 'VJ', '2025-09-01', 20),
      row('a1', 'Alice', 'VJ', '2026-02-01', 25),
    ];
    const trends = assembleTeamTrends(rows, ['VJ'], { VJ: 'higher' }, {
      VJ: [{ benchmarkName: 'Target', benchmarkValue: 24 }],
    });
    expect(trends.VJ.benchmark).toEqual({
      kind: 'thresholds',
      lines: [{ name: 'Target', value: 24, color: '#ef4444' }],
    });
  });

  it('drops a metric whose teamSeries has fewer than 2 distinct dates', () => {
    // Both athletes measured on the SAME single date -> only 1 team-series point.
    const rows = [
      row('a1', 'Alice', 'VJ', '2025-09-01', 20),
      row('a2', 'Bob', 'VJ', '2025-09-01', 24),
    ];
    const trends = assembleTeamTrends(rows, ['VJ'], { VJ: 'higher' }, { VJ: [] });
    expect(trends.VJ).toBeUndefined();
  });

  it('omits a metric with no rows at all', () => {
    const trends = assembleTeamTrends([], ['VJ'], { VJ: 'higher' }, { VJ: [] });
    expect(trends.VJ).toBeUndefined();
  });

  it('collapses same-day retests to the best value instead of double-weighting that athlete in the team average (regression: a second same-date row used to be averaged in as if it were a second athlete)', () => {
    const rows = [
      // Alice retested VJ twice on the same day — best (higher-is-better) is 26.
      row('a1', 'Alice', 'VJ', '2025-09-01', 20),
      row('a1', 'Alice', 'VJ', '2025-09-01', 26),
      row('a2', 'Bob', 'VJ', '2025-09-01', 24),
      row('a1', 'Alice', 'VJ', '2026-02-01', 30),
      row('a2', 'Bob', 'VJ', '2026-02-01', 32),
    ];
    const trends = assembleTeamTrends(rows, ['VJ'], { VJ: 'higher' }, { VJ: [] });

    // Team average must be (26 + 24) / 2 = 25, not (20 + 26 + 24) / 3.
    expect(trends.VJ.teamSeries).toEqual([
      { date: '2025-09-01', value: 25 },
      { date: '2026-02-01', value: 31 },
    ]);

    // Alice's own series must also collapse to one point for that date.
    const alice = trends.VJ.athleteSeries.find(s => s.athleteId === 'a1')!;
    expect(alice.series).toEqual([
      { date: '2025-09-01', value: 26 },
      { date: '2026-02-01', value: 30 },
    ]);
  });

  it('collapses same-day retests to the lowest value for a lower-is-better metric', () => {
    const rows = [
      row('a1', 'Alice', 'DASH', '2025-09-01', 5.6),
      row('a1', 'Alice', 'DASH', '2025-09-01', 4.9), // faster (better) retest
      row('a2', 'Bob', 'DASH', '2025-09-01', 5.2),
      row('a1', 'Alice', 'DASH', '2026-02-01', 4.7),
      row('a2', 'Bob', 'DASH', '2026-02-01', 5.0),
    ];
    const trends = assembleTeamTrends(rows, ['DASH'], { DASH: 'lower' }, { DASH: [] });

    expect(trends.DASH.teamSeries[0]).toEqual({ date: '2025-09-01', value: (4.9 + 5.2) / 2 });
    const alice = trends.DASH.athleteSeries.find(s => s.athleteId === 'a1')!;
    expect(alice.series[0]).toEqual({ date: '2025-09-01', value: 4.9 });
  });
});

describe('computeTeamDistribution', () => {
  it('computes five-number stats, teamAverage, and preserves per-athlete dots', () => {
    const athletes = [
      { athleteId: 'a1', athleteName: 'Alice', value: 10 },
      { athleteId: 'a2', athleteName: 'Bob', value: 20 },
      { athleteId: 'a3', athleteName: 'Carl', value: 40 },
      { athleteId: 'a4', athleteName: 'Dee', value: 50 },
    ];
    const dist = computeTeamDistribution(athletes)!;
    expect(dist.stats.min).toBe(10);
    expect(dist.stats.max).toBe(50);
    expect(dist.stats.median).toBe(30);
    expect(dist.stats.q1).toBeCloseTo(17.5, 5);
    expect(dist.stats.q3).toBeCloseTo(42.5, 5);
    expect(dist.teamAverage).toBe(30);
    expect(dist.values).toEqual([10, 20, 40, 50]);
    expect(dist.athletes).toEqual(athletes);
  });

  it('returns sorted values for unsorted athlete input', () => {
    const athletes = [
      { athleteId: 'a1', athleteName: 'Alice', value: 40 },
      { athleteId: 'a2', athleteName: 'Bob', value: 10 },
    ];
    const dist = computeTeamDistribution(athletes)!;
    expect(dist.values).toEqual([10, 40]);
  });

  it('returns null for 0 or 1 athletes', () => {
    expect(computeTeamDistribution([])).toBeNull();
    expect(computeTeamDistribution([{ athleteId: 'a1', athleteName: 'Alice', value: 42 }])).toBeNull();
  });

  it('returns non-null for exactly 2 athletes', () => {
    const dist = computeTeamDistribution([
      { athleteId: 'a1', athleteName: 'Alice', value: 10 },
      { athleteId: 'a2', athleteName: 'Bob', value: 20 },
    ]);
    expect(dist).not.toBeNull();
  });
});
