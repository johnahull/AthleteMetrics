/**
 * Tests for Event New Page
 *
 * Tests that:
 * - The create event form renders correctly
 * - Form validation works
 * - Organization context is required
 * - Navigation works correctly
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EventNew from '../event-new';
import type { EnhancedUser } from '@/lib/types/user';

// Mock state that can be changed per test
let mockUser: EnhancedUser | null = null;
let mockOrganizationContext: string | null = null;
let mockUserOrganizations: Array<{ organizationId: string; role: string }> = [];
let mockNavigate = vi.fn();
let mockCreateEvent = vi.fn();
let mockIsPending = false;

// Mock useAuth
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    organizationContext: mockOrganizationContext,
    userOrganizations: mockUserOrganizations,
  })),
}));

// Mock wouter
vi.mock('wouter', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: vi.fn(() => ['/events/new', mockNavigate]),
}));

// Mock useToast
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

// Mock useCreateEvent
vi.mock('@/lib/events-api', () => ({
  useCreateEvent: vi.fn(() => ({
    mutateAsync: mockCreateEvent,
    isPending: mockIsPending,
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

describe('EventNew Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockOrganizationContext = null;
    mockUserOrganizations = [];
    mockNavigate = vi.fn();
    mockCreateEvent = vi.fn();
    mockIsPending = false;
  });

  describe('Organization Context', () => {
    it('should show warning when no organization context', async () => {
      mockUser = {
        id: 'user-1',
        username: 'coach',
        email: 'coach@example.com',
        firstName: 'Test',
        lastName: 'Coach',
        role: 'coach',
        isSiteAdmin: false,
      };
      mockOrganizationContext = null;
      mockUserOrganizations = [];

      render(<EventNew />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/please select an organization/i)).toBeInTheDocument();
      });
    });

    it('should render form when organization context is set', async () => {
      mockUser = {
        id: 'user-1',
        username: 'coach',
        email: 'coach@example.com',
        firstName: 'Test',
        lastName: 'Coach',
        role: 'coach',
        isSiteAdmin: false,
      };
      mockOrganizationContext = 'org-123';

      render(<EventNew />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Create New Event')).toBeInTheDocument();
      });
    });

    it('should use first organization when no explicit context but has organizations', async () => {
      mockUser = {
        id: 'user-1',
        username: 'coach',
        email: 'coach@example.com',
        firstName: 'Test',
        lastName: 'Coach',
        role: 'coach',
        isSiteAdmin: false,
      };
      mockOrganizationContext = null;
      mockUserOrganizations = [{ organizationId: 'org-456', role: 'coach' }];

      render(<EventNew />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Create New Event')).toBeInTheDocument();
      });
    });
  });

  describe('Form Rendering', () => {
    beforeEach(() => {
      mockUser = {
        id: 'user-1',
        username: 'coach',
        email: 'coach@example.com',
        firstName: 'Test',
        lastName: 'Coach',
        role: 'coach',
        isSiteAdmin: false,
      };
      mockOrganizationContext = 'org-123';
    });

    it('should render the page title', async () => {
      render(<EventNew />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Create New Event')).toBeInTheDocument();
      });
    });

    it('should render back to events link', async () => {
      render(<EventNew />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/back to events/i)).toBeInTheDocument();
      });
    });

    it('should render basic info step initially', async () => {
      render(<EventNew />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Basic Information')).toBeInTheDocument();
        expect(screen.getByLabelText(/event name/i)).toBeInTheDocument();
      });
    });

    it('should render event type selector', async () => {
      render(<EventNew />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Event Type')).toBeInTheDocument();
      });
    });

    it('should render date fields', async () => {
      render(<EventNew />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/start date/i)).toBeInTheDocument();
        expect(screen.getByText(/end date/i)).toBeInTheDocument();
      });
    });
  });

  describe('Form Navigation', () => {
    beforeEach(() => {
      mockUser = {
        id: 'user-1',
        username: 'coach',
        email: 'coach@example.com',
        firstName: 'Test',
        lastName: 'Coach',
        role: 'coach',
        isSiteAdmin: false,
      };
      mockOrganizationContext = 'org-123';
    });

    it('should show cancel button on first step', async () => {
      render(<EventNew />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });
    });

    it('should show next button on first step', async () => {
      render(<EventNew />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    beforeEach(() => {
      mockUser = {
        id: 'user-1',
        username: 'coach',
        email: 'coach@example.com',
        firstName: 'Test',
        lastName: 'Coach',
        role: 'coach',
        isSiteAdmin: false,
      };
      mockOrganizationContext = 'org-123';
    });

    it('should require event name', async () => {
      render(<EventNew />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByLabelText(/event name/i)).toBeInTheDocument();
      });

      // The Next button should validate required fields
      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      // Form should show validation error (handled by react-hook-form)
      await waitFor(() => {
        // Still on step 1 because validation failed
        expect(screen.getByText('Basic Information')).toBeInTheDocument();
      });
    });
  });
});
