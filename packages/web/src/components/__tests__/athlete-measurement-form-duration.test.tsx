/**
 * Athlete measurement form: a time (mm:ss) metric is typed as 6:42.5 and posted as seconds.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'coach-1', role: 'coach' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
const apiRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ json: async () => ({}) }));
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
vi.mock('@/components/measurement/LastSetContextLine', () => ({ LastSetContextLine: () => null }));
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

import AthleteMeasurementForm from '../athlete-measurement-form';

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

describe('AthleteMeasurementForm: time (mm:ss) metrics', () => {
  it('posts 6:42.5 as 402.5 seconds', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AthleteMeasurementForm athleteId="ath-1" athleteName="Jordan Lee" />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('input-measurement-value')).toHaveAttribute('type', 'number');
    await user.click(screen.getByTestId('select-measurement-metric'));
    await user.click(await screen.findByRole('option', { name: /Mile Run/ }));
    const input = screen.getByTestId('input-measurement-value');
    expect(input).toHaveAttribute('type', 'text');
    await user.type(input, '6:42.5');
    await user.click(screen.getByTestId('button-save-measurement'));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('POST', '/api/measurements', expect.objectContaining({ value: 402.5 }))
    );
  });
});
