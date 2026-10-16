/**
 * Coach measurement form: a time (mm:ss) metric is typed as 6:42.5 and posted as seconds;
 * a decimal metric keeps the number input.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'coach-1', role: 'coach' } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const apiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a) }));
vi.mock('@/components/measurement/LastSetContextLine', () => ({ LastSetContextLine: () => null }));
vi.mock('@/components/ui/athlete-selector', () => ({
  AthleteSelector: ({ onSelect }: { onSelect: (a: unknown) => void }) => (
    <button type="button" data-testid="pick-athlete" onClick={() => onSelect({ id: 'ath-1', fullName: 'Jordan Lee', birthYear: 2008 })}>
      pick
    </button>
  ),
}));
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

import MeasurementForm from '../measurement-form';

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

const renderForm = async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MeasurementForm />
    </QueryClientProvider>
  );
  await user.click(screen.getByTestId('pick-athlete'));
  return user;
};

describe('MeasurementForm: time (mm:ss) metrics', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ json: async () => ({}) });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts 6:42.5 as 402.5 seconds', async () => {
    const user = await renderForm();
    await user.click(screen.getByTestId('metric-select'));
    await user.click(await screen.findByRole('option', { name: /Mile Run/ }));
    const input = screen.getByTestId('measurement-value');
    expect(input).toHaveAttribute('type', 'text');
    await user.type(input, '6:42.5');
    await user.click(screen.getByTestId('submit-measurement'));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('POST', '/api/measurements', expect.objectContaining({ value: 402.5 }))
    );
  });

  it('keeps the number input for a decimal metric', async () => {
    await renderForm();
    expect(screen.getByTestId('measurement-value')).toHaveAttribute('type', 'number');
  });
});
