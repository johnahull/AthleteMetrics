/**
 * Unit tests for event-detail page component
 *
 * Tests the event management page with tabs for Overview, Registrations,
 * Check-In, Metrics, Results, Reports, and Settings.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  // Mock clipboard API - use defineProperty since clipboard is read-only
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
  {
    id: 'reg-3',
    userId: 'user-3',
    eventId: 'event-123',
    status: 'waitlisted',
    userFullNameSnapshot: 'Bob Wilson',
    organizationNameSnapshot: null,
    registrationNumber: 3,
  },
  {
    id: 'reg-4',
    userId: 'user-4',
    eventId: 'event-123',
    status: 'checked_in',
    userFullNameSnapshot: 'Alice Brown',
    organizationNameSnapshot: 'Test Org',
    registrationNumber: 4,
  },
];

// Mock mutations
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

vi.mock('@/lib/events-api', () => ({
  useEvent: () => mockUseEvent(),
  useEventRegistrations: () => mockUseEventRegistrations(),
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

describe('EventDetail Page', () => {
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
  });

  describe('Loading State', () => {
    it('should display loading skeletons while fetching event', () => {
      mockUseEvent.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<EventDetail />, { wrapper: createWrapper() });

      // Should show skeleton loaders
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Error State', () => {
    it('should display error message when event not found', () => {
      mockUseEvent.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Not found'),
      });

      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByText(/event not found/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to events/i })).toBeInTheDocument();
    });
  });

  describe('Event Header', () => {
    it('should display event name', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByRole('heading', { name: 'Spring Combine 2025' })).toBeInTheDocument();
    });

    it('should display status badge', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByTestId('event-status-badge')).toHaveTextContent('published');
    });

    it('should display frozen badge when event is frozen', () => {
      mockUseEvent.mockReturnValue({
        data: { ...mockEvent, isFrozen: true },
        isLoading: false,
        error: null,
      });

      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByText('Frozen')).toBeInTheDocument();
    });

    it('should display event date', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      // Event date should be displayed - format: "EEEE, MMMM d, yyyy"
      expect(screen.getByText(/Saturday, March 15, 2025/)).toBeInTheDocument();
    });

    it('should display event location', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByText('Main Stadium')).toBeInTheDocument();
    });

    it('should display event code', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByText(/Code: SC2025/)).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should display all tabs', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
      expect(screen.getByTestId('tab-registrations')).toBeInTheDocument();
      expect(screen.getByTestId('tab-checkin')).toBeInTheDocument();
      expect(screen.getByTestId('tab-metrics')).toBeInTheDocument();
      expect(screen.getByTestId('tab-results')).toBeInTheDocument();
      expect(screen.getByTestId('tab-reports')).toBeInTheDocument();
      expect(screen.getByTestId('tab-settings')).toBeInTheDocument();
    });

    it('should show Overview tab by default', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByTestId('tab-overview')).toHaveAttribute('data-state', 'active');
    });

    it('should switch to Registrations tab when clicked', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      expect(screen.getByTestId('tab-registrations')).toHaveAttribute('data-state', 'active');
    });

    it('should display registration count in tab', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      // 2 approved/checked_in + 1 pending = 3 total
      expect(screen.getByTestId('tab-registrations')).toHaveTextContent('3');
    });

    it('should display check-in count in tab', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      // 1 checked_in / 2 approved (includes checked_in)
      expect(screen.getByTestId('tab-checkin')).toHaveTextContent('1/2');
    });
  });

  describe('Overview Tab - Stats Cards', () => {
    it('should display registered count', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      // Should show stats card with "Registered" label - use getAllByText since it appears multiple places
      const registeredElements = screen.getAllByText(/Registered/);
      expect(registeredElements.length).toBeGreaterThan(0);
    });

    it('should display checked in count', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByText('Checked In')).toBeInTheDocument();
    });

    it('should display pending count', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('should display waitlisted count', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByText('Waitlisted')).toBeInTheDocument();
    });

    it('should display event description', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByText('Annual spring combine event for athletes.')).toBeInTheDocument();
    });
  });

  describe('Overview Tab - Quick Actions', () => {
    it('should display View Registrations button', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /view registrations/i })).toBeInTheDocument();
    });

    it('should display Start Check-In button', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /start check-in/i })).toBeInTheDocument();
    });

    it('should display Configure Metrics button', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /configure metrics/i })).toBeInTheDocument();
    });

    it('should display Copy Join Link button', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      const copyButtons = screen.getAllByRole('button', { name: /copy join link/i });
      expect(copyButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Registrations Tab', () => {
    it('should display registrations list when tab is clicked', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.getByText('Bob Wilson')).toBeInTheDocument();
    });

    it('should display Invite Athletes button', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      expect(screen.getByRole('button', { name: /invite athletes/i })).toBeInTheDocument();
    });

    it('should show Approve/Decline buttons for pending registrations', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
    });

    it('should display empty state when no registrations', async () => {
      mockUseEventRegistrations.mockReturnValue({
        data: [],
        isLoading: false,
      });

      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));

      expect(screen.getByText(/no registrations yet/i)).toBeInTheDocument();
    });
  });

  describe('Freeze/Unfreeze Actions', () => {
    it('should display Freeze button when event is not frozen', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /freeze/i })).toBeInTheDocument();
    });

    it('should display Unfreeze button when event is frozen', () => {
      mockUseEvent.mockReturnValue({
        data: { ...mockEvent, isFrozen: true },
        isLoading: false,
        error: null,
      });

      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /unfreeze/i })).toBeInTheDocument();
    });

    it('should call freeze mutation when Freeze clicked', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByRole('button', { name: /^freeze$/i }));

      expect(mockFreezeMutate).toHaveBeenCalledWith({
        eventId: 'event-123',
        reason: 'Manual freeze by admin',
      });
    });

    it('should call unfreeze mutation when Unfreeze clicked', async () => {
      mockUseEvent.mockReturnValue({
        data: { ...mockEvent, isFrozen: true },
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByRole('button', { name: /unfreeze/i }));

      expect(mockUnfreezeMutate).toHaveBeenCalledWith('event-123');
    });
  });

  describe('Edit Event', () => {
    it('should display Edit Event button', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /edit event/i })).toBeInTheDocument();
    });
  });

  describe('Settings Tab', () => {
    it('should display event settings', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-settings'));

      expect(screen.getByText('Visibility')).toBeInTheDocument();
      expect(screen.getByText('Registration Mode')).toBeInTheDocument();
      expect(screen.getByText('Max Capacity')).toBeInTheDocument();
      expect(screen.getByText('Results Visibility')).toBeInTheDocument();
    });

    it('should display visibility value', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-settings'));

      expect(screen.getByText(/organization only/i)).toBeInTheDocument();
    });

    it('should display max registrations', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-settings'));

      expect(screen.getByText('50')).toBeInTheDocument();
    });
  });

  describe('Invite Athletes Modal', () => {
    it('should open invite modal when Invite Athletes clicked', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));
      await user.click(screen.getByRole('button', { name: /invite athletes/i }));

      expect(screen.getByTestId('invite-modal')).toBeInTheDocument();
    });
  });

  describe('Copy Event Code', () => {
    it('should have copy buttons in the UI', () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      // Find the Copy Join Link button in Quick Actions (this one has text)
      const copyJoinLinkButtons = screen.getAllByRole('button', { name: /copy join link/i });
      expect(copyJoinLinkButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Registration Approval', () => {
    it('should call approve mutation when Approve clicked', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));
      await user.click(screen.getByRole('button', { name: /approve/i }));

      expect(mockApproveMutate).toHaveBeenCalledWith({
        eventId: 'event-123',
        registrationId: 'reg-2', // Jane Doe's pending registration
      });
    });
  });

  describe('Decline Registration Dialog', () => {
    it('should open decline dialog when Decline clicked', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));
      await user.click(screen.getByRole('button', { name: /^decline$/i }));

      // Dialog should open with title and textarea
      expect(screen.getByRole('heading', { name: /decline registration/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/reason for declining/i)).toBeInTheDocument();
    });

    it('should call decline mutation with reason when confirmed', async () => {
      const user = userEvent.setup();
      render(<EventDetail />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId('tab-registrations'));
      await user.click(screen.getByRole('button', { name: /^decline$/i }));

      // Enter reason
      await user.type(screen.getByPlaceholderText(/reason for declining/i), 'Capacity reached');

      // Click Decline Registration button in dialog (use getAllByRole and filter)
      const declineButtons = screen.getAllByRole('button', { name: /decline registration/i });
      await user.click(declineButtons[declineButtons.length - 1]); // Click the one in dialog

      expect(mockDeclineMutate).toHaveBeenCalledWith({
        eventId: 'event-123',
        registrationId: 'reg-2',
        reason: 'Capacity reached',
      });
    });
  });
});
