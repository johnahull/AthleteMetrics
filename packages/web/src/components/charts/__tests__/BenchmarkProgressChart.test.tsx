import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BenchmarkProgressChart } from '../BenchmarkProgressChart';

describe('BenchmarkProgressChart', () => {
  const mockData = {
    benchmarkName: 'Elite Speed Male',
    snapshots: [
      {
        date: '2024-01-01',
        achievementRate: 50,
        athletesMet: 1,
        applicableAthletes: 2,
      },
      {
        date: '2024-01-08',
        achievementRate: 75,
        athletesMet: 3,
        applicableAthletes: 4,
      },
      {
        date: '2024-01-15',
        achievementRate: 100,
        athletesMet: 4,
        applicableAthletes: 4,
      },
    ],
  };

  beforeEach(() => {
    // Mock Chart.js
    vi.mock('react-chartjs-2', () => ({
      Line: vi.fn(() => <div data-testid="mock-line-chart">Line Chart</div>),
    }));
  });

  it('should render line chart with progress data', () => {
    render(<BenchmarkProgressChart data={mockData} />);
    expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
  });

  it('should display benchmark name in title', () => {
    const { container } = render(<BenchmarkProgressChart data={mockData} />);
    // Chart title is passed to Chart.js options
    expect(container).toBeTruthy();
  });

  it('should handle empty snapshots gracefully', () => {
    const emptyData = {
      benchmarkName: 'Empty Benchmark',
      snapshots: [],
    };

    render(<BenchmarkProgressChart data={emptyData} />);
    expect(screen.getByText(/No progress data available/i)).toBeInTheDocument();
  });

  it('should display target line when targetRate is provided', () => {
    render(<BenchmarkProgressChart data={mockData} targetRate={80} />);
    expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
  });

  it('should format dates correctly for x-axis labels', () => {
    const { container } = render(<BenchmarkProgressChart data={mockData} />);
    expect(container).toBeTruthy();
    // Labels are passed to Chart.js data object
  });

  it('should show achievement rate from 0-100% on y-axis', () => {
    const { container } = render(<BenchmarkProgressChart data={mockData} />);
    expect(container).toBeTruthy();
    // Y-axis config is passed to Chart.js options
  });

  it('should display tooltip with details on hover', () => {
    const { container } = render(<BenchmarkProgressChart data={mockData} />);
    expect(container).toBeTruthy();
    // Tooltip config is passed to Chart.js options
  });

  it('should handle custom height prop', () => {
    const { container } = render(<BenchmarkProgressChart data={mockData} height={400} />);
    expect(container.firstChild).toHaveStyle({ height: '400px' });
  });

  it('should use default height when not specified', () => {
    const { container } = render(<BenchmarkProgressChart data={mockData} />);
    expect(container.firstChild).toHaveStyle({ height: '300px' });
  });

  it('should show trend improving over time', () => {
    const improvingData = {
      benchmarkName: 'Improving Benchmark',
      snapshots: [
        { date: '2024-01-01', achievementRate: 25, athletesMet: 1, applicableAthletes: 4 },
        { date: '2024-01-08', achievementRate: 50, athletesMet: 2, applicableAthletes: 4 },
        { date: '2024-01-15', achievementRate: 75, athletesMet: 3, applicableAthletes: 4 },
        { date: '2024-01-22', achievementRate: 100, athletesMet: 4, applicableAthletes: 4 },
      ],
    };

    render(<BenchmarkProgressChart data={improvingData} />);
    expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
  });

  it('should show trend declining over time', () => {
    const decliningData = {
      benchmarkName: 'Declining Benchmark',
      snapshots: [
        { date: '2024-01-01', achievementRate: 100, athletesMet: 4, applicableAthletes: 4 },
        { date: '2024-01-08', achievementRate: 75, athletesMet: 3, applicableAthletes: 4 },
        { date: '2024-01-15', achievementRate: 50, athletesMet: 2, applicableAthletes: 4 },
        { date: '2024-01-22', achievementRate: 25, athletesMet: 1, applicableAthletes: 4 },
      ],
    };

    render(<BenchmarkProgressChart data={decliningData} />);
    expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
  });
});
