/**
 * TDD Tests for CheckInTab component
 *
 * CheckInTab allows coaches to search and check in athletes when they arrive at an event.
 * It displays progress stats, filter options, and a list of registrations.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CheckInTab } from '../CheckInTab';

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

// Mock registration data
const mockRegistrations = [
  {
    id: 'reg-1',
    eventId: 'event-123',
    userId: 'user-1',
    status: 'approved',
    checkedInAt: null,
    userFullNameSnapshot: 'John Smith',
    user: { firstName: 'John', lastName: 'Smith' },
    createdAt: new Date('2025-01-01'),
  },
  {
    id: 'reg-2',
    eventId: 'event-123',
    userId: 'user-2',
    status: 'approved',
    checkedInAt: new Date('2025-04-15T08:45:00'),
    userFullNameSnapshot: 'Maria Garcia',
    user: { firstName: 'Maria', lastName: 'Garcia' },
    createdAt: new Date('2025-01-02'),
  },
  {
    id: 'reg-3',
    eventId: 'event-123',
    userId: 'user-3',
    status: 'approved',
    checkedInAt: null,
    userFullNameSnapshot: 'Tyler Johnson',
    user: { firstName: 'Tyler', lastName: 'Johnson' },
    createdAt: new Date('2025-01-03'),
  },
  {
    id: 'reg-4',
    eventId: 'event-123',
    userId: 'user-4',
    status: 'checked_in',
    checkedInAt: new Date('2025-04-15T09:00:00'),
    userFullNameSnapshot: 'Sarah Williams',
    user: { firstName: 'Sarah', lastName: 'Williams' },
    createdAt: new Date('2025-01-04'),
  },
];

// Mock check-in mutation
const mockCheckInMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};

vi.mock('@/lib/events-api', () => ({
  useCheckInRegistration: vi.fn(() => mockCheckInMutation),
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

describe('CheckInTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckInMutation.mutateAsync.mockClear();
  });

  describe('Progress Display', () => {
    it('should display check-in progress stats', () => {
      render(
        <CheckInTab
          eventId="event-123"
          registrations={mockRegistrations as any}
        />,
        { wrapper: createWrapper() }
      );

      // Should show progress: 2 checked in out of 4 approved
      expect(screen.getByText(/2.*of.*4.*checked in/i)).toBeInTheDocument();
    });

    it('should display progress percentage', () => {
      render(
        <CheckInTab
          eventId="event-123"
          registrations={mockRegistrations as any}
        />,
        { wrapper: createWrapper() }
      );

      // 2 of 4 = 50%
      expect(screen.getByText(/50%/)).toBeInTheDocument();
    });
  });

  describe('Filter Functionality', () => {
    it('should show all registrations by default', () => {
      render(
        <CheckInTab
          eventId="event-123"
          registrations={mockRegistrations as any}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
      expect(screen.getByText('Tyler Johnson')).toBeInTheDocument();
      expect(screen.getByText('Sarah Williams')).toBeInTheDocument();
    });

    it('should filter to show only waiting athletes', async () => {
      render(
        <CheckInTab
          eventId="event-123"
          registrations={mockRegistrations as any}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();

      // Click on "Waiting" filter
      const waitingFilter = screen.getByRole('button', { name: /waiting/i });
      await user.click(waitingFilter);

      // Should show only non-checked-in athletes
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Tyler Johnson')).toBeInTheDocument();
      expect(screen.queryByText('Maria Garcia')).not.toBeInTheDocument();
      expect(screen.queryByText('Sarah Williams')).not.toBeInTheDocument();
    });

    it('should filter to show only checked-in athletes', async () => {
      render(
        <CheckInTab
          eventId="event-123"
          registrations={mockRegistrations as any}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();

      // Click on "Checked In" filter
      const checkedInFilter = screen.getByRole('button', { name: /checked in/i });
      await user.click(checkedInFilter);

      // Should show only checked-in athletes
      expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
      expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
      expect(screen.queryByText('Tyler Johnson')).not.toBeInTheDocument();
      expect(screen.getByText('Sarah Williams')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should search athletes by name', async () => {
      render(
        <CheckInTab
          eventId="event-123"
          registrations={mockRegistrations as any}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'Smith');

      // Should show only matching athlete (John Smith)
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.queryByText('Maria Garcia')).not.toBeInTheDocument();
      expect(screen.queryByText('Tyler Johnson')).not.toBeInTheDocument();
      expect(screen.queryByText('Sarah Williams')).not.toBeInTheDocument();
    });

    it('should be case-insensitive search', async () => {
      render(
        <CheckInTab
          eventId="event-123"
          registrations={mockRegistrations as any}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'MARIA');

      expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
    });
  });

  describe('Check-In Action', () => {
    it('should show check-in button for waiting athletes', () => {
      render(
        <CheckInTab
          eventId="event-123"
          registrations={mockRegistrations as any}
        />,
        { wrapper: createWrapper() }
      );

      // Find check-in buttons (should be 2 - for John and Tyler who are waiting)
      const checkInButtons = screen.getAllByRole('button', { name: /check in/i });
      expect(checkInButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('should call check-in API when button clicked', async () => {
      mockCheckInMutation.mutateAsync.mockResolvedValueOnce({});

      render(
        <CheckInTab
          eventId="event-123"
          registrations={mockRegistrations as any}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();

      // Find all check-in buttons (should be 2 - for waiting athletes)
      const checkInButtons = screen.getAllByRole('button', { name: /^check in$/i });
      // Click the first check-in button (John Smith's)
      await user.click(checkInButtons[0]);

      await waitFor(() => {
        expect(mockCheckInMutation.mutateAsync).toHaveBeenCalledWith({
          eventId: 'event-123',
          userId: 'user-1',
        });
      });
    });

    it('should show check-in time for checked-in athletes', () => {
      render(
        <CheckInTab
          eventId="event-123"
          registrations={mockRegistrations as any}
        />,
        { wrapper: createWrapper() }
      );

      // Maria was checked in at 8:45 AM
      expect(screen.getByText(/8:45/i)).toBeInTheDocument();
    });

    it('should show checked indicator for checked-in athletes', () => {
      render(
        <CheckInTab
          eventId="event-123"
          registrations={mockRegistrations as any}
        />,
        { wrapper: createWrapper() }
      );

      // Should show check marks or "Checked In" indicators for Maria and Sarah
      const checkedIndicators = screen.getAllByTestId('checked-indicator');
      expect(checkedIndicators.length).toBe(2);
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no registrations', () => {
      render(
        <CheckInTab
          eventId="event-123"
          registrations={[]}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/No registrations available for check-in/)).toBeInTheDocument();
    });

    it('should show message when search has no results', async () => {
      render(
        <CheckInTab
          eventId="event-123"
          registrations={mockRegistrations as any}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'NonExistentName');

      expect(screen.getByText(/no.*athletes.*found/i)).toBeInTheDocument();
    });
  });
});
