/**
 * Wellness history: template names come with the responses, and details load the template through the
 * response's organization (the public template route serves system templates only)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WellnessHistory from '../wellness-history';
import * as authModule from '@/lib/auth';

vi.mock('@/lib/auth', () => ({ useAuth: vi.fn() }));

const response = (id: string, templateName?: string) => ({
  id,
  requestId: 'req-1',
  organizationId: 'org-1',
  templateId: 'tpl-1',
  userId: 'athlete-1',
  userFullName: 'Athlete',
  teamId: null,
  teamNameSnapshot: null,
  submittedAt: '2026-11-20T08:00:00Z',
  date: '2026-11-20',
  responses: { q1: { value: 7, label: 'Energy' }, pain: { value: [{ x: 0.4, y: 0.7, label: 'Left knee' }], label: 'Pain' } },
  templateName,
});

const template = {
  id: 'tpl-1',
  organizationId: 'org-1',
  name: 'Morning check',
  config: {
    questions: [
      { id: 'q1', type: 'scale', label: 'Energy level', scaleMin: 1, scaleMax: 10, required: true },
      { id: 'pain', type: 'body_map', label: 'Where does it hurt?', required: false },
    ],
  },
};

function mockFetch(responses: unknown[]) {
  global.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.startsWith('/api/wellness/my-responses')) {
      return { ok: true, json: async () => ({ responses, pagination: { page: 1, limit: 20, total: responses.length, totalPages: 1, hasMore: false } }) } as Response;
    }
    if (u === '/api/organizations/org-1/wellness/templates/tpl-1') return { ok: true, json: async () => template } as Response;
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }) as any;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WellnessHistory />
    </QueryClientProvider>
  );
}

describe('WellnessHistory', () => {
  beforeEach(() => {
    vi.mocked(authModule.useAuth).mockReturnValue({ user: { id: 'athlete-1' } } as any);
  });

  it('titles each entry with its template name, or a generic title without one', async () => {
    mockFetch([response('r1', 'Morning check'), response('r2')]);
    renderPage();

    expect(await screen.findByText('Morning check')).toBeInTheDocument();
    expect(screen.getByText('Wellness Check-In')).toBeInTheDocument();
  });

  it('shows the question labels of an organization template in the details', async () => {
    mockFetch([response('r1', 'Morning check')]);
    renderPage();

    await userEvent.click(await screen.findByText('Morning check'));
    const detail = await screen.findByTestId('response-detail');
    expect(await within(detail).findByText('Energy level')).toBeInTheDocument();
    // Stored answers are { value, label }: the value is shown, not the object
    expect(within(detail).getByText('7')).toBeInTheDocument();
    expect(within(detail).getByText('Left knee')).toBeInTheDocument();
    expect(within(detail).queryByText('[object Object]')).not.toBeInTheDocument();
  });

  it('shows the question labels of a system template when the organization route does not answer', async () => {
    mockFetch([response('r1', 'Morning check')]);
    const serve = global.fetch as any;
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u === '/api/wellness/templates/tpl-1') return { ok: true, json: async () => ({ ...template, organizationId: null }) } as Response;
      if (u.startsWith('/api/organizations/')) return { ok: false, status: 403, json: async () => ({}) } as Response;
      return serve(url);
    }) as any;
    renderPage();

    await userEvent.click(await screen.findByText('Morning check'));
    const detail = await screen.findByTestId('response-detail');
    expect(await within(detail).findByText('Energy level')).toBeInTheDocument();
  });
});
