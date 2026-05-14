/**
 * Component tests for StatisticsSummaryCard
 * Tests rendering statistics, empty states, and number formatting
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatisticsSummaryCard } from '../StatisticsSummaryCard';
import type { Measurement } from '@shared/schema';

const METRIC_LABEL_FIXTURE: Record<string, string> = {
  FLY10_TIME: '10-Yard Fly Time',
  VERTICAL_JUMP: 'Vertical Jump',
  DASH_40YD: '40-Yard Dash',
};

vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({
    labels: METRIC_LABEL_FIXTURE,
    getLabel: (code: string) => METRIC_LABEL_FIXTURE[code] ?? code,
    isLoading: false,
  }),
}));

// Helper to create minimal test measurement
function createTestMeasurement(overrides: Partial<Measurement>): Measurement {
  return {
    id: 'test-id',
    userId: 'test-user',
    submittedBy: 'test-submitter',
    verifiedBy: null,
    isVerified: false,
    age: 16,
    metric: 'VERTICAL_JUMP',
    value: '30.0',
    units: 'in',
    flyInDistance: null,
    auxiliaryValue: null,
    teamId: 'test-team',
    organizationId: 'test-org',
    date: '2024-01-01',
    notes: null,
    photoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Measurement;
}

describe('StatisticsSummaryCard', () => {
  describe('Empty States', () => {
    it('should display "No data" message when measurements array is empty', () => {
      render(
        <StatisticsSummaryCard
          measurements={[]}
          metric="FLY10_TIME"
          title="10-Yard Fly Time Statistics"
        />
      );

      expect(screen.getByText(/no data available/i)).toBeInTheDocument();
    });
  });

  describe('Statistics Display', () => {
    const verticalJumpMeasurements: Measurement[] = [
      createTestMeasurement({ id: '1', metric: 'VERTICAL_JUMP', value: '28.5', units: 'in' }),
      createTestMeasurement({ id: '2', metric: 'VERTICAL_JUMP', value: '30.2', units: 'in' }),
      createTestMeasurement({ id: '3', metric: 'VERTICAL_JUMP', value: '32.1', units: 'in' }),
      createTestMeasurement({ id: '4', metric: 'VERTICAL_JUMP', value: '29.8', units: 'in' }),
      createTestMeasurement({ id: '5', metric: 'VERTICAL_JUMP', value: '31.5', units: 'in' }),
    ];

    it('should render all statistics labels', () => {
      render(
        <StatisticsSummaryCard
          measurements={verticalJumpMeasurements}
          metric="VERTICAL_JUMP"
        />
      );

      expect(screen.getByText('Count (N)')).toBeInTheDocument();
      expect(screen.getByText('Mean')).toBeInTheDocument();
      expect(screen.getByText('Median')).toBeInTheDocument();
      expect(screen.getByText('Std Dev')).toBeInTheDocument();
      expect(screen.getByText('Range')).toBeInTheDocument();
      expect(screen.getByText('Q1 (25th)')).toBeInTheDocument();
      expect(screen.getByText('Q3 (75th)')).toBeInTheDocument();
      expect(screen.getByText('IQR')).toBeInTheDocument();
    });

    it('should display correct count', () => {
      render(
        <StatisticsSummaryCard
          measurements={verticalJumpMeasurements}
          metric="VERTICAL_JUMP"
        />
      );

      expect(screen.getByText('Count (N)')).toBeInTheDocument();
      // Count value should be present
      const countValues = screen.getAllByText('5');
      expect(countValues.length).toBeGreaterThan(0);
    });

    it('should format decimal numbers to 2-3 decimal places', () => {
      render(
        <StatisticsSummaryCard
          measurements={verticalJumpMeasurements}
          metric="VERTICAL_JUMP"
        />
      );

      // Mean should be around 30.42
      const allValues = screen.getAllByText(/30\.4/);
      expect(allValues.length).toBeGreaterThan(0);
    });

    it('should display range in "min - max" format with units', () => {
      render(
        <StatisticsSummaryCard
          measurements={verticalJumpMeasurements}
          metric="VERTICAL_JUMP"
        />
      );

      // Range should contain min and max values with units
      expect(screen.getByText(/28\.5/)).toBeInTheDocument();
      expect(screen.getByText(/32\.1/)).toBeInTheDocument();
      expect(screen.getByText('Range')).toBeInTheDocument();
    });

    it('should use custom title when provided', () => {
      render(
        <StatisticsSummaryCard
          measurements={verticalJumpMeasurements}
          metric="VERTICAL_JUMP"
          title="Vertical Jump Statistics"
        />
      );

      expect(screen.getByText('Vertical Jump Statistics')).toBeInTheDocument();
    });

    it('should use metric-based default title when no title provided', () => {
      render(
        <StatisticsSummaryCard
          measurements={verticalJumpMeasurements}
          metric="VERTICAL_JUMP"
        />
      );

      // Should show some form of statistics title
      expect(screen.getByText(/statistics/i)).toBeInTheDocument();
    });
  });

  describe('Time-based Metrics', () => {
    const flyTimeMeasurements: Measurement[] = [
      createTestMeasurement({ id: '1', metric: 'FLY10_TIME', value: '1.05', units: 's' }),
      createTestMeasurement({ id: '2', metric: 'FLY10_TIME', value: '1.12', units: 's' }),
      createTestMeasurement({ id: '3', metric: 'FLY10_TIME', value: '1.08', units: 's' }),
      createTestMeasurement({ id: '4', metric: 'FLY10_TIME', value: '1.15', units: 's' }),
      createTestMeasurement({ id: '5', metric: 'FLY10_TIME', value: '1.10', units: 's' }),
    ];

    it('should render time-based statistics correctly', () => {
      render(
        <StatisticsSummaryCard
          measurements={flyTimeMeasurements}
          metric="FLY10_TIME"
        />
      );

      expect(screen.getByText('Count (N)')).toBeInTheDocument();
      // Count should be 5
      const countValues = screen.getAllByText('5');
      expect(countValues.length).toBeGreaterThan(0);
      // Mean should be around 1.10
      const allValues = screen.getAllByText(/1\.1/);
      expect(allValues.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single measurement', () => {
      const singleMeasurement: Measurement[] = [
        createTestMeasurement({ id: '1', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' }),
      ];

      render(
        <StatisticsSummaryCard
          measurements={singleMeasurement}
          metric="VERTICAL_JUMP"
        />
      );

      expect(screen.getByText('Count (N)')).toBeInTheDocument();
      const allOnes = screen.getAllByText('1');
      expect(allOnes.length).toBeGreaterThan(0); // Count
      // Mean, Median, Q1, Q3 all same - value and units may be separate text nodes
      const allThirty = screen.getAllByText('30', { exact: false });
      expect(allThirty.length).toBeGreaterThan(0);
    });

    it('should handle two measurements', () => {
      const twoMeasurements: Measurement[] = [
        createTestMeasurement({ id: '1', metric: 'VERTICAL_JUMP', value: '28.0', units: 'in' }),
        createTestMeasurement({ id: '2', metric: 'VERTICAL_JUMP', value: '32.0', units: 'in' }),
      ];

      render(
        <StatisticsSummaryCard
          measurements={twoMeasurements}
          metric="VERTICAL_JUMP"
        />
      );

      expect(screen.getByText('Count (N)')).toBeInTheDocument();
      const allTwos = screen.getAllByText('2');
      expect(allTwos.length).toBeGreaterThan(0); // Count (may also appear in StdDev)
      const allThirty = screen.getAllByText(/30/);
      expect(allThirty.length).toBeGreaterThan(0); // Mean
    });

    it('should handle empty measurements with quintiles mode', () => {
      render(
        <StatisticsSummaryCard
          measurements={[]}
          metric="VERTICAL_JUMP"
          distributionMode="quintiles"
        />
      );

      expect(screen.getByText(/no data available/i)).toBeInTheDocument();
    });

    it('should handle empty measurements with deciles mode', () => {
      render(
        <StatisticsSummaryCard
          measurements={[]}
          metric="VERTICAL_JUMP"
          distributionMode="deciles"
        />
      );

      expect(screen.getByText(/no data available/i)).toBeInTheDocument();
    });

    it('should handle single measurement with quintiles mode', () => {
      const singleMeasurement: Measurement[] = [
        createTestMeasurement({ id: '1', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' }),
      ];

      render(
        <StatisticsSummaryCard
          measurements={singleMeasurement}
          metric="VERTICAL_JUMP"
          distributionMode="quintiles"
        />
      );

      expect(screen.getByText('Count (N)')).toBeInTheDocument();
      expect(screen.getByText('P20')).toBeInTheDocument();
      expect(screen.getByText('P40')).toBeInTheDocument();
      expect(screen.getByText('P60')).toBeInTheDocument();
      expect(screen.getByText('P80')).toBeInTheDocument();
    });

    it('should handle single measurement with deciles mode', () => {
      const singleMeasurement: Measurement[] = [
        createTestMeasurement({ id: '1', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' }),
      ];

      render(
        <StatisticsSummaryCard
          measurements={singleMeasurement}
          metric="VERTICAL_JUMP"
          distributionMode="deciles"
        />
      );

      expect(screen.getByText('Count (N)')).toBeInTheDocument();
      expect(screen.getByText('P10')).toBeInTheDocument();
      expect(screen.getByText('P20')).toBeInTheDocument();
      expect(screen.getByText('P30')).toBeInTheDocument();
      expect(screen.getByText('P40')).toBeInTheDocument();
      expect(screen.getByText('P50')).toBeInTheDocument();
      expect(screen.getByText('P60')).toBeInTheDocument();
      expect(screen.getByText('P70')).toBeInTheDocument();
      expect(screen.getByText('P80')).toBeInTheDocument();
      expect(screen.getByText('P90')).toBeInTheDocument();
    });
  });

  describe('Distribution Modes', () => {
    const measurements = [
      createTestMeasurement({ id: '1', metric: 'VERTICAL_JUMP', value: '20.0', units: 'in' }),
      createTestMeasurement({ id: '2', metric: 'VERTICAL_JUMP', value: '25.0', units: 'in' }),
      createTestMeasurement({ id: '3', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' }),
      createTestMeasurement({ id: '4', metric: 'VERTICAL_JUMP', value: '35.0', units: 'in' }),
      createTestMeasurement({ id: '5', metric: 'VERTICAL_JUMP', value: '40.0', units: 'in' }),
    ];

    it('should render Q1/Q3/IQR by default (quartiles)', () => {
      render(
        <StatisticsSummaryCard measurements={measurements} metric="VERTICAL_JUMP" />
      );
      expect(screen.getByText('Q1 (25th)')).toBeInTheDocument();
      expect(screen.getByText('Q3 (75th)')).toBeInTheDocument();
      expect(screen.getByText('IQR')).toBeInTheDocument();
    });

    it('should render P20/P40/P60/P80 for quintiles mode', () => {
      render(
        <StatisticsSummaryCard measurements={measurements} metric="VERTICAL_JUMP" distributionMode="quintiles" />
      );
      expect(screen.getByText('P20')).toBeInTheDocument();
      expect(screen.getByText('P40')).toBeInTheDocument();
      expect(screen.getByText('P60')).toBeInTheDocument();
      expect(screen.getByText('P80')).toBeInTheDocument();
      // Should NOT render quartile labels
      expect(screen.queryByText('Q1 (25th)')).not.toBeInTheDocument();
      expect(screen.queryByText('IQR')).not.toBeInTheDocument();
    });

    it('should render P10–P90 for deciles mode', () => {
      render(
        <StatisticsSummaryCard measurements={measurements} metric="VERTICAL_JUMP" distributionMode="deciles" />
      );
      expect(screen.getByText('P10')).toBeInTheDocument();
      expect(screen.getByText('P20')).toBeInTheDocument();
      expect(screen.getByText('P30')).toBeInTheDocument();
      expect(screen.getByText('P40')).toBeInTheDocument();
      expect(screen.getByText('P50')).toBeInTheDocument();
      expect(screen.getByText('P60')).toBeInTheDocument();
      expect(screen.getByText('P70')).toBeInTheDocument();
      expect(screen.getByText('P80')).toBeInTheDocument();
      expect(screen.getByText('P90')).toBeInTheDocument();
      // Should NOT render quartile labels
      expect(screen.queryByText('Q1 (25th)')).not.toBeInTheDocument();
      expect(screen.queryByText('IQR')).not.toBeInTheDocument();
    });
  });

  describe('Number Formatting', () => {
    it('should format large standard deviation correctly', () => {
      const wideSpreadMeasurements: Measurement[] = [
        createTestMeasurement({ id: '1', metric: 'VERTICAL_JUMP', value: '20.0', units: 'in' }),
        createTestMeasurement({ id: '2', metric: 'VERTICAL_JUMP', value: '25.0', units: 'in' }),
        createTestMeasurement({ id: '3', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' }),
        createTestMeasurement({ id: '4', metric: 'VERTICAL_JUMP', value: '35.0', units: 'in' }),
        createTestMeasurement({ id: '5', metric: 'VERTICAL_JUMP', value: '40.0', units: 'in' }),
      ];

      render(
        <StatisticsSummaryCard
          measurements={wideSpreadMeasurements}
          metric="VERTICAL_JUMP"
        />
      );

      // Standard deviation should be displayed with appropriate precision
      const allSeven = screen.getAllByText(/7\./);
      expect(allSeven.length).toBeGreaterThan(0); // StdDev ~7.07
    });

    it('should handle zero standard deviation for identical values', () => {
      const identicalMeasurements: Measurement[] = [
        createTestMeasurement({ id: '1', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' }),
        createTestMeasurement({ id: '2', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' }),
        createTestMeasurement({ id: '3', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' }),
      ];

      render(
        <StatisticsSummaryCard
          measurements={identicalMeasurements}
          metric="VERTICAL_JUMP"
        />
      );

      // Standard deviation and IQR should be 0 - value and units may be separate text nodes
      const allZeros = screen.getAllByText('0.00', { exact: false });
      expect(allZeros.length).toBeGreaterThanOrEqual(2); // StdDev and IQR
    });
  });
});
