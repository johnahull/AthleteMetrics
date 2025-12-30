/**
 * Tests for Event Detail Page Permissions
 *
 * Verifies that:
 * - Athletes only see Overview tab and View My Results button
 * - Coaches/Org Admins see all admin tabs and controls
 * - Site Admins have full access
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});

// Mock wouter
vi.mock('wouter', () => ({
  useParams: () => ({ eventId: 'test-event-123' }),
  useLocation: () => ['/events/test-event-123', vi.fn()],
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// Mock events-api
const mockEvent = {
  id: 'test-event-123',
  name: 'Spring Combine 2024',
  organizationId: 'org-123',
  status: 'published',
  startDate: new Date('2024-04-15'),
  endDate: null,
  location: 'Training Center',
  description: 'Annual spring combine event',
  eventCode: 'SPRING24',
  isFrozen: false,
  resultsPublishedAt: new Date('2024-04-16'),
  visibility: 'org_private',
  registrationMode: 'open',
  maxRegistrations: null,
  resultsVisibility: 'after_event',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockRegistrations = [
  {
    id: 'reg-1',
    eventId: 'test-event-123',
    userId: 'user-1',
    status: 'approved',
    userFullNameSnapshot: 'John Athlete',
    createdAt: new Date(),
  },
];

vi.mock('@/lib/events-api', () => ({
  useEvent: vi.fn(() => ({ data: mockEvent, isLoading: false, error: null })),
  useEventRegistrations: vi.fn(() => ({ data: mockRegistrations, isLoading: false })),
  useEventInvitations: vi.fn(() => ({ data: [], isLoading: false })),
  useFreezeEvent: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUnfreezeEvent: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useApproveRegistration: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeclineRegistration: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useCancelInvitation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock event components
vi.mock('@/components/events', () => ({
  EventStatusBadge: ({ status }: { status: string }) => <span data-testid="status-badge">{status}</span>,
  EventMetricsTab: () => <div data-testid="metrics-tab">Metrics Content</div>,
  EventResultsTab: () => <div data-testid="results-tab">Results Content</div>,
  EventReportsTab: () => <div data-testid="reports-tab">Reports Content</div>,
  CheckInTab: () => <div data-testid="checkin-tab">Check-In Content</div>,
  InviteAthletesModal: () => null,
}));

// Mock user with different roles
type MockUserType = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  isSiteAdmin: boolean;
} | null;

type MockUserOrg = {
  organizationId: string;
  role: 'athlete' | 'coach' | 'org_admin';
};

let mockUser: MockUserType = null;
let mockUserOrganizations: MockUserOrg[] = [];

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    userOrganizations: mockUserOrganizations,
    isLoading: false,
  }),
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

describe('Event Detail Page Permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockUserOrganizations = [];
  });

  describe('Athlete View (no management permissions)', () => {
    beforeEach(() => {
      mockUser = {
        id: 'athlete-1',
        firstName: 'John',
        lastName: 'Athlete',
        role: 'athlete',
        isSiteAdmin: false,
      };
      // Athlete in a different org or no role
      mockUserOrganizations = [
        { organizationId: 'other-org-456', role: 'athlete' },
      ];
    });

    it('should show only Overview tab for athletes', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
      });

      // Admin tabs should NOT be visible
      expect(screen.queryByTestId('tab-registrations')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tab-checkin')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tab-metrics')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tab-results')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tab-reports')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tab-settings')).not.toBeInTheDocument();
    });

    it('should NOT show Edit Event button for athletes', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Spring Combine 2024')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /edit event/i })).not.toBeInTheDocument();
    });

    it('should NOT show Freeze/Unfreeze button for athletes', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Spring Combine 2024')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /freeze/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /unfreeze/i })).not.toBeInTheDocument();
    });

    it('should show View My Results button when results are published', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Spring Combine 2024')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /view my results/i })).toBeInTheDocument();
    });

    it('should NOT show Quick Actions card for athletes', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Spring Combine 2024')).toBeInTheDocument();
      });

      expect(screen.queryByText('Quick Actions')).not.toBeInTheDocument();
    });

    it('should NOT show registration stats (Registered, Checked In, Pending, Waitlisted) for athletes', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Spring Combine 2024')).toBeInTheDocument();
      });

      // Admin stats should NOT be visible to athletes
      expect(screen.queryByText('Registered')).not.toBeInTheDocument();
      expect(screen.queryByText('Checked In')).not.toBeInTheDocument();
      expect(screen.queryByText('Pending')).not.toBeInTheDocument();
      expect(screen.queryByText('Waitlisted')).not.toBeInTheDocument();
    });
  });

  describe('Coach View (has management permissions)', () => {
    beforeEach(() => {
      mockUser = {
        id: 'coach-1',
        firstName: 'Coach',
        lastName: 'Smith',
        role: 'coach',
        isSiteAdmin: false,
      };
      // Coach in the event's organization
      mockUserOrganizations = [
        { organizationId: 'org-123', role: 'coach' },
      ];
    });

    it('should show all admin tabs for coaches', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
      });

      // All admin tabs should be visible
      expect(screen.getByTestId('tab-registrations')).toBeInTheDocument();
      expect(screen.getByTestId('tab-checkin')).toBeInTheDocument();
      expect(screen.getByTestId('tab-metrics')).toBeInTheDocument();
      expect(screen.getByTestId('tab-results')).toBeInTheDocument();
      expect(screen.getByTestId('tab-reports')).toBeInTheDocument();
      expect(screen.getByTestId('tab-settings')).toBeInTheDocument();
    });

    it('should show Edit Event button for coaches', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Spring Combine 2024')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /edit event/i })).toBeInTheDocument();
    });

    it('should show Freeze button for coaches', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Spring Combine 2024')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /freeze/i })).toBeInTheDocument();
    });

    it('should show Quick Actions card for coaches', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Spring Combine 2024')).toBeInTheDocument();
      });

      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });

    it('should show registration stats for coaches', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Spring Combine 2024')).toBeInTheDocument();
      });

      // Admin stats should be visible to coaches
      expect(screen.getByText('Registered')).toBeInTheDocument();
      expect(screen.getByText('Checked In')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Waitlisted')).toBeInTheDocument();
    });
  });

  describe('Org Admin View', () => {
    beforeEach(() => {
      mockUser = {
        id: 'admin-1',
        firstName: 'Admin',
        lastName: 'Jones',
        role: 'org_admin',
        isSiteAdmin: false,
      };
      // Org admin in the event's organization
      mockUserOrganizations = [
        { organizationId: 'org-123', role: 'org_admin' },
      ];
    });

    it('should show all admin tabs for org admins', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
      });

      expect(screen.getByTestId('tab-registrations')).toBeInTheDocument();
      expect(screen.getByTestId('tab-checkin')).toBeInTheDocument();
      expect(screen.getByTestId('tab-metrics')).toBeInTheDocument();
      expect(screen.getByTestId('tab-results')).toBeInTheDocument();
      expect(screen.getByTestId('tab-reports')).toBeInTheDocument();
      expect(screen.getByTestId('tab-settings')).toBeInTheDocument();
    });

    it('should show Edit Event button for org admins', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Spring Combine 2024')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /edit event/i })).toBeInTheDocument();
    });
  });

  describe('Site Admin View', () => {
    beforeEach(() => {
      mockUser = {
        id: 'site-admin-1',
        firstName: 'Site',
        lastName: 'Admin',
        role: 'admin',
        isSiteAdmin: true,
      };
      // Site admin doesn't need to be in the org
      mockUserOrganizations = [];
    });

    it('should show all admin tabs for site admins', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
      });

      expect(screen.getByTestId('tab-registrations')).toBeInTheDocument();
      expect(screen.getByTestId('tab-checkin')).toBeInTheDocument();
      expect(screen.getByTestId('tab-metrics')).toBeInTheDocument();
      expect(screen.getByTestId('tab-results')).toBeInTheDocument();
      expect(screen.getByTestId('tab-reports')).toBeInTheDocument();
      expect(screen.getByTestId('tab-settings')).toBeInTheDocument();
    });

    it('should show all admin controls for site admins even without org membership', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Spring Combine 2024')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /edit event/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /freeze/i })).toBeInTheDocument();
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });
  });

  describe('Coach in Different Organization', () => {
    beforeEach(() => {
      mockUser = {
        id: 'coach-other',
        firstName: 'Other',
        lastName: 'Coach',
        role: 'coach',
        isSiteAdmin: false,
      };
      // Coach in a different organization
      mockUserOrganizations = [
        { organizationId: 'different-org-999', role: 'coach' },
      ];
    });

    it('should NOT show admin tabs for coaches from different org', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
      });

      // Admin tabs should NOT be visible
      expect(screen.queryByTestId('tab-registrations')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tab-checkin')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tab-metrics')).not.toBeInTheDocument();
    });

    it('should NOT show admin controls for coaches from different org', async () => {
      render(<EventDetail />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Spring Combine 2024')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /edit event/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /freeze/i })).not.toBeInTheDocument();
    });
  });
});
