/**
 * /join/:code sends logged-out users to /register?redirect=/join/CODE. After a successful
 * signup (the API already opened a session) the page must request membership in that org.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Register from '../register';
import { joinOrganizationByCode } from '@/lib/join-by-code';

vi.mock('wouter', () => ({ useLocation: () => ['/register', vi.fn()] }));
vi.mock('@/components/auth/oauth-buttons', () => ({ OAuthButtons: () => null }));
vi.mock('@/lib/join-by-code', () => ({ joinOrganizationByCode: vi.fn() }));

const joinMock = vi.mocked(joinOrganizationByCode);

async function registerWith(search: string, registerResponse: object = { success: true }) {
  vi.stubGlobal('location', { search, origin: 'http://localhost', pathname: '/register' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/auth/check-')) return { ok: true, json: async () => ({ available: true }) };
      return { ok: true, json: async () => registerResponse };
    }),
  );
  render(<Register />);
  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  type('First Name', 'Lucy');
  type('Last Name', 'Ortiz');
  type('Date of Birth', '1990-01-01');
  type('Email', 'lucy@example.com');
  type('Username', 'lucyortiz');
  type('Password', 'Str0ng!Passw0rd');
  type('Confirm Password', 'Str0ng!Passw0rd');
  fireEvent.click(screen.getByTestId('checkbox-terms-accepted'));
  // let the debounced availability checks resolve
  await waitFor(() => expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled(), { timeout: 3000 });
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
}

describe('Register page — join link signup', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    joinMock.mockReset();
  });

  it('requests membership for the code in ?redirect and says the user joined', async () => {
    joinMock.mockResolvedValue({ status: 'approved', organizationName: 'Big Time Athletes' });
    await registerWith('?redirect=/join/JOINBTA');
    expect(await screen.findByText(/you've joined big time athletes/i)).toBeInTheDocument();
    expect(joinMock).toHaveBeenCalledWith('JOINBTA');
  });

  it('says the request is pending when the org needs approval', async () => {
    joinMock.mockResolvedValue({ status: 'pending', organizationName: 'Big Time Athletes' });
    await registerWith('?redirect=/join/JOINBTA');
    expect(await screen.findByText(/request to join big time athletes was submitted/i)).toBeInTheDocument();
  });

  it('keeps the new account and links back to the join page when joining fails', async () => {
    joinMock.mockRejectedValue(new Error('Organization does not accept membership requests'));
    await registerWith('?redirect=/join/JOINBTA');
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(await screen.findByText(/does not accept membership requests/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /try joining again/i })).toHaveAttribute('href', '/join/JOINBTA');
  });

  it('does not try to join without a join redirect', async () => {
    await registerWith('');
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(joinMock).not.toHaveBeenCalled();
  });

  it('does not try to join for an unsafe redirect', async () => {
    await registerWith('?redirect=//evil.com/join/JOINBTA');
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(joinMock).not.toHaveBeenCalled();
  });

  it('does not join when the account awaits parental consent (no session)', async () => {
    await registerWith('?redirect=/join/JOINBTA', { success: true, requiresParentalConsent: true });
    expect(await screen.findByText('Consent Email Sent')).toBeInTheDocument();
    expect(joinMock).not.toHaveBeenCalled();
  });
});
