/**
 * Tests for MultiLineChart component
 * Rewritten to avoid hanging and timeout issues
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { TrendData, ChartConfiguration, StatisticalSummary } from '@shared/analytics-types';

// Mock useDebounce FIRST before any other imports
vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: vi.fn((value: any) => value) // Return immediately without debouncing
}));

// Mock useAthleteSelection hook
vi.mock('@/hooks/useAthleteSelection', () => ({
  useAthleteSelection: vi.fn(() => ({
    athleteToggles: { 'athlete1': true, 'athlete2': true },
    handleToggleAthlete: vi.fn(),
    handleSelectAll: vi.fn(),
    handleClearAll: vi.fn(),
    isControlled: false,
    selectedCount: 2,
    isAtMaximum: false
  }))
}));

// Mock Chart.js Line component to avoid canvas rendering
vi.mock('react-chartjs-2', () => ({
  Line: vi.fn(({ data }) => (
    <div data-testid="mock-chart">
      <div data-testid="chart-datasets">{JSON.stringify(data.datasets?.length || 0)}</div>
      <div data-testid="chart-labels">{JSON.stringify(data.labels?.length || 0)}</div>
    </div>
  ))
}));

// Mock AthleteSelector to simplify testing
vi.mock('../components/AthleteSelector', () => ({
  AthleteSelector: vi.fn(({ athletes }) => (
    <div data-testid="athlete-selector">
      <span data-testid="athlete-count">{athletes.length}</span>
    </div>
  ))
}));

// Mock ChartErrorBoundary to pass through children
vi.mock('../ChartErrorBoundary', () => ({
  ChartErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

// Mock CollapsibleLegend to simplify rendering
vi.mock('../components/CollapsibleLegend', () => ({
  CollapsibleLegend: ({ title, itemCount, children }: any) => (
    <div data-testid="collapsible-legend">
      <div data-testid="legend-title">{title}</div>
      <div data-testid="legend-count">{itemCount}</div>
      {children}
    </div>
  )
}));

// Mock LegendLine component
vi.mock('../components/LegendLine', () => ({
  LegendLine: () => <div data-testid="legend-line" />
}));

// Mock ChartSkeleton component
vi.mock('../components/ChartSkeleton', () => ({
  ChartSkeleton: () => <div data-testid="chart-skeleton" />
}));

// Mock chart validation utilities
vi.mock('@/utils/chart-validation', () => ({
  validateChartData: vi.fn(() => ({ isValid: true, value: [] })),
  validateMaxAthletes: vi.fn((max: number) => ({ isValid: true, value: max || 3 })),
  logValidationResult: vi.fn()
}));

// Mock chart constants
vi.mock('@/utils/chart-constants', () => ({
  ATHLETE_COLORS: ['#FF0000', '#00FF00', '#0000FF'],
  METRIC_COLORS: ['#FF00FF', '#00FFFF'],
  METRIC_STYLES: [
    { name: 'Solid', dash: [] },
    { name: 'Dashed', dash: [5, 5] }
  ],
  DEFAULT_SELECTION_COUNT: 3,
  NORMALIZED_MEAN_VALUE: 50,
  NORMALIZED_MIN_VALUE: 0,
  NORMALIZED_MAX_VALUE: 100,
  getAthleteColor: vi.fn((index: number) => `rgba(${index * 50}, 130, 246, 1)`),
  getMetricStyle: vi.fn((index: number) => ({
    name: index === 0 ? 'Solid' : 'Dashed',
    dash: index === 0 ? [] : [5, 5]
  }))
}));

// Mock FLY10 conversion utilities
vi.mock('@/utils/fly10-conversion', () => ({
  isFly10Metric: vi.fn(() => false),
  formatFly10Dual: vi.fn((value: number) => `${value}s`)
}));

// Now import the component after all mocks are set up
import { MultiLineChart } from '../MultiLineChart';

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
      athleteId: 'athlete2',
      athleteName: 'Jane Smith',
      metric: 'DASH_40YD',
      data: [
        { value: 4.8, date: new Date('2023-01-01'), isPersonalBest: false },
        { value: 4.6, date: new Date('2023-01-15'), isPersonalBest: true }
      ]
    }
  ];

  const mockConfig: ChartConfiguration = {
    type: 'multi_line',
    title: 'Test Chart',
    subtitle: 'Test Subtitle',
    showLegend: true,
    showTooltips: true,
    responsive: true,
    aspectRatio: 2
  };

  const mockStatistics: Record<string, StatisticalSummary> = {
    'DASH_40YD': {
      count: 10,
      mean: 4.5,
      median: 4.4,
      std: 0.3,
      variance: 0.09,
      min: 4.0,
      max: 5.0,
      percentiles: { p5: 4.1, p10: 4.2, p25: 4.3, p50: 4.4, p75: 4.6, p90: 4.8, p95: 4.9 }
    }
  };

  const defaultProps = {
    data: mockTrendData,
    config: mockConfig,
    statistics: mockStatistics
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(<MultiLineChart {...defaultProps} />);
      expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
    });

    it('should display no data message when data is empty', () => {
      render(<MultiLineChart {...defaultProps} data={[]} />);
      expect(screen.getByText(/no trend data available/i)).toBeInTheDocument();
    });

    it('should show loading skeleton when isLoading is true', () => {
      render(<MultiLineChart {...defaultProps} isLoading={true} />);
      expect(screen.getByTestId('chart-skeleton')).toBeInTheDocument();
    });

    it('should render chart with valid data', () => {
      render(<MultiLineChart {...defaultProps} />);
      expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
    });
  });

  describe('Athlete Selection', () => {
    it('should show athlete selector for multi-athlete data', () => {
      render(<MultiLineChart {...defaultProps} />);
      expect(screen.getByTestId('athlete-selector')).toBeInTheDocument();
    });

    it('should not show athlete selector for single athlete', () => {
      const singleAthleteData = mockTrendData.filter(t => t.athleteId === 'athlete1');
      render(<MultiLineChart {...defaultProps} data={singleAthleteData} />);
      expect(screen.queryByTestId('athlete-selector')).not.toBeInTheDocument();
    });

    it('should not show athlete selector when highlightAthlete is set', () => {
      render(<MultiLineChart {...defaultProps} highlightAthlete="athlete1" />);
      expect(screen.queryByTestId('athlete-selector')).not.toBeInTheDocument();
    });
  });

  describe('Data Processing', () => {
    it('should create datasets from trend data', () => {
      render(<MultiLineChart {...defaultProps} />);
      const datasetsCount = screen.getByTestId('chart-datasets').textContent;
      expect(Number(datasetsCount)).toBeGreaterThan(0);
    });

    it('should create labels from dates', () => {
      render(<MultiLineChart {...defaultProps} />);
      const labelsCount = screen.getByTestId('chart-labels').textContent;
      expect(Number(labelsCount)).toBeGreaterThan(0);
    });

    it('should handle missing statistics', () => {
      render(<MultiLineChart {...defaultProps} statistics={undefined} />);
      expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
    });
  });

  describe('Legend Display', () => {
    it('should show explanation text', () => {
      render(<MultiLineChart {...defaultProps} />);
      expect(screen.getByText(/normalized to 0-100% scale/i)).toBeInTheDocument();
    });

    it('should show help text for multi-athlete scenario', () => {
      render(<MultiLineChart {...defaultProps} />);
      expect(screen.getByText(/each athlete has a unique color/i)).toBeInTheDocument();
    });

    it('should show different help text for single athlete', () => {
      const singleAthleteData = mockTrendData.filter(t => t.athleteId === 'athlete1');
      render(<MultiLineChart {...defaultProps} data={singleAthleteData} />);
      expect(screen.getByText(/different line styles represent different metrics/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty data array', () => {
      render(<MultiLineChart {...defaultProps} data={[]} />);
      expect(screen.queryByTestId('mock-chart')).not.toBeInTheDocument();
      expect(screen.getByText(/no trend data available/i)).toBeInTheDocument();
    });

    it('should filter to highlighted athlete', () => {
      render(<MultiLineChart {...defaultProps} highlightAthlete="athlete1" />);
      expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
    });

    it('should handle invalid highlightAthlete gracefully', () => {
      render(<MultiLineChart {...defaultProps} highlightAthlete="nonexistent" />);
      expect(screen.getByText(/no trend data available/i)).toBeInTheDocument();
    });
  });

  describe('Props Validation', () => {
    it('should accept maxAthletes prop', () => {
      render(<MultiLineChart {...defaultProps} maxAthletes={5} />);
      expect(screen.getByTestId('athlete-selector')).toBeInTheDocument();
    });

    it('should use default maxAthletes when not provided', () => {
      render(<MultiLineChart {...defaultProps} />);
      expect(screen.getByTestId('athlete-selector')).toBeInTheDocument();
    });

    it('should handle external selection control', () => {
      const onSelectionChange = vi.fn();
      render(
        <MultiLineChart
          {...defaultProps}
          selectedAthleteIds={['athlete1']}
          onAthleteSelectionChange={onSelectionChange}
        />
      );
      expect(screen.getByTestId('mock-chart')).toBeInTheDocument();
    });
  });
});
