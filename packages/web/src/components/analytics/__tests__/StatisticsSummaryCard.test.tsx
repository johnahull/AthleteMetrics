/**
 * Component tests for StatisticsSummaryCard
 * Tests rendering statistics, empty states, and number formatting
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatisticsSummaryCard } from '../StatisticsSummaryCard';

// Mock measurement type for testing
interface MockMeasurement {
  id: string;
  metric: string;
  value: string;
  units: string;
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

    it('should display "No data" message when no measurements match the metric', () => {
      const measurements: MockMeasurement[] = [
        { id: '1', metric: 'VERTICAL_JUMP', value: '30.5', units: 'in' },
        { id: '2', metric: 'VERTICAL_JUMP', value: '32.1', units: 'in' },
      ];

      render(
        <StatisticsSummaryCard
          measurements={measurements}
          metric="FLY10_TIME"
          title="10-Yard Fly Time Statistics"
        />
      );

      expect(screen.getByText(/no data available/i)).toBeInTheDocument();
    });
  });

  describe('Statistics Display', () => {
    const verticalJumpMeasurements: MockMeasurement[] = [
      { id: '1', metric: 'VERTICAL_JUMP', value: '28.5', units: 'in' },
      { id: '2', metric: 'VERTICAL_JUMP', value: '30.2', units: 'in' },
      { id: '3', metric: 'VERTICAL_JUMP', value: '32.1', units: 'in' },
      { id: '4', metric: 'VERTICAL_JUMP', value: '29.8', units: 'in' },
      { id: '5', metric: 'VERTICAL_JUMP', value: '31.5', units: 'in' },
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

    it('should display range in "min - max" format', () => {
      render(
        <StatisticsSummaryCard
          measurements={verticalJumpMeasurements}
          metric="VERTICAL_JUMP"
        />
      );

      // Range should be "28.5 - 32.1" or similar format
      expect(screen.getByText(/28\.5.*-.*32\.1/)).toBeInTheDocument();
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
    const flyTimeMeasurements: MockMeasurement[] = [
      { id: '1', metric: 'FLY10_TIME', value: '1.05', units: 's' },
      { id: '2', metric: 'FLY10_TIME', value: '1.12', units: 's' },
      { id: '3', metric: 'FLY10_TIME', value: '1.08', units: 's' },
      { id: '4', metric: 'FLY10_TIME', value: '1.15', units: 's' },
      { id: '5', metric: 'FLY10_TIME', value: '1.10', units: 's' },
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
      const singleMeasurement: MockMeasurement[] = [
        { id: '1', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' },
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
      const allThirty = screen.getAllByText('30');
      expect(allThirty.length).toBeGreaterThan(0); // Mean, Median, Q1, Q3 all same
    });

    it('should handle two measurements', () => {
      const twoMeasurements: MockMeasurement[] = [
        { id: '1', metric: 'VERTICAL_JUMP', value: '28.0', units: 'in' },
        { id: '2', metric: 'VERTICAL_JUMP', value: '32.0', units: 'in' },
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

    it('should filter measurements by metric correctly', () => {
      const mixedMeasurements: MockMeasurement[] = [
        { id: '1', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' },
        { id: '2', metric: 'FLY10_TIME', value: '1.10', units: 's' },
        { id: '3', metric: 'VERTICAL_JUMP', value: '32.0', units: 'in' },
        { id: '4', metric: 'FLY10_TIME', value: '1.15', units: 's' },
      ];

      render(
        <StatisticsSummaryCard
          measurements={mixedMeasurements}
          metric="VERTICAL_JUMP"
        />
      );

      // Should only count VERTICAL_JUMP measurements
      expect(screen.getByText('Count (N)')).toBeInTheDocument();
      const allTwos = screen.getAllByText('2');
      expect(allTwos.length).toBeGreaterThan(0);
    });
  });

  describe('Number Formatting', () => {
    it('should format large standard deviation correctly', () => {
      const wideSpreadMeasurements: MockMeasurement[] = [
        { id: '1', metric: 'VERTICAL_JUMP', value: '20.0', units: 'in' },
        { id: '2', metric: 'VERTICAL_JUMP', value: '25.0', units: 'in' },
        { id: '3', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' },
        { id: '4', metric: 'VERTICAL_JUMP', value: '35.0', units: 'in' },
        { id: '5', metric: 'VERTICAL_JUMP', value: '40.0', units: 'in' },
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
      const identicalMeasurements: MockMeasurement[] = [
        { id: '1', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' },
        { id: '2', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' },
        { id: '3', metric: 'VERTICAL_JUMP', value: '30.0', units: 'in' },
      ];

      render(
        <StatisticsSummaryCard
          measurements={identicalMeasurements}
          metric="VERTICAL_JUMP"
        />
      );

      // Standard deviation and IQR should be 0
      const allZeros = screen.getAllByText('0.00');
      expect(allZeros.length).toBeGreaterThanOrEqual(2); // StdDev and IQR
    });
  });
});
