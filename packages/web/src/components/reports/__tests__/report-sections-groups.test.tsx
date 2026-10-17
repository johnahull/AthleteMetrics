import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrendSection } from '../TrendSection';
import { TeamTrendSection } from '../TeamTrendSection';
import { DistributionSection } from '../DistributionSection';
import { LeaderboardBarSection } from '../LeaderboardBarSection';

vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({
    getMetricConfig: (code: string) => ({ label: code, unit: 's', metricType: 'lower_is_better', lowerIsBetter: true }),
    isLoaded: true,
    metricsMap: {},
  }),
}));
vi.mock('react-chartjs-2', () => ({
  Line: () => <div />,
  Bar: () => <div />,
  Chart: () => <div />,
}));

const metricGroups = [
  { group: 'speed', label: 'Speed', codes: ['A'] },
  { group: 'power', label: 'Power', codes: ['B'] },
] as any[];

const series = [{ date: '2024-01-01', value: 1 }, { date: '2024-02-01', value: 2 }];
const trend = { series, direction: 'higher', delta: { from: 1, to: 2, pct: 100 }, benchmark: { kind: 'none' } };
const teamTrend = { teamSeries: series, athleteSeries: [], direction: 'higher', delta: { from: 1, to: 2, pct: 100 }, benchmark: { kind: 'none' } };
const dist = { values: [1, 2, 3], athleteValue: 2, stats: { min: 1, q1: 1, median: 2, q3: 3, max: 3 }, direction: 'higher' };

/** One heading per group, wrappers tagged with the section, and no heading inside a captured chart node. */
function expectGrouped(container: HTMLElement, section: string, captured: string) {
  const wrappers = Array.from(container.querySelectorAll('[data-metric-group]'));
  expect(wrappers.map((w) => w.getAttribute('data-metric-group-label'))).toEqual(['Speed', 'Power']);
  expect(wrappers.every((w) => w.getAttribute('data-metric-section') === section)).toBe(true);
  const headings = Array.from(container.querySelectorAll('h4'));
  expect(headings.map((h) => h.textContent)).toEqual(['Speed', 'Power']);
  for (const h of headings) expect(h.closest(captured)).toBeNull();
}

describe('metric group headings in chart sections', () => {
  it('TrendSection', () => {
    const { container } = render(<TrendSection trends={{ A: trend, B: trend } as any} metricGroups={metricGroups} />);
    expectGrouped(container, 'trends', '[data-chart-metric]');
  });

  it('TeamTrendSection', () => {
    const { container } = render(<TeamTrendSection trends={{ A: teamTrend, B: teamTrend } as any} metricGroups={metricGroups} />);
    expectGrouped(container, 'team-trends', '[data-chart-metric]');
  });

  it('DistributionSection', () => {
    const { container } = render(
      <DistributionSection athleteName="Sam" distributions={{ A: dist, B: dist } as any} metricGroups={metricGroups} />,
    );
    expectGrouped(container, 'distribution', '[data-report-chart^="dist:"]');
  });

  it('LeaderboardBarSection', () => {
    const rankings = [{ userId: 'u1', userName: 'A', measurements: { A: 1, B: 2 } }, { userId: 'u2', userName: 'B', measurements: { A: 2, B: 3 } }];
    const stat = (metric: string) => ({ metric, units: 's', average: 1, median: 1, min: 1, max: 2, standardDeviation: 0, topPerformer: null });
    const { container } = render(
      <LeaderboardBarSection
        athleteRankings={rankings as any}
        teamStatistics={[stat('A'), stat('B')] as any}
        generatedAt="2024-01-01"
        metricGroups={metricGroups}
      />,
    );
    expectGrouped(container, 'leaderboard', '[data-report-chart^="leaderboard:"]');
  });
});
