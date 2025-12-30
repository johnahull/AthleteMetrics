/**
 * BenchmarkCard Component Tests
 * Test-first development for individual benchmark display card
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BenchmarkCard } from '../BenchmarkCard';
import type { TeamBenchmarkAggregation } from '@/lib/benchmarks-api';

describe('BenchmarkCard', () => {
  const mockBenchmark: TeamBenchmarkAggregation = {
    benchmarkId: 'benchmark-1',
    benchmarkName: 'Elite Fly Time',
    metricCode: 'FLY10_TIME',
    benchmarkValue: 1.10,
    comparisonOperator: 'lte',
    filters: {
      gender: 'Male',
      ageMin: 18,
      ageMax: 25
    },
    applicableAthletes: 23,
    athletesMet: 18,
    athletesNoData: 2,
    achievementRate: 78,
    averageProgress: 95
  };

  it('renders benchmark name', () => {
    render(<BenchmarkCard benchmark={mockBenchmark} />);
    expect(screen.getByText('Elite Fly Time')).toBeInTheDocument();
  });

  it('renders metric code and target value with operator', () => {
    const { container } = render(<BenchmarkCard benchmark={mockBenchmark} />);
    expect(screen.getByText(/FLY10_TIME/)).toBeInTheDocument();
    // Check that the metric display contains all the required parts
    const metricDisplay = container.querySelector('.text-muted-foreground');
    expect(metricDisplay?.textContent).toContain('FLY10_TIME');
    expect(metricDisplay?.textContent).toContain('≤');
    expect(metricDisplay?.textContent).toContain('1.1');
    expect(metricDisplay?.textContent).toContain('s');
  });

  it('renders demographic filter badges', () => {
    render(<BenchmarkCard benchmark={mockBenchmark} />);
    expect(screen.getByText(/Male/)).toBeInTheDocument();
    expect(screen.getByText(/18-25/)).toBeInTheDocument();
  });

  it('renders progress bar with percentage', () => {
    render(<BenchmarkCard benchmark={mockBenchmark} />);
    expect(screen.getByText('78%')).toBeInTheDocument();
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '78');
  });

  it('renders applicable athletes count', () => {
    render(<BenchmarkCard benchmark={mockBenchmark} />);
    expect(screen.getByText(/18\/23 applicable/)).toBeInTheDocument();
  });

  it('displays "View Met" and "View Unmet" buttons', () => {
    render(<BenchmarkCard benchmark={mockBenchmark} />);
    expect(screen.getByRole('button', { name: /view met/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view unmet/i })).toBeInTheDocument();
  });

  it('calls onBenchmarkClick with "met" status when "View Met" clicked', async () => {
    const user = userEvent.setup();
    const onClickMock = vi.fn();

    render(
      <BenchmarkCard
        benchmark={mockBenchmark}
        onBenchmarkClick={onClickMock}
      />
    );

    await user.click(screen.getByRole('button', { name: /view met/i }));
    expect(onClickMock).toHaveBeenCalledWith('benchmark-1', 'met');
  });

  it('calls onBenchmarkClick with "unmet" status when "View Unmet" clicked', async () => {
    const user = userEvent.setup();
    const onClickMock = vi.fn();

    render(
      <BenchmarkCard
        benchmark={mockBenchmark}
        onBenchmarkClick={onClickMock}
      />
    );

    await user.click(screen.getByRole('button', { name: /view unmet/i }));
    expect(onClickMock).toHaveBeenCalledWith('benchmark-1', 'unmet');
  });

  it('applies green color for high achievement rate (≥75%)', () => {
    render(<BenchmarkCard benchmark={mockBenchmark} />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar.querySelector('[data-color="green"]')).toBeInTheDocument();
  });

  it('applies yellow color for medium achievement rate (50-75%)', () => {
    const mediumBenchmark = { ...mockBenchmark, achievementRate: 65, athletesMet: 15 };
    render(<BenchmarkCard benchmark={mediumBenchmark} />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar.querySelector('[data-color="yellow"]')).toBeInTheDocument();
  });

  it('applies orange color for low achievement rate (<50%)', () => {
    const lowBenchmark = { ...mockBenchmark, achievementRate: 35, athletesMet: 8 };
    render(<BenchmarkCard benchmark={lowBenchmark} />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar.querySelector('[data-color="orange"]')).toBeInTheDocument();
  });

  it('handles no demographic filters', () => {
    const noFilterBenchmark = { ...mockBenchmark, filters: {} };
    render(<BenchmarkCard benchmark={noFilterBenchmark} />);
    expect(screen.getByText(/all athletes/i)).toBeInTheDocument();
  });

  it('handles only gender filter', () => {
    const genderOnlyBenchmark = {
      ...mockBenchmark,
      filters: { gender: 'Female' }
    };
    render(<BenchmarkCard benchmark={genderOnlyBenchmark} />);
    expect(screen.getByText(/Female/)).toBeInTheDocument();
    expect(screen.queryByText(/18-25/)).not.toBeInTheDocument();
  });

  it('handles only age filter', () => {
    const ageOnlyBenchmark = {
      ...mockBenchmark,
      filters: { ageMin: 16, ageMax: 18 }
    };
    render(<BenchmarkCard benchmark={ageOnlyBenchmark} />);
    expect(screen.getByText(/16-18/)).toBeInTheDocument();
    expect(screen.queryByText(/Male/)).not.toBeInTheDocument();
  });

  it('handles position filter', () => {
    const positionBenchmark = {
      ...mockBenchmark,
      filters: { position: 'Forward' }
    };
    render(<BenchmarkCard benchmark={positionBenchmark} />);
    expect(screen.getByText(/Forward/)).toBeInTheDocument();
  });

  it('displays correct operator symbols', () => {
    const gteBenchmark = {
      ...mockBenchmark,
      comparisonOperator: 'gte' as const,
      metricCode: 'VERTICAL_JUMP',
      benchmarkValue: 28
    };
    const { container } = render(<BenchmarkCard benchmark={gteBenchmark} />);
    const metricDisplay = container.querySelector('.text-muted-foreground');
    expect(metricDisplay?.textContent).toContain('≥');
    expect(metricDisplay?.textContent).toContain('28');
    expect(metricDisplay?.textContent).toContain('in');
  });

  it('displays equal operator symbol', () => {
    const eqBenchmark = {
      ...mockBenchmark,
      comparisonOperator: 'eq' as const,
      benchmarkValue: 1.50
    };
    const { container } = render(<BenchmarkCard benchmark={eqBenchmark} />);
    const metricDisplay = container.querySelector('.text-muted-foreground');
    expect(metricDisplay?.textContent).toContain('=');
    expect(metricDisplay?.textContent).toContain('1.5');
    expect(metricDisplay?.textContent).toContain('s');
  });

  it('handles zero achievement rate', () => {
    const zeroBenchmark = {
      ...mockBenchmark,
      achievementRate: 0,
      athletesMet: 0
    };
    render(<BenchmarkCard benchmark={zeroBenchmark} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('handles 100% achievement rate', () => {
    const perfectBenchmark = {
      ...mockBenchmark,
      achievementRate: 100,
      athletesMet: 23,
      applicableAthletes: 23
    };
    render(<BenchmarkCard benchmark={perfectBenchmark} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <BenchmarkCard benchmark={mockBenchmark} className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('disables buttons when onBenchmarkClick is not provided', () => {
    render(<BenchmarkCard benchmark={mockBenchmark} />);
    const metButton = screen.getByRole('button', { name: /view met/i });
    const unmetButton = screen.getByRole('button', { name: /view unmet/i });
    expect(metButton).toBeDisabled();
    expect(unmetButton).toBeDisabled();
  });
});
