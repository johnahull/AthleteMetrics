import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Publish from '../publish';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', username: 'testuser', isSiteAdmin: true },
    isAuthenticated: true,
  }),
}));

vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: () => ({
    metrics: [
      { code: 'FLY10_TIME', label: 'Fly-10 Time', unit: 's', metricType: 'lower_is_better' },
      { code: 'BODY_WEIGHT', label: 'Body Weight', unit: 'lbs', metricType: 'tracking' },
      { code: 'MQI_TOTAL', label: 'MQI Total', unit: '', metricType: 'higher_is_better' },
      { code: 'CUSTOM_JUMP', label: 'Custom Jump', unit: 'in', metricType: 'higher_is_better', isCustom: true },
    ],
    isLoading: false,
  }),
}));

describe('Publish page metric picker (issue #805)', () => {
  it('offers only metrics athletes can be ranked on', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as any;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Publish />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('select-metric'));

    expect(await screen.findByRole('option', { name: 'Fly-10 Time' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Custom Jump' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Body Weight' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'MQI Total' })).not.toBeInTheDocument();
  });
});
