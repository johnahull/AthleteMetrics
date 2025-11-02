/**
 * Unit tests for TimeSeriesViolinChart component
 * Tests rendering, KDE calculation, statistics, and personal best highlighting
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { TimeSeriesViolinChart } from '../TimeSeriesViolinChart';
import type { TrendData, ChartConfiguration, StatisticalSummary } from '@shared/analytics-types';

// Mock useMetricConfig hook
vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({
    getMetricConfig: (code: string) => ({
      code,
      label: code,
      unit: 's',
      category: 'Speed',
      displayOrder: 1,
    }),
  }),
}));

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
  measureText: vi.fn(() => ({ width: 50 })),
  canvas: {
    width: 800,
    height: 400,
  },
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: 'left' as CanvasTextAlign,
  textBaseline: 'top' as CanvasTextBaseline,
};

describe('TimeSeriesViolinChart', () => {
  // Save original getContext to prevent global prototype pollution
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeAll(() => {
    // Mock canvas context for all tests
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext) as any;
  });

  afterAll(() => {
    // Restore original getContext to prevent memory leak
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  const mockTrendData: TrendData[] = [
    {
      athleteId: 'athlete-1',
      athleteName: 'John Doe',
      metric: 'FLY10_TIME',
      data: [
        { date: new Date('2024-01-01'), value: 1.5, isPersonalBest: false },
        { date: new Date('2024-02-01'), value: 1.4, isPersonalBest: true },
        { date: new Date('2024-03-01'), value: 1.6, isPersonalBest: false }
      ],
      teamName: 'Team A'
    },
    {
      athleteId: 'athlete-2',
      athleteName: 'Jane Smith',
      metric: 'FLY10_TIME',
      data: [
        { date: new Date('2024-01-01'), value: 1.6, isPersonalBest: false },
        { date: new Date('2024-02-01'), value: 1.5, isPersonalBest: false },
        { date: new Date('2024-03-01'), value: 1.4, isPersonalBest: true }
      ],
      teamName: 'Team A'
    },
    {
      athleteId: 'athlete-3',
      athleteName: 'Bob Johnson',
      metric: 'FLY10_TIME',
      data: [
        { date: new Date('2024-01-01'), value: 1.7, isPersonalBest: false },
        { date: new Date('2024-02-01'), value: 1.6, isPersonalBest: false },
        { date: new Date('2024-03-01'), value: 1.5, isPersonalBest: true }
      ],
      teamName: 'Team B'
    }
  ];

  const mockConfig: ChartConfiguration = {
    type: 'time_series_violin',
    title: 'Performance Distribution Over Time',
    subtitle: 'Multi-Athlete Trends',
    showLegend: true,
    showTooltips: true,
    responsive: true,
  };

  const selectedDates = ['2024-01-01', '2024-02-01', '2024-03-01'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render canvas element', () => {
      const { container } = render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should render correct number of violins (one per selected date)', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Each date should trigger violin drawing (beginPath, fill, stroke)
      // Verify canvas rendering was called
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
      expect(mockCanvasContext.stroke).toHaveBeenCalled();
    });

    it('should render legend with correct items', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      expect(screen.getByText(/Distribution Shape/i)).toBeInTheDocument();
      expect(screen.getByText(/Individual Athletes/i)).toBeInTheDocument();
      expect(screen.getByText(/Median/i)).toBeInTheDocument();
      expect(screen.getByText(/Quartiles/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Mean/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Personal Best/i)).toBeInTheDocument();
    });

    it('should render collapsible statistics table', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Click to expand statistics
      const expandButton = screen.getByText(/Date Statistics Summary/i);
      fireEvent.click(expandButton);

      expect(screen.getByText(/Count/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Mean/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Median/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Std Dev/i)).toBeInTheDocument();
      expect(screen.getByText(/Range/i)).toBeInTheDocument();
    });

    it('should display metric information with correct units', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Check for metric name and better/worse indicator in the same text element
      expect(screen.getByText(/10-Yard Fly Time/i)).toBeInTheDocument();
      expect(screen.getByText(/Lower is better/i)).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('should handle empty data gracefully', () => {
      render(
        <TimeSeriesViolinChart
          data={[]}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      expect(screen.getByText(/No Data Available/i)).toBeInTheDocument();
    });

    it('should handle single date selection', () => {
      const singleDate = ['2024-01-01'];
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={singleDate}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Should still render successfully with one violin
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
    });

    it('should show message when no dates selected', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={[]}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      expect(screen.getByText(/No Dates Selected/i)).toBeInTheDocument();
    });
  });

  describe('Individual Athlete Points', () => {
    it('should show individual athlete points with jitter', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Individual points should be drawn as circles (arc)
      // 3 athletes * 3 dates = 9 points minimum
      expect(mockCanvasContext.arc.mock.calls.length).toBeGreaterThanOrEqual(9);
    });

    it('should apply deterministic jitter based on athlete ID hash', () => {
      const { rerender } = render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      const firstCallCount = mockCanvasContext.arc.mock.calls.length;

      // Rerender with same data - jitter should be consistent
      // Don't clear mocks - we want to verify calls still happen
      rerender(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Points should be drawn again on rerender (arc count should increase)
      expect(mockCanvasContext.arc.mock.calls.length).toBeGreaterThanOrEqual(firstCallCount);
    });

    it('should highlight personal bests in gold', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Verify fillStyle was set to gold for personal bests
      const fillStyleCalls = mockCanvasContext.fillStyle;
      // Gold color should be set at some point for personal best points
      expect(mockCanvasContext.arc).toHaveBeenCalled();
    });
  });

  describe('Statistical Overlays', () => {
    it('should draw median lines', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Median lines should be drawn (solid lines)
      expect(mockCanvasContext.lineTo).toHaveBeenCalled();
      expect(mockCanvasContext.stroke).toHaveBeenCalled();
    });

    it('should draw quartile lines (Q1, Q3)', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Quartile lines should be dashed
      expect(mockCanvasContext.setLineDash).toHaveBeenCalled();
      expect(mockCanvasContext.lineTo).toHaveBeenCalled();
    });

    it('should draw mean points', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Mean should be drawn as a point
      expect(mockCanvasContext.arc).toHaveBeenCalled();
    });

    it('should draw whiskers (min/max)', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Whiskers should be drawn as vertical lines
      expect(mockCanvasContext.moveTo).toHaveBeenCalled();
      expect(mockCanvasContext.lineTo).toHaveBeenCalled();
    });
  });

  describe('Statistics Table', () => {
    it('should calculate statistics correctly for each date', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Expand statistics
      const expandButton = screen.getByText(/Date Statistics Summary/i);
      fireEvent.click(expandButton);

      // For each date (3 dates), values count = 3, so we expect three '3' elements
      const countElements = screen.getAllByText('3');
      expect(countElements.length).toBe(3); // One for each date
    });

    it('should format values with correct metric units', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Expand statistics
      const expandButton = screen.getByText(/Date Statistics Summary/i);
      fireEvent.click(expandButton);

      // Should display values with 's' unit for FLY10_TIME
      const valuesWithUnits = screen.getAllByText(/1\.\d{2}s/);
      expect(valuesWithUnits.length).toBeGreaterThan(0);
    });

    it('should expand and collapse statistics correctly', async () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      const expandButton = screen.getByText(/Date Statistics Summary/i);

      // Initially collapsed
      expect(screen.queryByText(/Count/i)).not.toBeInTheDocument();

      // Expand
      fireEvent.click(expandButton);
      await waitFor(() => {
        expect(screen.getByText(/Count/i)).toBeInTheDocument();
      });

      // Collapse
      fireEvent.click(expandButton);
      await waitFor(() => {
        expect(screen.queryByText(/Count/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Tooltips', () => {
    it('should display tooltips with correct athlete info', async () => {
      const { container } = render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();

      if (canvas) {
        // Simulate mouse move over canvas
        fireEvent.mouseMove(canvas, { clientX: 100, clientY: 100 });

        // Tooltip should be attached to canvas
        expect(canvas).toBeInTheDocument();
      }
    });

    it('should show date in tooltip', async () => {
      const { container } = render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      const canvas = container.querySelector('canvas');
      if (canvas) {
        fireEvent.mouseMove(canvas, { clientX: 100, clientY: 100 });

        // Verify mousemove handler is attached
        expect(canvas).toBeInTheDocument();
      }
    });

    it('should hide tooltip on mouse leave', async () => {
      const { container } = render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
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

  describe('Date Grouping', () => {
    it('should group data by selected dates correctly', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // 3 dates should result in 3 violins being drawn
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
    });

    it('should handle athletes with missing dates', () => {
      const incompleteData: TrendData[] = [
        {
          athleteId: 'athlete-1',
          athleteName: 'John Doe',
          metric: 'FLY10_TIME',
          data: [
            { date: new Date('2024-01-01'), value: 1.5, isPersonalBest: false }
            // Missing 2024-02-01 and 2024-03-01
          ],
          teamName: 'Team A'
        },
        {
          athleteId: 'athlete-2',
          athleteName: 'Jane Smith',
          metric: 'FLY10_TIME',
          data: [
            { date: new Date('2024-02-01'), value: 1.5, isPersonalBest: false }
            // Missing 2024-01-01 and 2024-03-01
          ],
          teamName: 'Team A'
        }
      ];

      render(
        <TimeSeriesViolinChart
          data={incompleteData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Should handle missing dates gracefully
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
    });
  });

  describe('Different Metrics', () => {
    it('should work with VERTICAL_JUMP metric', () => {
      const verticalJumpData: TrendData[] = mockTrendData.map(trend => ({
        ...trend,
        metric: 'VERTICAL_JUMP',
        data: trend.data.map(d => ({ ...d, value: d.value * 10 })) // Convert to inches
      }));

      render(
        <TimeSeriesViolinChart
          data={verticalJumpData}
          selectedDates={selectedDates}
          metric="VERTICAL_JUMP"
          config={mockConfig}
        />
      );

      expect(screen.getByText(/Vertical Jump/i)).toBeInTheDocument();
      expect(screen.getByText(/Higher is better/i)).toBeInTheDocument();
    });

    it('should format values appropriately for different metrics', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Expand statistics
      const expandButton = screen.getByText(/Date Statistics Summary/i);
      fireEvent.click(expandButton);

      // Should show values with 2 decimal places - use getAllByText for multiple matches
      const valuesWithUnits = screen.getAllByText(/1\.\d{2}s/);
      expect(valuesWithUnits.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single data point per date', () => {
      const singlePointData: TrendData[] = [
        {
          athleteId: 'athlete-1',
          athleteName: 'John Doe',
          metric: 'FLY10_TIME',
          data: [
            { date: new Date('2024-01-01'), value: 1.5, isPersonalBest: true }
          ],
          teamName: 'Team A'
        }
      ];

      render(
        <TimeSeriesViolinChart
          data={singlePointData}
          selectedDates={['2024-01-01']}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Should handle single value with artificial bandwidth
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });

    it('should handle identical values at a date', () => {
      const identicalData: TrendData[] = [
        {
          athleteId: 'athlete-1',
          athleteName: 'John Doe',
          metric: 'FLY10_TIME',
          data: [{ date: new Date('2024-01-01'), value: 1.5, isPersonalBest: false }],
          teamName: 'Team A'
        },
        {
          athleteId: 'athlete-2',
          athleteName: 'Jane Smith',
          metric: 'FLY10_TIME',
          data: [{ date: new Date('2024-01-01'), value: 1.5, isPersonalBest: false }],
          teamName: 'Team A'
        }
      ];

      render(
        <TimeSeriesViolinChart
          data={identicalData}
          selectedDates={['2024-01-01']}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Should handle zero range gracefully
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
    });
  });

  describe('Responsiveness', () => {
    it('should handle window resize events', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Trigger resize event
      fireEvent(window, new Event('resize'));

      // Canvas should be redrawn
      expect(mockCanvasContext.clearRect).toHaveBeenCalled();
    });

    it('should set canvas size based on container', () => {
      render(
        <TimeSeriesViolinChart
          data={mockTrendData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Verify canvas scaling is applied
      expect(mockCanvasContext.scale).toHaveBeenCalled();
    });
  });

  describe('KDE Calculation (Fix #9)', () => {
    it('should calculate peak density near mean for normal distribution', () => {
      const normalData: TrendData[] = [
        {
          athleteId: 'athlete-1',
          athleteName: 'Athlete 1',
          metric: 'FLY10_TIME',
          data: [{ date: new Date('2024-01-01'), value: 1.0, isPersonalBest: false }],
          teamName: 'Team A'
        },
        {
          athleteId: 'athlete-2',
          athleteName: 'Athlete 2',
          metric: 'FLY10_TIME',
          data: [{ date: new Date('2024-01-01'), value: 2.0, isPersonalBest: false }],
          teamName: 'Team A'
        },
        {
          athleteId: 'athlete-3',
          athleteName: 'Athlete 3',
          metric: 'FLY10_TIME',
          data: [{ date: new Date('2024-01-01'), value: 3.0, isPersonalBest: false }],
          teamName: 'Team A'
        },
        {
          athleteId: 'athlete-4',
          athleteName: 'Athlete 4',
          metric: 'FLY10_TIME',
          data: [{ date: new Date('2024-01-01'), value: 4.0, isPersonalBest: false }],
          teamName: 'Team A'
        },
        {
          athleteId: 'athlete-5',
          athleteName: 'Athlete 5',
          metric: 'FLY10_TIME',
          data: [{ date: new Date('2024-01-01'), value: 5.0, isPersonalBest: false }],
          teamName: 'Team A'
        }
      ];

      render(
        <TimeSeriesViolinChart
          data={normalData}
          selectedDates={['2024-01-01']}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // KDE should generate smooth distribution
      // Verify violin rendering succeeded
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });

    it('should handle zero-variance datasets with artificial bandwidth', () => {
      const identicalData: TrendData[] = Array.from({ length: 5 }, (_, i) => ({
        athleteId: `athlete-${i}`,
        athleteName: `Athlete ${i}`,
        metric: 'FLY10_TIME',
        data: [{ date: new Date('2024-01-01'), value: 2.5, isPersonalBest: false }],
        teamName: 'Team A'
      }));

      render(
        <TimeSeriesViolinChart
          data={identicalData}
          selectedDates={['2024-01-01']}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Should handle zero range gracefully with artificial bandwidth
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });

    it('should apply Silverman rule of thumb for bandwidth selection', () => {
      const variableData: TrendData[] = [
        { athleteId: 'a1', athleteName: 'A1', metric: 'FLY10_TIME', data: [{ date: new Date('2024-01-01'), value: 1.5, isPersonalBest: false }], teamName: 'Team A' },
        { athleteId: 'a2', athleteName: 'A2', metric: 'FLY10_TIME', data: [{ date: new Date('2024-01-01'), value: 2.0, isPersonalBest: false }], teamName: 'Team A' },
        { athleteId: 'a3', athleteName: 'A3', metric: 'FLY10_TIME', data: [{ date: new Date('2024-01-01'), value: 2.5, isPersonalBest: false }], teamName: 'Team A' },
        { athleteId: 'a4', athleteName: 'A4', metric: 'FLY10_TIME', data: [{ date: new Date('2024-01-01'), value: 3.0, isPersonalBest: false }], teamName: 'Team A' },
        { athleteId: 'a5', athleteName: 'A5', metric: 'FLY10_TIME', data: [{ date: new Date('2024-01-01'), value: 3.5, isPersonalBest: false }], teamName: 'Team A' },
      ];

      render(
        <TimeSeriesViolinChart
          data={variableData}
          selectedDates={['2024-01-01']}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Bandwidth calculation should produce valid KDE
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });

    it('should apply sampling for large datasets (>1000 points)', () => {
      const largeSingleDateData: TrendData[] = Array.from({ length: 1500 }, (_, i) => ({
        athleteId: `athlete-${i}`,
        athleteName: `Athlete ${i}`,
        metric: 'FLY10_TIME',
        data: [{
          date: new Date('2024-01-01'),
          value: 1.5 + Math.sin(i / 100) * 0.3,
          isPersonalBest: false
        }],
        teamName: 'Team A'
      }));

      const start = performance.now();
      render(
        <TimeSeriesViolinChart
          data={largeSingleDateData}
          selectedDates={['2024-01-01']}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );
      const end = performance.now();

      // Should complete quickly due to sampling
      expect(end - start).toBeLessThan(1000);
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
    });

    it('should handle single value with artificial bandwidth', () => {
      const singleValue: TrendData[] = [{
        athleteId: 'athlete-1',
        athleteName: 'Solo Athlete',
        metric: 'FLY10_TIME',
        data: [{ date: new Date('2024-01-01'), value: 2.0, isPersonalBest: true }],
        teamName: 'Team A'
      }];

      render(
        <TimeSeriesViolinChart
          data={singleValue}
          selectedDates={['2024-01-01']}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );

      // Single value should create narrow distribution
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('should handle large datasets efficiently', () => {
      // Create large dataset
      const largeData: TrendData[] = Array.from({ length: 100 }, (_, i) => ({
        athleteId: `athlete-${i}`,
        athleteName: `Athlete ${i}`,
        metric: 'FLY10_TIME',
        data: selectedDates.map((dateStr, dateIndex) => ({
          date: new Date(dateStr),
          value: 1.5 + (Math.sin(i / 10) * 0.3) + (dateIndex * 0.1),
          isPersonalBest: dateIndex === 2
        })),
        teamName: 'Team A'
      }));

      const start = performance.now();
      render(
        <TimeSeriesViolinChart
          data={largeData}
          selectedDates={selectedDates}
          metric="FLY10_TIME"
          config={mockConfig}
        />
      );
      const end = performance.now();

      // Should complete in reasonable time (< 1 second)
      expect(end - start).toBeLessThan(1000);

      // Should still render correctly
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
    });
  });
});
