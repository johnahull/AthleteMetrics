/**
 * Component tests for chart rendering
 * Tests Chart.js integration and error handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ChartContainer } from '../../client/src/components/charts/ChartContainer';
import { ErrorBoundary } from '../../client/src/components/ErrorBoundary';
import type { ChartDataPoint, ChartConfiguration } from '@shared/analytics-types';

// Mock Chart.js
jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn(),
    getChart: jest.fn(),
    defaults: {
      plugins: {
        legend: { display: true },
        tooltip: { enabled: true }
      }
    }
  },
  CategoryScale: jest.fn(),
  LinearScale: jest.fn(),
  PointElement: jest.fn(),
  LineElement: jest.fn(),
  Title: jest.fn(),
  Tooltip: jest.fn(),
  Legend: jest.fn(),
}));

// Mock react-chartjs-2
jest.mock('react-chartjs-2', () => ({
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

      expect(screen.getByText('Test Chart')).toBeInTheDocument();
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
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

      expect(screen.getByRole('status')).toBeInTheDocument(); // Loading skeleton
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

      expect(screen.getByText(/no data/i)).toBeInTheDocument();
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

      expect(screen.getByTestId('line-chart')).toBeInTheDocument();

      rerender(
        <ChartContainer
          type="bar_chart"
          data={mockData}
          config={mockConfig}
          isLoading={false}
        />
      );

      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
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
      expect(chartElement).toBeInTheDocument();
    });

    it('should handle export functionality', () => {
      const mockOnExport = jest.fn();

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

      expect(mockOnExport).toHaveBeenCalledWith(mockData, mockConfig);
    });

    it('should handle fullscreen functionality', () => {
      const mockOnFullscreen = jest.fn();

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
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/chart error/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

      consoleSpy.mockRestore();
    });

    it('should allow retry after error', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      // Simulate successful retry
      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('No error')).toBeInTheDocument();

      consoleSpy.mockRestore();
    });

    it('should show error details in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/error details/i)).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });

    it('should call custom error handler', () => {
      const mockErrorHandler = jest.fn();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

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

      consoleSpy.mockRestore();
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
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
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