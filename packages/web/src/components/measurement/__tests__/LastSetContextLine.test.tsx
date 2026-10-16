import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { LastSetContextLine } from '../LastSetContextLine';
import type { AvailableMetric } from '@/hooks/use-available-metrics';

function Harness({ metric }: { metric: AvailableMetric }) {
  const form = useForm({ defaultValues: { value: undefined } });
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FormProvider {...form}>
        <LastSetContextLine athleteId="ath-1" metric={metric} />
      </FormProvider>
    </QueryClientProvider>
  );
}

const metric = (over: Partial<AvailableMetric>): AvailableMetric => ({
  code: 'MILE_RUN', label: 'Mile Run', unit: 's', metricType: 'lower_is_better', lowerIsBetter: true, ...over,
});

describe('LastSetContextLine', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        measurements: [{ id: 'm1', date: '2024-01-15', value: '402.500', units: 's', auxiliaryValue: null, isCalculated: false, calculationMetadata: null }],
      }),
    }) as any;
  });

  it('shows the last value of a duration metric as m:ss', async () => {
    render(<Harness metric={metric({ displayFormat: 'duration', decimalPrecision: 1 })} />);
    expect(await screen.findByText('6:42.5')).toBeInTheDocument();
  });

  it('keeps a decimal metric as value and unit', async () => {
    render(<Harness metric={metric({ displayFormat: 'decimal' })} />);
    expect(await screen.findByText('402.50 s')).toBeInTheDocument();
  });
});
