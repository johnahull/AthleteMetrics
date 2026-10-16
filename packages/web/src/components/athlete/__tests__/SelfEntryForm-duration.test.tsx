/**
 * SelfEntryForm: a time (mm:ss) metric is typed as 6:42.5 and submitted as seconds.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelfEntryForm } from '../SelfEntryForm';

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

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

describe('SelfEntryForm: time (mm:ss) metrics', () => {
  it('submits 6:42.5 as 402.5 seconds', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SelfEntryForm onSubmit={onSubmit} onCancel={() => {}} />);
    await user.click(screen.getByRole('combobox', { name: /metric/i }));
    await user.click(await screen.findByRole('option', { name: /Mile Run/ }));
    const input = screen.getByLabelText(/value/i);
    expect(input).toHaveAttribute('type', 'text');
    await user.type(input, '6:42.5');
    await user.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ metric: 'MILE_RUN', value: 402.5 })));
  });
});
