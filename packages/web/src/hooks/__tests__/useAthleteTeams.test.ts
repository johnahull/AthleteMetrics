import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAthleteTeams } from '../useAthleteTeams';

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'a1' } }) }));
vi.mock('@/lib/athlete-utils', () => ({ getAthleteUserId: () => 'a1' }));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function run() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useAthleteTeams(), { wrapper });
}

describe('useAthleteTeams profile context', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns gender and sports from the athlete response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ teams: [{ id: 't1', name: 'T', organization: { id: 'o1' } }], gender: 'Female', sports: ['Soccer'] }),
    });
    const { result } = run();
    await waitFor(() => expect(result.current.teamIds).toEqual(['t1']));
    expect(result.current.gender).toBe('Female');
    expect(result.current.sports).toEqual(['Soccer']);
  });

  it('falls back to undefined gender and empty sports', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ teams: [], gender: null }) });
    const { result } = run();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.gender).toBeUndefined();
    expect(result.current.sports).toEqual([]);
  });
});
