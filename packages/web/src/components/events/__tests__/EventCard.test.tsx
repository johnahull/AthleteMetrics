/**
 * Unit tests for EventCard component
 *
 * Tests the display of event information in card format for list views.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventCard } from '../EventCard';
import type { EventWithCounts } from '@/lib/events-api';

// Helper to create mock event data
function createMockEvent(overrides: Partial<EventWithCounts> = {}): EventWithCounts {
  return {
    id: 'event-123',
    name: 'Spring Combine 2025',
    eventType: 'combine',
    status: 'published',
    startDate: new Date('2025-03-15'),
    endDate: null,
    location: 'Main Stadium',
    description: 'Annual spring combine event for athletes.',
    visibility: 'org_private',
    registrationMode: 'open',
    maxRegistrations: 50,
    registrationCount: 25,
    waitlistCount: 0,
    checkedInCount: 0,
    organizationId: 'org-123',
    createdBy: 'user-123',
    createdAt: new Date(),
    updatedAt: null,
    isFrozen: false,
    eventCode: 'SC2025',
    timezone: 'America/New_York',
    resultsVisibility: 'after_event',
    registrationOpensAt: null,
    registrationClosesAt: null,
    resultsPublishedAt: null,
    resultsPublishedBy: null,
    frozenAt: null,
    frozenBy: null,
    frozenReason: null,
    autoShareReports: false,
    autoShareReportTemplateId: null,
    autoShareMessage: null,
    finalizedAt: null,
    ...overrides,
  };
}

describe('EventCard', () => {
  describe('Event Name & Type', () => {
    it('should display event name', () => {
      render(<EventCard event={createMockEvent({ name: 'Fall Tryouts' })} />);
      expect(screen.getByText('Fall Tryouts')).toBeInTheDocument();
    });

    it('should display "Combine" for combine event type', () => {
      render(<EventCard event={createMockEvent({ eventType: 'combine' })} />);
      expect(screen.getByText('Combine')).toBeInTheDocument();
    });

    it('should display "Camp" for camp event type', () => {
      render(<EventCard event={createMockEvent({ eventType: 'camp' })} />);
      expect(screen.getByText('Camp')).toBeInTheDocument();
    });

    it('should display "Testing Day" for testing_day event type', () => {
      render(<EventCard event={createMockEvent({ eventType: 'testing_day' })} />);
      expect(screen.getByText('Testing Day')).toBeInTheDocument();
    });

    it('should display "Tryout" for tryout event type', () => {
      render(<EventCard event={createMockEvent({ eventType: 'tryout' })} />);
      expect(screen.getByText('Tryout')).toBeInTheDocument();
    });

    it('should display "Event" for custom/unknown event type', () => {
      render(<EventCard event={createMockEvent({ eventType: 'custom' })} />);
      expect(screen.getByText('Event')).toBeInTheDocument();
    });
  });

  describe('Status Badge', () => {
    it('should display status badge for published event', () => {
      render(<EventCard event={createMockEvent({ status: 'published' })} />);
      expect(screen.getByText('Published')).toBeInTheDocument();
    });

    it('should display status badge for active event', () => {
      render(<EventCard event={createMockEvent({ status: 'active' })} />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should display status badge for completed event', () => {
      // Use a future date to avoid duplicate "Completed" text from time label
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      render(<EventCard event={createMockEvent({
        status: 'completed',
        startDate: futureDate,
      })} />);
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
  });

  describe('Date Display', () => {
    it('should display formatted single date', () => {
      // Use explicit time to avoid timezone issues
      render(<EventCard event={createMockEvent({
        startDate: new Date('2025-03-15T12:00:00Z'),
        endDate: null,
      })} />);
      expect(screen.getByText('Mar 15, 2025')).toBeInTheDocument();
    });

    it('should display date range for multi-day event in same month', () => {
      render(<EventCard event={createMockEvent({
        startDate: new Date('2025-03-15T12:00:00Z'),
        endDate: new Date('2025-03-17T12:00:00Z'),
      })} />);
      expect(screen.getByText('Mar 15-17, 2025')).toBeInTheDocument();
    });

    it('should display date range for multi-day event across months', () => {
      render(<EventCard event={createMockEvent({
        startDate: new Date('2025-03-28T12:00:00Z'),
        endDate: new Date('2025-04-02T12:00:00Z'),
      })} />);
      expect(screen.getByText('Mar 28 - Apr 2, 2025')).toBeInTheDocument();
    });
  });

  describe('Time Label', () => {
    it('should display "Completed" for past events', () => {
      // Use a non-completed status so time label is the only "Completed" text
      render(<EventCard event={createMockEvent({
        status: 'published',
        startDate: new Date('2020-01-01T12:00:00Z'),
        endDate: new Date('2020-01-02T12:00:00Z'),
      })} />);
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should display "In Progress" for current events', () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      render(<EventCard event={createMockEvent({
        startDate: yesterday,
        endDate: tomorrow,
      })} />);
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('should display time until event for future events', () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 2);

      render(<EventCard event={createMockEvent({
        startDate: futureDate,
        endDate: null,
      })} />);
      // Should contain "In" followed by time distance
      expect(screen.getByText(/In (about )?\d+ months?/)).toBeInTheDocument();
    });
  });

  describe('Location', () => {
    it('should display location when provided', () => {
      render(<EventCard event={createMockEvent({ location: 'Main Stadium' })} />);
      expect(screen.getByText('Main Stadium')).toBeInTheDocument();
    });

    it('should not display location when not provided', () => {
      render(<EventCard event={createMockEvent({ location: null })} />);
      expect(screen.queryByText('Main Stadium')).not.toBeInTheDocument();
    });
  });

  describe('Registration Stats', () => {
    it('should display registration count', () => {
      render(<EventCard event={createMockEvent({ registrationCount: 25 })} />);
      expect(screen.getByText(/25 registered/)).toBeInTheDocument();
    });

    it('should display registration count with max capacity', () => {
      render(<EventCard event={createMockEvent({
        registrationCount: 25,
        maxRegistrations: 50,
      })} />);
      expect(screen.getByText(/25 registered.*\/ 50/)).toBeInTheDocument();
    });

    it('should display 0 registered when no registrations', () => {
      render(<EventCard event={createMockEvent({
        registrationCount: 0,
        maxRegistrations: null,
      })} />);
      expect(screen.getByText(/0 registered/)).toBeInTheDocument();
    });

    it('should display waitlist count when > 0', () => {
      render(<EventCard event={createMockEvent({ waitlistCount: 5 })} />);
      expect(screen.getByText('5 waitlisted')).toBeInTheDocument();
    });

    it('should not display waitlist when 0', () => {
      render(<EventCard event={createMockEvent({ waitlistCount: 0 })} />);
      expect(screen.queryByText(/waitlisted/)).not.toBeInTheDocument();
    });
  });

  describe('Description', () => {
    it('should display description preview when provided', () => {
      render(<EventCard event={createMockEvent({
        description: 'This is a test event description.',
      })} />);
      expect(screen.getByText('This is a test event description.')).toBeInTheDocument();
    });

    it('should not display description section when not provided', () => {
      render(<EventCard event={createMockEvent({ description: null })} />);
      expect(screen.queryByText('This is a test event description.')).not.toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('should display View Details button by default', () => {
      render(<EventCard event={createMockEvent()} />);
      expect(screen.getByRole('link', { name: /view details/i })).toBeInTheDocument();
    });

    it('should hide View Details button when showViewButton is false', () => {
      render(<EventCard event={createMockEvent()} showViewButton={false} />);
      expect(screen.queryByRole('link', { name: /view details/i })).not.toBeInTheDocument();
    });

    it('should display Manage button when showManageButton and onManage provided', () => {
      const onManage = vi.fn();
      render(<EventCard event={createMockEvent()} showManageButton={true} onManage={onManage} />);
      expect(screen.getByRole('button', { name: /manage/i })).toBeInTheDocument();
    });

    it('should not display Manage button when onManage not provided', () => {
      render(<EventCard event={createMockEvent()} showManageButton={true} />);
      expect(screen.queryByRole('button', { name: /manage/i })).not.toBeInTheDocument();
    });

    it('should call onManage with event when Manage clicked', async () => {
      const user = userEvent.setup();
      const onManage = vi.fn();
      const mockEvent = createMockEvent();

      render(<EventCard event={mockEvent} showManageButton={true} onManage={onManage} />);

      await user.click(screen.getByRole('button', { name: /manage/i }));

      expect(onManage).toHaveBeenCalledWith(mockEvent);
    });

    it('should link View Details to correct event URL', () => {
      render(<EventCard event={createMockEvent({ id: 'event-456' })} />);
      const link = screen.getByRole('link', { name: /view details/i });
      expect(link).toHaveAttribute('href', '/events/event-456');
    });
  });
});
