import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeerMetricCard } from '../PeerMetricCard';

vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({
    labels: {},
    getLabel: (code: string) => code,
    getUnit: (code: string) => (code === 'FLY10_TIME' ? 's' : ''),
    formats: {},
    isLoading: false,
  }),
}));

vi.mock('@/hooks/usePeerComparison', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePeerComparison')>()),
  usePeerDistribution: () => ({ data: undefined, isLoading: false }),
}));

describe('PeerMetricCard units', () => {
  it('shows the metric unit next to the athlete value', () => {
    render(
      <PeerMetricCard
        result={{ metric: 'FLY10_TIME', athleteValue: 1.15, percentile: 80, sampleSize: 40 } as any}
      />,
    );
    expect(screen.getByText('1.15 s')).toBeInTheDocument();
  });
});
