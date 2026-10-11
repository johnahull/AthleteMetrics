/**
 * deleteEvent / useDeleteEvent: the API answers 204 with no body, and a deleted event's own queries must not refetch
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { deleteEvent, useDeleteEvent } from '../events-api';

describe('deleteEvent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves on a 204 with an empty body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(deleteEvent('ev-1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/events/ev-1', { method: 'DELETE' });
  });

  it("rejects with the server's message on a 409", async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ message: 'Frozen event cannot be deleted' }), { status: 409 })));
    await expect(deleteEvent('ev-1')).rejects.toThrow('Frozen event cannot be deleted');
  });
});

describe('useDeleteEvent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("removes the deleted event's queries before invalidating the event lists", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    const queryClient = new QueryClient();
    const calls: string[] = [];
    const remove = vi.spyOn(queryClient, 'removeQueries').mockImplementation((filters: any) => {
      calls.push(`remove ${JSON.stringify(filters.queryKey)}`);
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async (filters: any) => {
      calls.push(`invalidate ${JSON.stringify(filters.queryKey)}`);
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeleteEvent(), { wrapper });

    await act(() => result.current.mutateAsync('ev-1'));

    expect(remove).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalled();
    expect(calls).toEqual(['remove ["events","ev-1"]', 'invalidate ["events"]']);
  });
});
