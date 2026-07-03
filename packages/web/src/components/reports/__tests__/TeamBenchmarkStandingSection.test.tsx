import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TeamBenchmarkStandingSection } from '../TeamBenchmarkStandingSection';
import type { TeamStatistic } from '@/types/report-types';

// Mock useMetricConfig to avoid needing a QueryClientProvider; VJ fixtures
// below are a higher-is-better metric (Elite = highest tier band).
vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({
    getMetricConfig: (code: string) => ({
      label: code,
      unit: '',
      metricType: 'higher_is_better',
      lowerIsBetter: false,
    }),
    isLoaded: true,
    metricsMap: {},
  }),
}));

const tieredStat: TeamStatistic = {
  metric: 'VJ',
  units: 'in',
  average: 25,
  median: 25,
  min: 20,
  max: 30,
  standardDeviation: 2,
  topPerformer: null,
  benchmarks: [
    { name: 'VJ - JV', value: null, minValue: 20, maxValue: 24, tierName: 'JV', tierColor: '#fde68a', tierGroupId: 'g1', tierOrder: 3 },
    { name: 'VJ - Varsity', value: null, minValue: 24, maxValue: 28, tierName: 'Varsity', tierColor: '#86efac', tierGroupId: 'g1', tierOrder: 2 },
    { name: 'VJ - Elite', value: null, minValue: 28, maxValue: 32, tierName: 'Elite', tierColor: '#fbbf24', tierGroupId: 'g1', tierOrder: 1 },
  ],
};

const singleValueStat: TeamStatistic = {
  metric: 'FLY',
  units: 's',
  average: 1.3,
  median: 1.3,
  min: 1.1,
  max: 1.6,
  standardDeviation: 0.1,
  topPerformer: null,
  benchmarks: [{ name: 'Club Standard', value: 1.4, comparisonOperator: 'lte' }],
};

const emptyStat: TeamStatistic = {
  metric: 'X',
  average: null,
  median: null,
  min: null,
  max: null,
  standardDeviation: null,
  topPerformer: null,
};

describe('TeamBenchmarkStandingSection', () => {
  it('renders a tier-progress row for a tiered benchmark group (team average standing)', () => {
    render(<TeamBenchmarkStandingSection teamStatistics={[tieredStat]} metricLabels={{ VJ: 'Vertical Jump' }} />);
    expect(screen.getByText('Team Benchmark Standing')).toBeInTheDocument();
    expect(document.querySelector('[data-report-chart="tier:VJ"]')).toBeTruthy();
  });

  it('renders a benchmark-standing-bar row for a single-value benchmark', () => {
    render(<TeamBenchmarkStandingSection teamStatistics={[singleValueStat]} metricLabels={{ FLY: 'Fly 10' }} />);
    expect(document.querySelector('[data-report-chart^="bench:FLY:"]')).toBeTruthy();
  });

  it('renders nothing when no stat has an average or benchmarks', () => {
    const { container } = render(<TeamBenchmarkStandingSection teamStatistics={[emptyStat]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when teamStatistics is empty', () => {
    const { container } = render(<TeamBenchmarkStandingSection teamStatistics={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
