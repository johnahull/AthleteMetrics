/**
 * Unit tests for InvitationCard component
 *
 * Tests the display of pending event invitations with
 * event details and accept/decline actions.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvitationCard } from '../InvitationCard';
import type { EventInvitationWithEvent } from '@/lib/events-api';

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

// Helper to create mock invitation data
function createMockInvitation(overrides: Partial<EventInvitationWithEvent> = {}): EventInvitationWithEvent {
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 1);

  return {
    id: 'inv-123',
    eventId: 'event-123',
    userId: 'user-123',
    email: null,
    status: 'pending',
    token: 'token-abc123def456',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    invitedBy: 'coach-1',
    emailSent: true,
    emailSentAt: new Date().toISOString(),
    acceptedAt: null,
    declinedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    event: {
      id: 'event-123',
      name: 'Spring Combine 2025',
      startDate: futureDate.toISOString(),
      endDate: null,
      location: 'Main Stadium',
      description: 'Annual spring combine for athletes.',
      status: 'published',
      eventType: 'combine',
      organizationId: 'org-123',
      visibility: 'org_private',
      registrationMode: 'invitation_only',
      maxRegistrations: null,
      createdById: 'coach-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isFrozen: false,
      eventCode: 'SC2025',
      registrationDeadline: null,
      resultsVisibility: 'manual',
      resultsPublishedAt: null,
      resultsPublishedBy: null,
      frozenAt: null,
      frozenBy: null,
      frozenReason: null,
    },
    ...overrides,
  } as EventInvitationWithEvent;
}

describe('InvitationCard', () => {
  describe('Event Details Display', () => {
    it('should display event name', () => {
      render(<InvitationCard invitation={createMockInvitation()} />);
      expect(screen.getByText('Spring Combine 2025')).toBeInTheDocument();
    });

    it('should display event location when provided', () => {
      render(<InvitationCard invitation={createMockInvitation()} />);
      expect(screen.getByText('Main Stadium')).toBeInTheDocument();
    });

    it('should not display location when not provided', () => {
      const invitation = createMockInvitation();
      invitation.event.location = null;
      render(<InvitationCard invitation={invitation} />);
      expect(screen.queryByText('Main Stadium')).not.toBeInTheDocument();
    });

    it('should display event type badge for combine', () => {
      render(<InvitationCard invitation={createMockInvitation()} />);
      expect(screen.getByText('Combine')).toBeInTheDocument();
    });

    it('should display event type badge for tryout', () => {
      const invitation = createMockInvitation();
      invitation.event.eventType = 'tryout';
      render(<InvitationCard invitation={invitation} />);
      expect(screen.getByText('Tryout')).toBeInTheDocument();
    });

    it('should display event type badge for camp', () => {
      const invitation = createMockInvitation();
      invitation.event.eventType = 'camp';
      render(<InvitationCard invitation={invitation} />);
      expect(screen.getByText('Camp')).toBeInTheDocument();
    });

    it('should display event type badge for testing_day', () => {
      const invitation = createMockInvitation();
      invitation.event.eventType = 'testing_day';
      render(<InvitationCard invitation={invitation} />);
      expect(screen.getByText('Testing Day')).toBeInTheDocument();
    });

    it('should display "Event" for unknown event type', () => {
      const invitation = createMockInvitation();
      invitation.event.eventType = 'custom';
      render(<InvitationCard invitation={invitation} />);
      expect(screen.getByText('Event')).toBeInTheDocument();
    });

    it('should display "Invited" badge', () => {
      render(<InvitationCard invitation={createMockInvitation()} />);
      expect(screen.getByText('Invited')).toBeInTheDocument();
    });
  });

  describe('Date Display', () => {
    it('should display formatted event date', () => {
      const futureDate = new Date('2025-06-15T12:00:00Z');
      const invitation = createMockInvitation();
      invitation.event.startDate = futureDate.toISOString();
      render(<InvitationCard invitation={invitation} />);

      // Should show the formatted date
      expect(screen.getByText(/June 15, 2025/)).toBeInTheDocument();
    });

    it('should display time until event', () => {
      render(<InvitationCard invitation={createMockInvitation()} />);

      // Should show time distance to event - the text is inside a div with clock icon
      // Use getAllByText with a function matcher for flexible matching
      const timeElements = screen.getAllByText((content, element) => {
        return element?.tagName === 'DIV' && /In (about )?\d+ (day|days|month|months)/.test(element.textContent || '');
      });
      expect(timeElements.length).toBeGreaterThan(0);
    });
  });

  describe('Expiration Warning', () => {
    it('should display expiration warning when expires in 7 days or less', () => {
      const invitation = createMockInvitation();
      invitation.expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days
      render(<InvitationCard invitation={invitation} />);

      expect(screen.getByText(/Expires in 3 days/)).toBeInTheDocument();
    });

    it('should show singular "day" when expiring tomorrow', () => {
      const invitation = createMockInvitation();
      invitation.expiresAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day
      render(<InvitationCard invitation={invitation} />);

      expect(screen.getByText(/Expires in 1 day/)).toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('should display Accept button as a link', () => {
      render(<InvitationCard invitation={createMockInvitation()} />);

      const acceptLink = screen.getByRole('link', { name: /accept/i });
      expect(acceptLink).toBeInTheDocument();
      expect(acceptLink).toHaveAttribute('href', '/events/invite/token-abc123def456');
    });

    it('should display Decline button when onDecline is provided', () => {
      const onDecline = vi.fn();
      render(<InvitationCard invitation={createMockInvitation()} onDecline={onDecline} />);

      expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
    });

    it('should not display Decline button when onDecline is not provided', () => {
      render(<InvitationCard invitation={createMockInvitation()} />);

      expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument();
    });

    it('should call onDecline with token when Decline clicked', async () => {
      const user = userEvent.setup();
      const onDecline = vi.fn();
      render(<InvitationCard invitation={createMockInvitation()} onDecline={onDecline} />);

      await user.click(screen.getByRole('button', { name: /decline/i }));

      expect(onDecline).toHaveBeenCalledWith('token-abc123def456');
    });

    it('should disable Decline button when isDeclineLoading is true', () => {
      const onDecline = vi.fn();
      render(
        <InvitationCard
          invitation={createMockInvitation()}
          onDecline={onDecline}
          isDeclineLoading={true}
        />
      );

      expect(screen.getByRole('button', { name: /decline/i })).toBeDisabled();
    });

    it('should display View Details button linking to event', () => {
      render(<InvitationCard invitation={createMockInvitation()} />);

      const viewLink = screen.getByRole('link', { name: /view details/i });
      expect(viewLink).toBeInTheDocument();
      expect(viewLink).toHaveAttribute('href', '/events/event-123');
    });
  });

  describe('Edge Cases', () => {
    it('should return null when event is missing', () => {
      const invitation = createMockInvitation();
      // @ts-expect-error - Testing edge case
      invitation.event = null;

      const { container } = render(<InvitationCard invitation={invitation} />);
      expect(container.firstChild).toBeNull();
    });

    it('should handle null eventType gracefully', () => {
      const invitation = createMockInvitation();
      invitation.event.eventType = null;

      render(<InvitationCard invitation={invitation} />);
      expect(screen.getByText('Event')).toBeInTheDocument();
    });
  });
});
