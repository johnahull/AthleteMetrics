/**
 * BenchmarkDashboardWidget Component Tests
 * Test-first development for team benchmark dashboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BenchmarkDashboardWidget } from '../BenchmarkDashboardWidget';

// Mock the API
vi.mock('@/lib/benchmarks-api', () => ({
  useTeamBenchmarkAggregation: vi.fn()
}));

import { useTeamBenchmarkAggregation } from '@/lib/benchmarks-api';

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

describe('BenchmarkDashboardWidget', () => {
  const mockBenchmarks = [
    {
      benchmarkId: 'benchmark-1',
      benchmarkName: 'Elite Fly Time',
      metricCode: 'FLY10_TIME',
      benchmarkValue: 1.10,
      comparisonOperator: 'lte' as const,
      filters: { gender: 'Male', ageMin: 18, ageMax: 25 },
      applicableAthletes: 23,
      athletesMet: 18,
      athletesNoData: 2,
      achievementRate: 78,
      averageProgress: 95
    },
    {
      benchmarkId: 'benchmark-2',
      benchmarkName: 'Vertical Jump Target',
      metricCode: 'VERTICAL_JUMP',
      benchmarkValue: 28,
      comparisonOperator: 'gte' as const,
      filters: {},
      applicableAthletes: 22,
      athletesMet: 10,
      athletesNoData: 3,
      achievementRate: 45,
      averageProgress: 85
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: [],
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    expect(screen.getByText(/benchmark achievement/i)).toBeInTheDocument();
  });

  it('displays loading state while fetching data', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('displays error state when fetch fails', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to fetch')
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    expect(screen.getByText(/error loading benchmarks/i)).toBeInTheDocument();
  });

  it('displays empty state when no benchmarks exist', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: [],
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    expect(screen.getByText(/no benchmarks/i)).toBeInTheDocument();
  });

  it('displays overall achievement rate', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    // Overall rate: (78 + 45) / 2 = 61.5% rounded to 62%
    expect(screen.getByText(/overall.*62%/i)).toBeInTheDocument();
  });

  it('displays overall progress bar with correct value', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    const overallProgress = screen.getAllByRole('progressbar')[0];
    expect(overallProgress).toHaveAttribute('aria-valuenow', '62');
  });

  it('renders individual benchmark cards', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    expect(screen.getByText('Elite Fly Time')).toBeInTheDocument();
    expect(screen.getByText('Vertical Jump Target')).toBeInTheDocument();
  });

  it('passes onBenchmarkClick handler to benchmark cards', async () => {
    const user = userEvent.setup();
    const onClickMock = vi.fn();

    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget
          organizationId="org-1"
          onBenchmarkClick={onClickMock}
        />
      </TestWrapper>
    );

    const metButtons = screen.getAllByRole('button', { name: /view met/i });
    await user.click(metButtons[0]);

    expect(onClickMock).toHaveBeenCalledWith('benchmark-1', 'met');
  });

  it('applies custom className', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: [],
      isLoading: false,
      error: null
    } as any);

    const { container } = render(
      <TestWrapper>
        <BenchmarkDashboardWidget
          organizationId="org-1"
          className="custom-class"
        />
      </TestWrapper>
    );

    // The className is applied to the Card component (the outer div)
    const card = container.querySelector('.custom-class');
    expect(card).toBeInTheDocument();
  });

  it('passes teamIds filter to API hook', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: [],
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget
          organizationId="org-1"
          teamIds={['team-1', 'team-2']}
        />
      </TestWrapper>
    );

    expect(useTeamBenchmarkAggregation).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ teamIds: ['team-1', 'team-2'] })
    );
  });

  it('passes genders filter to API hook', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: [],
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget
          organizationId="org-1"
          genders={['Male', 'Female']}
        />
      </TestWrapper>
    );

    expect(useTeamBenchmarkAggregation).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ genders: ['Male', 'Female'] })
    );
  });

  it('renders benchmark cards in grid layout', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    const { container } = render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    // Check for grid container
    const gridContainer = container.querySelector('.grid');
    expect(gridContainer).toBeInTheDocument();
  });

  it('handles single benchmark correctly', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: [mockBenchmarks[0]],
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    // Overall rate should match single benchmark
    expect(screen.getByText(/overall.*78%/i)).toBeInTheDocument();
    expect(screen.getByText('Elite Fly Time')).toBeInTheDocument();
  });

  it('calculates overall rate correctly with multiple benchmarks', () => {
    const threeBenchmarks = [
      ...mockBenchmarks,
      {
        benchmarkId: 'benchmark-3',
        benchmarkName: 'Speed Test',
        metricCode: 'DASH_40YD',
        benchmarkValue: 5.0,
        comparisonOperator: 'lte' as const,
        filters: {},
        applicableAthletes: 20,
        athletesMet: 16,
        athletesNoData: 1,
        achievementRate: 80,
        averageProgress: 92
      }
    ];

    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: threeBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    // Overall rate: (78 + 45 + 80) / 3 = 67.67% rounded to 68%
    expect(screen.getByText(/overall.*68%/i)).toBeInTheDocument();
  });

  it('shows count of benchmarks met text', () => {
    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: mockBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    expect(screen.getByText(/of benchmarks met/i)).toBeInTheDocument();
  });

  it('handles zero achievement rate gracefully', () => {
    const zeroBenchmarks = [
      {
        ...mockBenchmarks[0],
        achievementRate: 0,
        athletesMet: 0
      }
    ];

    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: zeroBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    expect(screen.getByText(/overall.*0%/i)).toBeInTheDocument();
  });

  it('handles 100% achievement rate', () => {
    const perfectBenchmarks = [
      {
        ...mockBenchmarks[0],
        achievementRate: 100,
        athletesMet: 23,
        applicableAthletes: 23
      }
    ];

    vi.mocked(useTeamBenchmarkAggregation).mockReturnValue({
      data: perfectBenchmarks,
      isLoading: false,
      error: null
    } as any);

    render(
      <TestWrapper>
        <BenchmarkDashboardWidget organizationId="org-1" />
      </TestWrapper>
    );

    expect(screen.getByText(/overall.*100%/i)).toBeInTheDocument();
  });
});
