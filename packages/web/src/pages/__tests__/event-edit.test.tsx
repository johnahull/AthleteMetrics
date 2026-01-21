/**
 * TDD Tests for EventEdit page
 *
 * EventEdit allows editing existing events using the same EventForm wizard.
 * It loads existing event data, pre-fills the form, and calls updateEvent API.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import EventEdit from '../event-edit';

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

// Mock event data
const mockEvent = {
  id: 'event-123',
  name: 'Spring Combine 2025',
  eventType: 'combine',
  location: 'Main Gymnasium',
  startDate: new Date('2025-04-15'),
  endDate: new Date('2025-04-16'),
  description: 'Annual spring combine for athletes',
  visibility: 'org_private',
  registrationMode: 'open',
  maxRegistrations: 100,
  resultsVisibility: 'after_event',
  organizationId: 'org-123',
  status: 'draft',
  timezone: 'America/New_York',
};

// Mock navigate function
const mockNavigate = vi.fn();

// Mock wouter hooks
vi.mock('wouter', async () => {
  const actual = await vi.importActual('wouter');
  return {
    ...actual,
    useLocation: () => ['/events/event-123/edit', mockNavigate],
    useParams: () => ({ eventId: 'event-123' }),
    useRoute: () => [true, { eventId: 'event-123' }],
  };
});

// Mock useAuth
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-123', isSiteAdmin: false },
    organizationContext: 'org-123',
    userOrganizations: [{ organizationId: 'org-123', organizationName: 'Test Org' }],
    isLoading: false,
    error: null,
  })),
}));

// Mock events-api hooks
const mockUpdateMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};

vi.mock('@/lib/events-api', () => ({
  useEvent: vi.fn(() => ({
    data: mockEvent,
    isLoading: false,
    error: null,
  })),
  useUpdateEvent: vi.fn(() => mockUpdateMutation),
  addEventMetric: vi.fn(),
}));

// Mock site metrics
vi.mock('@/lib/metrics-api', () => ({
  useSiteMetrics: vi.fn(() => ({
    data: [
      { code: 'FLY10_TIME', label: '10-Yard Fly', category: 'Speed', unit: 'seconds' },
      { code: 'VERTICAL_JUMP', label: 'Vertical Jump', category: 'Power', unit: 'inches' },
    ],
    isLoading: false,
    error: null,
  })),
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
      <Router>
        {children}
      </Router>
    </QueryClientProvider>
  );
}

describe('EventEdit Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockUpdateMutation.mutateAsync.mockClear();
  });

  describe('Loading and Initial State', () => {
    it('should load existing event data into form', async () => {
      render(<EventEdit />, { wrapper: createWrapper() });

      // Wait for event data to load and form to render
      await waitFor(() => {
        expect(screen.getByDisplayValue('Spring Combine 2025')).toBeInTheDocument();
      });
    });

    it('should show loading state while fetching event', async () => {
      // Override mock to show loading
      const { useEvent } = await import('@/lib/events-api');
      vi.mocked(useEvent).mockReturnValueOnce({
        data: undefined,
        isLoading: true,
        error: null,
      } as any);

      const { container } = render(<EventEdit />, { wrapper: createWrapper() });

      // Loading state uses Skeleton components with animate-pulse class
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should show error state if event not found', async () => {
      const { useEvent } = await import('@/lib/events-api');
      vi.mocked(useEvent).mockReturnValueOnce({
        data: undefined,
        isLoading: false,
        error: new Error('Event not found'),
      } as any);

      render(<EventEdit />, { wrapper: createWrapper() });

      expect(screen.getByText(/event not found/i)).toBeInTheDocument();
    });
  });

  describe('Form Pre-fill', () => {
    it('should pre-fill event name', async () => {
      render(<EventEdit />, { wrapper: createWrapper() });

      await waitFor(() => {
        const nameInput = screen.getByDisplayValue('Spring Combine 2025');
        expect(nameInput).toBeInTheDocument();
      });
    });

    it('should pre-fill location', async () => {
      render(<EventEdit />, { wrapper: createWrapper() });

      await waitFor(() => {
        const locationInput = screen.getByDisplayValue('Main Gymnasium');
        expect(locationInput).toBeInTheDocument();
      });
    });

    it('should pre-fill description', async () => {
      render(<EventEdit />, { wrapper: createWrapper() });

      await waitFor(() => {
        const descriptionInput = screen.getByDisplayValue('Annual spring combine for athletes');
        expect(descriptionInput).toBeInTheDocument();
      });
    });

    it('should pre-fill start date', async () => {
      render(<EventEdit />, { wrapper: createWrapper() });

      await waitFor(() => {
        const dateInput = screen.getByDisplayValue('2025-04-15');
        expect(dateInput).toBeInTheDocument();
      });
    });
  });

  describe('Edit Mode UI', () => {
    it('should show "Save Changes" button instead of "Publish Event"', async () => {
      render(<EventEdit />, { wrapper: createWrapper() });

      // Navigate to last step
      await waitFor(() => {
        expect(screen.getByDisplayValue('Spring Combine 2025')).toBeInTheDocument();
      });

      // Click through steps to reach final step
      const nextButton = screen.getByRole('button', { name: /next/i });
      const user = userEvent.setup();

      await user.click(nextButton); // Step 1 -> 2
      await user.click(nextButton); // Step 2 -> 3
      await user.click(nextButton); // Step 3 -> 4

      // On final step, should show "Save Changes" not "Publish Event"
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /publish event/i })).not.toBeInTheDocument();
      });
    });

    it('should show edit page header', async () => {
      render(<EventEdit />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/edit event/i)).toBeInTheDocument();
      });
    });

    it('should show back link to event detail', async () => {
      render(<EventEdit />, { wrapper: createWrapper() });

      await waitFor(() => {
        const backLink = screen.getByRole('link', { name: /back/i });
        expect(backLink).toHaveAttribute('href', '/events/event-123');
      });
    });
  });

  describe('Form Submission', () => {
    it('should call updateEvent API on submit', async () => {
      mockUpdateMutation.mutateAsync.mockResolvedValueOnce(mockEvent);

      render(<EventEdit />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByDisplayValue('Spring Combine 2025')).toBeInTheDocument();
      });

      // Navigate to final step and submit
      const user = userEvent.setup();
      const nextButton = screen.getByRole('button', { name: /next/i });

      await user.click(nextButton);
      await user.click(nextButton);
      await user.click(nextButton);

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockUpdateMutation.mutateAsync).toHaveBeenCalled();
      });
    });

    it('should navigate back to detail page on success', async () => {
      mockUpdateMutation.mutateAsync.mockResolvedValueOnce(mockEvent);

      render(<EventEdit />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByDisplayValue('Spring Combine 2025')).toBeInTheDocument();
      });

      const user = userEvent.setup();
      const nextButton = screen.getByRole('button', { name: /next/i });

      await user.click(nextButton);
      await user.click(nextButton);
      await user.click(nextButton);

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/events/event-123');
      });
    });
  });

  describe('Cancel/Back Navigation', () => {
    it('should navigate to event detail when cancel clicked', async () => {
      render(<EventEdit />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByDisplayValue('Spring Combine 2025')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      const user = userEvent.setup();
      await user.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/events/event-123');
    });
  });
});
