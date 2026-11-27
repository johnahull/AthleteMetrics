/**
 * Accept-invitation page: an invitation for an existing account is accepted while signed in.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AcceptInvitation from '../accept-invitation';

let mockUser: { id: string; username: string } | null = null;

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser, isLoading: false })),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useContextualLabels', () => ({ useContextualLabels: () => ({ teams: 'Teams' }) }));
vi.mock('wouter', () => ({
  useLocation: () => ['/accept-invitation', vi.fn()],
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const fetchMock = vi.fn();

function respondWith(invitation: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return { ok: true, json: async () => ({ success: true, redirectUrl: '/' }) };
    }
    return { ok: true, json: async () => invitation };
  });
}

describe('AcceptInvitation page', () => {
  beforeEach(() => {
    mockUser = null;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/accept-invitation?token=abc123');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks a signed-out invitee with an existing account to sign in, returning to the invitation', async () => {
    respondWith({ email: 'a@example.com', role: 'coach', organizationId: 'o1', requiresSignIn: true });

    render(<AcceptInvitation />);

    const link = await screen.findByRole('link', { name: /sign in/i });
    expect(link).toHaveAttribute('href', `/login?redirect=${encodeURIComponent('/accept-invitation?token=abc123')}`);
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('lets the signed-in invitee accept without choosing a username or password', async () => {
    mockUser = { id: 'u1', username: 'existing' };
    respondWith({ email: 'a@example.com', role: 'coach', organizationId: 'o1', requiresSignIn: true });

    render(<AcceptInvitation />);

    await screen.findByText(/signed in as/i);
    expect(screen.queryByLabelText(/^password/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('checkbox-terms-accepted'));
    fireEvent.click(screen.getByTestId('button-accept-invitation'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/invitations/abc123/accept', expect.anything()));
    const body = JSON.parse((fetchMock.mock.calls.find(c => c[1]?.method === 'POST')![1] as RequestInit).body as string);
    expect(body.username).toBeUndefined();
    expect(body.password).toBeUndefined();
    expect(body.legalAcceptedAt).toBeDefined();
  });

  it('shows the account form for a new invitee', async () => {
    respondWith({ email: 'new@example.com', role: 'athlete', organizationId: 'o1', requiresSignIn: false });

    render(<AcceptInvitation />);

    expect(await screen.findByTestId('input-username')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /already have an account/i }))
      .toHaveAttribute('href', `/login?redirect=${encodeURIComponent('/accept-invitation?token=abc123')}`);
  });
});
