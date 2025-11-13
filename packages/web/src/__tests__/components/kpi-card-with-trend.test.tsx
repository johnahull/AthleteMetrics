/**
 * Component tests for KPICardWithTrend
 *
 * Test coverage:
 * - Renders KPI value
 * - Renders trend indicator (arrow + percentage)
 * - Green color for positive trends
 * - Red color for negative trends
 * - Gray for flat trends
 * - Inverted metric handling (time-based where lower is better)
 * - No trend display when trend prop is undefined
 * - Accessibility (screen reader announcements)
 * - Different format types (number, time, percentage)
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { KPICardWithTrend, type TrendData } from '@/components/kpi-card-with-trend';
import { Users, Activity, Timer } from 'lucide-react';

describe('KPICardWithTrend', () => {
  describe('Basic Rendering', () => {
    it('should render KPI title and value', () => {
      render(
        <KPICardWithTrend
          title="Total Athletes"
          value={127}
          icon={Users}
        />
      );

      expect(screen.getByText('Total Athletes')).toBeInTheDocument();
      expect(screen.getByText('127')).toBeInTheDocument();
    });

    it('should render with string value', () => {
      render(
        <KPICardWithTrend
          title="Total Athletes"
          value="127"
          icon={Users}
        />
      );

      expect(screen.getByText('127')).toBeInTheDocument();
    });

    it('should render icon', () => {
      const { container } = render(
        <KPICardWithTrend
          title="Total Athletes"
          value={127}
          icon={Users}
        />
      );

      // Icon should be rendered (lucide-react icons have class name)
      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should render without trend when trend prop is undefined', () => {
      render(
        <KPICardWithTrend
          title="Total Athletes"
          value={127}
          icon={Users}
        />
      );

      // Should not render trend elements
      expect(screen.queryByText(/↑|↓|→/)).not.toBeInTheDocument();
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    });
  });

  describe('Trend Indicators', () => {
    it('should render positive trend with up arrow and green color', () => {
      const trend: TrendData = {
        value: 5,
        percent: 4.1,
        direction: 'up'
      };

      const { container } = render(
        <KPICardWithTrend
          title="Total Athletes"
          value={127}
          icon={Users}
          trend={trend}
        />
      );

      // Should show increase indicator
      expect(screen.getByText(/\+5/)).toBeInTheDocument();
      expect(screen.getByText(/4\.1%/)).toBeInTheDocument();

      // Should have green color (text-green-600)
      const trendElement = container.querySelector('.text-green-600');
      expect(trendElement).toBeInTheDocument();
    });

    it('should render negative trend with down arrow and red color', () => {
      const trend: TrendData = {
        value: -3,
        percent: -2.4,
        direction: 'down'
      };

      render(
        <KPICardWithTrend
          title="Total Athletes"
          value={122}
          icon={Users}
          trend={trend}
        />
      );

      // Should show decrease indicator
      expect(screen.getByText(/-3/)).toBeInTheDocument();
      expect(screen.getByText(/2\.4%/)).toBeInTheDocument();
    });

    it('should render flat trend with gray color', () => {
      const trend: TrendData = {
        value: 0,
        percent: 0,
        direction: 'flat'
      };

      const { container } = render(
        <KPICardWithTrend
          title="Total Teams"
          value={8}
          icon={Users}
          trend={trend}
        />
      );

      // Should show no change
      expect(screen.getByText('0.0%')).toBeInTheDocument();

      // Should have gray color (text-gray-600)
      const trendElement = container.querySelector('.text-gray-600');
      expect(trendElement).toBeInTheDocument();
    });

    it('should display trend with proper formatting', () => {
      const trend: TrendData = {
        value: 56,
        percent: 5.7,
        direction: 'up'
      };

      render(
        <KPICardWithTrend
          title="Measurements"
          value={1043}
          icon={Activity}
          trend={trend}
        />
      );

      // Should format with sign and percentage
      expect(screen.getByText(/\+56/)).toBeInTheDocument();
      expect(screen.getByText(/5\.7%/)).toBeInTheDocument();
    });
  });

  describe('Inverted Metrics', () => {
    it('should show green for negative trend when inverted (time metrics)', () => {
      const trend: TrendData = {
        value: -0.05,
        percent: -4.0,
        direction: 'down'
      };

      const { container } = render(
        <KPICardWithTrend
          title="Average Time"
          value="1.20s"
          icon={Timer}
          trend={trend}
          inverted={true}
          format="time"
        />
      );

      // For inverted metrics, down trend is good (green)
      const trendElement = container.querySelector('.text-green-600');
      expect(trendElement).toBeInTheDocument();
    });

    it('should show red for positive trend when inverted (time metrics)', () => {
      const trend: TrendData = {
        value: 0.03,
        percent: 2.4,
        direction: 'up'
      };

      const { container } = render(
        <KPICardWithTrend
          title="Average Time"
          value="1.28s"
          icon={Timer}
          trend={trend}
          inverted={true}
          format="time"
        />
      );

      // For inverted metrics, up trend is bad (red)
      const trendElement = container.querySelector('.text-red-600');
      expect(trendElement).toBeInTheDocument();
    });

    it('should show gray for flat trend even when inverted', () => {
      const trend: TrendData = {
        value: 0,
        percent: 0,
        direction: 'flat'
      };

      const { container } = render(
        <KPICardWithTrend
          title="Average Time"
          value="1.25s"
          icon={Timer}
          trend={trend}
          inverted={true}
          format="time"
        />
      );

      // Flat is always gray
      const trendElement = container.querySelector('.text-gray-600');
      expect(trendElement).toBeInTheDocument();
    });
  });

  describe('Format Types', () => {
    it('should format number values correctly', () => {
      render(
        <KPICardWithTrend
          title="Total Athletes"
          value={1234}
          icon={Users}
          format="number"
        />
      );

      expect(screen.getByText('1234')).toBeInTheDocument();
    });

    it('should format time values correctly', () => {
      render(
        <KPICardWithTrend
          title="Best Time"
          value="1.25s"
          icon={Timer}
          format="time"
        />
      );

      expect(screen.getByText('1.25s')).toBeInTheDocument();
    });

    it('should format percentage values correctly', () => {
      render(
        <KPICardWithTrend
          title="Completion Rate"
          value="94.5%"
          icon={Activity}
          format="percentage"
        />
      );

      expect(screen.getByText('94.5%')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible screen reader announcement for positive trend', () => {
      const trend: TrendData = {
        value: 5,
        percent: 4.1,
        direction: 'up'
      };

      render(
        <KPICardWithTrend
          title="Total Athletes"
          value={127}
          icon={Users}
          trend={trend}
        />
      );

      // Should have aria-label with context
      const trendElement = screen.getByLabelText(/up 5, 4\.1% from last month/i);
      expect(trendElement).toBeInTheDocument();
    });

    it('should have accessible screen reader announcement for negative trend', () => {
      const trend: TrendData = {
        value: -3,
        percent: -2.4,
        direction: 'down'
      };

      render(
        <KPICardWithTrend
          title="Total Athletes"
          value={122}
          icon={Users}
          trend={trend}
        />
      );

      // Should have aria-label with context
      const trendElement = screen.getByLabelText(/down 3, 2\.4% from last month/i);
      expect(trendElement).toBeInTheDocument();
    });

    it('should have accessible screen reader announcement for flat trend', () => {
      const trend: TrendData = {
        value: 0,
        percent: 0,
        direction: 'flat'
      };

      render(
        <KPICardWithTrend
          title="Total Teams"
          value={8}
          icon={Users}
          trend={trend}
        />
      );

      // Should have aria-label with context
      const trendElement = screen.getByLabelText(/no change from last month/i);
      expect(trendElement).toBeInTheDocument();
    });

    it('should have accessible card title', () => {
      render(
        <KPICardWithTrend
          title="Total Athletes"
          value={127}
          icon={Users}
        />
      );

      // Title should be accessible
      expect(screen.getByText('Total Athletes')).toBeInTheDocument();
    });

    it('should combine title and trend for full context', () => {
      const trend: TrendData = {
        value: 5,
        percent: 4.1,
        direction: 'up'
      };

      render(
        <KPICardWithTrend
          title="Total Athletes"
          value={127}
          icon={Users}
          trend={trend}
        />
      );

      // Full context: "Total athletes: 127. Up 5, 4.1% from last month"
      expect(screen.getByText('Total Athletes')).toBeInTheDocument();
      expect(screen.getByText('127')).toBeInTheDocument();
      expect(screen.getByLabelText(/up 5, 4\.1% from last month/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero value', () => {
      render(
        <KPICardWithTrend
          title="Total Athletes"
          value={0}
          icon={Users}
        />
      );

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should handle large numbers', () => {
      render(
        <KPICardWithTrend
          title="Total Measurements"
          value={999999}
          icon={Activity}
        />
      );

      expect(screen.getByText('999999')).toBeInTheDocument();
    });

    it('should handle decimal percentages', () => {
      const trend: TrendData = {
        value: 1,
        percent: 0.8,
        direction: 'flat' // Should be flat because < 1%
      };

      render(
        <KPICardWithTrend
          title="Total Athletes"
          value={126}
          icon={Users}
          trend={trend}
        />
      );

      expect(screen.getByText(/0\.8%/)).toBeInTheDocument();
    });

    it('should handle very small trend changes', () => {
      const trend: TrendData = {
        value: 1,
        percent: 0.1,
        direction: 'flat'
      };

      render(
        <KPICardWithTrend
          title="Total Athletes"
          value={1000}
          icon={Users}
          trend={trend}
        />
      );

      expect(screen.getByText(/\+1/)).toBeInTheDocument();
      expect(screen.getByText(/0\.1%/)).toBeInTheDocument();
    });
  });

  describe('Visual Consistency', () => {
    it('should use consistent icon styling', () => {
      const { container } = render(
        <KPICardWithTrend
          title="Total Athletes"
          value={127}
          icon={Users}
        />
      );

      const icon = container.querySelector('svg');
      expect(icon).toHaveClass('h-6', 'w-6');
    });

    it('should use Card and CardContent components', () => {
      const { container } = render(
        <KPICardWithTrend
          title="Total Athletes"
          value={127}
          icon={Users}
        />
      );

      // Should render with card structure
      const card = container.firstChild;
      expect(card).toHaveClass('bg-white');
    });

    it('should display trend inline with proper spacing', () => {
      const trend: TrendData = {
        value: 5,
        percent: 4.1,
        direction: 'up'
      };

      const { container } = render(
        <KPICardWithTrend
          title="Total Athletes"
          value={127}
          icon={Users}
          trend={trend}
        />
      );

      // Trend should have spacing classes
      const trendElement = container.querySelector('.mt-1');
      expect(trendElement).toBeInTheDocument();
    });
  });
});
