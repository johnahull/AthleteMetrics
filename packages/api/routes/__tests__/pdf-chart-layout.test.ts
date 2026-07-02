import { describe, it, expect } from 'vitest';
import { planChartPageBreaks } from '../pdf-chart-layout';

describe('planChartPageBreaks', () => {
  it('packs as many charts per page as fit by vertical space (more than two)', () => {
    // Three 80-unit blocks fit in 250 of usable height (3 * 80 = 240 <= 250),
    // so all three share the first page — the old fixed 2-per-page cap is gone.
    const breaks = planChartPageBreaks([80, 80, 80], 250);
    expect(breaks).toEqual([false, false, false]);
  });

  it('breaks to a new page when the next chart would overflow the page', () => {
    // 100-unit blocks in 250 usable: two fit (200), the third overflows (300).
    const breaks = planChartPageBreaks([100, 100, 100, 100, 100], 250);
    expect(breaks).toEqual([false, false, true, false, true]);
  });

  it('never breaks before the first chart, even if it is oversized', () => {
    expect(planChartPageBreaks([300], 250)).toEqual([false]);
    // An oversized chart takes its own page; the next chart starts a fresh page.
    expect(planChartPageBreaks([300, 50], 250)).toEqual([false, true]);
  });

  it('returns an empty array for no charts', () => {
    expect(planChartPageBreaks([], 250)).toEqual([]);
  });
});
