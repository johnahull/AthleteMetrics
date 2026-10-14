/**
 * Component tests for TeamAthletesModal bulk add / bulk remove.
 * One request per bulk operation, and an all-failed result takes the error path.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TeamAthletesModal from '../TeamAthletesModal';
import type { Team } from '@shared/schema';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ organizationContext: 'org-1', userOrganizations: [], user: { id: 'coach-1' } }),
}));

vi.mock('@/hooks/useContextualLabels', () => ({
  useContextualLabels: () => ({ team: 'Team', athlete: 'Athlete' }),
}));

const team = { id: 'team-1', name: 'Test Team', organizationId: 'org-1' } as Team;
const athletes = [
  { id: 'a1', firstName: 'Ann', lastName: 'One', fullName: 'Ann One', teamMemberships: [] },
  { id: 'a2', firstName: 'Bob', lastName: 'Two', fullName: 'Bob Two', teamMemberships: [] },
];

const jsonResponse = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe('TeamAthletesModal bulk operations', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    vi.clearAllMocks();
    // Both list queries use fetch: /api/athletes (current team) and /api/users (available)
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ athletes, users: athletes, total: 2 })));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const renderModal = (defaultTab: 'current' | 'add') =>
    render(
      <QueryClientProvider client={queryClient}>
        <TeamAthletesModal isOpen onClose={vi.fn()} team={team} defaultTab={defaultTab} />
      </QueryClientProvider>,
    );

  const addBoth = async () => {
    renderModal('add');
    fireEvent.click(await screen.findByText('Select All Available'));
    fireEvent.click(await screen.findByText(/Add 2 Athletes/));
  };

  const removeBoth = async () => {
    renderModal('current');
    fireEvent.click(await screen.findByText('Select All (2)'));
    fireEvent.click(await screen.findByText(/Remove 2 Athletes/));
  };

  it('adds all selected athletes with one POST to /api/teams/:id/add-athletes', async () => {
    mockApiRequest.mockResolvedValue(jsonResponse({ success: 2, errorCount: 0, errors: [] }));
    await addBoth();

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' })));
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/teams/team-1/add-athletes', { athleteIds: ['a1', 'a2'] });
  });

  it('shows a destructive toast with the server message when every add fails', async () => {
    mockApiRequest.mockResolvedValue(
      jsonResponse({ success: 0, errorCount: 2, errors: [{ athleteId: 'a1', message: 'Access denied - user does not belong to your organization' }] }),
    );
    await addBoth();

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', description: 'Access denied - user does not belong to your organization' }),
      ),
    );
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' }));
  });

  it('removes all selected athletes with one POST to /api/teams/:id/remove-athletes', async () => {
    mockApiRequest.mockResolvedValue(jsonResponse({ success: 2, errorCount: 0, errors: [] }));
    await removeBoth();

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' })));
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/teams/team-1/remove-athletes', { athleteIds: ['a1', 'a2'] });
  });

  it('removes a single athlete with DELETE /api/teams/:id/members/:userId', async () => {
    mockApiRequest.mockResolvedValue(jsonResponse({ message: 'Member removed from team successfully' }));
    renderModal('current');
    fireEvent.click(await screen.findByLabelText('Remove Ann One from team'));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(1));
    expect(mockApiRequest).toHaveBeenCalledWith('DELETE', '/api/teams/team-1/members/a1');
  });

  it('takes the error path and restores the selection when every remove fails', async () => {
    mockApiRequest.mockResolvedValue(jsonResponse({ success: 0, errorCount: 2, errors: [{ athleteId: 'a1', message: 'Remove failed' }] }));
    await removeBoth();

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'Remove failed' })),
    );
    // Selection restored by onError, so the bulk remove button is back
    expect(await screen.findByText(/Remove 2 Athletes/)).toBeInTheDocument();
  });

  const partial = (message: string) =>
    jsonResponse({ success: 1, errorCount: 1, errors: [{ athleteId: 'a2', message }] });

  it('on a partial add, names the failure and keeps only the failed athlete selected', async () => {
    mockApiRequest.mockResolvedValue(partial('Access denied - user does not belong to your organization'));
    await addBoth();

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Partial Success',
          description: expect.stringMatching(/1 failed.*Access denied - user does not belong to your organization/),
        }),
      ),
    );
    expect(await screen.findByText(/Add 1 Athlete$/)).toBeInTheDocument();
  });

  it('on a partial remove, names the failure and keeps only the failed athlete selected', async () => {
    mockApiRequest.mockResolvedValue(partial('Remove failed'));
    await removeBoth();

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Partial Success', description: expect.stringMatching(/1 failed.*Remove failed/) }),
      ),
    );
    expect(await screen.findByText(/Remove 1 Athlete$/)).toBeInTheDocument();
  });
});
