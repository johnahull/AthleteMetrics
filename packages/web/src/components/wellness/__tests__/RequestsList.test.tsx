/**
 * RequestsList compliance (AM-FEAT-027): a standing (anytime) request shows an "Anytime" badge and its
 * 7- and 28-day compliance from the completion-rate endpoint; one-time requests are unchanged.
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WellnessRequest } from '@shared/wellness-types';
import { apiRequest } from '@/lib/queryClient';
import RequestsList from '../RequestsList';

vi.mock('@/lib/queryClient', () => ({ apiRequest: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const baseRequest: WellnessRequest = {
  id: 'req-one',
  organizationId: 'org-1',
  templateId: 'template-1234567',
  requestedBy: 'coach-1',
  distributionMethod: 'athlete_account',
  targetAthleteIds: ['a-1', 'a-2'],
  targetTeamIds: null,
  publicToken: null,
  requiresAuth: true,
  scheduledFor: null,
  expiresAt: null,
  status: 'active',
  createdAt: new Date('2026-11-01T00:00:00Z'),
};

const window = (entryDays: number, totalPossibleDays: number, percentage: number) => ({
  possibleDays: totalPossibleDays,
  entryDays,
  totalPossibleDays,
  percentage,
  perAthlete: [{ userId: 'a-1', entryDays }],
});

function renderList(requests: WellnessRequest[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RequestsList requests={requests} organizationId="org-1" />
    </QueryClientProvider>
  );
}

describe('RequestsList compliance', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue({
      ok: true,
      json: async () => ({
        completed: 1,
        total: 1,
        percentage: 100,
        standing: true,
        windows: { last7: window(5, 7, 71), last28: window(12, 28, 43) },
      }),
    } as Response);
  });

  it('shows the Anytime badge and the 7- and 28-day compliance for a standing request', async () => {
    renderList([{ ...baseRequest, id: 'req-standing', isStanding: true }]);

    expect(screen.getByText('Anytime')).toBeInTheDocument();
    const text = screen.getByTestId('completion-text-req-standing');
    expect(await screen.findByText('7d: 5 of 7 days · 71%')).toBeInTheDocument();
    expect(screen.getByText('28d: 12 of 28 days · 43%')).toBeInTheDocument();
    expect(text).not.toHaveTextContent('/');
    expect(apiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/organizations/org-1/wellness/requests/req-standing/completion-rate'
    );
  });

  it('shows "No complete days yet" when no complete UTC day has passed', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ok: true,
      json: async () => ({
        completed: 0,
        total: 2,
        percentage: 0,
        standing: true,
        windows: { last7: window(0, 0, 0), last28: window(0, 0, 0) },
      }),
    } as Response);

    renderList([{ ...baseRequest, id: 'req-new', isStanding: true }]);

    expect(await screen.findByText('No complete days yet')).toBeInTheDocument();
    expect(screen.queryByText(/of 0 days/)).not.toBeInTheDocument();
  });

  it('leaves one-time requests unchanged and does not fetch compliance for them', () => {
    renderList([baseRequest]);

    expect(screen.queryByText('Anytime')).not.toBeInTheDocument();
    expect(screen.getByTestId('completion-text-req-one')).toHaveTextContent('0/2 - 0%');
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
