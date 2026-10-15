/**
 * Athletes page: "Remove from team" (shown when the list is filtered to one team)
 * must call the real route, DELETE /api/teams/:id/members/:userId.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Athletes from '../athletes';

vi.mock('wouter', () => ({
  useLocation: () => ['/athletes', vi.fn()],
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', isSiteAdmin: true },
    organizationContext: 'test-org-id',
    userOrganizations: [{ organizationId: 'test-org-id' }],
  }),
}));

vi.mock('@/components/athlete-modal', () => ({ default: () => null }));
vi.mock('@/components/invitation-modal', () => ({ InvitationModal: () => null }));

const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, apiRequest: (...args: any[]) => mockApiRequest(...args) };
});

const athletes = [
  {
    id: 'athlete-1',
    firstName: 'Alice',
    lastName: 'Anderson',
    fullName: 'Alice Anderson',
    birthYear: 2005,
    positions: [],
    sports: [],
    emails: [],
    isActive: true,
    teams: [{ id: 'team-1', name: 'Varsity Basketball' }],
  },
];

describe('Athletes page - remove from team', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    vi.clearAllMocks();
    window.history.pushState({}, '', '/athletes?teamId=team-1');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url.includes('/api/teams')
          ? [{ id: 'team-1', name: 'Varsity Basketball' }]
          : url.includes('/api/athletes')
            ? athletes
            : [];
        return { ok: true, json: async () => body } as Response;
      }),
    );
  });

  afterEach(() => {
    queryClient.clear();
    window.history.pushState({}, '', '/');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls DELETE /api/teams/:id/members/:userId', async () => {
    mockApiRequest.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(
      <QueryClientProvider client={queryClient}>
        <Athletes />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByTestId('button-remove-from-team-athlete-1'));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(1));
    expect(mockApiRequest).toHaveBeenCalledWith('DELETE', '/api/teams/team-1/members/athlete-1');
  });
});
