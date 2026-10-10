/**
 * Issue #579: a derived metric with a calculated preview value is computed automatically
 * from its source measurements, so the coach form must not post a row for it (a posted
 * copy is stored as a direct entry and blocks recalculation). Override still posts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
      { code: 'MOMENTUM', label: 'Momentum', unit: 'kg*m/s', metricType: 'higher_is_better', isDerived: true },
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

const PREVIEW = {
  calculatedValue: 478.5,
  sourceMetrics: [{ code: 'FLY10_TIME', label: '10-Yard Fly', value: 1.3, unit: 's', measurementId: 'm-1' }],
  sourceMeasurementIds: ['m-1'],
  formula: 'weight_lbs * 0.45359237 * 9.144 / fly10_time',
};

const renderWithPreview = async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MeasurementForm />
    </QueryClientProvider>
  );
  await user.click(screen.getByTestId('pick-athlete'));
  // The form defaults to FLY10_TIME, which is not in the metric list: pick the derived metric
  await user.click(screen.getByTestId('metric-select'));
  await user.click(await screen.findByRole('option', { name: 'Momentum' }));
  await screen.findByText(/Calculated value:/);
  return user;
};

describe('MeasurementForm derived-metric preview (#579)', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ json: async () => ({}) });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).startsWith('/api/measurements/calculate-preview') ? PREVIEW : []),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not post a row for the calculated value and says it is computed automatically', async () => {
    const user = await renderWithPreview();
    // A value typed during an earlier override must not turn into a posted copy
    await user.click(screen.getByLabelText('Override with direct measurement'));
    await user.type(screen.getByTestId('measurement-value'), '500');
    await user.click(screen.getByLabelText('Override with direct measurement'));

    expect(screen.getByTestId('derived-auto-calculated')).toHaveTextContent(
      /calculated automatically from the source measurements/i
    );
    expect(screen.getByTestId('submit-measurement')).toBeDisabled();

    fireEvent.submit(screen.getByTestId('submit-measurement').closest('form')!);
    await new Promise((r) => setTimeout(r, 50));
    expect(apiRequest).not.toHaveBeenCalledWith('POST', '/api/measurements', expect.anything());
  });

  it('still posts a direct measurement when Override is checked', async () => {
    const user = await renderWithPreview();
    await user.click(screen.getByLabelText('Override with direct measurement'));
    await user.type(screen.getByTestId('measurement-value'), '500');

    expect(screen.queryByTestId('derived-auto-calculated')).not.toBeInTheDocument();
    fireEvent.submit(screen.getByTestId('submit-measurement').closest('form')!);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/measurements', expect.anything()));
    const body = apiRequest.mock.calls.find((c) => c[1] === '/api/measurements')![2];
    expect(body).toMatchObject({ metric: 'MOMENTUM', value: 500, userId: 'ath-1' });
    expect(body).not.toHaveProperty('isCalculated');
  });
});
