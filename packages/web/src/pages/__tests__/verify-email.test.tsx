/**
 * Tests for email verification page
 * Rewritten to properly mock window.location using vi.stubGlobal
 *
 * The page posts through apiRequest (session + CSRF token, so a signed-in redemption works). The server answers
 * 200 with success: false for a bad or expired token; apiRequest rejects on any non-2xx status or network failure.
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

// Mock apiRequest
const mockApiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest: mockApiRequest }));

const respond = (body: unknown) => ({ json: async () => body });

describe('VerifyEmail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(mockApiRequest).not.toHaveBeenCalled();
    });

    it('should show verifying state initially', () => {
      vi.stubGlobal('location', { search: '?token=valid-token-123' });

      // Delay the response
      mockApiRequest.mockImplementation(() => new Promise(() => {}));

      render(<VerifyEmail />);

      expect(screen.getByText('Verifying Your Email')).toBeInTheDocument();
      expect(screen.getByText(/please wait/i)).toBeInTheDocument();
    });
  });

  describe('Successful Verification', () => {
    it('should show success message on valid token', async () => {
      vi.stubGlobal('location', { search: '?token=valid-token-123' });

      mockApiRequest.mockResolvedValueOnce(respond({
        success: true,
        message: 'Email verified successfully!',
      }));

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Email Verified!')).toBeInTheDocument();
        expect(screen.getByText(/email verified successfully/i)).toBeInTheDocument();
      });
    });

    it('should make API call with correct token', async () => {
      vi.stubGlobal('location', { search: '?token=test-token-456' });

      mockApiRequest.mockResolvedValueOnce(respond({ success: true }));

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/enhanced-auth/verify-email', { token: 'test-token-456' });
      });
    });

    it('should display sign in navigation button', async () => {
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockApiRequest.mockResolvedValueOnce(respond({ success: true }));

      render(<VerifyEmail />);

      await waitFor(() => {
        const signInButton = screen.getByRole('button', { name: /sign in now/i });
        expect(signInButton).toBeInTheDocument();
      });
    });

    it('should navigate to login on button click', async () => {
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockApiRequest.mockResolvedValueOnce(respond({ success: true }));

      render(<VerifyEmail />);

      const signInButton = await screen.findByRole('button', { name: /sign in now/i });
      signInButton.click();

      expect(mockSetLocation).toHaveBeenCalledWith('/login?verified=true');
    });

    it('should explain the signed-in step when linked records still need it', async () => {
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockApiRequest.mockResolvedValueOnce(respond({ success: true, signInToRestoreLinks: true }));

      render(<VerifyEmail />);

      expect(await screen.findByText(/to restore records linked from your other organizations, sign in/i)).toBeInTheDocument();
    });

    it('should not mention linked records otherwise', async () => {
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockApiRequest.mockResolvedValueOnce(respond({ success: true }));

      render(<VerifyEmail />);

      await screen.findByText('Email Verified!');
      expect(screen.queryByText(/restore records linked/i)).not.toBeInTheDocument();
    });
  });

  describe('Failed Verification', () => {
    it('should show error message on invalid token', async () => {
      vi.stubGlobal('location', { search: '?token=invalid-token' });

      mockApiRequest.mockResolvedValueOnce(respond({
        success: false,
        message: 'Invalid or expired verification token',
      }));

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
        expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument();
      });
    });

    it('should show error message on network failure', async () => {
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockApiRequest.mockRejectedValueOnce(new Error('Network error'));

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
        expect(screen.getByText(/error occurred/i)).toBeInTheDocument();
      });
    });

    it('should show an error when the request is refused', async () => {
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockApiRequest.mockRejectedValueOnce(new Error('403: {"error":"CSRF token missing"}'));

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
      });
    });

    it('should display login navigation button on error', async () => {
      vi.stubGlobal('location', { search: '?token=expired-token' });

      mockApiRequest.mockResolvedValueOnce(respond({ success: false, message: 'Token expired' }));

      render(<VerifyEmail />);

      await waitFor(() => {
        const loginButton = screen.getByRole('button', { name: /go to login/i });
        expect(loginButton).toBeInTheDocument();
      });
    });

    it('should navigate to login on button click', async () => {
      vi.stubGlobal('location', { search: '?token=expired-token' });

      mockApiRequest.mockResolvedValueOnce(respond({ success: false, message: 'Token expired' }));

      render(<VerifyEmail />);

      const loginButton = await screen.findByRole('button', { name: /go to login/i });
      loginButton.click();

      expect(mockSetLocation).toHaveBeenCalledWith('/login');
    });
  });

  describe('Visual States', () => {
    it('should show loading spinner while verifying', () => {
      vi.stubGlobal('location', { search: '?token=valid-token' });

      // Delay the response
      mockApiRequest.mockImplementation(() => new Promise(() => {}));

      render(<VerifyEmail />);

      // Look for the Loader2 component by its className
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should show success icon after verification', async () => {
      vi.stubGlobal('location', { search: '?token=valid-token' });

      mockApiRequest.mockResolvedValueOnce(respond({ success: true }));

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Email Verified!')).toBeInTheDocument();
      });
    });

    it('should show error icon on failure', async () => {
      vi.stubGlobal('location', { search: '?token=invalid-token' });

      mockApiRequest.mockResolvedValueOnce(respond({ success: false, message: 'Invalid token' }));

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

      mockApiRequest.mockResolvedValueOnce({
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

      mockApiRequest.mockResolvedValueOnce(respond({
        success: true,
        message: 'Custom success message',
      }));

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Custom success message')).toBeInTheDocument();
      });
    });

    it('should display custom error message from API', async () => {
      vi.stubGlobal('location', { search: '?token=invalid-token' });

      mockApiRequest.mockResolvedValueOnce(respond({
        success: false,
        message: 'Custom error message',
      }));

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(screen.getByText('Custom error message')).toBeInTheDocument();
      });
    });

    it('should show helpful text for expired tokens', async () => {
      vi.stubGlobal('location', { search: '?token=expired-token' });

      mockApiRequest.mockResolvedValueOnce(respond({ success: false, message: 'Token expired' }));

      render(<VerifyEmail />);

      await waitFor(() => {
        expect(
          screen.getByText(/sign in and request a new verification email/i)
        ).toBeInTheDocument();
      });
    });
  });
});
