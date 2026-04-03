/**
 * Component tests for ConsentRecoveryBanner (COPPA D5)
 *
 * Covers:
 * - Null render for non-revoked coppaStatus values
 * - Banner render when coppaStatus === 'consent_revoked'
 * - Form toggle on button click
 * - POST /api/admin/coppa/re-initiate/:athleteId on submit
 * - Success toast on 2xx response
 * - Error toast on non-ok response
 * - Network error toast on fetch rejection
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsentRecoveryBanner } from '../consent-recovery-banner';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ── Helpers ──────────────────────────────────────────────────────────────────

const defaultProps = {
  athleteId: 'athlete-uuid-123',
  athleteName: 'Jane Doe',
  parentEmail: 'parent@example.com',
};

function renderBanner(overrides: Partial<typeof defaultProps & { coppaStatus?: string }> = {}) {
  const props = { ...defaultProps, ...overrides };
  return render(<ConsentRecoveryBanner {...props} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConsentRecoveryBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Null-render cases ────────────────────────────────────────────────────

  describe('renders null when coppaStatus is not consent_revoked', () => {
    it('returns null when coppaStatus is "pending_consent"', () => {
      const { container } = renderBanner({ coppaStatus: 'pending_consent' });
      expect(container.firstChild).toBeNull();
    });

    it('returns null when coppaStatus is "active"', () => {
      const { container } = renderBanner({ coppaStatus: 'active' });
      expect(container.firstChild).toBeNull();
    });

    it('returns null when coppaStatus is undefined', () => {
      const { container } = renderBanner({ coppaStatus: undefined });
      expect(container.firstChild).toBeNull();
    });

    it('returns null when coppaStatus is an empty string', () => {
      const { container } = renderBanner({ coppaStatus: '' });
      expect(container.firstChild).toBeNull();
    });
  });

  // ── Banner render ────────────────────────────────────────────────────────

  describe('renders banner when coppaStatus is consent_revoked', () => {
    it('displays the revoked-consent heading and description', () => {
      renderBanner({ coppaStatus: 'consent_revoked' });

      expect(screen.getByText('Parental Consent Revoked')).toBeInTheDocument();
      expect(screen.getByText(/Jane Doe.*inactive/i)).toBeInTheDocument();
    });

    it('shows the Re-initiate Consent button but no email form initially', () => {
      renderBanner({ coppaStatus: 'consent_revoked' });

      expect(screen.getByRole('button', { name: /re-initiate consent/i })).toBeInTheDocument();
      expect(screen.queryByLabelText(/parent.*guardian email/i)).not.toBeInTheDocument();
    });
  });

  // ── Form toggle ──────────────────────────────────────────────────────────

  describe('form toggle on button click', () => {
    it('reveals the email input when Re-initiate Consent is clicked', async () => {
      const user = userEvent.setup();
      renderBanner({ coppaStatus: 'consent_revoked' });

      await user.click(screen.getByRole('button', { name: /re-initiate consent/i }));

      expect(screen.getByLabelText(/parent.*guardian email/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send consent email/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('pre-fills the email input with the provided parentEmail', async () => {
      const user = userEvent.setup();
      renderBanner({ coppaStatus: 'consent_revoked', parentEmail: 'guardian@test.com' });

      await user.click(screen.getByRole('button', { name: /re-initiate consent/i }));

      expect(screen.getByLabelText(/parent.*guardian email/i)).toHaveValue('guardian@test.com');
    });

    it('hides the email form when Cancel is clicked', async () => {
      const user = userEvent.setup();
      renderBanner({ coppaStatus: 'consent_revoked' });

      await user.click(screen.getByRole('button', { name: /re-initiate consent/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByLabelText(/parent.*guardian email/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /re-initiate consent/i })).toBeInTheDocument();
    });
  });

  // ── Successful submission ────────────────────────────────────────────────

  describe('POST to /api/admin/coppa/re-initiate/:athleteId on submit', () => {
    it('sends POST to the correct URL with the parent email body', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      renderBanner({ coppaStatus: 'consent_revoked' });

      await user.click(screen.getByRole('button', { name: /re-initiate consent/i }));
      await user.clear(screen.getByLabelText(/parent.*guardian email/i));
      // Use mixed-case email to verify .toLowerCase() normalization
      await user.type(screen.getByLabelText(/parent.*guardian email/i), 'New@Parent.COM');
      await user.click(screen.getByRole('button', { name: /send consent email/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/admin/coppa/re-initiate/athlete-uuid-123',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
            credentials: 'include',
            body: JSON.stringify({ parentEmail: 'new@parent.com' }), // lowercased
          })
        );
      });
    });

    it('shows a success toast and replaces the banner with a confirmation on 2xx', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      renderBanner({ coppaStatus: 'consent_revoked' });

      await user.click(screen.getByRole('button', { name: /re-initiate consent/i }));
      await user.click(screen.getByRole('button', { name: /send consent email/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Consent email sent' })
        );
      });

      // Banner transitions to the sent-confirmation state
      expect(
        screen.getByText(/new parental consent email has been sent/i)
      ).toBeInTheDocument();
      // Form is no longer visible
      expect(screen.queryByRole('button', { name: /send consent email/i })).not.toBeInTheDocument();
    });
  });

  // ── Error responses ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('shows a destructive toast when the API returns a non-ok response', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Athlete not found' }),
      });

      renderBanner({ coppaStatus: 'consent_revoked' });

      await user.click(screen.getByRole('button', { name: /re-initiate consent/i }));
      await user.click(screen.getByRole('button', { name: /send consent email/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Failed to re-initiate consent',
            description: 'Athlete not found',
            variant: 'destructive',
          })
        );
      });

      // Banner stays in form state — form is still present
      expect(screen.getByRole('button', { name: /send consent email/i })).toBeInTheDocument();
    });

    it('uses a fallback description when the error response has no message', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      renderBanner({ coppaStatus: 'consent_revoked' });

      await user.click(screen.getByRole('button', { name: /re-initiate consent/i }));
      await user.click(screen.getByRole('button', { name: /send consent email/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: 'destructive',
            description: 'An error occurred. Please try again.',
          })
        );
      });
    });

    it('shows a network-error toast when fetch rejects entirely', async () => {
      const user = userEvent.setup();
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      renderBanner({ coppaStatus: 'consent_revoked' });

      await user.click(screen.getByRole('button', { name: /re-initiate consent/i }));
      await user.click(screen.getByRole('button', { name: /send consent email/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Network error',
            variant: 'destructive',
          })
        );
      });
    });

    it('does not submit when the email input is empty', async () => {
      const user = userEvent.setup();
      renderBanner({ coppaStatus: 'consent_revoked', parentEmail: '' });

      await user.click(screen.getByRole('button', { name: /re-initiate consent/i }));

      // Send button should be disabled with empty email
      const sendButton = screen.getByRole('button', { name: /send consent email/i });
      expect(sendButton).toBeDisabled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
