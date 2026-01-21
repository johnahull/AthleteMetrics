/**
 * TDD Tests for InviteAthletesModal - Organization Members Tab
 *
 * Tests the ability to invite organization members to an event
 * by selecting them from a list with checkboxes.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InviteAthletesModal } from '../InviteAthletesModal';

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

// Mock data - athlete.id IS the userId (athletes are User records)
const mockAthletes = [
  { id: 'user-1', fullName: 'John Smith', teamName: 'Varsity' },
  { id: 'user-2', fullName: 'Maria Garcia', teamName: 'Varsity' },
  { id: 'user-3', fullName: 'Tyler Johnson', teamName: 'JV' },
  { id: 'user-4', fullName: 'Sarah Williams', teamName: 'Varsity' },
];

const mockRegistrations = [
  { id: 'reg-1', userId: 'user-1', status: 'approved' }, // John is registered
];

const mockInvitations = [
  { id: 'inv-1', userId: 'user-3', status: 'pending', email: null }, // Tyler has pending invite
];

// Mock mutation
const mockMutateAsync = vi.fn();

// Mock modules
vi.mock('@/lib/api', () => ({
  queries: {
    athletes: () => ({
      queryKey: ['athletes', { organizationId: 'org-123' }],
      queryFn: () => Promise.resolve(mockAthletes),  // API returns array directly
    }),
  },
}));

vi.mock('@/lib/events-api', () => ({
  useEventRegistrations: () => ({
    data: mockRegistrations,
    isLoading: false,
  }),
  useEventInvitations: () => ({
    data: mockInvitations,
    isLoading: false,
  }),
  useCreateEventInvitation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
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

describe('InviteAthletesModal - Organization Members Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockReset();
    mockMutateAsync.mockResolvedValue({ id: 'new-inv' });
  });

  describe('Tab Navigation', () => {
    it('should display Organization Members tab by default', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      // Should show Organization tab as active
      const orgTab = screen.getByRole('tab', { name: /organization/i });
      expect(orgTab).toHaveAttribute('data-state', 'active');
    });

    it('should switch to By Email tab when clicked', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const emailTab = screen.getByRole('tab', { name: /email/i });
      await user.click(emailTab);

      expect(emailTab).toHaveAttribute('data-state', 'active');
      // Email input should be visible
      expect(screen.getByPlaceholderText(/enter email/i)).toBeInTheDocument();
    });
  });

  describe('Athletes List', () => {
    it('should display athletes from organization', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
        expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
        expect(screen.getByText('Tyler Johnson')).toBeInTheDocument();
        expect(screen.getByText('Sarah Williams')).toBeInTheDocument();
      });
    });

    it('should show team name for each athlete', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getAllByText('Varsity').length).toBeGreaterThan(0);
        expect(screen.getByText('JV')).toBeInTheDocument();
      });
    });
  });

  describe('Athlete Status Indicators', () => {
    it('should show "Registered" status for registered athletes', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // John should have Registered badge
      expect(screen.getByText('Registered')).toBeInTheDocument();
    });

    it('should show "Pending" status for athletes with pending invites', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('Tyler Johnson')).toBeInTheDocument();
      });

      // Tyler should have Pending badge
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('should disable checkbox for registered athletes', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      const johnCheckbox = screen.getByRole('checkbox', { name: /john smith/i });
      expect(johnCheckbox).toBeDisabled();
    });

    it('should disable checkbox for pending invitation athletes', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('Tyler Johnson')).toBeInTheDocument();
      });

      const tylerCheckbox = screen.getByRole('checkbox', { name: /tyler johnson/i });
      expect(tylerCheckbox).toBeDisabled();
    });
  });

  describe('Selection', () => {
    it('should toggle athlete selection when checkbox clicked', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
      });

      const mariaCheckbox = screen.getByRole('checkbox', { name: /maria garcia/i });
      await user.click(mariaCheckbox);
      expect(mariaCheckbox).toBeChecked();

      await user.click(mariaCheckbox);
      expect(mariaCheckbox).not.toBeChecked();
    });

    it('should show selected count', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
      });

      // Select two athletes
      const mariaCheckbox = screen.getByRole('checkbox', { name: /maria garcia/i });
      const sarahCheckbox = screen.getByRole('checkbox', { name: /sarah williams/i });
      await user.click(mariaCheckbox);
      await user.click(sarahCheckbox);

      expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
    });

    it('should select all eligible athletes with Select All', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
      });

      // Click Select All
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      await user.click(selectAllCheckbox);

      // Should select Maria and Sarah (2 eligible), not John (registered) or Tyler (pending)
      expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
    });

    it('should deselect all when Select All clicked again', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
      });

      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      await user.click(selectAllCheckbox); // Select all
      await user.click(selectAllCheckbox); // Deselect all

      // Button should show 0 invitations
      expect(screen.getByRole('button', { name: /send 0 invitation/i })).toBeInTheDocument();
    });
  });

  describe('Search', () => {
    it('should filter athletes by name search', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'maria');

      expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
      expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
      expect(screen.queryByText('Tyler Johnson')).not.toBeInTheDocument();
    });
  });

  describe('Send Invitations', () => {
    it('should call API with userId for each selected athlete', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
      });

      // Select Maria and Sarah
      const mariaCheckbox = screen.getByRole('checkbox', { name: /maria garcia/i });
      const sarahCheckbox = screen.getByRole('checkbox', { name: /sarah williams/i });
      await user.click(mariaCheckbox);
      await user.click(sarahCheckbox);

      // Click send button
      const sendButton = screen.getByRole('button', { name: /send 2 invitation/i });
      await user.click(sendButton);

      await waitFor(() => {
        // Should be called with userId, not email
        expect(mockMutateAsync).toHaveBeenCalledWith({
          eventId: 'event-123',
          data: { userId: 'user-2' }, // Maria
        });
        expect(mockMutateAsync).toHaveBeenCalledWith({
          eventId: 'event-123',
          data: { userId: 'user-4' }, // Sarah
        });
      });
    });

    it('should disable send button when no athletes selected', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={() => {}}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
      });

      const sendButton = screen.getByRole('button', { name: /send 0 invitation/i });
      expect(sendButton).toBeDisabled();
    });

    it('should close modal after successful send', async () => {
      const onClose = vi.fn();

      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          organizationId="org-123"
          isOpen={true}
          onClose={onClose}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
      });

      const mariaCheckbox = screen.getByRole('checkbox', { name: /maria garcia/i });
      await user.click(mariaCheckbox);

      const sendButton = screen.getByRole('button', { name: /send 1 invitation/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });
  });
});
