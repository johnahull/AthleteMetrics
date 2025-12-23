/**
 * Tests for Admin Page (Site Settings) Authorization
 *
 * Tests that only site admins can access the /admin page.
 * Non-site-admins (org admins, coaches, athletes) should be redirected to home.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminPage from '../admin';

// Mock state that can be changed per test
let mockUser: any = null;
let mockIsLoading = false;
let mockSetLocation = vi.fn();

// Mock useAuth
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    isLoading: mockIsLoading,
  })),
}));

// Mock wouter
vi.mock('wouter', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: vi.fn(() => ['/admin', mockSetLocation]),
}));

// Mock useToast
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

// Create QueryClient wrapper for React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('AdminPage Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockIsLoading = false;
    mockSetLocation = vi.fn();
  });

  describe('Non-site-admin redirects', () => {
    it('should redirect org_admin to home', async () => {
      mockUser = {
        id: 'user-1',
        username: 'orgadmin',
        role: 'org_admin',
        isSiteAdmin: false,
      };
      mockIsLoading = false;

      render(<AdminPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/');
      });
    });

    it('should redirect coach to home', async () => {
      mockUser = {
        id: 'user-2',
        username: 'coach',
        role: 'coach',
        isSiteAdmin: false,
      };
      mockIsLoading = false;

      render(<AdminPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/');
      });
    });

    it('should redirect athlete to home', async () => {
      mockUser = {
        id: 'user-3',
        username: 'athlete',
        role: 'athlete',
        isSiteAdmin: false,
      };
      mockIsLoading = false;

      render(<AdminPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('Site admin access', () => {
    it('should allow site_admin to view page without redirect', async () => {
      mockUser = {
        id: 'user-4',
        username: 'siteadmin',
        role: 'site_admin',
        isSiteAdmin: true,
      };
      mockIsLoading = false;

      render(<AdminPage />, { wrapper: createWrapper() });

      // Wait a tick to ensure no redirect was triggered
      await waitFor(() => {
        expect(mockSetLocation).not.toHaveBeenCalled();
      });
    });
  });

  describe('Loading states', () => {
    it('should not redirect while auth is loading', async () => {
      mockUser = null;
      mockIsLoading = true;

      render(<AdminPage />, { wrapper: createWrapper() });

      // Wait a tick to ensure no redirect was triggered during loading
      await waitFor(() => {
        expect(mockSetLocation).not.toHaveBeenCalled();
      });
    });
  });
});
