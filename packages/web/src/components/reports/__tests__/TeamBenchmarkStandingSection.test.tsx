import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TeamBenchmarkStandingSection } from '../TeamBenchmarkStandingSection';
import type { TeamStatistic } from '@/types/report-types';

// Direction now comes from the `metricDirections` prop (server-computed),
// not a client hook — this component must work identically for an
// authenticated coach and an anonymous public viewer, since it renders on
// both. No QueryClientProvider/mock needed as a result.

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
    render(
      <TeamBenchmarkStandingSection
        teamStatistics={[tieredStat]}
        metricLabels={{ VJ: 'Vertical Jump' }}
        metricDirections={{ VJ: 'higher' }}
      />
    );
    expect(screen.getByText('Team Benchmark Standing')).toBeInTheDocument();
    expect(document.querySelector('[data-report-chart="tier:VJ"]')).toBeTruthy();
  });

  it('renders a benchmark-standing-bar row for a single-value benchmark', () => {
    render(<TeamBenchmarkStandingSection teamStatistics={[singleValueStat]} metricLabels={{ FLY: 'Fly 10' }} />);
    expect(document.querySelector('[data-report-chart^="bench:FLY:"]')).toBeTruthy();
  });

  it('renders correctly with no metricDirections prop at all (public-view safety: no auth-dependent hook)', () => {
    // Regression: this component previously derived direction via
    // useMetricConfig(), which requires authenticated org context and is
    // unavailable on the public/anonymous report view. It must now render
    // from props alone, defaulting to higher-is-better when direction is
    // unknown rather than throwing or requiring a provider.
    render(<TeamBenchmarkStandingSection teamStatistics={[tieredStat]} metricLabels={{ VJ: 'Vertical Jump' }} />);
    expect(document.querySelector('[data-report-chart="tier:VJ"]')).toBeTruthy();
  });

  it('threads a lower-is-better direction through to the correct tier standing', () => {
    // A lower-is-better tier group (best = lowest band). A team average of
    // 1.90 is worse than every band; with lower-is-better correctly applied
    // it must land on the worst tier (JV), not the best (Elite) — the exact
    // bug this prop threading fixes.
    const lowerIsBetterStat: TeamStatistic = {
      metric: 'FLY10_TIME',
      units: 's',
      average: 1.90,
      median: 1.90,
      min: 1.0,
      max: 2.0,
      standardDeviation: 0.1,
      topPerformer: null,
      benchmarks: [
        { name: 'Sprint - Elite', value: null, minValue: 1.00, maxValue: 1.20, tierName: 'Elite', tierColor: '#fbbf24', tierGroupId: 'g2', tierOrder: 1 },
        { name: 'Sprint - Varsity', value: null, minValue: 1.20, maxValue: 1.50, tierName: 'Varsity', tierColor: '#86efac', tierGroupId: 'g2', tierOrder: 2 },
        { name: 'Sprint - JV', value: null, minValue: 1.50, maxValue: 1.60, tierName: 'JV', tierColor: '#fde68a', tierGroupId: 'g2', tierOrder: 3 },
      ],
    };
    render(
      <TeamBenchmarkStandingSection
        teamStatistics={[lowerIsBetterStat]}
        metricLabels={{ FLY10_TIME: 'Sprint' }}
        metricDirections={{ FLY10_TIME: 'lower' }}
      />
    );
    // The tier bar always renders all three segment labels (JV/Varsity/Elite)
    // regardless of which matched — the caption line names the MATCHED tier
    // specifically, which is what actually proves direction was applied
    // correctly (JV, the worst tier, not Elite, the best).
    expect(screen.getByText(/· JV ·/)).toBeInTheDocument();
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
