/**
 * AM-FEAT-015 R2: athletes cannot enter Movement Quality scores (the API answers
 * 403), so the athlete self-entry form must not offer MQ metrics to an athlete.
 * Coaches opening the same form (athlete profile) still see them.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let authState: { user: { id: string; role: string } };

vi.mock('@/lib/auth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('@/components/measurement/LastSetContextLine', () => ({
  LastSetContextLine: () => null,
}));

const METRICS = [
  { code: 'FLY10_TIME', label: '10-Yard Fly', unit: 's', metricType: 'lower_is_better', lowerIsBetter: true },
  { code: 'MQ_JUMP', label: 'MQ Jump', unit: 'score', metricType: 'higher_is_better', lowerIsBetter: false },
  { code: 'MQI_TOTAL', label: 'MQI Total', unit: 'score', metricType: 'higher_is_better', lowerIsBetter: false },
];

vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: () => ({ metrics: METRICS, isLoading: false, error: null }),
}));

import AthleteMeasurementForm from '../athlete-measurement-form';

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

const openMetricOptions = async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AthleteMeasurementForm athleteId="ath-1" athleteName="Jordan Lee" />
    </QueryClientProvider>
  );
  await user.click(screen.getByTestId('select-measurement-metric'));
  return (await screen.findAllByRole('option')).map((o) => o.textContent);
};

describe('AthleteMeasurementForm Movement Quality metrics', () => {
  beforeEach(() => {
    authState = { user: { id: 'ath-1', role: 'athlete' } };
  });

  it('does not offer MQ metrics to an athlete', async () => {
    const options = await openMetricOptions();
    expect(options).toContain('10-Yard Fly');
    expect(options).not.toContain('MQ Jump');
    expect(options).not.toContain('MQI Total');
  });

  it('still offers MQ metrics to a coach', async () => {
    authState = { user: { id: 'coach-1', role: 'coach' } };
    const options = await openMetricOptions();
    expect(options).toEqual(expect.arrayContaining(['10-Yard Fly', 'MQ Jump']));
  });
});
