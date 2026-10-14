/**
 * AthleteModal create flow: after POST /api/athletes, each selected team gets one
 * POST /api/teams/:id/add-athletes. A per-athlete failure in a 200 response, or a
 * non-2xx (apiRequest throws), must show up as a team assignment warning.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AthleteModal from '../athlete-modal';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

// No organization context, so the modal skips its separate add-users call
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'coach-1' }, organizationContext: null }),
}));

vi.mock('@/hooks/useContextualLabels', () => ({
  useContextualLabels: () => ({ team: 'Team', teams: 'Teams', athlete: 'Athlete' }),
}));

vi.mock('@/lib/sports-api', () => ({
  useSports: () => ({ data: [], isLoading: false }),
  usePositionsForSports: () => ({ data: {}, isLoading: false }),
}));

const jsonResponse = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe('AthleteModal team assignment on create', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([{ id: 'team-1', name: 'Test Team' }])));
  });

  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  const createWithTeam = async (addAthletes: () => Promise<Response>) => {
    mockApiRequest.mockImplementation(async (_method: string, url: string) =>
      url === '/api/athletes' ? jsonResponse({ id: 'ath-1' }) : addAthletes(),
    );
    render(
      <QueryClientProvider client={queryClient}>
        <AthleteModal isOpen onClose={vi.fn()} athlete={null} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByTestId('input-athlete-firstname'), { target: { value: 'Ann' } });
    fireEvent.change(screen.getByTestId('input-athlete-lastname'), { target: { value: 'One' } });
    fireEvent.change(screen.getByTestId('input-athlete-birthdate'), { target: { value: '2010-01-01' } });
    fireEvent.click(screen.getByTestId('button-add-email'));
    fireEvent.change(await screen.findByTestId('input-email-0'), { target: { value: 'ann@test.com' } });
    fireEvent.click(await screen.findByTestId('checkbox-team-team-1'));
    fireEvent.click(screen.getByTestId('submit-athlete'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/teams/team-1/add-athletes', { athleteIds: ['ath-1'] });
    return mockToast.mock.calls[0][0];
  };

  it('warns when the add-athletes response reports a per-athlete failure', async () => {
    const toast = await createWithTeam(async () =>
      jsonResponse({ success: 0, errorCount: 1, errors: [{ athleteId: 'ath-1', message: 'x' }] }),
    );
    expect(toast.title).toBe('Athlete created with warnings');
    expect(toast.description).toContain('Team assignment failed: x');
  });

  it('warns when add-athletes answers with a non-2xx status', async () => {
    const toast = await createWithTeam(async () => {
      throw new Error('403: {"message":"Access denied"}');
    });
    expect(toast.title).toBe('Athlete created with warnings');
    expect(toast.description).toContain('Error adding athlete to team: 403: {"message":"Access denied"}');
  });

  it('reports plain success when the athlete was added to the team', async () => {
    const toast = await createWithTeam(async () => jsonResponse({ success: 1, errorCount: 0, errors: [] }));
    expect(toast.title).toBe('Success');
  });
});
