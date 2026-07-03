import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LeaderboardBarSection } from '../LeaderboardBarSection';
import type { AthleteRanking, TeamStatistic } from '@/types/report-types';

vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({
    getMetricConfig: (code: string) => ({
      label: code,
      unit: 's',
      metricType: 'lower_is_better',
      lowerIsBetter: true,
    }),
    isLoaded: true,
    metricsMap: {},
  }),
}));

vi.mock('react-chartjs-2', () => ({
  Bar: vi.fn(({ data }: any) => (
    <div data-testid="mock-bar">
      <div data-testid="bar-values">{data.datasets?.[0]?.data?.length ?? 0}</div>
    </div>
  )),
}));

const rankings: AthleteRanking[] = [
  { userId: 'u1', userName: 'A', measurements: { FLY: 1.3 } },
  { userId: 'u2', userName: 'B', measurements: { FLY: 1.5 } },
];

const stats: TeamStatistic[] = [
  { metric: 'FLY', units: 's', average: 1.4, median: 1.4, min: 1.3, max: 1.5, standardDeviation: 0.1, topPerformer: null },
];

describe('LeaderboardBarSection', () => {
  it('renders a ranked leaderboard bar chart per metric', () => {
    render(<LeaderboardBarSection athleteRankings={rankings} teamStatistics={stats} metricLabels={{ FLY: 'Fly 10' }} generatedAt="2024-01-01" />);
    expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    expect(screen.getByTestId('mock-bar')).toBeInTheDocument();
    expect(screen.getByTestId('bar-values')).toHaveTextContent('2');
    expect(document.querySelector('[data-report-chart="leaderboard:FLY"]')).toBeTruthy();
  });

  it('renders nothing when no athlete has a value for any configured metric', () => {
    const { container } = render(<LeaderboardBarSection athleteRankings={[]} teamStatistics={stats} generatedAt="2024-01-01" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('clips BarChart content to its fixed-height wrapper (regression: footer used to bleed into the next metric block)', () => {
    // BarChart's canvas used to render at 100% of its container's height via
    // `h-full`, with its Best/Average/Range footer added on top of that —
    // pushing the total content past the wrapper's fixed height with nothing
    // to clip it, so the footer visually overlapped whatever rendered next.
    render(<LeaderboardBarSection athleteRankings={rankings} teamStatistics={stats} metricLabels={{ FLY: 'Fly 10' }} generatedAt="2024-01-01" />);
    const wrapper = document.querySelector('[data-report-chart="leaderboard:FLY"]');
    expect(wrapper).toHaveClass('h-[420px]');
    // BarChart's own root (rendered for real here — only react-chartjs-2's
    // `Bar` is mocked) must clip its content to whatever height it's given.
    const barChartRoot = wrapper?.querySelector(':scope > div');
    expect(barChartRoot).toHaveClass('overflow-hidden');
  });
});
