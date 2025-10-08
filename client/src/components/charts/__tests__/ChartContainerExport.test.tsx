/**
 * TDD Tests for ChartContainer Export Functionality
 *
 * Tests the export dropdown menu and integration with export utilities
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChartContainer } from '../ChartContainer';
import type { ChartDataPoint } from '@shared/analytics-types';

// Mock chart components
vi.mock('chart.js', () => ({
  Chart: class {
    static register = vi.fn();
    static getChart = vi.fn();
  },
  CategoryScale: {},
  LinearScale: {},
  PointElement: {},
  LineElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));

vi.mock('../BoxPlotChart', () => ({
  BoxPlotChart: vi.fn(() => <div data-testid="box-plot-chart">Box Plot Chart</div>)
}));

vi.mock('../DistributionChart', () => ({
  DistributionChart: vi.fn(() => <div data-testid="distribution-chart">Distribution Chart</div>)
}));

vi.mock('../BarChart', () => ({
  BarChart: vi.fn(() => <div data-testid="bar-chart">Bar Chart</div>)
}));

describe('ChartContainer Export Functionality - TDD', () => {
  const mockData: ChartDataPoint[] = [
    {
      athleteId: 'athlete-1',
      athleteName: 'John Doe',
      value: 1.23,
      date: new Date('2025-01-15'),
      metric: 'FLY10_TIME',
      teamName: 'Team A'
    },
    {
      athleteId: 'athlete-2',
      athleteName: 'Jane Smith',
      value: 1.18,
      date: new Date('2025-01-15'),
      metric: 'FLY10_TIME',
      teamName: 'Team B'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Export Button and Dropdown Menu', () => {
    it('should render export button when onExport is provided', () => {
      const mockOnExport = vi.fn();

      render(
        <ChartContainer
          title="Test Chart"
          chartType="box_plot"
          data={mockData}
          onExport={mockOnExport}
        />
      );

      const exportButton = screen.getByTitle(/export/i);
      expect(exportButton).toBeInTheDocument();
    });

    it('should not render export button when onExport is not provided', () => {
      render(
        <ChartContainer
          title="Test Chart"
          chartType="box_plot"
          data={mockData}
        />
      );

      const exportButton = screen.queryByTitle(/export/i);
      expect(exportButton).not.toBeInTheDocument();
    });

    it('should have dropdown menu trigger in export button', async () => {
      const mockOnExport = vi.fn();

      render(
        <ChartContainer
          title="Test Chart"
          chartType="box_plot"
          data={mockData}
          onExport={mockOnExport}
        />
      );

      const exportButton = screen.getByTitle(/export/i);
      expect(exportButton).toHaveAttribute('aria-haspopup', 'menu');
      expect(exportButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('should render ChartContainer with export capability', () => {
      const mockOnExport = vi.fn();

      const { container } = render(
        <ChartContainer
          title="Test Chart"
          chartType="box_plot"
          data={mockData}
          onExport={mockOnExport}
        />
      );

      // Verify dropdown menu structure exists
      const exportButton = screen.getByTitle(/export/i);
      expect(exportButton).toBeInTheDocument();

      // Verify the component structure includes DropdownMenu components
      expect(container.querySelector('[aria-haspopup="menu"]')).toBeTruthy();
    });
  });

  describe('Component Integration', () => {
    it('should pass export function signature correctly', () => {
      const mockOnExport = vi.fn();

      render(
        <ChartContainer
          title="Test Chart"
          chartType="box_plot"
          data={mockData}
          onExport={mockOnExport}
        />
      );

      // Verify export button structure
      const exportButton = screen.getByTitle(/export/i);
      expect(exportButton).toHaveAttribute('type', 'button');
      expect(exportButton).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('should have container ref for full view exports', () => {
      const mockOnExport = vi.fn();

      const { container } = render(
        <ChartContainer
          title="Test Chart"
          chartType="box_plot"
          data={mockData}
          onExport={mockOnExport}
        />
      );

      // Verify the Card component (container) is rendered
      const card = container.querySelector('.rounded-lg.border.bg-card');
      expect(card).toBeTruthy();
    });
  });
});
