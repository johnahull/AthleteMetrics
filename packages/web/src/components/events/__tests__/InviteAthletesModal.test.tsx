/**
 * TDD Tests for InviteAthletesModal component
 *
 * InviteAthletesModal allows coaches to invite athletes to an event via email.
 * It supports single and bulk email invitations.
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

// Mock invitation data
const mockInvitations = [
  {
    id: 'inv-1',
    eventId: 'event-123',
    email: 'existing@example.com',
    status: 'pending',
    createdAt: new Date('2025-01-01'),
  },
];

// Mock create mutation
const mockCreateMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};

vi.mock('@/lib/events-api', () => ({
  useCreateEventInvitation: vi.fn(() => mockCreateMutation),
  useEventInvitations: vi.fn(() => ({
    data: mockInvitations,
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
      {children}
    </QueryClientProvider>
  );
}

describe('InviteAthletesModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMutation.mutateAsync.mockClear();
    mockOnClose.mockClear();
  });

  describe('Modal Display', () => {
    it('should display modal when open', () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/invite athletes/i)).toBeInTheDocument();
    });

    it('should not display modal when closed', () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={false}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByText(/invite athletes/i)).not.toBeInTheDocument();
    });

    it('should show event name in modal header', () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/Spring Combine 2025/)).toBeInTheDocument();
    });
  });

  describe('Email Input', () => {
    it('should have an email input field', () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    });

    it('should validate email format', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const emailInput = screen.getByPlaceholderText(/email/i);
      await user.type(emailInput, 'invalid-email');

      // Validation happens when trying to add the email (press Enter)
      await user.type(emailInput, '{enter}');

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeInTheDocument();
      });
    });

    it('should allow adding multiple emails', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const emailInput = screen.getByPlaceholderText(/email/i);

      // Type email and press Enter to add
      await user.type(emailInput, 'athlete1@example.com{enter}');
      await user.type(emailInput, 'athlete2@example.com{enter}');

      // Should show both emails in the list
      expect(screen.getByText('athlete1@example.com')).toBeInTheDocument();
      expect(screen.getByText('athlete2@example.com')).toBeInTheDocument();
    });

    it('should allow removing an email from the list', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const emailInput = screen.getByPlaceholderText(/email/i);

      // Add an email
      await user.type(emailInput, 'athlete1@example.com{enter}');
      expect(screen.getByText('athlete1@example.com')).toBeInTheDocument();

      // Remove it
      const removeButton = screen.getByRole('button', { name: /remove/i });
      await user.click(removeButton);

      expect(screen.queryByText('athlete1@example.com')).not.toBeInTheDocument();
    });
  });

  describe('Send Invitations', () => {
    it('should call API for each email when send clicked', async () => {
      mockCreateMutation.mutateAsync.mockResolvedValue({});

      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const emailInput = screen.getByPlaceholderText(/email/i);

      // Add emails
      await user.type(emailInput, 'athlete1@example.com{enter}');
      await user.type(emailInput, 'athlete2@example.com{enter}');

      // Click send
      const sendButton = screen.getByRole('button', { name: /send.*invitation/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockCreateMutation.mutateAsync).toHaveBeenCalledTimes(2);
        expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith({
          eventId: 'event-123',
          data: { email: 'athlete1@example.com' },
        });
        expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith({
          eventId: 'event-123',
          data: { email: 'athlete2@example.com' },
        });
      });
    });

    it('should close modal after successful send', async () => {
      mockCreateMutation.mutateAsync.mockResolvedValue({});

      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const emailInput = screen.getByPlaceholderText(/email/i);

      await user.type(emailInput, 'athlete@example.com{enter}');

      const sendButton = screen.getByRole('button', { name: /send.*invitation/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should show count of emails to send', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const emailInput = screen.getByPlaceholderText(/email/i);

      await user.type(emailInput, 'athlete1@example.com{enter}');
      await user.type(emailInput, 'athlete2@example.com{enter}');

      // Button should show count
      expect(screen.getByRole('button', { name: /send 2 invitation/i })).toBeInTheDocument();
    });
  });

  describe('Duplicate Detection', () => {
    it('should prevent duplicate emails in the list', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const emailInput = screen.getByPlaceholderText(/email/i);

      await user.type(emailInput, 'athlete@example.com{enter}');
      await user.type(emailInput, 'athlete@example.com{enter}');

      // Should only show one instance
      const emails = screen.getAllByText('athlete@example.com');
      expect(emails.length).toBe(1);
    });

    it('should warn about already invited emails', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const emailInput = screen.getByPlaceholderText(/email/i);

      // Try to add email that already has an invitation
      await user.type(emailInput, 'existing@example.com{enter}');

      // Should show warning
      expect(screen.getByText(/already.*invited/i)).toBeInTheDocument();
    });
  });

  describe('Cancel Action', () => {
    it('should close modal when cancel clicked', async () => {
      render(
        <InviteAthletesModal
          eventId="event-123"
          eventName="Spring Combine 2025"
          isOpen={true}
          onClose={mockOnClose}
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
