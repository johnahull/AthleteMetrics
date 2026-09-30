// packages/api/services/report-trends.test.ts
import { describe, it, expect } from 'vitest';
import { assembleTrends, deriveOverlay } from './report-trends';

// Minimal shape of a measurement row used by assembleTrends.
const m = (metric: string, date: string, value: number) => ({ metric, date, value: String(value) });

describe('assembleTrends', () => {
  it('builds an ascending series with delta for a higher-is-better metric', () => {
    const rows = [m('VJ', '2026-02-01', 25.5), m('VJ', '2025-09-01', 18)]; // unordered
    const trends = assembleTrends(
      rows,
      ['VJ'],
      { VJ: 'higher' },
      { VJ: [] },
    );
    expect(trends.VJ.series.map(p => p.date)).toEqual(['2025-09-01', '2026-02-01']);
    expect(trends.VJ.series.map(p => p.value)).toEqual([18, 25.5]);
    expect(trends.VJ.direction).toBe('higher');
    expect(trends.VJ.delta.from).toBe(18);
    expect(trends.VJ.delta.to).toBe(25.5);
    expect(Math.round(trends.VJ.delta.pct)).toBe(42); // (25.5-18)/18*100
  });

  it('computes positive improvement pct for a lower-is-better metric', () => {
    const rows = [m('DASH', '2026-02-01', 4.92), m('DASH', '2025-09-01', 5.6)];
    const trends = assembleTrends(rows, ['DASH'], { DASH: 'lower' }, { DASH: [] });
    expect(trends.DASH.direction).toBe('lower');
    expect(trends.DASH.delta.from).toBe(5.6);
    expect(trends.DASH.delta.to).toBe(4.92);
    expect(Math.round(trends.DASH.delta.pct)).toBe(12); // (5.6-4.92)/5.6*100
  });

  it('omits metrics with fewer than 2 measurements', () => {
    const rows = [m('VJ', '2025-09-01', 18)];
    const trends = assembleTrends(rows, ['VJ'], { VJ: 'higher' }, { VJ: [] });
    expect(trends.VJ).toBeUndefined();
  });

  it('drops non-numeric (NaN) measurement values without poisoning the series/delta', () => {
    const rows = [
      m('VJ', '2025-09-01', 18),
      { metric: 'VJ', date: '2025-12-01', value: 'corrupt' }, // parseFloat -> NaN, must be dropped
      m('VJ', '2026-02-01', 25.5),
    ];
    const trends = assembleTrends(rows, ['VJ'], { VJ: 'higher' }, { VJ: [] });
    expect(trends.VJ.series.map(p => p.value)).toEqual([18, 25.5]);
    expect(trends.VJ.delta.from).toBe(18);
    expect(trends.VJ.delta.to).toBe(25.5);
    expect(Number.isNaN(trends.VJ.delta.pct)).toBe(false);
  });

  it('keeps only the best (max) same-day measurement for a higher-is-better metric', () => {
    const rows = [
      m('VJ', '2025-09-01', 18),
      m('VJ', '2026-02-01', 24),   // same day, worse
      m('VJ', '2026-02-01', 25.5), // same day, best
      m('VJ', '2026-02-01', 23),   // same day, worse
    ];
    const trends = assembleTrends(rows, ['VJ'], { VJ: 'higher' }, { VJ: [] });
    expect(trends.VJ.series).toEqual([
      { date: '2025-09-01', value: 18 },
      { date: '2026-02-01', value: 25.5 },
    ]);
    expect(trends.VJ.delta.to).toBe(25.5);
  });

  it('keeps only the best (min) same-day measurement for a lower-is-better metric', () => {
    const rows = [
      m('DASH', '2025-09-01', 5.6),
      m('DASH', '2025-09-01', 5.4),  // same day, best
      m('DASH', '2026-02-01', 4.92),
    ];
    const trends = assembleTrends(rows, ['DASH'], { DASH: 'lower' }, { DASH: [] });
    expect(trends.DASH.series).toEqual([
      { date: '2025-09-01', value: 5.4 },
      { date: '2026-02-01', value: 4.92 },
    ]);
    expect(trends.DASH.delta.from).toBe(5.4);
  });

  it('omits a metric whose measurements all fall on a single day (fewer than 2 points after dedup)', () => {
    const rows = [
      m('VJ', '2025-09-01', 18),
      m('VJ', '2025-09-01', 19),
      m('VJ', '2025-09-01', 20),
    ];
    const trends = assembleTrends(rows, ['VJ'], { VJ: 'higher' }, { VJ: [] });
    expect(trends.VJ).toBeUndefined();
  });

  it('derives tier zones when comparisons carry allTiers', () => {
    const overlay = deriveOverlay([
      {
        benchmarkName: 'HS', benchmarkValue: 24, athleteValue: 25.5, meetsOrExceeds: true,
        percentageDiff: 0, comparisonOperator: 'range',
        allTiers: [
          { tierName: 'JV', tierColor: '#fde68a', tierOrder: 1, minValue: 20, maxValue: 24 },
          { tierName: 'Varsity', tierColor: '#86efac', tierOrder: 2, minValue: 24, maxValue: 28 },
        ],
      } as any,
    ]);
    expect(overlay.kind).toBe('tiers');
    if (overlay.kind === 'tiers') {
      expect(overlay.tiers).toHaveLength(2);
      expect(overlay.tiers[0]).toEqual({ name: 'JV', min: 20, max: 24, color: '#fde68a' });
    }
  });

  it('derives threshold lines for single-value comparisons', () => {
    const overlay = deriveOverlay([
      { benchmarkName: 'Target', benchmarkValue: 24, athleteValue: 25, meetsOrExceeds: true,
        percentageDiff: 0, comparisonOperator: 'gte' } as any,
    ]);
    expect(overlay).toEqual({ kind: 'thresholds', lines: [{ name: 'Target', value: 24, color: '#ef4444' }] });
  });

  it('returns none when there are no comparisons', () => {
    expect(deriveOverlay([])).toEqual({ kind: 'none' });
    expect(deriveOverlay(undefined)).toEqual({ kind: 'none' });
  });
});
