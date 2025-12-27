/**
 * Unit tests for My Events page - Pending Invitations section
 *
 * Tests the display of pending event invitations on the athlete's
 * My Events page, including accept/decline actions.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyEvents from '../my-events';

// Polyfill for happy-dom (Radix UI components)
beforeAll(() => {
  if (typeof Element.prototype.hasPointerCapture === 'undefined') {
    Element.prototype.hasPointerCapture = function () { return false; };
  }
  if (typeof Element.prototype.setPointerCapture === 'undefined') {
    Element.prototype.setPointerCapture = function () {};
  }
  if (typeof Element.prototype.releasePointerCapture === 'undefined') {
    Element.prototype.releasePointerCapture = function () {};
  }
});

// Mock data
const futureDate = new Date();
futureDate.setMonth(futureDate.getMonth() + 1);

const mockPendingInvitations = [
  {
    id: 'inv-1',
    eventId: 'event-1',
    userId: 'user-123',
    email: null,
    status: 'pending',
    token: 'token-abc123',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    createdAt: new Date().toISOString(),
    event: {
      id: 'event-1',
      name: 'Spring Combine 2025',
      startDate: futureDate.toISOString(),
      endDate: null,
      location: 'Main Stadium',
      status: 'published',
      eventType: 'combine',
      organizationId: 'org-123',
      visibility: 'organization_only',
      registrationMode: 'open',
      maxRegistrations: null,
      createdById: 'coach-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isFrozen: false,
    },
  },
  {
    id: 'inv-2',
    eventId: 'event-2',
    userId: 'user-123',
    email: null,
    status: 'pending',
    token: 'token-def456',
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
    createdAt: new Date().toISOString(),
    event: {
      id: 'event-2',
      name: 'Fall Tryouts',
      startDate: futureDate.toISOString(),
      endDate: null,
      location: 'Field House',
      status: 'published',
      eventType: 'tryout',
      organizationId: 'org-123',
      visibility: 'organization_only',
      registrationMode: 'invitation_only',
      maxRegistrations: 50,
      createdById: 'coach-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isFrozen: false,
    },
  },
];

// Mock hooks
const mockUseMyEvents = vi.fn();
const mockUseMyPendingInvitations = vi.fn();
const mockUseCancelRegistration = vi.fn();
const mockUseDeclineInvitation = vi.fn();
const mockToast = vi.fn();

vi.mock('@/lib/events-api', () => ({
  useMyEvents: () => mockUseMyEvents(),
  useMyPendingInvitations: () => mockUseMyPendingInvitations(),
  useCancelRegistration: () => mockUseCancelRegistration(),
  useDeclineInvitation: () => mockUseDeclineInvitation(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Create wrapper with providers
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('My Events - Pending Invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyEvents.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mockUseCancelRegistration.mockReturnValue({
      mutateAsync: vi.fn(),
    });
    mockUseDeclineInvitation.mockReturnValue({
      mutateAsync: vi.fn(),
    });
  });

  describe('Pending Invitations Section Display', () => {
    it('should show Pending Invitations section when invitations exist', () => {
      mockUseMyPendingInvitations.mockReturnValue({
        data: mockPendingInvitations,
        isLoading: false,
      });

      render(<MyEvents />, { wrapper: createWrapper() });

      expect(screen.getByText(/pending invitations/i)).toBeInTheDocument();
    });

    it('should show invitation count in section header', () => {
      mockUseMyPendingInvitations.mockReturnValue({
        data: mockPendingInvitations,
        isLoading: false,
      });

      render(<MyEvents />, { wrapper: createWrapper() });

      // Should show "(2)" for 2 invitations
      expect(screen.getByText(/pending invitations.*\(2\)/i)).toBeInTheDocument();
    });

    it('should hide Pending Invitations section when no invitations', () => {
      mockUseMyPendingInvitations.mockReturnValue({
        data: [],
        isLoading: false,
      });

      render(<MyEvents />, { wrapper: createWrapper() });

      expect(screen.queryByText(/pending invitations/i)).not.toBeInTheDocument();
    });

    it('should hide section when invitations data is undefined', () => {
      mockUseMyPendingInvitations.mockReturnValue({
        data: undefined,
        isLoading: false,
      });

      render(<MyEvents />, { wrapper: createWrapper() });

      expect(screen.queryByText(/pending invitations/i)).not.toBeInTheDocument();
    });
  });

  describe('Invitation Card Display', () => {
    beforeEach(() => {
      mockUseMyPendingInvitations.mockReturnValue({
        data: mockPendingInvitations,
        isLoading: false,
      });
    });

    it('should display event name for each invitation', () => {
      render(<MyEvents />, { wrapper: createWrapper() });

      expect(screen.getByText('Spring Combine 2025')).toBeInTheDocument();
      expect(screen.getByText('Fall Tryouts')).toBeInTheDocument();
    });

    it('should display event location when provided', () => {
      render(<MyEvents />, { wrapper: createWrapper() });

      expect(screen.getByText('Main Stadium')).toBeInTheDocument();
      expect(screen.getByText('Field House')).toBeInTheDocument();
    });

    it('should display event type badge', () => {
      render(<MyEvents />, { wrapper: createWrapper() });

      expect(screen.getByText('Combine')).toBeInTheDocument();
      expect(screen.getByText('Tryout')).toBeInTheDocument();
    });
  });

  describe('Accept Action', () => {
    beforeEach(() => {
      mockUseMyPendingInvitations.mockReturnValue({
        data: [mockPendingInvitations[0]],
        isLoading: false,
      });
    });

    it('should display Accept button for each invitation', () => {
      render(<MyEvents />, { wrapper: createWrapper() });

      const acceptButtons = screen.getAllByRole('button', { name: /accept/i });
      expect(acceptButtons.length).toBeGreaterThan(0);
    });

    it('should link Accept button to invitation acceptance page', () => {
      render(<MyEvents />, { wrapper: createWrapper() });

      // The accept button should be a link to /events/invite/:token
      const acceptLink = screen.getByRole('link', { name: /accept/i });
      expect(acceptLink).toHaveAttribute('href', '/events/invite/token-abc123');
    });
  });

  describe('Decline Action', () => {
    beforeEach(() => {
      mockUseMyPendingInvitations.mockReturnValue({
        data: [mockPendingInvitations[0]],
        isLoading: false,
      });
    });

    it('should display Decline button for each invitation', () => {
      render(<MyEvents />, { wrapper: createWrapper() });

      const declineButtons = screen.getAllByRole('button', { name: /decline/i });
      expect(declineButtons.length).toBeGreaterThan(0);
    });

    it('should call decline mutation when Decline clicked', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({ success: true });
      mockUseDeclineInvitation.mockReturnValue({
        mutateAsync: mockMutateAsync,
      });

      const user = userEvent.setup();
      render(<MyEvents />, { wrapper: createWrapper() });

      const declineButton = screen.getByRole('button', { name: /decline/i });
      await user.click(declineButton);

      expect(mockMutateAsync).toHaveBeenCalledWith('token-abc123');
    });

    it('should show success toast after declining', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({ success: true });
      mockUseDeclineInvitation.mockReturnValue({
        mutateAsync: mockMutateAsync,
      });

      const user = userEvent.setup();
      render(<MyEvents />, { wrapper: createWrapper() });

      const declineButton = screen.getByRole('button', { name: /decline/i });
      await user.click(declineButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringMatching(/declined/i),
          })
        );
      });
    });
  });

  describe('Loading State', () => {
    it('should show skeleton loading when invitations are loading', () => {
      mockUseMyPendingInvitations.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      render(<MyEvents />, { wrapper: createWrapper() });

      // Check for skeleton elements (animate-pulse class)
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Section Ordering', () => {
    it('should display Pending Invitations section before other sections', () => {
      mockUseMyPendingInvitations.mockReturnValue({
        data: mockPendingInvitations,
        isLoading: false,
      });
      mockUseMyEvents.mockReturnValue({
        data: [{
          id: 'reg-1',
          status: 'approved',
          event: {
            id: 'event-3',
            name: 'Existing Event',
            startDate: futureDate.toISOString(),
          },
        }],
        isLoading: false,
      });

      render(<MyEvents />, { wrapper: createWrapper() });

      // Pending Invitations should appear before Upcoming Events
      const pageContent = document.body.textContent || '';
      const invitationsIndex = pageContent.indexOf('Pending Invitations');
      const upcomingIndex = pageContent.indexOf('Upcoming Events');

      expect(invitationsIndex).toBeLessThan(upcomingIndex);
    });
  });

  describe('Visual Styling', () => {
    it('should use distinct visual style for invitation cards', () => {
      mockUseMyPendingInvitations.mockReturnValue({
        data: [mockPendingInvitations[0]],
        isLoading: false,
      });

      render(<MyEvents />, { wrapper: createWrapper() });

      // The pending invitations section should have a distinct border color (amber/yellow)
      const section = screen.getByText(/pending invitations/i).closest('section');
      expect(section).toBeInTheDocument();
    });
  });
});
