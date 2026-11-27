/**
 * Athlete metric cards state which direction is better. The label comes only
 * from the metric's configured type: tracking and unknown types show nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { MetricType } from '@shared/analytics-types';
import { MetricProgressCard } from '../MetricProgressCard';
import { PeerMetricCard } from '../PeerMetricCard';

const metricTypes = vi.hoisted(() => ({ current: {} as Record<string, string> }));

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('react-chartjs-2', () => ({ Line: () => null }));
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({
    labels: {},
    getLabel: (code: string) => code,
    getUnit: () => 's',
    formats: {},
    types: metricTypes.current,
    isLoading: false,
  }),
}));
vi.mock('@/hooks/usePeerComparison', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePeerComparison')>()),
  usePeerDistribution: () => ({ data: undefined, isLoading: false }),
}));

// FLY10_TIME is a built-in time code, so a guess from the code would say "Lower is better"
const CODE = 'FLY10_TIME';

const progressCard = (measurements: Array<{ value: number; date: string }>) =>
  (metricType?: MetricType) => (
    <MetricProgressCard
      metric={CODE}
      displayName="Fly 10"
      measurements={measurements}
      units="s"
      metricType={metricType}
    />
  );

const peerCard = (percentile: number) => (metricType?: MetricType) => {
  metricTypes.current = metricType ? { [CODE]: metricType } : {};
  return (
    <PeerMetricCard result={{ metric: CODE, athleteValue: 1.15, percentile, sampleSize: 40 } as any} />
  );
};

const CARDS = [
  ['progress card', progressCard([{ value: 1.15, date: '2026-01-10' }])],
  ['progress card with no measurements', progressCard([])],
  ['peer card', peerCard(80)],
  ['peer card without enough peers', peerCard(-1)],
] as const;

describe.each(CARDS)('metric direction label: %s', (_name, card) => {
  beforeEach(() => {
    metricTypes.current = {};
  });

  it.each([
    ['lower_is_better', 'Lower is better'],
    ['higher_is_better', 'Higher is better'],
  ] as const)('shows the direction for %s', (metricType, text) => {
    render(card(metricType));
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it.each([['tracking' as const], [undefined]])('shows no direction for %s', (metricType) => {
    render(card(metricType));
    expect(screen.queryByText(/(lower|higher) is better/i)).not.toBeInTheDocument();
  });
});
