/**
 * Wellness submit page: standing ("Anytime") requests (AM-FEAT-027)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WellnessSubmit from '../wellness-submit';
import * as authModule from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('wouter', () => ({
  useRoute: () => [true, { token: 'tok-1' }],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

const baseRequest = {
  id: 'req-1',
  organizationId: 'org-1',
  templateId: 'template-1',
  requestedBy: 'coach-1',
  distributionMethod: 'athlete_account',
  targetAthleteIds: ['athlete-1'],
  targetTeamIds: null,
  publicToken: 'tok-1',
  requiresAuth: true,
  scheduledFor: null,
  expiresAt: null,
  status: 'active',
  createdAt: new Date().toISOString(),
};

const template = {
  id: 'template-1',
  organizationId: 'org-1',
  name: 'Daily check-in',
  config: { questions: [{ id: 'q1', type: 'text', label: 'Anything to add?', required: false }] },
};

let submitBodies: any[] = [];

function mockFetch(request: object, submission: object = { hasSubmitted: false }) {
  submitBodies = [];
  global.fetch = vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/api/wellness/responses') && init?.method === 'POST') {
      submitBodies.push(JSON.parse(String(init.body)));
      return { ok: true, status: 201, json: async () => ({ id: 'resp-1', replaced: false }) } as Response;
    }
    if (u.includes('/check-submission')) return { ok: true, json: async () => submission } as Response;
    if (u.endsWith('/template')) return { ok: true, json: async () => template } as Response;
    if (u.includes('/targeted-athletes')) return { ok: true, json: async () => ({ athletes: [] }) } as Response;
    if (u.includes('/by-token/')) return { ok: true, json: async () => request } as Response;
    throw new Error(`Unexpected fetch ${u}`);
  }) as any;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WellnessSubmit />
    </QueryClientProvider>
  );
}

const signedIn = () =>
  vi.mocked(authModule.useAuth).mockReturnValue({ user: { id: 'athlete-1' }, isLoading: false } as any);

describe('WellnessSubmit - standing requests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the form with the replace-today note and no name picker for a signed-in athlete', async () => {
    signedIn();
    mockFetch({ ...baseRequest, isStanding: true }, { hasSubmitted: false, isStanding: true });
    renderPage();

    expect(await screen.findByText("Submitting again today replaces today's entry.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    expect(screen.queryByTestId('athlete-selector')).not.toBeInTheDocument();
  });

  it('is not locked even if a prior submission is reported', async () => {
    signedIn();
    mockFetch({ ...baseRequest, isStanding: true }, { hasSubmitted: true, submittedAt: new Date().toISOString() });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Submit' })).toBeEnabled();
    expect(screen.queryByText(/already submitted/i)).not.toBeInTheDocument();
  });

  it('submits as the signed-in user without magic-link params, then offers to go back or enter again', async () => {
    signedIn();
    mockFetch({ ...baseRequest, isStanding: true }, { hasSubmitted: false, isStanding: true });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(submitBodies).toHaveLength(1));
    const body = submitBodies[0];
    expect(body).toMatchObject({ requestId: 'req-1', templateId: 'template-1' });
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body).not.toHaveProperty('token');
    expect(body).not.toHaveProperty('athlete');
    expect(body).not.toHaveProperty('selectedAthleteId');
    expect(body).not.toHaveProperty('athleteName');

    const success = await screen.findByTestId('standing-submit-success');
    expect(screen.getByRole('link', { name: /my check-ins/i })).toHaveAttribute('href', '/wellness/my-requests');
    expect(success).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /enter again/i }));
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });

  it('asks a visitor who is not signed in to sign in instead of showing the form', async () => {
    vi.mocked(authModule.useAuth).mockReturnValue({ user: null, isLoading: false } as any);
    mockFetch({ ...baseRequest, isStanding: true });
    renderPage();

    expect(await screen.findByText('Please sign in to submit this check-in')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  it('still locks a one-time request after a submission', async () => {
    signedIn();
    mockFetch({ ...baseRequest, isStanding: false }, { hasSubmitted: true, submittedAt: new Date().toISOString() });
    renderPage();

    expect(await screen.findByText('You have already submitted this questionnaire')).toBeInTheDocument();
  });
});
