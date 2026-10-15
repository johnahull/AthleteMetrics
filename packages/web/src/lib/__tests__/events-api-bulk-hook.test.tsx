/**
 * useCreateEventMeasurementsBulk: which queries a successful request invalidates
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateEventMeasurementsBulk } from '../events-api';

const setup = () => {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useCreateEventMeasurementsBulk(), { wrapper });
  return { result, invalidatedKeys: () => invalidate.mock.calls.map(([filters]) => (filters as any).queryKey) };
};

describe('useCreateEventMeasurementsBulk', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = () =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ created: [], replaced: [], errors: [] }), { status: 200 })));

  it('invalidates the event measurements and results by default', async () => {
    stubFetch();
    const { result, invalidatedKeys } = setup();
    await act(() => result.current.mutateAsync({ eventId: 'ev-1', measurements: [] }));
    expect(invalidatedKeys()).toEqual([
      ['events', 'ev-1', 'measurements'],
      ['events', 'ev-1', 'results'],
    ]);
  });

  it('leaves the measurements to the caller with invalidateMeasurements: false', async () => {
    stubFetch();
    const { result, invalidatedKeys } = setup();
    await act(() => result.current.mutateAsync({ eventId: 'ev-1', measurements: [], invalidateMeasurements: false }));
    expect(invalidatedKeys()).toEqual([['events', 'ev-1', 'results']]);
  });
});
