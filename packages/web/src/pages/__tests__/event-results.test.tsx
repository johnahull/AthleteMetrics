/**
 * Unit tests for event-results page component
 *
 * Tests the athlete event results display page that shows:
 * - Event name and date header
 * - Loading state while fetching data
 * - Visibility check (results not available message)
 * - Athlete's own results when registered
 * - Empty state when no measurements
 * - Link back to event detail page
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EventResults from '../event-results';
import type { EventMeasurementWithDetails } from '@/lib/events-api';

// Mock event data
const mockEvent = {
  id: 'event-123',
  name: 'Spring Combine 2025',
  eventType: 'combine',
  status: 'published' as const,
  startDate: new Date('2025-03-15T12:00:00Z'),
  endDate: null,
  location: 'Main Stadium',
  description: 'Annual spring combine event for athletes.',
  visibility: 'org_private' as const,
  registrationMode: 'open' as const,
  maxRegistrations: 50,
  organizationId: 'org-123',
  createdById: 'user-123',
  eventCode: 'SC2025',
  isFrozen: false,
  resultsVisibility: 'after_event' as const,
  resultsPublishedAt: null,
  timezone: 'America/New_York',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: null,
  registrationOpensAt: null,
  registrationClosesAt: null,
  resultsPublishedBy: null,
  frozenAt: null,
  frozenBy: null,
  frozenReason: null,
  createdBy: 'user-123',
};

const mockMeasurements: EventMeasurementWithDetails[] = [
  {
    id: 'meas-1',
    userId: 'user-athlete',
    submittedBy: 'user-123',
    verifiedBy: 'user-123',
    metric: 'VERTICAL_JUMP',
    value: '32.5',
    units: 'in',
    age: 18,
    date: '2025-03-15',
    eventId: 'event-123',
    eventNameSnapshot: 'Spring Combine 2025',
    eventDateSnapshot: '2025-03-15',
    metricLabel: 'Vertical Jump',
    metricUnits: 'inches',
    userFullName: 'John Athlete',
    userEmail: 'john@example.com',
    notes: null,
    isVerified: true,
    flyInDistance: null,
    teamId: null,
    teamNameSnapshot: null,
    organizationId: null,
    season: null,
    teamContextAuto: true,
    globalAthleteId: null,
    isCalculated: false,
    calculatedFromMeasurementIds: null,
    calculationMetadata: null,
    createdAt: new Date('2025-03-15'),
    importSource: null,
    importBatchId: null,
  },
  {
    id: 'meas-2',
    userId: 'user-athlete',
    submittedBy: 'user-123',
    verifiedBy: 'user-123',
    metric: 'DASH_40YD',
    value: '4.85',
    units: 's',
    age: 18,
    date: '2025-03-15',
    eventId: 'event-123',
    eventNameSnapshot: 'Spring Combine 2025',
    eventDateSnapshot: '2025-03-15',
    metricLabel: '40-Yard Dash',
    metricUnits: 'seconds',
    userFullName: 'John Athlete',
    userEmail: 'john@example.com',
    notes: null,
    isVerified: true,
    flyInDistance: null,
    teamId: null,
    teamNameSnapshot: null,
    organizationId: null,
    season: null,
    teamContextAuto: true,
    globalAthleteId: null,
    isCalculated: false,
    calculatedFromMeasurementIds: null,
    calculationMetadata: null,
    createdAt: new Date('2025-03-15'),
    importSource: null,
    importBatchId: null,
  },
];

// Mock hooks
const mockUseEvent = vi.fn();
const mockUseResultsVisible = vi.fn();
const mockUseEventMeasurements = vi.fn();

vi.mock('wouter', () => ({
  useParams: () => ({ eventId: 'event-123' }),
  useLocation: () => ['/events/event-123/results', vi.fn()],
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-athlete', role: 'athlete', athleteId: 'athlete-123' },
  }),
}));

vi.mock('@/lib/events-api', () => ({
  useEvent: () => mockUseEvent(),
  useResultsVisible: () => mockUseResultsVisible(),
  useEventMeasurements: () => mockUseEventMeasurements(),
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

describe('EventResults Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEvent.mockReturnValue({
      data: mockEvent,
      isLoading: false,
      error: null,
    });
    mockUseResultsVisible.mockReturnValue({
      data: { visible: true, canViewOwnResults: true },
      isLoading: false,
      error: null,
    });
    mockUseEventMeasurements.mockReturnValue({
      data: mockMeasurements,
      isLoading: false,
      error: null,
    });
  });

  describe('Loading State', () => {
    it('should display loading spinner while fetching event', () => {
      mockUseEvent.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<EventResults />, { wrapper: createWrapper() });

      expect(screen.getByText(/loading event results/i)).toBeInTheDocument();
    });

    it('should display loading spinner while checking visibility', () => {
      mockUseResultsVisible.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<EventResults />, { wrapper: createWrapper() });

      expect(screen.getByText(/loading event results/i)).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should display error message when event not found', () => {
      mockUseEvent.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Event not found'),
      });

      render(<EventResults />, { wrapper: createWrapper() });

      expect(screen.getByText(/error loading event/i)).toBeInTheDocument();
      expect(screen.getByText(/event not found/i)).toBeInTheDocument();
    });
  });

  describe('Event Header', () => {
    it('should display event name', () => {
      render(<EventResults />, { wrapper: createWrapper() });

      expect(screen.getByRole('heading', { name: /spring combine 2025/i })).toBeInTheDocument();
    });

    it('should display event date', () => {
      render(<EventResults />, { wrapper: createWrapper() });

      // Event date formatted as "EEEE, MMMM d, yyyy" -> "Saturday, March 15, 2025"
      expect(screen.getByText(/saturday, march 15, 2025/i)).toBeInTheDocument();
    });

    it('should display event location when available', () => {
      render(<EventResults />, { wrapper: createWrapper() });

      expect(screen.getByText(/main stadium/i)).toBeInTheDocument();
    });
  });

  describe('Results Visibility', () => {
    it('should show "Results not available" message when visibility is false', () => {
      mockUseResultsVisible.mockReturnValue({
        data: { visible: false, canViewOwnResults: false },
        isLoading: false,
        error: null,
      });

      render(<EventResults />, { wrapper: createWrapper() });

      expect(screen.getByText(/results not available/i)).toBeInTheDocument();
    });

    it('should show results when visibility is true', () => {
      render(<EventResults />, { wrapper: createWrapper() });

      expect(screen.getByText(/your results/i)).toBeInTheDocument();
    });
  });

  describe('Athlete Results', () => {
    it('should display athlete measurements when registered', () => {
      render(<EventResults />, { wrapper: createWrapper() });

      // Should show metric labels
      expect(screen.getByText(/vertical jump/i)).toBeInTheDocument();
      expect(screen.getByText(/40-yard dash/i)).toBeInTheDocument();

      // Should show values with units
      expect(screen.getByText(/32\.5/)).toBeInTheDocument();
      expect(screen.getByText(/inches/i)).toBeInTheDocument();
      expect(screen.getByText(/4\.85/)).toBeInTheDocument();
      expect(screen.getByText(/seconds/i)).toBeInTheDocument();
    });

    it('should show "No results yet" when athlete has no measurements', () => {
      mockUseEventMeasurements.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      render(<EventResults />, { wrapper: createWrapper() });

      expect(screen.getByText(/no results yet/i)).toBeInTheDocument();
    });

    it('should display loading state for measurements', () => {
      mockUseEventMeasurements.mockReturnValue({
        data: [],
        isLoading: true,
        error: null,
      });

      render(<EventResults />, { wrapper: createWrapper() });

      expect(screen.getByText(/loading results/i)).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should display link back to event detail page', () => {
      render(<EventResults />, { wrapper: createWrapper() });

      const backLink = screen.getByRole('link', { name: /back to event/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/events/event-123');
    });
  });
});
