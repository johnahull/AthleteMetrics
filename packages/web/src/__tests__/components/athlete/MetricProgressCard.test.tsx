/**
 * Component tests for MetricProgressCard
 * Tests sparkline visualization, trend indicators, and color coding
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MetricProgressCard } from '@/components/athlete/MetricProgressCard';

// Mock Chart.js component
vi.mock('react-chartjs-2', () => ({
  Line: ({ data, options }: any) => (
    <div data-testid="sparkline-chart" data-chart-values={JSON.stringify(data.datasets[0].data)}>
      Mock Sparkline Chart
    </div>
  ),
}));

describe('MetricProgressCard', () => {
  const mockMeasurements = [
    { value: 1.55, date: '2023-12-15' },
    { value: 1.52, date: '2023-12-20' },
    { value: 1.50, date: '2023-12-25' },
    { value: 1.48, date: '2023-12-28' },
    { value: 1.45, date: '2024-01-01' },
    { value: 1.42, date: '2024-01-05' },
    { value: 1.40, date: '2024-01-10' },
    { value: 1.38, date: '2024-01-15' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render metric name and current value', () => {
      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={mockMeasurements}
          units="s"
        />
      );

      expect(screen.getByText('10-Yard Fly Time')).toBeInTheDocument();
      expect(screen.getByTestId('current-value')).toHaveTextContent('1.38s');
    });

    it('should render sparkline chart', () => {
      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={mockMeasurements}
          units="s"
        />
      );

      expect(screen.getByTestId('sparkline-chart')).toBeInTheDocument();
    });

    it('should display best value', () => {
      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={mockMeasurements}
          units="s"
        />
      );

      expect(screen.getByTestId('pr-value')).toHaveTextContent('1.38s');
    });
  });

  describe('Trend Indicators - Time Metrics (lower is better)', () => {
    it('should show improving trend with green color when times decrease', () => {
      const improvingMeasurements = [
        { value: 1.60, date: '2023-12-15' },
        { value: 1.55, date: '2023-12-20' },
        { value: 1.52, date: '2023-12-25' },
        { value: 1.50, date: '2023-12-28' },
        { value: 1.48, date: '2024-01-01' },
        { value: 1.45, date: '2024-01-05' },
        { value: 1.42, date: '2024-01-10' },
        { value: 1.40, date: '2024-01-15' },
      ];

      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={improvingMeasurements}
          units="s"
        />
      );

      const trendBadge = screen.getByTestId('trend-badge');
      expect(trendBadge).toHaveTextContent(/improving/i);
      expect(trendBadge).toHaveClass('bg-green-500');

      // Should show up arrow
      expect(screen.getByTestId('trend-icon-improving')).toBeInTheDocument();
    });

    it('should show declining trend with red color when times increase', () => {
      const decliningMeasurements = [
        { value: 1.40, date: '2023-12-15' },
        { value: 1.42, date: '2023-12-20' },
        { value: 1.45, date: '2023-12-25' },
        { value: 1.48, date: '2023-12-28' },
        { value: 1.50, date: '2024-01-01' },
        { value: 1.52, date: '2024-01-05' },
        { value: 1.55, date: '2024-01-10' },
        { value: 1.60, date: '2024-01-15' },
      ];

      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={decliningMeasurements}
          units="s"
        />
      );

      const trendBadge = screen.getByTestId('trend-badge');
      expect(trendBadge).toHaveTextContent(/declining/i);
      expect(trendBadge).toHaveClass('bg-red-500');

      // Should show down arrow
      expect(screen.getByTestId('trend-icon-declining')).toBeInTheDocument();
    });

    it('should show steady trend with yellow color when change < 5%', () => {
      const steadyMeasurements = [
        { value: 1.50, date: '2023-12-15' },
        { value: 1.49, date: '2023-12-20' },
        { value: 1.51, date: '2023-12-25' },
        { value: 1.50, date: '2023-12-28' },
        { value: 1.52, date: '2024-01-01' },
        { value: 1.51, date: '2024-01-05' },
      ];

      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={steadyMeasurements}
          units="s"
        />
      );

      const trendBadge = screen.getByTestId('trend-badge');
      expect(trendBadge).toHaveTextContent(/steady/i);
      // Using bg-yellow-600 for WCAG AA contrast compliance
      expect(trendBadge).toHaveClass('bg-yellow-600');

      // Should show minus icon
      expect(screen.getByTestId('trend-icon-steady')).toBeInTheDocument();
    });
  });

  describe('Trend Indicators - Distance Metrics (higher is better)', () => {
    it('should show improving trend when values increase', () => {
      const improvingMeasurements = [
        { value: 30.0, date: '2023-12-15' },
        { value: 31.0, date: '2023-12-20' },
        { value: 32.0, date: '2023-12-25' },
        { value: 33.0, date: '2023-12-28' },
        { value: 34.0, date: '2024-01-01' },
        { value: 35.0, date: '2024-01-05' },
      ];

      render(
        <MetricProgressCard
          metric="VERTICAL_JUMP"
          displayName="Vertical Jump"
          measurements={improvingMeasurements}
          units="in"
        />
      );

      const trendBadge = screen.getByTestId('trend-badge');
      expect(trendBadge).toHaveTextContent(/improving/i);
      expect(trendBadge).toHaveClass('bg-green-500');
    });

    it('should show declining trend when values decrease', () => {
      const decliningMeasurements = [
        { value: 35.0, date: '2023-12-15' },
        { value: 34.0, date: '2023-12-20' },
        { value: 33.0, date: '2023-12-25' },
        { value: 32.0, date: '2023-12-28' },
        { value: 31.0, date: '2024-01-01' },
        { value: 30.0, date: '2024-01-05' },
      ];

      render(
        <MetricProgressCard
          metric="VERTICAL_JUMP"
          displayName="Vertical Jump"
          measurements={decliningMeasurements}
          units="in"
        />
      );

      const trendBadge = screen.getByTestId('trend-badge');
      expect(trendBadge).toHaveTextContent(/declining/i);
      expect(trendBadge).toHaveClass('bg-red-500');
    });
  });

  describe('Comparison Text', () => {
    it('should display comparison text for improving trend', () => {
      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={mockMeasurements}
          units="s"
        />
      );

      const comparisonText = screen.getByTestId('comparison-text');
      expect(comparisonText).toBeInTheDocument();
      expect(comparisonText).toHaveTextContent(/↑/); // Up arrow
      expect(comparisonText).toHaveTextContent(/better/i);
    });

    it('should display percentage in comparison text', () => {
      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={mockMeasurements}
          units="s"
        />
      );

      const comparisonText = screen.getByTestId('comparison-text');
      expect(comparisonText).toHaveTextContent(/%/); // Should include percentage
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty measurements gracefully', () => {
      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={[]}
          units="s"
        />
      );

      expect(screen.getByText('10-Yard Fly Time')).toBeInTheDocument();
      expect(screen.getByTestId('no-measurements')).toBeInTheDocument();
      expect(screen.getByText(/No measurements yet/i)).toBeInTheDocument();
    });

    it('should handle single measurement', () => {
      const singleMeasurement = [{ value: 1.50, date: '2024-01-15' }];

      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={singleMeasurement}
          units="s"
        />
      );

      expect(screen.getByTestId('current-value')).toHaveTextContent('1.50s');
      // Should show chart but no trend
      expect(screen.getByTestId('sparkline-chart')).toBeInTheDocument();
      expect(screen.queryByTestId('trend-badge')).not.toBeInTheDocument();
    });

    it('should handle < 10 measurements', () => {
      const fewMeasurements = [
        { value: 1.50, date: '2024-01-01' },
        { value: 1.45, date: '2024-01-05' },
        { value: 1.40, date: '2024-01-10' },
      ];

      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={fewMeasurements}
          units="s"
        />
      );

      expect(screen.getByTestId('current-value')).toHaveTextContent('1.40s');
      expect(screen.getByTestId('sparkline-chart')).toBeInTheDocument();
    });

    it('should handle all improving measurements', () => {
      const allImproving = Array.from({ length: 10 }, (_, i) => ({
        value: 1.60 - i * 0.02, // Consistently improving
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      }));

      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={allImproving}
          units="s"
        />
      );

      const trendBadge = screen.getByTestId('trend-badge');
      expect(trendBadge).toHaveTextContent(/improving/i);
    });

    it('should handle all declining measurements', () => {
      const allDeclining = Array.from({ length: 10 }, (_, i) => ({
        value: 1.40 + i * 0.02, // Consistently declining
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      }));

      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={allDeclining}
          units="s"
        />
      );

      const trendBadge = screen.getByTestId('trend-badge');
      expect(trendBadge).toHaveTextContent(/declining/i);
    });
  });

  describe('Sparkline Visualization', () => {
    it('should pass correct data to chart', () => {
      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={mockMeasurements}
          units="s"
        />
      );

      const chart = screen.getByTestId('sparkline-chart');
      const chartData = JSON.parse(chart.getAttribute('data-chart-values') || '[]');

      // Should have data points
      expect(chartData.length).toBeGreaterThan(0);
      expect(chartData.length).toBeLessThanOrEqual(10);
    });

    it('should limit sparkline to 10 measurements', () => {
      const manyMeasurements = Array.from({ length: 20 }, (_, i) => ({
        value: 1.5 - i * 0.01,
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      }));

      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={manyMeasurements}
          units="s"
        />
      );

      const chart = screen.getByTestId('sparkline-chart');
      const chartData = JSON.parse(chart.getAttribute('data-chart-values') || '[]');

      expect(chartData.length).toBe(10);
    });
  });

  describe('Visual Design', () => {
    it('should render with card styling', () => {
      const { container } = render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={mockMeasurements}
          units="s"
        />
      );

      const cardElement = container.querySelector('[data-testid="metric-progress-card"]');
      expect(cardElement).toBeInTheDocument();
    });

    it('should have proper data-testid attributes', () => {
      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={mockMeasurements}
          units="s"
        />
      );

      expect(screen.getByTestId('metric-progress-card')).toBeInTheDocument();
      expect(screen.getByTestId('current-value')).toBeInTheDocument();
      expect(screen.getByTestId('pr-value')).toBeInTheDocument();
      expect(screen.getByTestId('trend-badge')).toBeInTheDocument();
      expect(screen.getByTestId('comparison-text')).toBeInTheDocument();
      expect(screen.getByTestId('sparkline-chart')).toBeInTheDocument();
    });
  });

  describe('Best Per Date Filtering', () => {
    it('should show only best value per date for time metrics (lower is better)', () => {
      // Two measurements on same date - should show only the better (lower) one
      const measurementsWithDuplicateDates = [
        { value: 1.55, date: '2024-01-01' },
        { value: 1.50, date: '2024-01-01' }, // Better time (lower)
        { value: 1.48, date: '2024-01-05' },
        { value: 1.52, date: '2024-01-05' }, // Worse time (higher)
      ];

      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={measurementsWithDuplicateDates}
          units="s"
        />
      );

      const chart = screen.getByTestId('sparkline-chart');
      const chartData = JSON.parse(chart.getAttribute('data-chart-values') || '[]');

      // Should have only 2 data points (one per date, best only)
      expect(chartData.length).toBe(2);
      // First date should show 1.50 (the lower/better time)
      expect(chartData[0]).toBe(1.50);
      // Second date should show 1.48 (the lower/better time)
      expect(chartData[1]).toBe(1.48);
    });

    it('should show only best value per date for distance metrics (higher is better)', () => {
      // Two measurements on same date - should show only the better (higher) one
      const measurementsWithDuplicateDates = [
        { value: 30.0, date: '2024-01-01' },
        { value: 32.0, date: '2024-01-01' }, // Better jump (higher)
        { value: 31.0, date: '2024-01-05' }, // Worse jump (lower)
        { value: 34.0, date: '2024-01-05' }, // Better jump (higher)
      ];

      render(
        <MetricProgressCard
          metric="VERTICAL_JUMP"
          displayName="Vertical Jump"
          measurements={measurementsWithDuplicateDates}
          units="in"
        />
      );

      const chart = screen.getByTestId('sparkline-chart');
      const chartData = JSON.parse(chart.getAttribute('data-chart-values') || '[]');

      // Should have only 2 data points (one per date, best only)
      expect(chartData.length).toBe(2);
      // First date should show 32.0 (the higher/better jump)
      expect(chartData[0]).toBe(32.0);
      // Second date should show 34.0 (the higher/better jump)
      expect(chartData[1]).toBe(34.0);
    });

    it('should show current value from best per date data', () => {
      // Multiple measurements on most recent date
      const measurementsWithDuplicates = [
        { value: 1.55, date: '2024-01-01' },
        { value: 1.48, date: '2024-01-10' }, // Better time on recent date
        { value: 1.52, date: '2024-01-10' }, // Worse time on recent date
      ];

      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={measurementsWithDuplicates}
          units="s"
        />
      );

      // Current value should be the best from the most recent date (1.48)
      expect(screen.getByTestId('current-value')).toHaveTextContent('1.48s');
    });

    it('should calculate trend using filtered best-per-date data', () => {
      // Measurements that look declining when including all, but improving when filtered
      // Using larger differences to ensure trend detection threshold is met
      const mixedMeasurements = [
        { value: 1.80, date: '2024-01-01' }, // Day 1: 1.80 is the only measurement
        { value: 1.90, date: '2024-01-05' }, // Day 2: worse attempt
        { value: 1.60, date: '2024-01-05' }, // Day 2: better attempt - this is the best
        { value: 1.85, date: '2024-01-10' }, // Day 3: worse attempt
        { value: 1.45, date: '2024-01-10' }, // Day 3: better attempt - this is the best
      ];

      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="10-Yard Fly Time"
          measurements={mixedMeasurements}
          units="s"
        />
      );

      // Trend should be "improving" because best values go 1.80 -> 1.60 -> 1.45
      // This is a ~15% improvement from average of first two (1.70) to 1.45
      const trendBadge = screen.getByTestId('trend-badge');
      expect(trendBadge).toHaveTextContent(/improving/i);
    });
  });
});
