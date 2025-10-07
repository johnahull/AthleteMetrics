/**
 * Tests for email verification page
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import VerifyEmail from '../verify-email';

// Mock useLocation
const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/verify-email', mockSetLocation],
}));

// Mock fetch
global.fetch = vi.fn();

describe('VerifyEmail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).location;
    window.location = { search: '' } as any;
  });

  describe('Token Validation', () => {
    it('should show error when token is missing', async () => {
      window.location.search = '';

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
        expect(screen.getByText(/token is missing/i)).toBeInTheDocument();
      });
    });

    it('should show verifying state initially', () => {
      window.location.search = '?token=valid-token-123';

      render(<VerifyEmail />);

      expect(screen.getByText('Verifying Your Email')).toBeInTheDocument();
      expect(screen.getByText(/please wait/i)).toBeInTheDocument();
    });
  });

  describe('Successful Verification', () => {
    it('should show success message on valid token', async () => {
      window.location.search = '?token=valid-token-123';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Email verified successfully!',
        }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Email Verified!')).toBeInTheDocument();
        expect(screen.getByText(/email verified successfully/i)).toBeInTheDocument();
      });
    });

    it('should make API call with correct token', async () => {
      window.location.search = '?token=test-token-456';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/auth/verify-email/test-token-456',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });
    });

    it('should display dashboard navigation button', async () => {
      window.location.search = '?token=valid-token';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        const dashboardButton = screen.getByRole('button', { name: /go to dashboard/i });
        expect(dashboardButton).toBeInTheDocument();
      });
    });

    it('should navigate to dashboard on button click', async () => {
      window.location.search = '?token=valid-token';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<VerifyEmail />);

      await waitFor(async () => {
        const dashboardButton = screen.getByRole('button', { name: /go to dashboard/i });
        dashboardButton.click();

        expect(mockSetLocation).toHaveBeenCalledWith('/dashboard');
      });
    });
  });

  describe('Failed Verification', () => {
    it('should show error message on invalid token', async () => {
      window.location.search = '?token=invalid-token';

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message: 'Invalid or expired verification token',
        }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
        expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument();
      });
    });

    it('should show error message on network failure', async () => {
      window.location.search = '?token=valid-token';

      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
        expect(screen.getByText(/error occurred/i)).toBeInTheDocument();
      });
    });

    it('should display profile navigation button on error', async () => {
      window.location.search = '?token=expired-token';

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Token expired' }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        const profileButton = screen.getByRole('button', { name: /go to profile/i });
        expect(profileButton).toBeInTheDocument();
      });
    });

    it('should navigate to profile on button click', async () => {
      window.location.search = '?token=expired-token';

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Token expired' }),
      });

      render(<VerifyEmail />);

      await waitFor(async () => {
        const profileButton = screen.getByRole('button', { name: /go to profile/i });
        profileButton.click();

        expect(mockSetLocation).toHaveBeenCalledWith('/profile');
      });
    });
  });

  describe('Visual States', () => {
    it('should show loading spinner while verifying', () => {
      window.location.search = '?token=valid-token';

      render(<VerifyEmail />);

      const spinner = screen.getByTestId('lucide-icon'); // Loading icon
      expect(spinner).toBeInTheDocument();
    });

    it('should show success icon after verification', async () => {
      window.location.search = '?token=valid-token';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        // CheckCircle2 icon should be visible
        expect(screen.getByText('Email Verified!')).toBeInTheDocument();
      });
    });

    it('should show error icon on failure', async () => {
      window.location.search = '?token=invalid-token';

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Invalid token' }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        // XCircle icon should be visible
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty token parameter', async () => {
      window.location.search = '?token=';

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
      });
    });

    it('should handle malformed URL parameters', async () => {
      window.location.search = '?nottoken=123';

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
        expect(screen.getByText(/token is missing/i)).toBeInTheDocument();
      });
    });

    it('should handle JSON parse errors', async () => {
      window.location.search = '?token=valid-token';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
      });
    });
  });

  describe('User Messages', () => {
    it('should display custom success message from API', async () => {
      window.location.search = '?token=valid-token';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Custom success message',
        }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Custom success message')).toBeInTheDocument();
      });
    });

    it('should display custom error message from API', async () => {
      window.location.search = '?token=invalid-token';

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message: 'Custom error message',
        }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Custom error message')).toBeInTheDocument();
      });
    });

    it('should show helpful text for expired tokens', async () => {
      window.location.search = '?token=expired-token';

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Token expired' }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(
          screen.getByText(/request a new verification email/i)
        ).toBeInTheDocument();
      });
    });
  });
});
