// packages/web/src/components/charts/trend-utils.test.ts
import { describe, it, expect } from 'vitest';
import {
  directionCue,
  formatDelta,
  currentTierName,
  overlayToAnnotations,
  buildTrendChartData,
} from './trend-utils';
import type { BenchmarkOverlay, MetricTrend } from '@shared/report-trends-types';

describe('trend-utils', () => {
  it('cues downward improvement for lower-is-better, upward for higher-is-better', () => {
    expect(directionCue('lower')).toEqual({ betterText: 'Lower is better', arrow: '↓', word: 'downward' });
    expect(directionCue('higher')).toEqual({ betterText: 'Higher is better', arrow: '↑', word: 'upward' });
  });

  it('labels improvement-signed positive delta as improvement (no misleading arrow)', () => {
    expect(formatDelta({ from: 18, to: 25.5, pct: 41.7 })).toBe('+42% improvement');
  });

  it('labels a negative (worse) delta as decline', () => {
    expect(formatDelta({ from: 25, to: 20, pct: -20 })).toBe('20% decline');
  });

  it('labels a zero delta as no change', () => {
    expect(formatDelta({ from: 20, to: 20, pct: 0 })).toBe('No change');
  });

  it('finds the tier a value falls into', () => {
    const overlay: BenchmarkOverlay = {
      kind: 'tiers',
      tiers: [
        { name: 'JV', min: 20, max: 24, color: '#a' },
        { name: 'Varsity', min: 24, max: 28, color: '#b' },
      ],
    };
    expect(currentTierName(overlay, 25.5)).toBe('Varsity');
    expect(currentTierName(overlay, 21)).toBe('JV');
    expect(currentTierName(overlay, 30)).toBe('Varsity'); // above top -> best tier
    expect(currentTierName({ kind: 'none' }, 10)).toBeNull();
  });

  describe('overlayToAnnotations', () => {
    it('builds keyed box annotations for a tiers overlay', () => {
      const overlay: BenchmarkOverlay = {
        kind: 'tiers',
        tiers: [
          { name: 'JV', min: 20, max: 24, color: '#aabbcc' },
          { name: 'Elite', min: null, max: null, color: '#ddeeff' },
        ],
      };

      const annotations = overlayToAnnotations(overlay);

      expect(Object.keys(annotations)).toEqual(['tier-0', 'tier-1']);

      const tier0 = annotations['tier-0'] as { type: string; yMin?: number; yMax?: number };
      expect(tier0.type).toBe('box');
      expect(tier0.yMin).toBe(20);
      expect(tier0.yMax).toBe(24);

      // null min/max map to undefined (open-ended band)
      const tier1 = annotations['tier-1'] as { type: string; yMin?: number; yMax?: number };
      expect(tier1.type).toBe('box');
      expect(tier1.yMin).toBeUndefined();
      expect(tier1.yMax).toBeUndefined();
    });

    it('builds keyed line annotations for a thresholds overlay', () => {
      const overlay: BenchmarkOverlay = {
        kind: 'thresholds',
        lines: [{ name: 'Target', value: 26, color: '#112233' }],
      };

      const annotations = overlayToAnnotations(overlay);

      expect(Object.keys(annotations)).toEqual(['line-0']);

      const line0 = annotations['line-0'] as {
        type: string;
        yMin?: number;
        yMax?: number;
        borderDash?: number[];
      };
      expect(line0.type).toBe('line');
      expect(line0.yMin).toBe(26);
      expect(line0.yMax).toBe(26);
      expect(line0.borderDash).toBeDefined();
    });

    it('returns an empty map for a none overlay', () => {
      expect(overlayToAnnotations({ kind: 'none' })).toEqual({});
    });
  });

  describe('buildTrendChartData', () => {
    it('maps a metric trend into a single-series dataset', () => {
      const trend: MetricTrend = {
        series: [
          { date: '2024-01-15', value: 24 },
          { date: '2024-03-15', value: 27.5 },
        ],
        direction: 'higher',
        delta: { from: 24, to: 27.5, pct: 14.6 },
        benchmark: { kind: 'none' },
      };

      const chartData = buildTrendChartData(trend, 'Vertical Jump');

      expect(chartData.labels).toHaveLength(trend.series.length);
      expect(chartData.datasets[0].data).toEqual([24, 27.5]);
      expect(chartData.datasets[0].label).toBe('Vertical Jump');
    });
  });
});
