import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BenchmarkCard } from '../BenchmarkCard';

vi.mock('@/lib/benchmarks-api', () => ({
  useToggleSiteBenchmarkStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSiteBenchmark: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ labels: {}, getLabel: (c: string) => c, formats: {}, isLoading: false }),
}));
vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({
    getMetricConfig: () => ({ label: 'Mile', unit: 's', metricType: 'lower_is_better', lowerIsBetter: true, displayFormat: 'duration', decimalPrecision: 1 }),
    isLoaded: true,
    metricsMap: {},
  }),
}));

describe('BenchmarkCard: duration (mm:ss) metric', () => {
  it('shows the target value as m:ss without the seconds unit', () => {
    const benchmark = {
      id: 'b1', name: 'Varsity Mile', metricCode: 'MILE_RUN', benchmarkValue: '390.000', comparisonOperator: 'lte', isActive: true,
    } as any;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BenchmarkCard benchmark={benchmark} onEdit={vi.fn()} />
      </QueryClientProvider>
    );
    expect(screen.getByText('6:30.0')).toBeInTheDocument();
  });
});
