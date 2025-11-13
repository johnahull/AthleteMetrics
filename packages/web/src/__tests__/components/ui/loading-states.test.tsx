import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  KPICardSkeleton,
  TableSkeleton,
  ChartSkeleton,
  ProgressBar
} from '@/components/ui/loading-states';

describe('Loading States Components', () => {
  describe('KPICardSkeleton', () => {
    it('renders skeleton structure with correct elements', () => {
      const { container } = render(<KPICardSkeleton />);

      // Should render a Card component
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();

      // Should have skeleton elements (using animate-pulse class from Skeleton component)
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('has aria-busy="true" for accessibility', () => {
      const { container } = render(<KPICardSkeleton />);
      const busyElement = container.querySelector('[aria-busy="true"]');
      expect(busyElement).toBeInTheDocument();
    });

    it('includes screen reader text', () => {
      render(<KPICardSkeleton />);
      expect(screen.getByText('Loading data...')).toHaveClass('sr-only');
    });

    it('uses shadcn/ui Skeleton component', () => {
      const { container } = render(<KPICardSkeleton />);
      // Skeleton component uses animate-pulse and rounded-md classes
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('TableSkeleton', () => {
    it('renders correct default number of rows and columns', () => {
      const { container } = render(<TableSkeleton />);

      // Default is 5 rows + 1 header = 6 total div containers
      const rows = container.querySelectorAll('.flex.gap-4');
      expect(rows.length).toBe(6); // 1 header + 5 data rows
    });

    it('renders custom number of rows', () => {
      const { container } = render(<TableSkeleton rows={3} />);

      // 3 rows + 1 header = 4 total
      const rows = container.querySelectorAll('.flex.gap-4');
      expect(rows.length).toBe(4);
    });

    it('renders custom number of columns', () => {
      const { container } = render(<TableSkeleton columns={4} />);

      // Check first row has 4 skeleton items
      const firstRow = container.querySelector('.flex.gap-4');
      const columns = firstRow?.querySelectorAll('.animate-pulse');
      expect(columns?.length).toBe(4);
    });

    it('can hide header when showHeader is false', () => {
      const { container } = render(<TableSkeleton rows={5} showHeader={false} />);

      // Should only have 5 rows (no header)
      const rows = container.querySelectorAll('.flex.gap-4');
      expect(rows.length).toBe(5);
    });

    it('has aria-busy="true" for accessibility', () => {
      const { container } = render(<TableSkeleton />);
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });

    it('includes screen reader text', () => {
      render(<TableSkeleton />);
      expect(screen.getByText('Loading table...')).toHaveClass('sr-only');
    });

    it('uses shadcn/ui Skeleton component', () => {
      const { container } = render(<TableSkeleton />);
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('ChartSkeleton', () => {
    it('renders with default height', () => {
      const { container } = render(<ChartSkeleton />);
      const chartContainer = container.querySelector('[aria-busy="true"]');
      // Height is set via inline style (16rem = 256px at default font size)
      expect(chartContainer).toHaveAttribute('style', expect.stringContaining('height'));
    });

    it('renders with custom height', () => {
      const { container } = render(<ChartSkeleton height="20rem" />);
      const chartContainer = container.querySelector('[aria-busy="true"]');
      // Height is set via inline style (20rem = 320px at default font size)
      expect(chartContainer).toHaveAttribute('style', expect.stringContaining('height'));
    });

    it('renders correct default number of bars', () => {
      const { container } = render(<ChartSkeleton />);
      // Default is 8 bars
      const bars = container.querySelectorAll('.animate-pulse');
      expect(bars.length).toBe(8);
    });

    it('renders custom number of bars', () => {
      const { container } = render(<ChartSkeleton bars={12} />);
      const bars = container.querySelectorAll('.animate-pulse');
      expect(bars.length).toBe(12);
    });

    it('has aria-busy="true" for accessibility', () => {
      const { container } = render(<ChartSkeleton />);
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });

    it('includes screen reader text', () => {
      render(<ChartSkeleton />);
      expect(screen.getByText('Loading chart...')).toHaveClass('sr-only');
    });

    it('uses shadcn/ui Skeleton component', () => {
      const { container } = render(<ChartSkeleton />);
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('ProgressBar', () => {
    it('shows correct width percentage', () => {
      const { container } = render(<ProgressBar value={50} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveStyle({ width: '50%' });
    });

    it('displays message when provided', () => {
      render(<ProgressBar value={75} message="Loading athletes..." />);
      expect(screen.getByText('Loading athletes...')).toBeInTheDocument();
    });

    it('does not display message when not provided', () => {
      const { container } = render(<ProgressBar value={50} />);
      const message = container.querySelector('.text-sm.text-gray-600');
      expect(message).not.toBeInTheDocument();
    });

    it('has correct aria attributes', () => {
      const { container } = render(<ProgressBar value={60} />);
      const progressBar = container.querySelector('[role="progressbar"]');

      expect(progressBar).toHaveAttribute('aria-valuenow', '60');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('clamps value to 0-100 range (min)', () => {
      const { container } = render(<ProgressBar value={-10} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveStyle({ width: '0%' });
    });

    it('clamps value to 0-100 range (max)', () => {
      const { container } = render(<ProgressBar value={150} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveStyle({ width: '100%' });
    });

    it('has aria-busy="true" for accessibility', () => {
      const { container } = render(<ProgressBar value={50} />);
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('all skeletons have aria-busy attribute', () => {
      const { container: kpiContainer } = render(<KPICardSkeleton />);
      const { container: tableContainer } = render(<TableSkeleton />);
      const { container: chartContainer } = render(<ChartSkeleton />);
      const { container: progressContainer } = render(<ProgressBar value={50} />);

      expect(kpiContainer.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(tableContainer.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(chartContainer.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(progressContainer.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });

    it('all skeletons have screen reader announcements', () => {
      render(
        <>
          <KPICardSkeleton />
          <TableSkeleton />
          <ChartSkeleton />
        </>
      );

      expect(screen.getByText('Loading data...')).toHaveClass('sr-only');
      expect(screen.getByText('Loading table...')).toHaveClass('sr-only');
      expect(screen.getByText('Loading chart...')).toHaveClass('sr-only');
    });
  });

  describe('Visual Consistency', () => {
    it('uses consistent pulse animation across all skeletons', () => {
      const { container: kpiContainer } = render(<KPICardSkeleton />);
      const { container: tableContainer } = render(<TableSkeleton />);
      const { container: chartContainer } = render(<ChartSkeleton />);

      // All should use animate-pulse class from Skeleton component
      expect(kpiContainer.querySelector('.animate-pulse')).toBeInTheDocument();
      expect(tableContainer.querySelector('.animate-pulse')).toBeInTheDocument();
      expect(chartContainer.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });
});
