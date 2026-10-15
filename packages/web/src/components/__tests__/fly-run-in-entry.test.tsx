/**
 * AM-FEAT-017: the run-in is part of the metric code, so entry forms no longer
 * show a free-form fly-in distance field and never send flyInDistance.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
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

const m = (code: string, label: string) => ({ code, label, unit: 's', metricType: 'lower_is_better', lowerIsBetter: true });
const METRICS = [
  m('FLY10_TIME_RI5', '10-Yard Fly, 5 yd run-in'),
  m('FLY10_TIME_RI10', '10-Yard Fly, 10 yd run-in'),
  m('FLY10_TIME_RI15', '10-Yard Fly, 15 yd run-in'),
  m('FLY10_TIME', '10-Yard Fly, 20 yd run-in'),
  m('FLY10_TIME_RI30', '10-Yard Fly, 30 yd run-in'),
];
// Deliberately shuffled; the mock applies the hook's real comparator, as the hook does.
const SHUFFLED = [METRICS[3], METRICS[0], METRICS[4], METRICS[2], METRICS[1]];
vi.mock('@/hooks/use-available-metrics', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-available-metrics')>('@/hooks/use-available-metrics');
  return {
    useAvailableMetrics: () => ({
      metrics: [...SHUFFLED].sort(actual.compareMetricLabels),
      isLoading: false,
      error: null,
    }),
  };
});

import AthleteMeasurementForm from '../athlete-measurement-form';
import MeasurementForm from '../measurement-form';

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

const renderForm = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AthleteMeasurementForm athleteId="ath-1" athleteName="Jordan Lee" />
    </QueryClientProvider>
  );

describe('AthleteMeasurementForm FLY10 run-in variants', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ json: async () => ({}) });
  });

  it('shows no fly-in distance field for FLY10_TIME or any variant', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.queryByTestId('input-fly-in-distance')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('select-measurement-metric'));
    await user.click(await screen.findByRole('option', { name: '10-Yard Fly, 10 yd run-in' }));
    expect(screen.queryByTestId('input-fly-in-distance')).not.toBeInTheDocument();
  });

  it('lists the five variants with their run-in in the label', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByTestId('select-measurement-metric'));
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual([5, 10, 15, 20, 30].map((yd) => `10-Yard Fly, ${yd} yd run-in`));
  });

  it('submits without a flyInDistance key', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByTestId('select-measurement-metric'));
    await user.click(await screen.findByRole('option', { name: '10-Yard Fly, 10 yd run-in' }));
    await user.type(screen.getByTestId('input-measurement-value'), '1.4');
    fireEvent.submit(screen.getByTestId('button-save-measurement').closest('form')!);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = apiRequest.mock.calls[0];
    expect(url).toBe('/api/measurements');
    expect(body.metric).toBe('FLY10_TIME_RI10');
    expect(body).not.toHaveProperty('flyInDistance');
  });
});

describe('MeasurementForm (coach) FLY10 run-in variants', () => {
  it('shows no fly-in distance field for the default FLY10_TIME or a variant', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MeasurementForm />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('metric-select')).toBeInTheDocument();
    expect(screen.queryByTestId('input-fly-in-distance')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('metric-select'));
    await user.click(await screen.findByRole('option', { name: '10-Yard Fly, 15 yd run-in' }));
    expect(screen.queryByTestId('input-fly-in-distance')).not.toBeInTheDocument();
  });
});
