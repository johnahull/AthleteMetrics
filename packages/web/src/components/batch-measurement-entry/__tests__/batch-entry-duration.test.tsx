/**
 * Batch entry grid and card: a row with a time (mm:ss) metric takes 6:42.5 and stores seconds;
 * a decimal row keeps the number input.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, FormProvider, type UseFormReturn } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BatchEntryGrid } from '../batch-entry-grid';
import { BatchEntryCard } from '../batch-entry-card';

vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: () => ({
    metrics: [
      { code: 'FLY10_TIME', label: '10-Yard Fly', unit: 's', metricType: 'lower_is_better', lowerIsBetter: true, displayFormat: 'decimal' },
      { code: 'MILE_RUN', label: 'Mile Run', unit: 's', metricType: 'lower_is_better', lowerIsBetter: true, displayFormat: 'duration' },
    ],
    isLoading: false,
    error: null,
  }),
}));

const rows = [
  { athleteId: 'a1', date: '2026-10-01', metric: 'MILE_RUN', value: 0, notes: '' },
  { athleteId: 'a1', date: '2026-10-01', metric: 'FLY10_TIME', value: 0, notes: '' },
];

let form: UseFormReturn<any>;
function Harness({ view }: { view: 'grid' | 'card' }) {
  form = useForm({ defaultValues: { measurements: rows } });
  const fields = form.getValues('measurements').map((r: any, i: number) => ({ ...r, id: String(i) }));
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { enabled: false } } })}>
      <FormProvider {...form}>
        {view === 'grid'
          ? <BatchEntryGrid fields={fields} deleteRow={() => {}} />
          : <BatchEntryCard fields={fields} deleteRow={() => {}} />}
      </FormProvider>
    </QueryClientProvider>
  );
}

describe('batch entry: time (mm:ss) metrics', () => {
  it('grid: a duration row parses 6:42.5 to seconds; a decimal row stays numeric', async () => {
    render(<Harness view="grid" />);
    const user = userEvent.setup();
    const durationCell = screen.getByTestId('batch-value-0');
    expect(durationCell).toHaveAttribute('type', 'text');
    expect(screen.getByTestId('batch-value-1')).toHaveAttribute('type', 'number');
    await user.type(durationCell, '6:42.5');
    expect(form.getValues('measurements.0.value')).toBe(402.5);
  });

  it('card: a duration row parses 6:42.5 to seconds', async () => {
    render(<Harness view="card" />);
    const user = userEvent.setup();
    const input = screen.getByTestId('batch-card-value');
    expect(input).toHaveAttribute('type', 'text');
    await user.type(input, '6:42.5');
    expect(form.getValues('measurements.0.value')).toBe(402.5);
  });
});
