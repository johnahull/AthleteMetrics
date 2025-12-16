/**
 * BenchmarkLineSelector Component Tests
 * Test-first development for benchmark selection UI
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BenchmarkLineSelector } from '../BenchmarkLineSelector';

// Mock the API
vi.mock('@/lib/benchmarks-api', () => ({
  useBenchmarksForMetric: vi.fn()
}));

import { useBenchmarksForMetric } from '@/lib/benchmarks-api';

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

describe('BenchmarkLineSelector', () => {
  const mockBenchmarks = [
    {
      id: 'benchmark-1',
      name: 'Elite Performance',
      benchmarkValue: 1.5,
      comparisonOperator: 'lte' as const,
      metricCode: 'FLY10_TIME',
      filters: {
        gender: 'Male',
        ageMin: 16,
        ageMax: 18
      }
    },
    {
      id: 'benchmark-2',
      name: 'College Ready',
      benchmarkValue: 1.6,
      comparisonOperator: 'lte' as const,
      metricCode: 'FLY10_TIME',
      filters: {
        gender: 'Male'
      }
    },
    {
      id: 'benchmark-3',
      name: 'Female Elite',
      benchmarkValue: 1.7,
      comparisonOperator: 'lte' as const,
      metricCode: 'FLY10_TIME',
      filters: {
        gender: 'Female',
        ageMin: 16,
        ageMax: 18
      }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: [],
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={[]}
          onSelectionChange={vi.fn()}
        />
      </TestWrapper>
    );

    // Component now shows "Benchmarks for {metricLabel}" format
    expect(screen.getByText(/Benchmarks for/i)).toBeInTheDocument();
  });

  it('displays loading state while fetching benchmarks', () => {
    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={[]}
          onSelectionChange={vi.fn()}
        />
      </TestWrapper>
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('displays error state when fetch fails', () => {
    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to fetch benchmarks')
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={[]}
          onSelectionChange={vi.fn()}
        />
      </TestWrapper>
    );

    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it('displays benchmark list when data is loaded', () => {
    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={[]}
          onSelectionChange={vi.fn()}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Elite Performance')).toBeInTheDocument();
    expect(screen.getByText('College Ready')).toBeInTheDocument();
    expect(screen.getByText('Female Elite')).toBeInTheDocument();
  });

  it('displays benchmark target values', () => {
    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={[]}
          onSelectionChange={vi.fn()}
        />
      </TestWrapper>
    );

    expect(screen.getByText(/1.5/)).toBeInTheDocument();
    expect(screen.getByText(/1.6/)).toBeInTheDocument();
    expect(screen.getByText(/1.7/)).toBeInTheDocument();
  });

  it('displays demographic filter badges', () => {
    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={[]}
          onSelectionChange={vi.fn()}
        />
      </TestWrapper>
    );

    // Check for filter badges
    expect(screen.getAllByText(/Male/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Female/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/16-18/i).length).toBeGreaterThan(0);
  });

  it('allows selecting individual benchmarks', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={[]}
          onSelectionChange={onSelectionChange}
        />
      </TestWrapper>
    );

    const checkbox = screen.getAllByRole('checkbox')[0];
    await user.click(checkbox);

    expect(onSelectionChange).toHaveBeenCalledWith(['benchmark-1']);
  });

  it('allows deselecting benchmarks', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={['benchmark-1', 'benchmark-2']}
          onSelectionChange={onSelectionChange}
        />
      </TestWrapper>
    );

    const checkbox = screen.getAllByRole('checkbox')[0];
    await user.click(checkbox);

    expect(onSelectionChange).toHaveBeenCalledWith(['benchmark-2']);
  });

  it('provides "Select All" functionality', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={[]}
          onSelectionChange={onSelectionChange}
        />
      </TestWrapper>
    );

    const selectAllButton = screen.getByText(/select all/i);
    await user.click(selectAllButton);

    expect(onSelectionChange).toHaveBeenCalledWith(['benchmark-1', 'benchmark-2', 'benchmark-3']);
  });

  it('provides "Clear All" functionality', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={['benchmark-1', 'benchmark-2']}
          onSelectionChange={onSelectionChange}
        />
      </TestWrapper>
    );

    const clearAllButton = screen.getByText(/clear all/i);
    await user.click(clearAllButton);

    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it('shows empty state when no benchmarks exist', () => {
    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: [],
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={[]}
          onSelectionChange={vi.fn()}
        />
      </TestWrapper>
    );

    expect(screen.getByText(/no benchmarks/i)).toBeInTheDocument();
  });

  it('disables "Select All" when all benchmarks already selected', () => {
    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={['benchmark-1', 'benchmark-2', 'benchmark-3']}
          onSelectionChange={vi.fn()}
        />
      </TestWrapper>
    );

    const selectAllButton = screen.getByText(/select all/i);
    expect(selectAllButton).toBeDisabled();
  });

  it('disables "Clear All" when no benchmarks selected', () => {
    vi.mocked(useBenchmarksForMetric).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkLineSelector
          organizationId="org-1"
          metricCode="FLY10_TIME"
          selectedBenchmarkIds={[]}
          onSelectionChange={vi.fn()}
        />
      </TestWrapper>
    );

    const clearAllButton = screen.getByText(/clear all/i);
    expect(clearAllButton).toBeDisabled();
  });
});
