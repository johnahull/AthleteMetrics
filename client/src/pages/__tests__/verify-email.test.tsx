/**
 * Tests for email verification page
 * Rewritten to properly mock window.location using vi.stubGlobal
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import VerifyEmail from '../verify-email';

// Mock useLocation
const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/verify-email', mockSetLocation],
}));

// Mock fetch
const mockFetch = vi.fn();

describe('VerifyEmail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup fetch mock
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('Token Validation', () => {
    it('should show error when token is missing', async () => {
      // Mock window.location.search with no token
      vi.stubGlobal('location', { search: '' });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
        expect(screen.getByText(/token is missing/i)).toBeInTheDocument();
      });
    });

    it('should show verifying state initially', () => {
      vi.stubGlobal('location', { search: '?token=valid-token-123' });

      // Mock fetch to delay response
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<VerifyEmail />);

      expect(screen.getByText('Verifying Your Email')).toBeInTheDocument();
      expect(screen.getByText(/please wait/i)).toBeInTheDocument();
    });
  });

  describe('Successful Verification', () => {
    it('should show success message on valid token', async () => {
      vi.stubGlobal('location', { search: '?token=valid-token-123' });

      mockFetch.mockResolvedValueOnce({
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
      vi.stubGlobal('location', { search: '?token=test-token-456' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/auth/verify-email/test-token-456',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });
    });

    it('should display dashboard navigation button', async () => {
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockFetch.mockResolvedValueOnce({
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
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<VerifyEmail />);

      const dashboardButton = await screen.findByRole('button', { name: /go to dashboard/i });
      dashboardButton.click();

      expect(mockSetLocation).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('Failed Verification', () => {
    it('should show error message on invalid token', async () => {
      vi.stubGlobal('location', { search: '?token=invalid-token' });

      mockFetch.mockResolvedValueOnce({
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
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
        expect(screen.getByText(/error occurred/i)).toBeInTheDocument();
      });
    });

    it('should display profile navigation button on error', async () => {
      vi.stubGlobal('location', { search: '?token=expired-token' });

      mockFetch.mockResolvedValueOnce({
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
      vi.stubGlobal('location', { search: '?token=expired-token' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Token expired' }),
      });

      render(<VerifyEmail />);

      const profileButton = await screen.findByRole('button', { name: /go to profile/i });
      profileButton.click();

      expect(mockSetLocation).toHaveBeenCalledWith('/profile');
    });
  });

  describe('Visual States', () => {
    it('should show loading spinner while verifying', () => {
      vi.stubGlobal('location', { search: '?token=valid-token' });

      // Mock fetch to delay response
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<VerifyEmail />);

      // Look for the Loader2 component by its className
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should show success icon after verification', async () => {
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Email Verified!')).toBeInTheDocument();
      });
    });

    it('should show error icon on failure', async () => {
      vi.stubGlobal('location', { search: '?token=invalid-token' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Invalid token' }),
      });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty token parameter', async () => {
      vi.stubGlobal('location', { search: '?token=' });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
      });
    });

    it('should handle malformed URL parameters', async () => {
      vi.stubGlobal('location', { search: '?nottoken=123' });

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
        expect(screen.getByText(/token is missing/i)).toBeInTheDocument();
      });
    });

    it('should handle JSON parse errors', async () => {
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockFetch.mockResolvedValueOnce({
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
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockFetch.mockResolvedValueOnce({
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
      vi.stubGlobal('location', { search: '?token=invalid-token' });

      mockFetch.mockResolvedValueOnce({
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
      vi.stubGlobal('location', { search: '?token=expired-token' });

      mockFetch.mockResolvedValueOnce({
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
