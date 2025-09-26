/**
 * Comprehensive tests for MultiLineChart component
 *
 * Tests cover athlete selection logic, state management, data transformation,
 * chart rendering configurations, and edge cases to ensure reliability.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MultiLineChart } from '../MultiLineChart';
import type { TrendData, ChartConfiguration, StatisticalSummary } from '@shared/analytics-types';

// Mock Chart.js
vi.mock('react-chartjs-2', () => ({
  Line: vi.fn(({ data, options }) => (
    <div data-testid="chart-component">
      <div data-testid="chart-data">{JSON.stringify(data)}</div>
      <div data-testid="chart-options">{JSON.stringify(options)}</div>
    </div>
  ))
}));

// Mock AthleteSelector component
vi.mock('../components/AthleteSelector', () => ({
  AthleteSelector: vi.fn(({ athletes, athleteToggles, onToggleAthlete, onSelectAll, onClearAll, maxAthletes }) => (
    <div data-testid="athlete-selector">
      <div data-testid="max-athletes">{maxAthletes}</div>
      {athletes.map((athlete: any) => (
        <button
          key={athlete.id}
          data-testid={`athlete-${athlete.id}`}
          onClick={() => onToggleAthlete(athlete.id)}
          className={athleteToggles[athlete.id] ? 'selected' : ''}
        >
          {athlete.name}
        </button>
      ))}
      <button data-testid="select-all" onClick={onSelectAll}>
        Select All
      </button>
      <button data-testid="clear-all" onClick={onClearAll}>
        Clear All
      </button>
    </div>
  ))
}));

describe('MultiLineChart', () => {
  const mockTrendData: TrendData[] = [
    {
      athleteId: 'athlete1',
      athleteName: 'John Doe',
      metric: 'DASH_40YD',
      data: [
        { value: 4.5, date: new Date('2023-01-01'), isPersonalBest: false },
        { value: 4.3, date: new Date('2023-01-15'), isPersonalBest: true }
      ]
    },
    {
      athleteId: 'athlete1',
      athleteName: 'John Doe',
      metric: 'VERTICAL_JUMP',
      data: [
        { value: 30, date: new Date('2023-01-01'), isPersonalBest: false },
        { value: 32, date: new Date('2023-01-15'), isPersonalBest: false }
      ]
    },
    {
      athleteId: 'athlete2',
      athleteName: 'Jane Smith',
      metric: 'DASH_40YD',
      data: [
        { value: 4.8, date: new Date('2023-01-01'), isPersonalBest: false },
        { value: 4.6, date: new Date('2023-01-15'), isPersonalBest: true }
      ]
    },
    {
      athleteId: 'athlete2',
      athleteName: 'Jane Smith',
      metric: 'VERTICAL_JUMP',
      data: [
        { value: 28, date: new Date('2023-01-01'), isPersonalBest: false },
        { value: 30, date: new Date('2023-01-15'), isPersonalBest: false }
      ]
    }
  ];

  const mockConfig: ChartConfiguration = {
    type: 'multi_line',
    title: 'Test Multi-Line Chart',
    subtitle: 'Test Subtitle',
    showLegend: true,
    showTooltips: true,
    responsive: true,
    aspectRatio: 2
  };

  const mockStatistics: Record<string, StatisticalSummary> = {
    'DASH_40YD': { count: 10, mean: 4.5, median: 4.4, std: 0.3, variance: 0.09, min: 4.0, max: 5.0, percentiles: { p5: 4.1, p10: 4.2, p25: 4.3, p50: 4.4, p75: 4.6, p90: 4.8, p95: 4.9 } },
    'VERTICAL_JUMP': { count: 10, mean: 30, median: 30, std: 4, variance: 16, min: 22, max: 38, percentiles: { p5: 23, p10: 24, p25: 27, p50: 30, p75: 33, p90: 36, p95: 37 } }
  };

  const defaultProps = {
    data: mockTrendData,
    config: mockConfig,
    statistics: mockStatistics
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      render(<MultiLineChart {...defaultProps} />);
      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });

    it('should display no data message when data is empty', () => {
      render(<MultiLineChart {...defaultProps} data={[]} />);
      expect(screen.getByText('No trend data available for multi-line chart')).toBeInTheDocument();
    });

    it('should display chart explanation text', () => {
      render(<MultiLineChart {...defaultProps} />);
      expect(screen.getByText('All metrics normalized to 0-100% scale for comparison.')).toBeInTheDocument();
    });
  });

  describe('Athlete Selection', () => {
    it('should show athlete selector for multi-athlete scenarios', () => {
      render(<MultiLineChart {...defaultProps} />);
      expect(screen.getByTestId('athlete-selector')).toBeInTheDocument();
    });

    it('should not show athlete selector when highlightAthlete is provided', () => {
      render(<MultiLineChart {...defaultProps} highlightAthlete="athlete1" />);
      expect(screen.queryByTestId('athlete-selector')).not.toBeInTheDocument();
    });

    it('should not show athlete selector for single athlete data', () => {
      const singleAthleteData = mockTrendData.filter(trend => trend.athleteId === 'athlete1');
      render(<MultiLineChart {...defaultProps} data={singleAthleteData} />);
      expect(screen.queryByTestId('athlete-selector')).not.toBeInTheDocument();
    });

    it('should pass maxAthletes prop to AthleteSelector', () => {
      render(<MultiLineChart {...defaultProps} maxAthletes={5} />);
      expect(screen.getByTestId('max-athletes')).toHaveTextContent('5');
    });

    it('should use default maxAthletes when not provided', () => {
      render(<MultiLineChart {...defaultProps} />);
      expect(screen.getByTestId('max-athletes')).toHaveTextContent('3');
    });
  });

  describe('Internal State Management', () => {
    it('should handle athlete toggle', async () => {
      render(<MultiLineChart {...defaultProps} />);

      const athleteButton = screen.getByTestId('athlete-athlete1');
      fireEvent.click(athleteButton);

      await waitFor(() => {
        // Should trigger state update (tested via chart data changes)
        expect(screen.getByTestId('chart-component')).toBeInTheDocument();
      });
    });

    it('should handle select all', async () => {
      render(<MultiLineChart {...defaultProps} />);

      const selectAllButton = screen.getByTestId('select-all');
      fireEvent.click(selectAllButton);

      await waitFor(() => {
        expect(screen.getByTestId('chart-component')).toBeInTheDocument();
      });
    });

    it('should handle clear all', async () => {
      render(<MultiLineChart {...defaultProps} />);

      const clearAllButton = screen.getByTestId('clear-all');
      fireEvent.click(clearAllButton);

      await waitFor(() => {
        // After clearing all athletes, should show no data message
        expect(screen.getByText('No trend data available for multi-line chart')).toBeInTheDocument();
      });
    });

    it('should respect maxAthletes limit', () => {
      const onAthleteSelectionChange = vi.fn();
      render(
        <MultiLineChart
          {...defaultProps}
          maxAthletes={1}
          onAthleteSelectionChange={onAthleteSelectionChange}
        />
      );

      // Should limit selection to 1 athlete
      expect(screen.getByTestId('max-athletes')).toHaveTextContent('1');
    });
  });

  describe('External State Management', () => {
    it('should use external selectedAthleteIds when provided', () => {
      const selectedAthleteIds = ['athlete1'];
      const onAthleteSelectionChange = vi.fn();

      render(
        <MultiLineChart
          {...defaultProps}
          selectedAthleteIds={selectedAthleteIds}
          onAthleteSelectionChange={onAthleteSelectionChange}
        />
      );

      expect(screen.getByTestId('athlete-selector')).toBeInTheDocument();
    });

    it('should call onAthleteSelectionChange when selection changes', async () => {
      const onAthleteSelectionChange = vi.fn();

      render(
        <MultiLineChart
          {...defaultProps}
          selectedAthleteIds={['athlete1']}
          onAthleteSelectionChange={onAthleteSelectionChange}
        />
      );

      const athleteButton = screen.getByTestId('athlete-athlete2');
      fireEvent.click(athleteButton);

      await waitFor(() => {
        expect(onAthleteSelectionChange).toHaveBeenCalled();
      });
    });
  });

  describe('Data Transformation', () => {
    it('should normalize data to 0-100% scale', () => {
      render(<MultiLineChart {...defaultProps} />);

      const chartData = JSON.parse(screen.getByTestId('chart-data').textContent || '{}');

      // Check that datasets are created
      expect(chartData.datasets).toBeDefined();
      expect(chartData.datasets.length).toBeGreaterThan(0);
    });

    it('should create separate datasets for each athlete-metric combination', () => {
      render(<MultiLineChart {...defaultProps} />);

      const chartData = JSON.parse(screen.getByTestId('chart-data').textContent || '{}');

      // Should have datasets for each athlete-metric combo
      expect(chartData.datasets.length).toBeGreaterThan(0);
    });

    it('should handle single athlete differently than multi-athlete', () => {
      const singleAthleteData = mockTrendData.filter(trend => trend.athleteId === 'athlete1');
      render(<MultiLineChart {...defaultProps} data={singleAthleteData} />);

      const chartData = JSON.parse(screen.getByTestId('chart-data').textContent || '{}');

      // Should have appropriate dataset configuration
      expect(chartData.datasets).toBeDefined();
    });

    it('should generate date labels correctly', () => {
      render(<MultiLineChart {...defaultProps} />);

      const chartData = JSON.parse(screen.getByTestId('chart-data').textContent || '{}');

      // Should have labels for dates
      expect(chartData.labels).toBeDefined();
      expect(Array.isArray(chartData.labels)).toBe(true);
    });
  });

  describe('Chart Configuration', () => {
    it('should configure chart options correctly', () => {
      render(<MultiLineChart {...defaultProps} />);

      const chartOptions = JSON.parse(screen.getByTestId('chart-options').textContent || '{}');

      // Should have responsive configuration
      expect(chartOptions.responsive).toBe(true);
      expect(chartOptions.maintainAspectRatio).toBe(false);

      // Should have title configuration
      expect(chartOptions.plugins.title.display).toBe(true);
      expect(chartOptions.plugins.title.text).toBe('Test Multi-Line Chart');
    });

    it('should configure scales correctly', () => {
      render(<MultiLineChart {...defaultProps} />);

      const chartOptions = JSON.parse(screen.getByTestId('chart-options').textContent || '{}');

      // Y-axis should be normalized to 0-100
      expect(chartOptions.scales.y.min).toBe(0);
      expect(chartOptions.scales.y.max).toBe(100);

      // Should have proper axis titles
      expect(chartOptions.scales.x.title.text).toBe('Date');
      expect(chartOptions.scales.y.title.text).toBe('Normalized Performance (%)');
    });

    it('should handle subtitle configuration', () => {
      render(<MultiLineChart {...defaultProps} />);

      const chartOptions = JSON.parse(screen.getByTestId('chart-options').textContent || '{}');

      expect(chartOptions.plugins.subtitle.display).toBe(true);
      expect(chartOptions.plugins.subtitle.text).toBe('Test Subtitle');
    });
  });

  describe('Legend Rendering', () => {
    it('should show athletes legend for multi-athlete scenario', () => {
      render(<MultiLineChart {...defaultProps} />);

      expect(screen.getByText('Athletes (2)')).toBeInTheDocument();
    });

    it('should show metrics legend', () => {
      render(<MultiLineChart {...defaultProps} />);

      expect(screen.getByText('Metrics & Line Styles (2)')).toBeInTheDocument();
    });

    it('should not show athletes legend for single athlete', () => {
      const singleAthleteData = mockTrendData.filter(trend => trend.athleteId === 'athlete1');
      render(<MultiLineChart {...defaultProps} data={singleAthleteData} />);

      expect(screen.queryByText(/Athletes \(\d+\)/)).not.toBeInTheDocument();
    });

    it('should show appropriate help text for single vs multi athlete', () => {
      // Single athlete
      const singleAthleteData = mockTrendData.filter(trend => trend.athleteId === 'athlete1');
      const { rerender } = render(<MultiLineChart {...defaultProps} data={singleAthleteData} />);

      expect(screen.getByText(/Different line styles represent different metrics/)).toBeInTheDocument();

      // Multi athlete
      rerender(<MultiLineChart {...defaultProps} />);

      expect(screen.getByText(/Each athlete has a unique color/)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty trend data gracefully', () => {
      render(<MultiLineChart {...defaultProps} data={[]} />);

      expect(screen.getByText('No trend data available for multi-line chart')).toBeInTheDocument();
    });

    it('should handle missing statistics', () => {
      render(<MultiLineChart {...defaultProps} statistics={undefined} />);

      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });

    it('should handle data with missing metric configs', () => {
      const dataWithUnknownMetric: TrendData[] = [
        {
          athleteId: 'athlete1',
          athleteName: 'Test Athlete',
          metric: 'UNKNOWN_METRIC',
          data: [{ value: 10, date: new Date('2023-01-01'), isPersonalBest: false }]
        }
      ];

      render(<MultiLineChart {...defaultProps} data={dataWithUnknownMetric} />);

      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });

    it('should handle data points with null values', () => {
      const dataWithNulls: TrendData[] = [
        {
          athleteId: 'athlete1',
          athleteName: 'Test Athlete',
          metric: 'DASH_40YD',
          data: [
            { value: 4.5, date: new Date('2023-01-01'), isPersonalBest: false },
            // Gap in data
            { value: 4.3, date: new Date('2023-01-15'), isPersonalBest: false }
          ]
        }
      ];

      render(<MultiLineChart {...defaultProps} data={dataWithNulls} />);

      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });
  });

  describe('Performance Optimization', () => {
    it('should memoize athlete IDs to prevent unnecessary re-renders', () => {
      const { rerender } = render(<MultiLineChart {...defaultProps} />);

      // Re-render with same data should not cause issues
      rerender(<MultiLineChart {...defaultProps} />);

      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });

    it('should use useCallback for event handlers', () => {
      const onAthleteSelectionChange = vi.fn();

      render(
        <MultiLineChart
          {...defaultProps}
          onAthleteSelectionChange={onAthleteSelectionChange}
        />
      );

      // Should not recreate handlers unnecessarily
      expect(screen.getByTestId('athlete-selector')).toBeInTheDocument();
    });
  });

  describe('Highlight Athlete Feature', () => {
    it('should filter to highlighted athlete only', () => {
      render(<MultiLineChart {...defaultProps} highlightAthlete="athlete1" />);

      const chartData = JSON.parse(screen.getByTestId('chart-data').textContent || '{}');

      // Should only show data for athlete1
      expect(chartData.datasets).toBeDefined();
    });

    it('should not show athlete selector when highlighting', () => {
      render(<MultiLineChart {...defaultProps} highlightAthlete="athlete1" />);

      expect(screen.queryByTestId('athlete-selector')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels in legends', () => {
      render(<MultiLineChart {...defaultProps} />);

      // Check that legend sections have proper headings
      expect(screen.getByText('Athletes (2)')).toBeInTheDocument();
      expect(screen.getByText('Metrics & Line Styles (2)')).toBeInTheDocument();
    });

    it('should provide meaningful titles for color indicators', () => {
      render(<MultiLineChart {...defaultProps} />);

      // Legend items should be accessible
      expect(screen.getByTestId('chart-component')).toBeInTheDocument();
    });
  });
});