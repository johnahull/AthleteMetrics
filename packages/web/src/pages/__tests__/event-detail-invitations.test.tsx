/**
 * Unit tests for Event Detail - Pending Invitations section
 *
 * Tests the display of pending event invitations on the Registrations tab
 * of the event detail page for coaches/admins.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EventDetail from '../event-detail';

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
  // Mock clipboard API
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
    writable: true,
    configurable: true,
  });
});

// Mock event data
const mockEvent = {
  id: 'event-123',
  name: 'Spring Combine 2025',
  eventType: 'combine',
  status: 'published',
  startDate: new Date('2025-03-15T12:00:00Z').toISOString(),
  endDate: null,
  location: 'Main Stadium',
  description: 'Annual spring combine event for athletes.',
  visibility: 'organization_only',
  registrationMode: 'open',
  maxRegistrations: 50,
  organizationId: 'org-123',
  createdById: 'user-123',
  eventCode: 'SC2025',
  isFrozen: false,
  resultsVisibility: 'after_event',
  resultsPublishedAt: null,
};

const mockRegistrations = [
  {
    id: 'reg-1',
    userId: 'user-1',
    eventId: 'event-123',
    status: 'approved',
    userFullNameSnapshot: 'John Smith',
    organizationNameSnapshot: 'Test Org',
    registrationNumber: 1,
  },
  {
    id: 'reg-2',
    userId: 'user-2',
    eventId: 'event-123',
    status: 'pending',
    userFullNameSnapshot: 'Jane Doe',
    organizationNameSnapshot: 'Test Org',
    registrationNumber: 2,
  },
];

// Mock user data (for userId lookup)
const mockUsers = {
  'user-athlete-1': {
    id: 'user-athlete-1',
    fullName: 'Alice Johnson',
    email: 'alice@example.com',
  },
  'user-athlete-2': {
    id: 'user-athlete-2',
    fullName: 'Bob Williams',
    email: 'bob@example.com',
  },
  'coach-1': {
    id: 'coach-1',
    fullName: 'Coach Sarah',
    email: 'coach@example.com',
  },
};

const mockInvitations = [
  {
    id: 'inv-1',
    eventId: 'event-123',
    userId: 'user-athlete-1',
    email: null,
    status: 'pending',
    token: 'token-abc123',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    invitedBy: 'coach-1',
    emailSent: true,
    emailSentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    acceptedAt: null,
    declinedAt: null,
    cancelledAt: null,
    cancelledBy: null,
  },
  {
    id: 'inv-2',
    eventId: 'event-123',
    userId: null,
    email: 'external@example.com',
    status: 'pending',
    token: 'token-def456',
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days (expiring soon)
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    invitedBy: 'coach-1',
    emailSent: true,
    emailSentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    acceptedAt: null,
    declinedAt: null,
    cancelledAt: null,
    cancelledBy: null,
  },
  {
    id: 'inv-3',
    eventId: 'event-123',
    userId: 'user-athlete-2',
    email: null,
    status: 'declined',
    token: 'token-ghi789',
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    invitedBy: 'coach-1',
    emailSent: true,
    emailSentAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    acceptedAt: null,
    declinedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
    cancelledAt: null,
    cancelledBy: null,
  },
  {
    id: 'inv-4',
    eventId: 'event-123',
    userId: 'user-athlete-1',
    email: null,
    status: 'cancelled',
    token: 'token-jkl012',
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    invitedBy: 'coach-1',
    emailSent: true,
    emailSentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    acceptedAt: null,
    declinedAt: null,
    cancelledAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    cancelledBy: 'coach-1',
  },
];

// Mock mutations
const mockCancelInvitationMutate = vi.fn();
const mockFreezeMutate = vi.fn();
const mockUnfreezeMutate = vi.fn();
const mockApproveMutate = vi.fn();
const mockDeclineMutate = vi.fn();

// Mock hooks
vi.mock('wouter', () => ({
  useParams: () => ({ eventId: 'event-123' }),
  useLocation: () => ['/events/event-123', vi.fn()],
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-123', role: 'coach' },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock event-related API hooks
const mockUseEvent = vi.fn();
const mockUseEventRegistrations = vi.fn();
const mockUseEventInvitations = vi.fn();

vi.mock('@/lib/events-api', () => ({
  useEvent: () => mockUseEvent(),
  useEventRegistrations: () => mockUseEventRegistrations(),
  useEventInvitations: () => mockUseEventInvitations(),
  useFreezeEvent: () => ({
    mutateAsync: mockFreezeMutate,
    isPending: false,
  }),
  useUnfreezeEvent: () => ({
    mutateAsync: mockUnfreezeMutate,
    isPending: false,
  }),
  useApproveRegistration: () => ({
    mutateAsync: mockApproveMutate,
    isPending: false,
  }),
  useDeclineRegistration: () => ({
    mutateAsync: mockDeclineMutate,
    isPending: false,
  }),
  // TODO: Add this hook when implementing
  useCancelInvitation: () => ({
    mutateAsync: mockCancelInvitationMutate,
    isPending: false,
  }),
}));

// Mock child components
vi.mock('@/components/events', () => ({
  EventStatusBadge: ({ status }: { status: string }) => (
    <div data-testid="event-status-badge">{status}</div>
  ),
  EventMetricsTab: () => <div data-testid="metrics-tab">Metrics Tab Content</div>,
  EventResultsTab: () => <div data-testid="results-tab">Results Tab Content</div>,
  EventReportsTab: () => <div data-testid="reports-tab">Reports Tab Content</div>,
  CheckInTab: () => <div data-testid="checkin-tab">Check-In Tab Content</div>,
  InviteAthletesModal: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div data-testid="invite-modal">Invite Modal</div> : null
  ),
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

describe('EventDetail Page - Pending Invitations Section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEvent.mockReturnValue({
      data: mockEvent,
      isLoading: false,
      error: null,
    });
    mockUseEventRegistrations.mockReturnValue({
      data: mockRegistrations,
      isLoading: false,
    });
    mockUseEventInvitations.mockReturnValue({
      data: mockInvitations,
      isLoading: false,
    });
  });

  describe('Pending Invitations Section Display', () => {
    it('should show "Pending Invitations" section when there are invitations', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // Check for the section header text (appears in both tab and card header)
      const pendingInvitationsText = screen.getAllByText(/Pending Invitations/i);
      expect(pendingInvitationsText.length).toBeGreaterThan(0);
    });

    it('should NOT show "Pending Invitations" section when there are no invitations', async () => {
      mockUseEventInvitations.mockReturnValue({
        data: [],
        isLoading: false,
      });

      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      expect(screen.queryByText(/Pending Invitations/i)).not.toBeInTheDocument();
    });

    it('should display invitation count in section header', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // 4 total invitations
      expect(screen.getByText(/4 invitations/i)).toBeInTheDocument();
    });

    it('should show invitations section above registrations list', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // Find elements by their text content and check order
      const invitationsText = screen.getByText('4 invitations'); // Description unique to invitations section
      const registrationsText = screen.getByText(/2 total registrations/i); // Description unique to registrations section

      // Invitations should come before registrations in DOM order
      expect(invitationsText.compareDocumentPosition(registrationsText))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });

  describe('Individual Invitation Display', () => {
    it('should display invitee userId when userId exists (placeholder for user lookup)', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // Should show user ID placeholder (first 8 chars + "...")
      const userIdPlaceholder = screen.getAllByText(/User user-ath/i);
      expect(userIdPlaceholder.length).toBeGreaterThan(0);
    });

    it('should display invitee email when no userId', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      expect(screen.getByText('external@example.com')).toBeInTheDocument();
    });

    it('should display "Pending" status badge for pending invitations', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      const pendingBadges = screen.getAllByText(/^Pending$/i);
      // 2 pending invitations (inv-1, inv-2) + 1 pending registration = 3 total
      expect(pendingBadges.length).toBeGreaterThanOrEqual(2);
    });

    it('should display "Declined" status badge for declined invitations', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      expect(screen.getByText(/^Declined$/i)).toBeInTheDocument();
    });

    it('should display "Cancelled" status badge for cancelled invitations', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      expect(screen.getByText(/^Cancelled$/i)).toBeInTheDocument();
    });

    it('should display time since invited (e.g., "2 days ago")', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // Should show relative time
      expect(screen.getByText(/2 days ago/i)).toBeInTheDocument();
      expect(screen.getByText(/5 days ago/i)).toBeInTheDocument();
    });

    it('should display expiration warning when expires in 7 days or less', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // inv-2 expires in 3 days
      expect(screen.getByText(/Expires in 3 days/i)).toBeInTheDocument();
    });

    it('should NOT display expiration warning when expires in more than 7 days', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // inv-1 expires in 7 days - should show warning
      expect(screen.getByText(/Expires in 7 days/i)).toBeInTheDocument();

      // inv-3 expires in 10 days - should NOT show warning (but is declined, so no warning anyway)
      expect(screen.queryByText(/Expires in 10 days/i)).not.toBeInTheDocument();
    });

    it('should display "invited by" coach ID when available (placeholder for user lookup)', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // All invitations invited by coach-1 (showing as "by Coach coach-1...")
      const coachElements = screen.getAllByText(/by Coach coach-1/i);
      expect(coachElements.length).toBeGreaterThan(0);
    });
  });

  describe('Cancel Action', () => {
    it('should display Cancel button for pending invitations', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // Should have Cancel buttons for pending invitations (2)
      const cancelButtons = screen.getAllByRole('button', { name: /^Cancel$/i });
      expect(cancelButtons.length).toBe(2);
    });

    it('should NOT display Cancel button for declined invitations', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // Check that "Declined" badge exists
      expect(screen.getByText(/^Declined$/i)).toBeInTheDocument();

      // Should NOT have Cancel button in declined row - we'll verify by checking total Cancel buttons
      // There should only be 2 Cancel buttons (for the 2 pending invitations)
      const cancelButtons = screen.getAllByRole('button', { name: /^Cancel$/i });
      expect(cancelButtons.length).toBe(2);
    });

    it('should NOT display Cancel button for cancelled invitations', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // Check that "Cancelled" badge exists
      expect(screen.getByText(/^Cancelled$/i)).toBeInTheDocument();

      // The cancelled row should NOT have a Cancel button
      // We can check by looking at all Cancel buttons - should only be 2 (for pending)
      const cancelButtons = screen.getAllByRole('button', { name: /^Cancel$/i });
      expect(cancelButtons.length).toBe(2); // Only pending invitations
    });

    it('should show confirmation dialog when Cancel clicked', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      const cancelButtons = screen.getAllByRole('button', { name: /^Cancel$/i });
      await user.click(cancelButtons[0]);

      // Should show confirmation dialog
      expect(screen.getByRole('heading', { name: /Cancel Invitation/i })).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to cancel this invitation/i)).toBeInTheDocument();
    });

    it('should call cancel mutation when confirmed', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      const cancelButtons = screen.getAllByRole('button', { name: /^Cancel$/i });
      await user.click(cancelButtons[0]);

      // Click "Cancel Invitation" button in dialog
      const confirmButton = screen.getByRole('button', { name: /Cancel Invitation$/i });
      await user.click(confirmButton);

      expect(mockCancelInvitationMutate).toHaveBeenCalledWith({
        eventId: 'event-123',
        invitationId: 'inv-1', // First pending invitation
      });
    });
  });

  describe('Tab Count Updates', () => {
    it('should show combined count in Registrations tab label', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      const registrationsTab = screen.getByTestId('tab-registrations');

      // 2 registrations + 4 invitations = should show both counts
      // Format: "Registrations (2 + 4 pending invitations)"
      expect(registrationsTab).toHaveTextContent(/2/); // registrations count
      expect(registrationsTab).toHaveTextContent(/4/); // invitations count
    });

    it('should show only registration count when no invitations', async () => {
      mockUseEventInvitations.mockReturnValue({
        data: [],
        isLoading: false,
      });

      render(<EventDetail />, { wrapper: createWrapper() });

      const registrationsTab = screen.getByTestId('tab-registrations');

      // Should only show registration count
      expect(registrationsTab).toHaveTextContent(/2/);
      expect(registrationsTab).not.toHaveTextContent(/pending invitations/i);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty invitations array', async () => {
      mockUseEventInvitations.mockReturnValue({
        data: [],
        isLoading: false,
      });

      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // Should not show invitations section
      expect(screen.queryByText(/Pending Invitations/i)).not.toBeInTheDocument();
    });

    it('should handle loading state for invitations', async () => {
      mockUseEventInvitations.mockReturnValue({
        data: [],
        isLoading: true,
      });

      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // When loading, invitations section should still appear if data is empty array
      // OR it should not appear at all (depends on implementation)
      // Since we check `invitations && invitations.length > 0`, loading won't show section
      expect(screen.queryByRole('heading', { name: /Pending Invitations/i })).not.toBeInTheDocument();
    });

    it('should handle error state for invitations', async () => {
      mockUseEventInvitations.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Failed to fetch invitations'),
      });

      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // Should not crash - invitations section should not appear
      expect(screen.queryByText(/Pending Invitations/i)).not.toBeInTheDocument();
    });

    it('should handle invitation with null invitedBy', async () => {
      const invitationsWithNullInvitedBy = [
        {
          ...mockInvitations[0],
          invitedBy: null,
        },
      ];

      mockUseEventInvitations.mockReturnValue({
        data: invitationsWithNullInvitedBy,
        isLoading: false,
      });

      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // Should not crash, should show invitation without coach name
      expect(screen.getByText(/User user-ath/i)).toBeInTheDocument();
      // Should NOT show "by Coach" when invitedBy is null
      expect(screen.queryByText(/by Coach/i)).not.toBeInTheDocument();
    });
  });

  describe('Styling and UX', () => {
    it('should use amber/yellow styling for pending invitations section', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // Look for amber/yellow classes - check the element containing "4 invitations"
      const invitationsDescription = screen.getByText('4 invitations');
      const invitationsCard = invitationsDescription.closest('div[class*="border"]');
      const hasAmberStyling = invitationsCard?.className.includes('amber') ||
                              invitationsCard?.className.includes('yellow');

      expect(hasAmberStyling).toBe(true);
    });

    it('should show invitations section above registrations list', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      // Find elements by their unique text and check order
      const invitationsText = screen.getByText('4 invitations');
      const registrationsText = screen.getByText(/2 total registrations/i);

      // Invitations should come before registrations
      expect(invitationsText.compareDocumentPosition(registrationsText))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });
});
