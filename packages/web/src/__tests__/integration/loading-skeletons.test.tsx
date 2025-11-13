import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  KPICardSkeleton,
  TableSkeleton,
  ChartSkeleton,
  ProgressBar
} from '@/components/ui/loading-states';

/**
 * Integration tests for loading skeleton components
 * Verifies that skeletons work correctly across different usage patterns
 */
describe('Loading Skeletons Integration', () => {
  describe('Multiple Skeleton Rendering', () => {
    it('renders multiple KPICardSkeletons in a grid', () => {
      const { container } = render(
        <div className="grid grid-cols-3 gap-4">
          <KPICardSkeleton />
          <KPICardSkeleton />
          <KPICardSkeleton />
        </div>
      );

      const busyElements = container.querySelectorAll('[aria-busy="true"]');
      expect(busyElements.length).toBe(3);
    });

    it('renders TableSkeleton with various configurations', () => {
      const { container } = render(
        <div>
          <TableSkeleton rows={5} columns={6} />
          <TableSkeleton rows={10} columns={9} showHeader={false} />
        </div>
      );

      const busyElements = container.querySelectorAll('[aria-busy="true"]');
      expect(busyElements.length).toBe(2);
    });

    it('renders multiple ChartSkeletons with different heights', () => {
      const { container } = render(
        <div className="grid grid-cols-2 gap-4">
          <ChartSkeleton height="16rem" bars={8} />
          <ChartSkeleton height="20rem" bars={12} />
        </div>
      );

      const busyElements = container.querySelectorAll('[aria-busy="true"]');
      expect(busyElements.length).toBe(2);
    });
  });

  describe('Accessibility across components', () => {
    it('all skeleton types have unique screen reader text', () => {
      render(
        <div>
          <KPICardSkeleton />
          <TableSkeleton />
          <ChartSkeleton />
        </div>
      );

      expect(screen.getByText('Loading data...')).toBeInTheDocument();
      expect(screen.getByText('Loading table...')).toBeInTheDocument();
      expect(screen.getByText('Loading chart...')).toBeInTheDocument();
    });

    it('all skeletons have aria-busy="true"', () => {
      const { container } = render(
        <div>
          <KPICardSkeleton />
          <TableSkeleton />
          <ChartSkeleton />
          <ProgressBar value={50} message="Loading..." />
        </div>
      );

      const busyElements = container.querySelectorAll('[aria-busy="true"]');
      expect(busyElements.length).toBe(4);
    });
  });

  describe('Progressive Loading Pattern', () => {
    it('can use ProgressBar to show loading progress', () => {
      const { rerender } = render(<ProgressBar value={0} message="Starting..." />);

      expect(screen.getByText('Starting...')).toBeInTheDocument();

      rerender(<ProgressBar value={50} message="Halfway there..." />);
      expect(screen.getByText('Halfway there...')).toBeInTheDocument();

      rerender(<ProgressBar value={100} message="Complete!" />);
      expect(screen.getByText('Complete!')).toBeInTheDocument();
    });
  });

  describe('Visual Consistency', () => {
    it('all skeletons use shadcn/ui Skeleton component (animate-pulse)', () => {
      const { container } = render(
        <div>
          <KPICardSkeleton />
          <TableSkeleton />
          <ChartSkeleton />
        </div>
      );

      const animatedElements = container.querySelectorAll('.animate-pulse');
      expect(animatedElements.length).toBeGreaterThan(0);
    });

    it('skeleton elements have consistent styling classes', () => {
      const { container } = render(
        <div>
          <KPICardSkeleton />
          <TableSkeleton />
          <ChartSkeleton />
        </div>
      );

      // All should use rounded styling from Skeleton component
      const roundedElements = container.querySelectorAll('.rounded-md, .rounded');
      expect(roundedElements.length).toBeGreaterThan(0);
    });
  });

  describe('Realistic Usage Scenarios', () => {
    it('dashboard layout with KPI cards and charts', () => {
      const { container } = render(
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <KPICardSkeleton />
            <KPICardSkeleton />
            <KPICardSkeleton />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </div>
      );

      const kpiCards = container.querySelectorAll('[aria-busy="true"]');
      expect(kpiCards.length).toBe(5); // 3 KPI cards + 2 charts
    });

    it('table page layout with filters and table', () => {
      const { container } = render(
        <div className="p-6">
          <div className="mb-6 space-y-4">
            {/* Filter skeletons */}
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
          <TableSkeleton rows={10} columns={9} />
        </div>
      );

      const tableSkeleton = container.querySelector('[aria-busy="true"]');
      expect(tableSkeleton).toBeInTheDocument();
    });
  });
});
