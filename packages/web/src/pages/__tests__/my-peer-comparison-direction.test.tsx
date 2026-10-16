import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', athleteId: 'a1' }, isLoading: false, organizationContext: null }),
}));
vi.mock('@/hooks/useAthleteContext', () => ({ useAthleteContext: () => ({ athleteId: 'a1', isLoading: false }) }));
vi.mock('@/hooks/useAthleteDashboardData', () => ({
  useAthleteDashboardData: () => ({ data: { availableMetrics: ['MILE_RUN', 'FLY10_TIME'] }, isLoading: false }),
}));
vi.mock('@/hooks/useAthleteProfile', () => ({ useAthleteProfile: () => ({ data: null }) }));
vi.mock('@/hooks/usePeerComparison', () => ({
  usePeerComparisonStatus: () => ({ data: { optedIn: true }, isLoading: false }),
  usePeerPercentiles: () => ({
    data: { percentiles: [{ metric: 'MILE_RUN', percentile: 80 }, { metric: 'FLY10_TIME', percentile: 60 }] },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));
vi.mock('@/hooks/useAthleteMetricExplanations', () => ({ useAthleteMetricExplanations: () => ({ explanations: {} }) }));
// MILE_RUN is not in the hard-coded lower-is-better list: only its type says lower is better
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ labels: {}, getLabel: (c: string) => c, formats: {}, types: { MILE_RUN: 'lower_is_better' }, isLoading: false }),
}));
vi.mock('@/components/athlete/PeerComparisonFilters', () => ({ PeerComparisonFilters: () => null }));
vi.mock('@/components/athlete/PeerMetricCard', () => ({
  PeerMetricCard: ({ result, lowerIsBetter }: { result: { metric: string }; lowerIsBetter?: boolean }) => (
    <div data-testid={`card-${result.metric}`}>{lowerIsBetter ? 'lower' : 'higher'}</div>
  ),
}));

import MyPeerComparisonPage from '../my-peer-comparison';

describe('MyPeerComparisonPage: metric direction', () => {
  it('takes lower-is-better from the metric list for a metric outside the built-in list', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MyPeerComparisonPage />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('card-MILE_RUN')).toHaveTextContent('lower');
    expect(screen.getByTestId('card-FLY10_TIME')).toHaveTextContent('lower');
  });
});
