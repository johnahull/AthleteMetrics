import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const captured: { options?: any } = {};
vi.mock('react-chartjs-2', () => ({
  Line: ({ options }: any) => { captured.options = options; return <div data-testid="line" />; },
}));
vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: () => ({
    metrics: [{ code: 'MILE_RUN', label: 'Mile Run', unit: 's', metricType: 'lower_is_better', lowerIsBetter: true, displayFormat: 'duration', decimalPrecision: 1 }],
    isLoading: false,
    error: null,
  }),
}));

import { DashboardTrendsChart } from '../DashboardTrendsChart';

describe('DashboardTrendsChart: duration (mm:ss) metric', () => {
  it('labels the value axis and tooltip as m:ss', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ weeks: ['2026-09-28', '2026-10-05'], metrics: { MILE_RUN: [410, 402.5] } }),
    }) as any;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DashboardTrendsChart organizationId="org-1" />
      </QueryClientProvider>
    );
    await waitFor(() => expect(captured.options).toBeDefined());
    expect(captured.options.scales.y0.ticks.callback(420)).toBe('7:00');
    const label = captured.options.plugins.tooltip.callbacks.label({ datasetIndex: 0, dataset: { label: 'Mile Run' }, parsed: { y: 402.5 } });
    expect(label).toBe('Mile Run: 6:42.5');
  });
});
