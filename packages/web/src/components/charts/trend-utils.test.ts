// packages/web/src/components/charts/trend-utils.test.ts
import { describe, it, expect } from 'vitest';
import { shouldReverseYAxis, formatDelta, currentTierName } from './trend-utils';
import type { BenchmarkOverlay } from '@shared/report-trends-types';

describe('trend-utils', () => {
  it('reverses the y-axis only for lower-is-better metrics', () => {
    expect(shouldReverseYAxis('lower')).toBe(true);
    expect(shouldReverseYAxis('higher')).toBe(false);
  });

  it('formats improvement with an up arrow and rounded percent', () => {
    expect(formatDelta({ from: 18, to: 25.5, pct: 41.7 })).toBe('▲ +42%');
  });

  it('formats a decline with a down arrow', () => {
    expect(formatDelta({ from: 25, to: 20, pct: -20 })).toBe('▼ 20%');
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
});
