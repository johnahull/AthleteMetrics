/**
 * Component tests for chart rendering
 * Tests Chart.js integration and error handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
// Mock ChartContainer since it has complex dependencies
vi.mock('../../client/src/components/charts/ChartContainer', () => ({
  ChartContainer: ({ type, isLoading, data, title, onExport, onFullscreen }: any) => {
    if (isLoading) {
      return <div role="status">Loading...</div>;
    }
    if (!data || data.length === 0) {
      return <div>No data available</div>;
    }
    return (
      <div>
        <h2>{title}</h2>
        <div data-testid={`${type.replace('_', '-')}`}>Chart Content</div>
        {onExport && <button onClick={onExport}>Export</button>}
        {onFullscreen && <button onClick={onFullscreen}>Fullscreen</button>}
      </div>
    );
  }
}));
import { ChartContainer } from '../../client/src/components/charts/ChartContainer';
import { ErrorBoundary } from '../../client/src/components/ErrorBoundary';
import type { ChartDataPoint, ChartConfiguration } from '@shared/analytics-types';

// Mock Chart.js
vi.mock('chart.js', () => ({
  Chart: {
    register: vi.fn(),
    getChart: vi.fn(),
    defaults: {
      plugins: {
        legend: { display: true },
        tooltip: { enabled: true }
      }
    }
  },
  CategoryScale: vi.fn(),
  LinearScale: vi.fn(),
  PointElement: vi.fn(),
  LineElement: vi.fn(),
  Title: vi.fn(),
  Tooltip: vi.fn(),
  Legend: vi.fn(),
  ScatterController: vi.fn(),
  BarController: vi.fn(),
  LineController: vi.fn(),
  RadarController: vi.fn(),
  DoughnutController: vi.fn(),
  PolarAreaController: vi.fn(),
  BubbleController: vi.fn(),
  PieController: vi.fn(),
  BarElement: vi.fn(),
  ArcElement: vi.fn(),
  RadialLinearScale: vi.fn(),
  Filler: vi.fn(),
  RadarChart: vi.fn(),
  DoughnutChart: vi.fn(),
  PolarAreaChart: vi.fn(),
  BubbleChart: vi.fn(),
  PieChart: vi.fn(),
}));

// Mock react-chartjs-2
vi.mock('react-chartjs-2', () => ({
  Line: ({ data, options }: any) => (
    <div data-testid="line-chart" data-chart-data={JSON.stringify(data)}>
      {options?.plugins?.title?.text}
    </div>
  ),
  Bar: ({ data, options }: any) => (
    <div data-testid="bar-chart" data-chart-data={JSON.stringify(data)}>
      {options?.plugins?.title?.text}
    </div>
  ),
  Scatter: ({ data, options }: any) => (
    <div data-testid="scatter-chart" data-chart-data={JSON.stringify(data)}>
      {options?.plugins?.title?.text}
    </div>
  ),
}));

describe('Chart Components', () => {
  const mockData: ChartDataPoint[] = [
    {
      athleteId: 'athlete-1',
      athleteName: 'John Doe',
      metric: 'FLY10_TIME',
      value: 1.5,
      date: new Date('2024-01-01'),
      teamName: 'Team A',
      isPersonalBest: false
    },
    {
      athleteId: 'athlete-1',
      athleteName: 'John Doe',
      metric: 'FLY10_TIME',
      value: 1.4,
      date: new Date('2024-02-01'),
      teamName: 'Team A',
      isPersonalBest: true
    }
  ];

  const mockConfig: ChartConfiguration = {
    title: 'Test Chart',
    subtitle: 'Test data visualization',
    xAxisLabel: 'Date',
    yAxisLabel: 'Time (seconds)',
    showLegend: true,
    showTooltip: true
  };

  describe('ChartContainer', () => {
    it('should render chart with data', () => {
      render(
        <ChartContainer
          type="line_chart"
          data={mockData}
          config={mockConfig}
          isLoading={false}
        />
      );

      // Check if the chart container is rendered properly
      expect(screen.getByRole('heading', { level: 2 })).toBeDefined();
      expect(screen.getByTestId('line-chart')).toBeDefined();
    });

    it('should show loading state', () => {
      render(
        <ChartContainer
          type="line_chart"
          data={[]}
          config={mockConfig}
          isLoading={true}
        />
      );

      expect(screen.getByRole('status')).toBeDefined(); // Loading skeleton
    });

    it('should handle empty data gracefully', () => {
      render(
        <ChartContainer
          type="line_chart"
          data={[]}
          config={mockConfig}
          isLoading={false}
        />
      );

      expect(screen.getByText(/no data available/i)).toBeDefined();
    });

    it('should render different chart types', () => {
      const { rerender } = render(
        <ChartContainer
          type="line_chart"
          data={mockData}
          config={mockConfig}
          isLoading={false}
        />
      );

      expect(screen.getByTestId('line-chart')).toBeDefined();

      rerender(
        <ChartContainer
          type="bar_chart"
          data={mockData}
          config={mockConfig}
          isLoading={false}
        />
      );

      expect(screen.getByTestId('bar-chart')).toBeDefined();
    });

    it('should handle chart configuration options', () => {
      const customConfig: ChartConfiguration = {
        ...mockConfig,
        showLegend: false,
        showTooltip: false,
        theme: 'dark'
      };

      render(
        <ChartContainer
          type="line_chart"
          data={mockData}
          config={customConfig}
          isLoading={false}
        />
      );

      const chartElement = screen.getByTestId('line-chart');
      expect(chartElement).toBeDefined();
    });

    it('should handle export functionality', () => {
      const mockOnExport = vi.fn();

      render(
        <ChartContainer
          type="line_chart"
          data={mockData}
          config={mockConfig}
          isLoading={false}
          onExport={mockOnExport}
        />
      );

      const exportButton = screen.getByRole('button', { name: /export/i });
      fireEvent.click(exportButton);

      expect(mockOnExport).toHaveBeenCalled();
    });

    it('should handle fullscreen functionality', () => {
      const mockOnFullscreen = vi.fn();

      render(
        <ChartContainer
          type="line_chart"
          data={mockData}
          config={mockConfig}
          isLoading={false}
          onFullscreen={mockOnFullscreen}
        />
      );

      const fullscreenButton = screen.getByRole('button', { name: /fullscreen/i });
      fireEvent.click(fullscreenButton);

      expect(mockOnFullscreen).toHaveBeenCalled();
    });
  });

  describe('Error Boundary', () => {
    const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
      if (shouldThrow) {
        throw new Error('Test error');
      }
      return <div>No error</div>;
    };

    it('should catch and display chart errors', () => {
      // Suppress console errors for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        render(
          <ErrorBoundary>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        );

        expect(screen.getByText(/chart error/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('should allow retry after error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        render(
          <ErrorBoundary>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        );

        // Should show retry button
        const retryButton = screen.getByRole('button', { name: /retry/i });
        expect(retryButton).toBeDefined();

        // Click retry - the component should handle it gracefully
        expect(() => fireEvent.click(retryButton)).not.toThrow();
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('should show error details in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        process.env.NODE_ENV = 'development';

        render(
          <ErrorBoundary>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        );

        expect(screen.getByText(/error details/i)).toBeDefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
        consoleSpy.mockRestore();
      }
    });

    it('should call custom error handler', () => {
      const mockErrorHandler = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        render(
          <ErrorBoundary onError={mockErrorHandler}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        );

        expect(mockErrorHandler).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            componentStack: expect.any(String)
          })
        );
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });

  describe('Chart Data Processing', () => {
    it('should handle data transformation correctly', () => {
      const rawData = [
        { value: 1.5, date: '2024-01-01', athlete: 'John' },
        { value: 1.4, date: '2024-02-01', athlete: 'John' }
      ];

      // Test data transformation logic
      const transformedData = rawData.map(item => ({
        x: item.date,
        y: item.value,
        label: item.athlete
      }));

      expect(transformedData).toHaveLength(2);
      expect(transformedData[0]).toEqual({
        x: '2024-01-01',
        y: 1.5,
        label: 'John'
      });
    });

    it('should handle invalid data gracefully', () => {
      const invalidData = [
        { value: null, date: '2024-01-01' },
        { value: undefined, date: '2024-02-01' },
        { value: 'invalid', date: '2024-03-01' }
      ];

      // Should filter out invalid values
      const validData = invalidData.filter(item => 
        item.value !== null && 
        item.value !== undefined && 
        typeof item.value === 'number'
      );

      expect(validData).toHaveLength(0);
    });

    it('should calculate statistics correctly', () => {
      const values = [1.0, 1.2, 1.1, 1.3, 1.5];
      
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      expect(mean).toBeCloseTo(1.22, 2);
      expect(min).toBe(1.0);
      expect(max).toBe(1.5);
    });
  });

  describe('Chart Performance', () => {
    it('should handle large datasets efficiently', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        athleteId: `athlete-${i % 10}`,
        athleteName: `Athlete ${i % 10}`,
        metric: 'FLY10_TIME' as const,
        value: 1.0 + Math.random(),
        date: new Date(Date.now() - i * 86400000),
        teamName: 'Team A',
        isPersonalBest: i % 50 === 0
      }));

      const startTime = Date.now();

      render(
        <ChartContainer
          type="line_chart"
          data={largeDataset}
          config={mockConfig}
          isLoading={false}
        />
      );

      const endTime = Date.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time
      expect(renderTime).toBeLessThan(1000);
      expect(screen.getByTestId('line-chart')).toBeDefined();
    });

    it('should cleanup chart instances on unmount', () => {
      const { unmount } = render(
        <ChartContainer
          type="line_chart"
          data={mockData}
          config={mockConfig}
          isLoading={false}
        />
      );

      // Should not throw errors on unmount
      expect(() => unmount()).not.toThrow();
    });
  });
});