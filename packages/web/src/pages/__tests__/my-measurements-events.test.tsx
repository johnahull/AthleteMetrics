/**
 * Unit tests for my-measurements page with event integration
 *
 * Tests the event badge display on measurements that were taken at events:
 * - Event badge shows event name for measurements with eventId
 * - Event badge links to event results page
 * - Non-event measurements show normal source (no badge)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyMeasurementsPage from '../my-measurements';
import type { Measurement } from '@shared/schema';

// Mock measurements data
const mockMeasurementsWithEvents: Measurement[] = [
  {
    id: 'meas-1',
    userId: 'user-athlete',
    submittedBy: 'coach-123',
    verifiedBy: 'coach-123',
    metric: 'VERTICAL_JUMP',
    value: '32.5',
    units: 'in',
    age: 18,
    date: '2025-03-15',
    eventId: 'event-123',
    eventNameSnapshot: 'Spring Combine 2025',
    eventDateSnapshot: '2025-03-15',
    notes: null,
    isVerified: true,
    flyInDistance: null,
    auxiliaryValue: null,
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
    submittedBy: 'coach-123',
    verifiedBy: 'coach-123',
    metric: 'DASH_40YD',
    value: '4.85',
    units: 's',
    age: 18,
    date: '2025-02-01',
    eventId: null,
    eventNameSnapshot: null,
    eventDateSnapshot: null,
    notes: null,
    isVerified: true,
    flyInDistance: null,
    auxiliaryValue: null,
    teamId: null,
    teamNameSnapshot: null,
    organizationId: null,
    season: null,
    teamContextAuto: true,
    globalAthleteId: null,
    isCalculated: false,
    calculatedFromMeasurementIds: null,
    calculationMetadata: null,
    createdAt: new Date('2025-02-01'),
    importSource: null,
    importBatchId: null,
  },
];

// Mock available metrics
const mockAvailableMetrics = [
  { code: 'VERTICAL_JUMP', label: 'Vertical Jump', units: 'inches' },
  { code: 'DASH_40YD', label: '40-Yard Dash', units: 'seconds' },
];

// Mock hooks
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-athlete', role: 'athlete', athleteId: 'athlete-123' },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useAthleteContext', () => ({
  useAthleteContext: () => ({
    athleteId: 'athlete-123',
    isLoading: false,
  }),
}));

const mockMeasurementHistory = vi.fn();
vi.mock('@/hooks/useAthleteMeasurements', () => ({
  useAthleteMeasurementHistory: () => mockMeasurementHistory(),
  useUpdateSelfMeasurement: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useDeleteSelfMeasurement: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

const mockAvailableMetricsHook = vi.fn();
vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: () => mockAvailableMetricsHook(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('wouter', () => ({
  Redirect: ({ to }: { to: string }) => <div>Redirect to {to}</div>,
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
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

describe('MyMeasurements Page - Event Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMeasurementHistory.mockReturnValue({
      data: mockMeasurementsWithEvents,
      isLoading: false,
      isError: false,
      error: null,
    });
    mockAvailableMetricsHook.mockReturnValue({
      metrics: mockAvailableMetrics,
    });
  });

  describe('Event Badge Display', () => {
    it('should display event name badge for measurements with eventId', () => {
      render(<MyMeasurementsPage />, { wrapper: createWrapper() });

      // Event measurement should show event name badge
      expect(screen.getByText('Spring Combine 2025')).toBeInTheDocument();
    });

    it('should link event badge to event results page', () => {
      render(<MyMeasurementsPage />, { wrapper: createWrapper() });

      // Event badge should be a link to results page
      const eventLink = screen.getByRole('link', { name: /spring combine 2025/i });
      expect(eventLink).toBeInTheDocument();
      expect(eventLink).toHaveAttribute('href', '/events/event-123/results');
    });

    it('should not show event badge for measurements without eventId', () => {
      render(<MyMeasurementsPage />, { wrapper: createWrapper() });

      // There should only be ONE event badge (for the first measurement)
      const eventBadges = screen.getAllByText('Spring Combine 2025');
      expect(eventBadges).toHaveLength(1);
    });

    it('should display both event and non-event measurements', () => {
      render(<MyMeasurementsPage />, { wrapper: createWrapper() });

      // Both measurements should be displayed
      // Use text matcher to find values (they may be combined with units)
      expect(screen.getByText(/32\.5/)).toBeInTheDocument();
      expect(screen.getByText(/4\.85/)).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no measurements exist', () => {
      mockMeasurementHistory.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        error: null,
      });

      render(<MyMeasurementsPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/no measurements yet/i)).toBeInTheDocument();
    });
  });
});
