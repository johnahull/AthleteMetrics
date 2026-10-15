/**
 * HTTP 429 from the password-reset endpoints must read as "too many attempts", not as a bad token or a
 * generic failure (the 429 body has no `valid` / `success` field).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ResetPasswordForm } from '../reset-password-form';
import { ForgotPasswordForm } from '../forgot-password-form';

const TOO_MANY = 'Too many attempts. Please wait a few minutes and try again.';
const limited = () => ({ ok: false, status: 429, json: async () => ({ message: 'Too many authentication attempts, please try again later.' }) });
const ok = (body: object) => ({ ok: true, status: 200, json: async () => body });

describe('password reset forms: HTTP 429', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reset form shows the too-many-attempts message when token validation is rate limited', async () => {
    fetchMock.mockResolvedValueOnce(limited());
    render(<ResetPasswordForm token="abc" />);
    expect(await screen.findByText(TOO_MANY)).toBeInTheDocument();
    expect(screen.queryByText('Invalid or expired reset token')).not.toBeInTheDocument();
  });

  it('reset form shows the too-many-attempts message when the reset submit is rate limited', async () => {
    fetchMock.mockResolvedValueOnce(ok({ valid: true })).mockResolvedValueOnce(limited());
    render(<ResetPasswordForm token="abc" />);
    const pw = await screen.findByLabelText('New Password');
    const confirm = screen.getByLabelText('Confirm New Password');
    fireEvent.change(pw, { target: { value: 'A-very-long-Passw0rd!' } });
    fireEvent.change(confirm, { target: { value: 'A-very-long-Passw0rd!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    expect(await screen.findByText(TOO_MANY)).toBeInTheDocument();
    expect(screen.queryByText('Failed to reset password')).not.toBeInTheDocument();
  });

  it('forgot form shows the too-many-attempts message when rate limited', async () => {
    fetchMock.mockResolvedValueOnce(limited());
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => expect(screen.getByText(TOO_MANY)).toBeInTheDocument());
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });
});
