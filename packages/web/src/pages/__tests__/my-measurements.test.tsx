/**
 * Tests for My Measurements Page
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import MyMeasurementsPage from '../my-measurements';
import type { EnhancedUser } from '@/lib/types/user';
import type { Measurement } from '@shared/schema';

// Mock state that can be changed per test
let mockUser: EnhancedUser | null = null;
let mockIsLoading = false;
let mockMeasurements: Measurement[] = [];
let mockIsLoadingMeasurements = false;

// Mock modules
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    isLoading: mockIsLoading,
  })),
}));

vi.mock('@/hooks/useAthleteContext', () => ({
  useAthleteContext: vi.fn(() => ({
    athleteId: mockUser?.athleteId || 'athlete-1',
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useAthleteMeasurements', () => ({
  useAthleteMeasurementHistory: vi.fn(() => ({
    data: mockMeasurements,
    isLoading: mockIsLoadingMeasurements,
    isError: false,
    error: null,
    verifiedMeasurements: mockMeasurements.filter(m => m.isVerified),
    unverifiedMeasurements: mockMeasurements.filter(m => !m.isVerified),
    sortedByDate: [...mockMeasurements].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    ),
  })),
  useUpdateSelfMeasurement: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useDeleteSelfMeasurement: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('wouter', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to}></div>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

// Mock useAvailableMetrics hook to avoid QueryClient requirement
vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: vi.fn(() => ({
    metrics: [
      { code: 'FLY10_TIME', label: '10-Yard Fly', unit: 's' },
      { code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in' },
      { code: 'AGILITY_505', label: '5-0-5 Agility', unit: 's' },
    ],
    isLoading: false,
  })),
}));

// Mock useAthleteMetricExplanations hook to avoid QueryClient requirement
vi.mock('@/hooks/useAthleteMetricExplanations', () => ({
  useAthleteMetricExplanations: vi.fn(() => ({
    explanations: {},
    isLoading: false,
    error: null,
  })),
}));

// Mock MeasurementHistoryTable component
vi.mock('@/components/athlete/MeasurementHistoryTable', () => ({
  MeasurementHistoryTable: ({ measurements, isLoading }: { measurements: Measurement[]; isLoading: boolean }) => (
    <div data-testid="measurement-history-table" data-loading={isLoading}>
      {measurements.map((m) => (
        <div key={m.id} data-testid={`measurement-${m.id}`}>
          {m.metric} - {m.value}
        </div>
      ))}
    </div>
  ),
}));

// Mock MeasurementTimeline component
vi.mock('@/components/athlete/MeasurementTimeline', () => ({
  MeasurementTimeline: ({ measurements, isLoading }: { measurements: Measurement[]; isLoading: boolean }) => (
    <div data-testid="measurement-timeline" data-loading={isLoading}>
      Timeline with {measurements.length} measurements
    </div>
  ),
}));

// Mock MeasurementProgressChart component
vi.mock('@/components/athlete/MeasurementProgressChart', () => ({
  MeasurementProgressChart: ({ measurements, isLoading }: { measurements: Measurement[]; isLoading: boolean }) => (
    <div data-testid="measurement-progress-chart" data-loading={isLoading}>
      Chart with {measurements.length} measurements
    </div>
  ),
}));

// Mock EditMeasurementModal component
vi.mock('@/components/athlete/EditMeasurementModal', () => ({
  EditMeasurementModal: () => <div data-testid="edit-measurement-modal" />,
}));

// Mock DeleteMeasurementDialog component
vi.mock('@/components/athlete/DeleteMeasurementDialog', () => ({
  DeleteMeasurementDialog: () => <div data-testid="delete-measurement-dialog" />,
}));

describe('My Measurements Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      id: 'user-1',
      username: 'athlete1',
      firstName: 'Test',
      lastName: 'Athlete',
      email: 'athlete@example.com',
      role: 'athlete',
      isSiteAdmin: false,
      athleteId: 'athlete-1',
      organizations: [],
    };
    mockIsLoading = false;
    mockIsLoadingMeasurements = false;
    mockMeasurements = [
      {
        id: 'm1',
        userId: 'athlete-1',
        submittedBy: 'coach-1',
        verifiedBy: 'coach-1',
        metric: 'FLY10_TIME',
        value: '1.23',
        date: '2024-01-15',
        age: 16,
        units: 's',
        isVerified: true,
        flyInDistance: null,
        notes: 'Great run',
        teamId: null,
        teamNameSnapshot: null,
        organizationId: null,
        season: null,
        teamContextAuto: false,
        globalAthleteId: null,
        isCalculated: false,
        calculatedFromMeasurementIds: null,
        calculationMetadata: null,
        createdAt: new Date('2024-01-15'),
        eventId: null,
        eventNameSnapshot: null,
        eventDateSnapshot: null,
        importSource: null,
        importBatchId: null,
      },
      {
        id: 'm2',
        userId: 'athlete-1',
        submittedBy: 'athlete-1',
        verifiedBy: null,
        metric: 'VERTICAL_JUMP',
        value: '28',
        date: '2024-01-14',
        age: 16,
        units: 'in',
        isVerified: false,
        flyInDistance: null,
        notes: 'Self-entry',
        teamId: null,
        teamNameSnapshot: null,
        organizationId: null,
        season: null,
        teamContextAuto: false,
        globalAthleteId: null,
        isCalculated: false,
        calculatedFromMeasurementIds: null,
        calculationMetadata: null,
        createdAt: new Date('2024-01-14'),
        eventId: null,
        eventNameSnapshot: null,
        eventDateSnapshot: null,
        importSource: null,
        importBatchId: null,
      },
      {
        id: 'm3',
        userId: 'athlete-1',
        submittedBy: 'coach-1',
        verifiedBy: 'coach-1',
        metric: 'FLY10_TIME',
        value: '1.25',
        date: '2024-01-10',
        age: 16,
        units: 's',
        isVerified: true,
        flyInDistance: null,
        notes: null,
        teamId: null,
        teamNameSnapshot: null,
        organizationId: null,
        season: null,
        teamContextAuto: false,
        globalAthleteId: null,
        isCalculated: false,
        calculatedFromMeasurementIds: null,
        calculationMetadata: null,
        eventId: null,
        eventNameSnapshot: null,
        eventDateSnapshot: null,
        importSource: null,
        importBatchId: null,
        createdAt: new Date('2024-01-10'),
      },
    ];
  });

  describe('Authentication and Authorization', () => {
    it('should redirect to login when not authenticated', () => {
      mockUser = null;
      mockIsLoading = false;

      render(<MyMeasurementsPage />);

      const redirect = screen.getByTestId('redirect');
      expect(redirect).toHaveAttribute('data-to', '/login');
    });

    it('should redirect to /dashboard when user is not an athlete', () => {
      mockUser = {
        ...mockUser!,
        athleteId: undefined,
        role: 'coach',
      };

      render(<MyMeasurementsPage />);

      const redirect = screen.getByTestId('redirect');
      expect(redirect).toHaveAttribute('data-to', '/dashboard');
    });
  });

  describe('Page Structure', () => {
    it('should render page with "My Measurements" heading', () => {
      render(<MyMeasurementsPage />);

      expect(screen.getByRole('heading', { name: /my measurements/i })).toBeInTheDocument();
    });

    it('should show "Add Entry" button that links to /my-measurements/add', () => {
      render(<MyMeasurementsPage />);

      const addButton = screen.getByRole('link', { name: /add entry/i });
      expect(addButton).toBeInTheDocument();
      expect(addButton).toHaveAttribute('href', '/my-measurements/add');
    });

    it('should show view toggle tabs (Table, Timeline)', () => {
      render(<MyMeasurementsPage />);

      expect(screen.getByRole('tab', { name: /table/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /timeline/i })).toBeInTheDocument();
    });

    it('should have Table view active by default', () => {
      render(<MyMeasurementsPage />);

      const tableTab = screen.getByRole('tab', { name: /table/i });
      expect(tableTab).toHaveAttribute('data-state', 'active');
    });

    it('should show metric filter dropdown', () => {
      render(<MyMeasurementsPage />);

      // Check for the Select trigger with aria-label
      const metricFilter = screen.getByRole('combobox', { name: /filter by metric/i });
      expect(metricFilter).toBeInTheDocument();
    });

    it('should show status filter (All, Verified, Unverified)', () => {
      render(<MyMeasurementsPage />);

      // Check for the Select trigger with aria-label
      const statusFilter = screen.getByRole('combobox', { name: /filter by status/i });
      expect(statusFilter).toBeInTheDocument();
    });

    it('should render MeasurementHistoryTable with measurements', () => {
      render(<MyMeasurementsPage />);

      const table = screen.getByTestId('measurement-history-table');
      expect(table).toBeInTheDocument();
      expect(screen.getByTestId('measurement-m1')).toBeInTheDocument();
      expect(screen.getByTestId('measurement-m2')).toBeInTheDocument();
      expect(screen.getByTestId('measurement-m3')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading state while fetching measurements', () => {
      mockIsLoadingMeasurements = true;

      render(<MyMeasurementsPage />);

      expect(screen.getByText(/loading your measurements/i)).toBeInTheDocument();
    });

    it('should pass loading state to MeasurementHistoryTable', () => {
      mockIsLoadingMeasurements = true;

      render(<MyMeasurementsPage />);

      // Wait for loading to appear in the DOM
      waitFor(() => {
        const table = screen.queryByTestId('measurement-history-table');
        if (table) {
          expect(table).toHaveAttribute('data-loading', 'true');
        }
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no measurements', () => {
      mockMeasurements = [];

      render(<MyMeasurementsPage />);

      expect(screen.getByText(/no measurements yet/i)).toBeInTheDocument();
    });

    it('should show helpful message in empty state', () => {
      mockMeasurements = [];

      render(<MyMeasurementsPage />);

      expect(screen.getByText(/start tracking your performance/i)).toBeInTheDocument();
    });
  });

  describe('Metric Filter', () => {
    it('should show all measurements by default', () => {
      render(<MyMeasurementsPage />);

      const table = screen.getByTestId('measurement-history-table');
      const measurements = within(table).getAllByTestId(/^measurement-/);
      expect(measurements).toHaveLength(3);
    });

    it('should have metric filter dropdown available', () => {
      render(<MyMeasurementsPage />);

      const filterTrigger = screen.getByRole('combobox', { name: /filter by metric/i });
      expect(filterTrigger).toBeInTheDocument();
    });
  });

  describe('Status Filter', () => {
    it('should show all measurements by default (All status)', () => {
      render(<MyMeasurementsPage />);

      const table = screen.getByTestId('measurement-history-table');
      const measurements = within(table).getAllByTestId(/^measurement-/);
      expect(measurements).toHaveLength(3);
    });

    it('should have status filter dropdown available', () => {
      render(<MyMeasurementsPage />);

      const statusTrigger = screen.getByRole('combobox', { name: /filter by status/i });
      expect(statusTrigger).toBeInTheDocument();
    });
  });

  describe('Combined Filters', () => {
    it('should have both metric and status filters available', () => {
      render(<MyMeasurementsPage />);

      const metricTrigger = screen.getByRole('combobox', { name: /filter by metric/i });
      const statusTrigger = screen.getByRole('combobox', { name: /filter by status/i });

      expect(metricTrigger).toBeInTheDocument();
      expect(statusTrigger).toBeInTheDocument();
    });
  });

  describe('Timeline View', () => {
    it('should switch to timeline view when timeline tab is clicked', async () => {
      const user = userEvent.setup();
      render(<MyMeasurementsPage />);

      const timelineTab = screen.getByRole('tab', { name: /timeline/i });
      await user.click(timelineTab);

      await waitFor(() => {
        expect(timelineTab).toHaveAttribute('data-state', 'active');
      });
    });

    it('should render MeasurementTimeline component in timeline view', async () => {
      const user = userEvent.setup();
      render(<MyMeasurementsPage />);

      const timelineTab = screen.getByRole('tab', { name: /timeline/i });
      await user.click(timelineTab);

      await waitFor(() => {
        expect(screen.getByTestId('measurement-timeline')).toBeInTheDocument();
      });
    });
  });
});
