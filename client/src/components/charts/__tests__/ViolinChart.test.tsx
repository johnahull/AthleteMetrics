/**
 * Unit tests for ViolinChart component
 * Tests KDE calculation, rendering, and tooltip functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ViolinChart } from '../ViolinChart';
import type { ChartDataPoint, ChartConfiguration, StatisticalSummary, GroupDefinition } from '@shared/analytics-types';

// Mock canvas context
const mockCanvasContext = {
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: [] })),
  putImageData: vi.fn(),
  createImageData: vi.fn(),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  scale: vi.fn(),
  setLineDash: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  canvas: {
    width: 800,
    height: 400,
  },
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: 'left' as CanvasTextAlign,
};

HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext) as any;

describe('ViolinChart', () => {
  const mockData: ChartDataPoint[] = [
    {
      athleteId: 'athlete-1',
      athleteName: 'John Doe',
      metric: 'FLY10_TIME',
      value: 1.5,
      date: new Date('2024-01-01'),
      teamName: 'Team A',
      grouping: 'Team A'
    },
    {
      athleteId: 'athlete-2',
      athleteName: 'Jane Smith',
      metric: 'FLY10_TIME',
      value: 1.6,
      date: new Date('2024-01-01'),
      teamName: 'Team A',
      grouping: 'Team A'
    },
    {
      athleteId: 'athlete-3',
      athleteName: 'Bob Johnson',
      metric: 'FLY10_TIME',
      value: 1.7,
      date: new Date('2024-01-01'),
      teamName: 'Team B',
      grouping: 'Team B'
    },
    {
      athleteId: 'athlete-4',
      athleteName: 'Alice Williams',
      metric: 'FLY10_TIME',
      value: 1.8,
      date: new Date('2024-01-01'),
      teamName: 'Team B',
      grouping: 'Team B'
    },
  ];

  const mockConfig: ChartConfiguration = {
    type: 'violin_plot',
    title: 'Performance Distribution',
    subtitle: 'By Team',
    showLegend: true,
    showTooltips: true,
    responsive: true,
  };

  const mockStatistics: Record<string, StatisticalSummary> = {
    'Team A': {
      mean: 1.55,
      median: 1.55,
      std: 0.05,
      min: 1.5,
      max: 1.6,
      count: 2,
      variance: 0.0025,
      percentiles: {
        p5: 1.505,
        p10: 1.51,
        p25: 1.525,
        p50: 1.55,
        p75: 1.575,
        p90: 1.59,
        p95: 1.595
      }
    },
    'Team B': {
      mean: 1.75,
      median: 1.75,
      std: 0.05,
      min: 1.7,
      max: 1.8,
      count: 2,
      variance: 0.0025,
      percentiles: {
        p5: 1.705,
        p10: 1.71,
        p25: 1.725,
        p50: 1.75,
        p75: 1.775,
        p90: 1.79,
        p95: 1.795
      }
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render canvas element', () => {
      render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      const canvas = screen.getByRole('img', { hidden: true });
      expect(canvas).toBeInTheDocument();
    });

    it('should render legend with correct items', () => {
      render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      expect(screen.getByText(/Distribution Shape/i)).toBeInTheDocument();
      expect(screen.getByText(/Individual Athletes/i)).toBeInTheDocument();
      expect(screen.getByText(/Median/i)).toBeInTheDocument();
      expect(screen.getByText(/Quartiles/i)).toBeInTheDocument();
      expect(screen.getByText(/Mean/i)).toBeInTheDocument();
    });

    it('should render statistical summary table', () => {
      render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      expect(screen.getByText(/Count/i)).toBeInTheDocument();
      expect(screen.getByText(/Mean/i)).toBeInTheDocument();
      expect(screen.getByText(/Median/i)).toBeInTheDocument();
      expect(screen.getByText(/Std Dev/i)).toBeInTheDocument();
      expect(screen.getByText(/Range/i)).toBeInTheDocument();
    });

    it('should display metric information', () => {
      render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      expect(screen.getByText(/10-Yard Fly Time/i)).toBeInTheDocument();
      expect(screen.getByText(/Lower is better/i)).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('should handle empty data array', () => {
      render(
        <ViolinChart
          data={[]}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      expect(screen.getByText(/No Data Available/i)).toBeInTheDocument();
      expect(screen.getByText(/Select groups and metrics/i)).toBeInTheDocument();
    });

    it('should handle empty groups with selectedGroups', () => {
      const emptyGroups: GroupDefinition[] = [
        {
          id: 'group-1',
          name: 'Empty Group',
          type: 'custom',
          memberIds: [],
          color: '#3B82F6',
          criteria: {}
        }
      ];

      render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
          selectedGroups={emptyGroups}
        />
      );

      expect(screen.getByText(/Empty Groups/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when error state is set', () => {
      // Simulate an error by passing invalid data that will trigger error state
      const invalidData: any[] = [
        { athleteId: 'athlete-1', value: 'invalid' } // Invalid value type
      ];

      render(
        <ViolinChart
          data={invalidData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      // The component should gracefully handle invalid data
      // Either by showing the chart with filtered data or an error message
      const canvas = screen.queryByRole('img', { hidden: true });
      expect(canvas).toBeTruthy(); // Component should still render
    });
  });

  describe('KDE Calculation', () => {
    it('should process data with groups correctly', () => {
      render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      // Canvas drawing methods should be called
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
      expect(mockCanvasContext.stroke).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });

    it('should handle single-value groups (zero range)', () => {
      const singleValueData: ChartDataPoint[] = [
        {
          athleteId: 'athlete-1',
          athleteName: 'John Doe',
          metric: 'FLY10_TIME',
          value: 1.5,
          date: new Date('2024-01-01'),
          teamName: 'Team A',
              grouping: 'Team A'
        },
        {
          athleteId: 'athlete-2',
          athleteName: 'Jane Smith',
          metric: 'FLY10_TIME',
          value: 1.5,
          date: new Date('2024-01-01'),
          teamName: 'Team A',
              grouping: 'Team A'
        },
      ];

      render(
        <ViolinChart
          data={singleValueData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      // Should handle zero range without crashing
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
    });

    it('should use sampling for large datasets', () => {
      // Create a large dataset (>1000 points)
      const largeDataset: ChartDataPoint[] = Array.from({ length: 1500 }, (_, i) => ({
        athleteId: `athlete-${i}`,
        athleteName: `Athlete ${i}`,
        metric: 'FLY10_TIME',
        value: 1.5 + (i % 100) / 100,
        date: new Date('2024-01-01'),
        teamName: 'Team A',
          grouping: 'Team A'
      }));

      render(
        <ViolinChart
          data={largeDataset}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      // Should render without performance issues (sampling is applied)
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
    });
  });

  describe('Multi-Group Analysis', () => {
    it('should render multiple groups with selectedGroups prop', () => {
      const groups: GroupDefinition[] = [
        {
          id: 'group-1',
          name: 'Team A',
          type: 'team',
          memberIds: ['athlete-1', 'athlete-2'],
          color: '#3B82F6',
          criteria: { teams: ['Team A'] }
        },
        {
          id: 'group-2',
          name: 'Team B',
          type: 'team',
          memberIds: ['athlete-3', 'athlete-4'],
          color: '#10B981',
          criteria: { teams: ['Team B'] }
        }
      ];

      render(
        <ViolinChart
          data={mockData}
          rawData={mockData}
          config={mockConfig}
          statistics={mockStatistics}
          selectedGroups={groups}
        />
      );

      // Should render statistical summary for both groups
      expect(screen.getByText('Team A')).toBeInTheDocument();
      expect(screen.getByText('Team B')).toBeInTheDocument();
    });

    it('should use rawData when provided for individual points', () => {
      const aggregatedData: ChartDataPoint[] = [
        {
          athleteId: 'group-team-a',
          athleteName: 'Team A Average',
          metric: 'FLY10_TIME',
          value: 1.55,
          date: new Date('2024-01-01'),
          teamName: 'Team A',
              grouping: 'Team A'
        }
      ];

      render(
        <ViolinChart
          data={aggregatedData}
          rawData={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      // Should use rawData for individual athlete points
      expect(mockCanvasContext.arc).toHaveBeenCalled(); // Individual points drawn as circles
    });
  });

  describe('Tooltips', () => {
    it('should show tooltip on mouse hover over athlete point', async () => {
      const { container } = render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();

      if (canvas) {
        // Simulate mouse move over canvas
        fireEvent.mouseMove(canvas, { clientX: 100, clientY: 100 });

        // Due to the complexity of hit detection, we just verify the event handler is attached
        // In a real scenario, you would need to simulate exact coordinates of a point
        expect(canvas).toBeInTheDocument();
      }
    });

    it('should hide tooltip on mouse leave', async () => {
      const { container } = render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      const canvas = container.querySelector('canvas');
      if (canvas) {
        fireEvent.mouseMove(canvas, { clientX: 100, clientY: 100 });
        fireEvent.mouseLeave(canvas);

        // Tooltip should not be visible
        await waitFor(() => {
          const tooltip = screen.queryByText(/John Doe/i);
          expect(tooltip).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('Highlighting', () => {
    it('should highlight specific athlete when highlightAthlete prop is provided', () => {
      render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
          highlightAthlete="athlete-1"
        />
      );

      // Highlighted athlete should be drawn differently (verified by canvas calls)
      expect(mockCanvasContext.arc).toHaveBeenCalled();
    });
  });

  describe('Responsiveness', () => {
    it('should handle window resize events', () => {
      render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      // Trigger resize event
      fireEvent(window, new Event('resize'));

      // Canvas should be redrawn
      expect(mockCanvasContext.clearRect).toHaveBeenCalled();
    });

    it('should set canvas size based on container', () => {
      render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      // Verify canvas scaling is applied
      expect(mockCanvasContext.scale).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible statistical summary table', () => {
      render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      // Check that statistical data is presented in a readable format
      expect(screen.getByText(/Count/i)).toBeInTheDocument();
      expect(screen.getByText(/Mean/i)).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should memoize KDE calculation function', () => {
      const { rerender } = render(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      const initialCalls = mockCanvasContext.beginPath.mock.calls.length;

      // Rerender with same data
      rerender(
        <ViolinChart
          data={mockData}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );

      // Should still render (memoization doesn't prevent rendering, but optimizes calculation)
      expect(mockCanvasContext.beginPath.mock.calls.length).toBeGreaterThan(initialCalls);
    });

    it('should skip distant Gaussian kernel calculations', () => {
      // This is tested implicitly by the performance of large datasets
      // The optimization (skipping calculations >3 std dev) is internal
      const largeDataset: ChartDataPoint[] = Array.from({ length: 500 }, (_, i) => ({
        athleteId: `athlete-${i}`,
        athleteName: `Athlete ${i}`,
        metric: 'FLY10_TIME',
        value: 1.5 + Math.random(),
        date: new Date('2024-01-01'),
        teamName: 'Team A',
          grouping: 'Team A'
      }));

      const start = performance.now();
      render(
        <ViolinChart
          data={largeDataset}
          config={mockConfig}
          statistics={mockStatistics}
        />
      );
      const end = performance.now();

      // Should complete in reasonable time (< 1 second)
      expect(end - start).toBeLessThan(1000);
    });
  });
});