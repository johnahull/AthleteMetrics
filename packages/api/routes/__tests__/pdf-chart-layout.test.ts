import { describe, it, expect } from 'vitest';
import { planChartPageBreaks, chartGroupHeadings, addHeadingHeights } from '../pdf-chart-layout';

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

describe('chartGroupHeadings', () => {
  const c = (group?: string, groupLabel?: string, section?: string) => ({ group, groupLabel, section });

  it('marks the first chart and each group change, not repeats', () => {
    const out = chartGroupHeadings([
      c('speed', 'Speed'), c('speed', 'Speed'), c('power', 'Power'), c('power', 'Power'), c('agility', 'Agility'),
    ]);
    expect(out).toEqual(['Speed', null, 'Power', null, 'Agility']);
  });

  it('heads each section separately when consecutive sections share the same group', () => {
    const out = chartGroupHeadings([
      c('speed', 'Speed', 'standing'), c('speed', 'Speed', 'standing'),
      c('speed', 'Speed', 'trends'), c('speed', 'Speed', 'trends'),
      c('speed', 'Speed', 'distribution'),
    ]);
    expect(out).toEqual(['Speed', null, 'Speed', null, 'Speed']);
  });

  it('resets after a chart with no group, so the same group heads again', () => {
    const out = chartGroupHeadings([c('speed', 'Speed'), c(), c('speed', 'Speed')]);
    expect(out).toEqual(['Speed', null, 'Speed']);
  });

  it('gives no heading to charts without a group and handles empty input', () => {
    expect(chartGroupHeadings([c(), c()])).toEqual([null, null]);
    expect(chartGroupHeadings([])).toEqual([]);
  });

  it('falls back to the group id when there is no label', () => {
    expect(chartGroupHeadings([c('speed')])).toEqual(['speed']);
  });
});

describe('addHeadingHeights', () => {
  it('adds the heading height only to charts that start a group', () => {
    expect(addHeadingHeights([80, 80, 80], ['Speed', null, 'Power'], 8)).toEqual([88, 80, 88]);
  });

  it('keeps a heading on the same page as its first chart', () => {
    // 100-unit blocks in 250 usable: without headings two fit per page. The heading on chart 3 (+8)
    // is part of its block, so it moves to the next page together with its chart.
    const heights = addHeadingHeights([100, 100, 100], [null, null, 'Power'], 8);
    expect(planChartPageBreaks(heights, 250)).toEqual([false, false, true]);
  });
});
