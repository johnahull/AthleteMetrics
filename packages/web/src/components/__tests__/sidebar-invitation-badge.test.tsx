/**
 * Tests for invitation badge on "My Events" link in Sidebar
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Sidebar from '../sidebar';

// Mock wouter
vi.mock('wouter', () => ({
  useLocation: () => ['/'],
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

// Mock React Query with QueryClient for queryClient.ts module
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

// Mock events API
vi.mock('@/lib/events-api', () => ({
  useMyPendingInvitations: vi.fn(),
}));

// Mock contextual labels hook
vi.mock('@/hooks/useContextualLabels', () => ({
  useContextualLabels: () => ({
    teams: 'Teams',
    athletes: 'Athletes',
  }),
}));

// Mock athlete org context
vi.mock('@/lib/athlete-org-context', () => ({
  useAthleteOrg: () => ({
    filterMode: { type: 'all' },
    setFilterMode: vi.fn(),
    organizations: [],
  }),
}));

// Mock use-my-reports hook (used by sidebar for report badge)
vi.mock('@/hooks/use-my-reports', () => ({
  useUnreadReportCount: vi.fn(() => ({ data: 0, isLoading: false })),
  useMyReports: vi.fn(() => ({ data: { reports: [] }, isLoading: false })),
  useMarkReportViewed: vi.fn(() => ({ mutate: vi.fn() })),
}));

import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { useMyPendingInvitations } from '@/lib/events-api';

describe('Sidebar - Invitation Badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for useQuery (site settings, organization, user orgs)
    (useQuery as any).mockImplementation((options: any) => {
      if (options.queryKey?.[0] === '/api/site-settings/public') {
        return {
          data: { wellnessModuleEnabled: true },
          isLoading: false,
        };
      }
      if (options.queryKey?.[0]?.includes('/api/organizations/')) {
        return {
          data: { eventsEnabled: true, wellnessEnabled: true },
          isLoading: false,
        };
      }
      return {
        data: null,
        isLoading: false,
      };
    });
  });

  it('should show badge on "My Events" when athlete has pending invitations', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'user-1',
        role: 'athlete',
        isSiteAdmin: false,
      },
      logout: vi.fn(),
    });

    const mockInvitations = [
      {
        id: 'inv-1',
        status: 'pending',
        event: { name: 'Event 1' },
      },
      {
        id: 'inv-2',
        status: 'pending',
        event: { name: 'Event 2' },
      },
    ];

    (useMyPendingInvitations as any).mockReturnValue({
      data: mockInvitations,
      isLoading: false,
    });

    render(<Sidebar />);

    // Should show "My Events" nav item
    expect(screen.getByText('My Events')).toBeInTheDocument();

    // Should show badge with count of 2
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should NOT show badge when athlete has no pending invitations', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'user-1',
        role: 'athlete',
        isSiteAdmin: false,
      },
      logout: vi.fn(),
    });

    (useMyPendingInvitations as any).mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<Sidebar />);

    // Should show "My Events" nav item
    expect(screen.getByText('My Events')).toBeInTheDocument();

    // Should NOT show badge
    const navItem = screen.getByText('My Events').closest('div');
    expect(navItem?.querySelector('span[class*="amber"]')).not.toBeInTheDocument();
  });

  it('should NOT fetch invitations for non-athlete users (coach)', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'user-1',
        role: 'coach',
        isSiteAdmin: false,
      },
      logout: vi.fn(),
    });

    // Mock site settings to enable events module
    (useQuery as any).mockImplementation((options: any) => {
      if (options.queryKey?.[0] === '/api/site-settings/public') {
        return {
          data: { wellnessModuleEnabled: true },
          isLoading: false,
        };
      }
      if (options.queryKey?.[0]?.includes('/api/auth/me/organizations')) {
        return {
          data: [{ organizationId: 'org-1' }],
          isLoading: false,
        };
      }
      if (options.queryKey?.[0]?.includes('/api/organizations/org-1')) {
        return {
          data: { eventsEnabled: true },
          isLoading: false,
        };
      }
      return { data: null, isLoading: false };
    });

    (useMyPendingInvitations as any).mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<Sidebar />);

    // Coach should see "Events" link, not "My Events"
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.queryByText('My Events')).not.toBeInTheDocument();
  });

  it('should NOT fetch invitations for site admin users', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'user-1',
        role: 'site_admin',
        isSiteAdmin: true,
      },
      logout: vi.fn(),
    });

    // Mock for site admin context
    (useQuery as any).mockImplementation((options: any) => {
      if (options.queryKey?.[0] === '/api/site-settings') {
        return {
          data: { wellnessModuleEnabled: true },
          isLoading: false,
        };
      }
      return { data: null, isLoading: false };
    });

    (useMyPendingInvitations as any).mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<Sidebar />);

    // Site admin should not see "My Events" in default view
    expect(screen.queryByText('My Events')).not.toBeInTheDocument();
  });

  it('should update badge when invitations data changes', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'user-1',
        role: 'athlete',
        isSiteAdmin: false,
      },
      logout: vi.fn(),
    });

    const mockInvitations = [
      {
        id: 'inv-1',
        status: 'pending',
        event: { name: 'Event 1' },
      },
    ];

    (useMyPendingInvitations as any).mockReturnValue({
      data: mockInvitations,
      isLoading: false,
    });

    const { rerender } = render(<Sidebar />);

    // Initially should show badge with count of 1
    expect(screen.getByText('1')).toBeInTheDocument();

    // Update to 3 invitations
    const updatedInvitations = [
      ...mockInvitations,
      { id: 'inv-2', status: 'pending', event: { name: 'Event 2' } },
      { id: 'inv-3', status: 'pending', event: { name: 'Event 3' } },
    ];

    (useMyPendingInvitations as any).mockReturnValue({
      data: updatedInvitations,
      isLoading: false,
    });

    rerender(<Sidebar />);

    // Should now show badge with count of 3
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
