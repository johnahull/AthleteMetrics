import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MetricFormDialog from '../metric-form-dialog';

const update = vi.fn().mockResolvedValue({});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/metrics-api', () => ({
  useCreateSiteMetric: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSiteMetric: () => ({ mutateAsync: update, isPending: false }),
}));

const metric: any = {
  code: 'DASH_10YD', label: '10-yd dash', metricType: 'lower_is_better', isActive: true, decimalPrecision: 3,
  displayFormat: 'decimal', isDerived: false, meaning: 'How fast he gets going.', availableOrgTypes: null, sportAssociations: null,
};

const renderDialog = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MetricFormDialog open onOpenChange={() => {}} metric={metric} />
    </QueryClientProvider>,
  );

describe('MetricFormDialog meaning field', () => {
  it('shows "Meaning for families" prefilled with help text, and sends the edited value', async () => {
    renderDialog();
    const box = screen.getByTestId('metric-meaning-input') as HTMLTextAreaElement;
    expect(screen.getByText('Meaning for families')).toBeInTheDocument();
    expect(screen.getByText(/Written for parents, no numbers, no medical claims/)).toBeInTheDocument();
    expect(box.value).toBe('How fast he gets going.');
    fireEvent.change(box, { target: { value: '  A quicker start helps every sprint.  ' } });
    fireEvent.click(screen.getByRole('button', { name: /update|save/i }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0].data.meaning).toBe('A quicker start helps every sprint.');
  });
});
