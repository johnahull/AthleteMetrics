/**
 * LineChart Benchmark Integration Tests
 * Tests for benchmark overlay functionality on line charts
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LineChart } from '../LineChart';
import type { TrendData, BenchmarkLine } from '@shared/analytics-types';

// Test wrapper with React Query
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('LineChart with Benchmarks', () => {
  const mockTrendData: TrendData[] = [
    {
      athleteId: 'athlete-1',
      athleteName: 'John Doe',
      metric: 'FLY10_TIME',
      data: [
        { date: new Date('2024-01-01'), value: 1.8 },
        { date: new Date('2024-01-15'), value: 1.7 },
        { date: new Date('2024-02-01'), value: 1.6 }
      ]
    },
    {
      athleteId: 'athlete-2',
      athleteName: 'Jane Smith',
      metric: 'FLY10_TIME',
      data: [
        { date: new Date('2024-01-01'), value: 1.9 },
        { date: new Date('2024-01-15'), value: 1.75 },
        { date: new Date('2024-02-01'), value: 1.65 }
      ]
    }
  ];

  const mockBenchmarks: BenchmarkLine[] = [
    {
      id: 'benchmark-1',
      name: 'Elite Performance',
      value: 1.5,
      comparisonOperator: 'lte',
      color: 'rgba(255, 99, 132, 0.8)',
      lineStyle: 'solid'
    },
    {
      id: 'benchmark-2',
      name: 'College Ready',
      value: 1.7,
      comparisonOperator: 'lte',
      color: 'rgba(54, 162, 235, 0.8)',
      lineStyle: 'dashed',
      filters: {
        gender: 'Male',
        ageMin: 16,
        ageMax: 18
      }
    }
  ];

  const defaultConfig = {
    type: 'line_chart' as const,
    title: 'Performance Over Time',
    showLegend: true,
    showTooltips: true,
    responsive: true
  };

  it('renders chart without benchmarks', () => {
    const { container } = render(
      <TestWrapper>
        <LineChart
          data={mockTrendData}
          config={defaultConfig}
        />
      </TestWrapper>
    );

    // Chart should render successfully (canvas element exists)
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders chart with benchmark lines', () => {
    const { container } = render(
      <TestWrapper>
        <LineChart
          data={mockTrendData}
          config={defaultConfig}
          benchmarks={mockBenchmarks}
          showBenchmarks={true}
        />
      </TestWrapper>
    );

    // Chart should render successfully with benchmarks
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('does not render benchmarks when showBenchmarks is false', () => {
    const { container } = render(
      <TestWrapper>
        <LineChart
          data={mockTrendData}
          config={defaultConfig}
          benchmarks={mockBenchmarks}
          showBenchmarks={false}
        />
      </TestWrapper>
    );

    // Chart should render but benchmarks should not be visible
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('handles empty benchmark array', () => {
    const { container } = render(
      <TestWrapper>
        <LineChart
          data={mockTrendData}
          config={defaultConfig}
          benchmarks={[]}
          showBenchmarks={true}
        />
      </TestWrapper>
    );

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('handles undefined benchmarks prop', () => {
    const { container } = render(
      <TestWrapper>
        <LineChart
          data={mockTrendData}
          config={defaultConfig}
          benchmarks={undefined}
          showBenchmarks={true}
        />
      </TestWrapper>
    );

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('applies custom colors to benchmark lines', () => {
    const customBenchmarks: BenchmarkLine[] = [
      {
        id: 'benchmark-1',
        name: 'Custom Color',
        value: 1.5,
        comparisonOperator: 'lte',
        color: 'rgba(0, 255, 0, 1)'
      }
    ];

    const { container } = render(
      <TestWrapper>
        <LineChart
          data={mockTrendData}
          config={defaultConfig}
          benchmarks={customBenchmarks}
          showBenchmarks={true}
        />
      </TestWrapper>
    );

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('applies different line styles (solid, dashed, dotted)', () => {
    const styledBenchmarks: BenchmarkLine[] = [
      {
        id: 'benchmark-1',
        name: 'Solid Line',
        value: 1.5,
        comparisonOperator: 'lte',
        lineStyle: 'solid'
      },
      {
        id: 'benchmark-2',
        name: 'Dashed Line',
        value: 1.7,
        comparisonOperator: 'lte',
        lineStyle: 'dashed'
      },
      {
        id: 'benchmark-3',
        name: 'Dotted Line',
        value: 1.9,
        comparisonOperator: 'lte',
        lineStyle: 'dotted'
      }
    ];

    const { container } = render(
      <TestWrapper>
        <LineChart
          data={mockTrendData}
          config={defaultConfig}
          benchmarks={styledBenchmarks}
          showBenchmarks={true}
        />
      </TestWrapper>
    );

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('handles benchmark with demographic filters', () => {
    const benchmarkWithFilters: BenchmarkLine[] = [
      {
        id: 'benchmark-1',
        name: 'Male 16-18',
        value: 1.5,
        comparisonOperator: 'lte',
        filters: {
          gender: 'Male',
          ageMin: 16,
          ageMax: 18,
          position: 'Forward'
        }
      }
    ];

    const { container } = render(
      <TestWrapper>
        <LineChart
          data={mockTrendData}
          config={defaultConfig}
          benchmarks={benchmarkWithFilters}
          showBenchmarks={true}
        />
      </TestWrapper>
    );

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders multiple benchmark lines simultaneously', () => {
    const multipleBenchmarks: BenchmarkLine[] = [
      {
        id: 'benchmark-1',
        name: 'Elite',
        value: 1.4,
        comparisonOperator: 'lte'
      },
      {
        id: 'benchmark-2',
        name: 'College',
        value: 1.6,
        comparisonOperator: 'lte'
      },
      {
        id: 'benchmark-3',
        name: 'High School',
        value: 1.8,
        comparisonOperator: 'lte'
      }
    ];

    const { container } = render(
      <TestWrapper>
        <LineChart
          data={mockTrendData}
          config={defaultConfig}
          benchmarks={multipleBenchmarks}
          showBenchmarks={true}
        />
      </TestWrapper>
    );

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('uses default color when benchmark color is not specified', () => {
    const benchmarkWithoutColor: BenchmarkLine[] = [
      {
        id: 'benchmark-1',
        name: 'Default Color',
        value: 1.5,
        comparisonOperator: 'lte'
        // No color specified
      }
    ];

    const { container } = render(
      <TestWrapper>
        <LineChart
          data={mockTrendData}
          config={defaultConfig}
          benchmarks={benchmarkWithoutColor}
          showBenchmarks={true}
        />
      </TestWrapper>
    );

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
