/**
 * Tests for pending invitations alert banner on My Events page
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MyEvents from '../my-events';

// Mock the events API
vi.mock('@/lib/events-api', () => ({
  useMyEvents: vi.fn(),
  useMyPendingInvitations: vi.fn(),
  useCancelRegistration: vi.fn(),
  useDeclineInvitation: vi.fn(),
}));

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock wouter
vi.mock('wouter', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { useMyEvents, useMyPendingInvitations, useCancelRegistration, useDeclineInvitation } from '@/lib/events-api';

describe('MyEvents - Pending Invitations Alert', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    (useMyEvents as any).mockReturnValue({
      data: [],
      isLoading: false,
    });

    (useCancelRegistration as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    (useDeclineInvitation as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it('should show alert banner when there are pending invitations', () => {
    const mockInvitations = [
      {
        id: 'inv-1',
        status: 'pending',
        token: 'token-1',
        event: {
          id: 'event-1',
          name: 'Spring Championship',
          startDate: '2025-05-01',
          status: 'published',
        },
      },
      {
        id: 'inv-2',
        status: 'pending',
        token: 'token-2',
        event: {
          id: 'event-2',
          name: 'Summer Combine',
          startDate: '2025-06-15',
          status: 'published',
        },
      },
    ];

    (useMyPendingInvitations as any).mockReturnValue({
      data: mockInvitations,
      isLoading: false,
    });

    render(<MyEvents />);

    // Should show alert banner
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/You have 2 pending invitations!/)).toBeInTheDocument();
    expect(screen.getByText(/Review and respond to your invitations below/)).toBeInTheDocument();
  });

  it('should NOT show alert banner when no pending invitations', () => {
    (useMyPendingInvitations as any).mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<MyEvents />);

    // Should NOT show alert banner
    expect(screen.queryByText(/pending invitation/i)).not.toBeInTheDocument();
  });

  it('should display correct count in alert message', () => {
    const mockInvitations = [
      {
        id: 'inv-1',
        status: 'pending',
        token: 'token-1',
        event: {
          id: 'event-1',
          name: 'Spring Championship',
          startDate: '2025-05-01',
          status: 'published',
        },
      },
      {
        id: 'inv-2',
        status: 'pending',
        token: 'token-2',
        event: {
          id: 'event-2',
          name: 'Summer Combine',
          startDate: '2025-06-15',
          status: 'published',
        },
      },
      {
        id: 'inv-3',
        status: 'pending',
        token: 'token-3',
        event: {
          id: 'event-3',
          name: 'Fall Classic',
          startDate: '2025-09-10',
          status: 'published',
        },
      },
    ];

    (useMyPendingInvitations as any).mockReturnValue({
      data: mockInvitations,
      isLoading: false,
    });

    render(<MyEvents />);

    expect(screen.getByText(/You have 3 pending invitations!/)).toBeInTheDocument();
  });

  it('should show singular "invitation" for count of 1', () => {
    const mockInvitations = [
      {
        id: 'inv-1',
        status: 'pending',
        token: 'token-1',
        event: {
          id: 'event-1',
          name: 'Spring Championship',
          startDate: '2025-05-01',
          status: 'published',
        },
      },
    ];

    (useMyPendingInvitations as any).mockReturnValue({
      data: mockInvitations,
      isLoading: false,
    });

    render(<MyEvents />);

    expect(screen.getByText(/You have 1 pending invitation!/)).toBeInTheDocument();
  });

  it('should show plural "invitations" for count > 1', () => {
    const mockInvitations = [
      {
        id: 'inv-1',
        status: 'pending',
        token: 'token-1',
        event: {
          id: 'event-1',
          name: 'Spring Championship',
          startDate: '2025-05-01',
          status: 'published',
        },
      },
      {
        id: 'inv-2',
        status: 'pending',
        token: 'token-2',
        event: {
          id: 'event-2',
          name: 'Summer Combine',
          startDate: '2025-06-15',
          status: 'published',
        },
      },
    ];

    (useMyPendingInvitations as any).mockReturnValue({
      data: mockInvitations,
      isLoading: false,
    });

    render(<MyEvents />);

    expect(screen.getByText(/You have 2 pending invitations!/)).toBeInTheDocument();
  });
});
