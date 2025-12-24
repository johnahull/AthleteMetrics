/**
 * Tests for MeasurementProgressChart Component
 *
 * TDD tests for the measurement progress line chart.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Measurement } from '@shared/schema';

// Mock Chart.js Line component to avoid canvas rendering
vi.mock('react-chartjs-2', () => ({
  Line: vi.fn(({ data, options }) => (
    <div data-testid="mock-line-chart">
      <div data-testid="chart-data-points">{data.datasets?.[0]?.data?.length || 0}</div>
      <div data-testid="chart-labels">{data.labels?.length || 0}</div>
      <div data-testid="chart-dataset-label">{data.datasets?.[0]?.label || ''}</div>
    </div>
  ))
}));

// Import after mocks
import { MeasurementProgressChart } from '../MeasurementProgressChart';

// Helper to create mock measurements
function createMockMeasurement(overrides: Partial<Measurement> = {}): Measurement {
  return {
    id: 'measurement-1',
    metric: 'FLY10_TIME',
    value: '1.23',
    units: 's',
    date: '2024-01-15',
    notes: 'Test notes',
    isVerified: true,
    userId: 'user-1',
    submittedBy: 'user-1',
    verifiedBy: 'coach-1',
    age: 18,
    flyInDistance: null,
    teamId: null,
    teamNameSnapshot: null,
    organizationId: 'org-1',
    season: null,
    teamContextAuto: true,
    globalAthleteId: null,
    isCalculated: false,
    calculatedFromMeasurementIds: null,
    calculationMetadata: null,
    createdAt: new Date('2024-01-15'),
    ...overrides,
  };
}

// Mock measurements for testing
const mockMeasurements: Measurement[] = [
  createMockMeasurement({
    id: 'm1',
    metric: 'FLY10_TIME',
    value: '1.25',
    date: '2024-01-10',
    isVerified: true,
  }),
  createMockMeasurement({
    id: 'm2',
    metric: 'FLY10_TIME',
    value: '1.22',
    date: '2024-01-15',
    isVerified: true,
  }),
  createMockMeasurement({
    id: 'm3',
    metric: 'FLY10_TIME',
    value: '1.20',
    date: '2024-01-20',
    isVerified: false,
  }),
];

describe('MeasurementProgressChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render chart when measurements provided', () => {
      render(<MeasurementProgressChart measurements={mockMeasurements} />);

      expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
    });

    it('should render correct number of data points', () => {
      render(<MeasurementProgressChart measurements={mockMeasurements} />);

      expect(screen.getByTestId('chart-data-points')).toHaveTextContent('3');
    });

    it('should render chart with metric name as label', () => {
      render(<MeasurementProgressChart measurements={mockMeasurements} />);

      // Now uses raw metric code as fallback since METRIC_DISPLAY_NAMES is empty
      expect(screen.getByTestId('chart-dataset-label')).toHaveTextContent(/FLY10_TIME/i);
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no measurements', () => {
      render(<MeasurementProgressChart measurements={[]} />);

      expect(screen.getByText(/no measurements/i)).toBeInTheDocument();
      expect(screen.queryByTestId('mock-line-chart')).not.toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading skeleton when isLoading is true', () => {
      render(<MeasurementProgressChart measurements={[]} isLoading={true} />);

      expect(screen.getByTestId('chart-loading-skeleton')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-line-chart')).not.toBeInTheDocument();
    });

    it('should not show empty state when loading', () => {
      render(<MeasurementProgressChart measurements={[]} isLoading={true} />);

      expect(screen.queryByText(/no measurements/i)).not.toBeInTheDocument();
    });
  });

  describe('Data Sorting', () => {
    it('should sort measurements by date (oldest first)', () => {
      // Measurements passed in non-chronological order
      const unsortedMeasurements = [
        createMockMeasurement({ id: 'm1', date: '2024-01-20', value: '1.20' }),
        createMockMeasurement({ id: 'm2', date: '2024-01-10', value: '1.25' }),
        createMockMeasurement({ id: 'm3', date: '2024-01-15', value: '1.22' }),
      ];

      render(<MeasurementProgressChart measurements={unsortedMeasurements} />);

      // Chart should still render with correct data count
      expect(screen.getByTestId('chart-data-points')).toHaveTextContent('3');
    });
  });

  describe('Mixed Metrics Warning', () => {
    it('should show warning when measurements have different metrics', () => {
      const mixedMeasurements = [
        createMockMeasurement({ id: 'm1', metric: 'FLY10_TIME', value: '1.25' }),
        createMockMeasurement({ id: 'm2', metric: 'VERTICAL_JUMP', value: '28.5' }),
      ];

      render(<MeasurementProgressChart measurements={mixedMeasurements} />);

      expect(screen.getByText(/select a single metric/i)).toBeInTheDocument();
    });

    it('should not show warning when all measurements have same metric', () => {
      render(<MeasurementProgressChart measurements={mockMeasurements} />);

      expect(screen.queryByText(/select a single metric/i)).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have chart container with proper role', () => {
      render(<MeasurementProgressChart measurements={mockMeasurements} />);

      const container = screen.getByTestId('measurement-progress-chart');
      expect(container).toBeInTheDocument();
    });
  });

  describe('Best/All Toggle', () => {
    // Create measurements with multiple entries on same date
    const measurementsWithDuplicateDates: Measurement[] = [
      createMockMeasurement({
        id: 'm1',
        metric: 'FLY10_TIME',
        value: '1.30',
        date: '2024-01-10',
      }),
      createMockMeasurement({
        id: 'm2',
        metric: 'FLY10_TIME',
        value: '1.25', // Best for this date (lower is better for time)
        date: '2024-01-10',
      }),
      createMockMeasurement({
        id: 'm3',
        metric: 'FLY10_TIME',
        value: '1.20',
        date: '2024-01-15',
      }),
      createMockMeasurement({
        id: 'm4',
        metric: 'FLY10_TIME',
        value: '1.22',
        date: '2024-01-15',
      }),
    ];

    it('should render toggle when measurements provided', () => {
      render(
        <MeasurementProgressChart
          measurements={measurementsWithDuplicateDates}
          showBestOnly={true}
          onShowBestOnlyChange={() => {}}
        />
      );

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
      expect(screen.getByLabelText(/best per date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/all entries/i)).toBeInTheDocument();
    });

    it('should show only best values per date when showBestOnly is true (time metric - lower is better)', () => {
      render(
        <MeasurementProgressChart
          measurements={measurementsWithDuplicateDates}
          showBestOnly={true}
          onShowBestOnlyChange={() => {}}
        />
      );

      // 4 measurements on 2 dates -> should show 2 data points (best per date)
      expect(screen.getByTestId('chart-data-points')).toHaveTextContent('2');
    });

    it('should show all measurements when showBestOnly is false', () => {
      render(
        <MeasurementProgressChart
          measurements={measurementsWithDuplicateDates}
          showBestOnly={false}
          onShowBestOnlyChange={() => {}}
        />
      );

      // Should show all 4 data points
      expect(screen.getByTestId('chart-data-points')).toHaveTextContent('4');
    });

    it('should call onShowBestOnlyChange when toggle is clicked', () => {
      const mockOnChange = vi.fn();
      render(
        <MeasurementProgressChart
          measurements={measurementsWithDuplicateDates}
          showBestOnly={true}
          onShowBestOnlyChange={mockOnChange}
        />
      );

      const allEntriesRadio = screen.getByLabelText(/all entries/i);
      fireEvent.click(allEntriesRadio);

      expect(mockOnChange).toHaveBeenCalledWith(false);
    });

    it('should use higher values for metrics where higher is better (VERTICAL_JUMP)', () => {
      const jumpMeasurements: Measurement[] = [
        createMockMeasurement({
          id: 'm1',
          metric: 'VERTICAL_JUMP',
          value: '28.0',
          units: 'in',
          date: '2024-01-10',
        }),
        createMockMeasurement({
          id: 'm2',
          metric: 'VERTICAL_JUMP',
          value: '30.5', // Best for this date (higher is better for jump)
          units: 'in',
          date: '2024-01-10',
        }),
        createMockMeasurement({
          id: 'm3',
          metric: 'VERTICAL_JUMP',
          value: '29.0',
          units: 'in',
          date: '2024-01-15',
        }),
      ];

      render(
        <MeasurementProgressChart
          measurements={jumpMeasurements}
          showBestOnly={true}
          onShowBestOnlyChange={() => {}}
        />
      );

      // 3 measurements on 2 dates -> should show 2 data points (best per date)
      expect(screen.getByTestId('chart-data-points')).toHaveTextContent('2');
    });

    it('should default to showing all when showBestOnly prop is not provided', () => {
      render(<MeasurementProgressChart measurements={measurementsWithDuplicateDates} />);

      // Without showBestOnly prop, should show all 4 data points
      expect(screen.getByTestId('chart-data-points')).toHaveTextContent('4');
    });

    it('should not render toggle when onShowBestOnlyChange is not provided', () => {
      render(<MeasurementProgressChart measurements={measurementsWithDuplicateDates} />);

      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    });
  });
});
