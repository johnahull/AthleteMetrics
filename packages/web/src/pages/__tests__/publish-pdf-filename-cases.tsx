/**
 * Shared cases: with no "date from" filter, the results PDF is named after the
 * viewer's LOCAL day. Imported by per-timezone test files.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Publish from '../publish';

const save = vi.fn();
vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    setFontSize: vi.fn(),
    text: vi.fn(),
    addPage: vi.fn(),
    save,
  })),
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'u', isSiteAdmin: true }, isAuthenticated: true }),
}));
vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({ getMetricConfig: (code: string) => ({ code, label: code, unit: 's', category: 'Speed', displayOrder: 1 }) }),
}));
vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: () => ({ metrics: [{ code: 'DASH_40YD', label: '40-Yard Dash', unit: 's', category: 'Speed' }], isLoading: false }),
}));

const measurement = {
  id: 'm1', value: '4.50', date: '2026-03-01', metric: 'DASH_40YD',
  user: { id: 'a1', fullName: 'John Doe', birthYear: 2005, gender: 'Male', sports: ['Football'], teams: [] },
};

export function describePublishPdfFilenameCases(zone: string, now: string, today: string) {
  describe(`results PDF filename uses the local day (${zone}, ${now})`, () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(now));
      global.fetch = vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (String(url).includes('/api/measurements') ? [measurement] : []),
      })) as any;
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('names the PDF after the local day', async () => {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (await fetch(String(queryKey[0]))).json() } },
      });
      render(<QueryClientProvider client={qc}><Publish /></QueryClientProvider>);
      fireEvent.click(screen.getByTestId('select-metric'));
      fireEvent.click(await screen.findByRole('option', { name: '40-Yard Dash' }));
      await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('export-pdf-button'));
      expect(save).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`_${today}\\.pdf$`)));
    });
  });
}
