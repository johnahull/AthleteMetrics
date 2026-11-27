/**
 * My wellness requests: standing ("Anytime") check-ins (AM-FEAT-027)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WellnessMyRequests from '../wellness-my-requests';
import * as authModule from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

const baseRequest = {
  organizationId: 'org-1',
  templateId: 'template-1',
  requestedBy: 'coach-1',
  distributionMethod: 'athlete_account',
  targetAthleteIds: ['athlete-1'],
  targetTeamIds: null,
  requiresAuth: true,
  scheduledFor: null,
  status: 'active',
  createdAt: new Date().toISOString(),
};

const standingRequest = { ...baseRequest, id: 'req-standing', publicToken: 'tok-standing', expiresAt: null, isStanding: true };
const oneTimeRequest = {
  ...baseRequest,
  id: 'req-once',
  publicToken: 'tok-once',
  expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
  isStanding: false,
};

const template = { id: 'template-1', name: 'Daily check-in', config: { questions: [] } };

function mockFetch(requests: unknown[]) {
  global.fetch = vi.fn(async (url: any) => {
    if (String(url).includes('/api/wellness/my-requests')) {
      return { ok: true, json: async () => requests } as Response;
    }
    return { ok: true, json: async () => template } as Response;
  }) as any;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WellnessMyRequests />
    </QueryClientProvider>
  );
}

describe('WellnessMyRequests - Anytime check-ins', () => {
  beforeEach(() => {
    vi.mocked(authModule.useAuth).mockReturnValue({ user: { id: 'athlete-1' } } as any);
  });

  it('lists standing requests in their own section with an Anytime badge and a Fill out button', async () => {
    mockFetch([standingRequest, oneTimeRequest]);
    renderPage();

    const section = await screen.findByTestId('anytime-requests-section');
    expect(within(section).getByText('Anytime check-ins')).toBeInTheDocument();
    expect(within(section).getByText('Anytime')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Fill out' })).toBeInTheDocument();
    expect(within(section).queryByText('Pending')).not.toBeInTheDocument();
    expect(within(section).queryByText('Expired')).not.toBeInTheDocument();
    expect(within(section).getAllByTestId('wellness-request-card')).toHaveLength(1);
  });

  it('keeps one-time requests in Pending Requests unchanged', async () => {
    mockFetch([standingRequest, oneTimeRequest]);
    renderPage();

    const pending = await screen.findByTestId('pending-requests-section');
    expect(within(pending).getByText('Pending Requests')).toBeInTheDocument();
    expect(within(pending).getByText('Pending')).toBeInTheDocument();
    expect(within(pending).getByRole('button', { name: 'Start Questionnaire' })).toBeInTheDocument();
    expect(within(pending).getAllByTestId('wellness-request-card')).toHaveLength(1);
  });

  it('shows the standing section without the empty state when it is the only request', async () => {
    mockFetch([standingRequest]);
    renderPage();

    expect(await screen.findByTestId('anytime-requests-section')).toBeInTheDocument();
    expect(screen.queryByText(/No pending wellness requests/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-requests-section')).not.toBeInTheDocument();
  });

  it('shows the template details the server sends, without fetching templates', async () => {
    mockFetch([{ ...oneTimeRequest, templateName: 'Morning check', templateDescription: 'How did you sleep?', templateQuestionCount: 4 }]);
    renderPage();

    const card = await screen.findByTestId('wellness-request-card');
    expect(within(card).getByText('Morning check')).toBeInTheDocument();
    expect(within(card).getByText('How did you sleep?')).toBeInTheDocument();
    expect(within(card).getByText(/4 questions/)).toBeInTheDocument();
    expect(vi.mocked(global.fetch).mock.calls.map(c => String(c[0]))).toEqual(['/api/wellness/my-requests']);
  });

  it('falls back to a generic title when the server sends no template name', async () => {
    mockFetch([oneTimeRequest]);
    renderPage();

    const card = await screen.findByTestId('wellness-request-card');
    expect(within(card).getByText('Wellness Check-In')).toBeInTheDocument();
  });

  it('links to My history', async () => {
    mockFetch([]);
    renderPage();

    const link = await screen.findByRole('link', { name: /My history/i });
    expect(link).toHaveAttribute('href', '/wellness/history');
  });
});
