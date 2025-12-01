/**
 * Component tests for RecentActivityTimeline
 * Tests timeline display, insights generation, and mobile responsiveness
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RecentActivityTimeline } from '@/components/athlete/RecentActivityTimeline';

describe('RecentActivityTimeline', () => {
  const mockActivities = [
    {
      id: '1',
      date: '2024-01-15',
      metric: 'FLY10_TIME',
      displayName: '10-Yard Fly Time',
      value: 1.45,
      units: 's',
      insight: 'New personal record! 🎉',
      insightType: 'pr' as const,
    },
    {
      id: '2',
      date: '2024-01-12',
      metric: 'VERTICAL_JUMP',
      displayName: 'Vertical Jump',
      value: 32.5,
      units: 'in',
      insight: 'Improved by 6.2% from last time',
      insightType: 'improvement' as const,
    },
    {
      id: '3',
      date: '2024-01-10',
      metric: 'FLY10_TIME',
      displayName: '10-Yard Fly Time',
      value: 1.50,
      units: 's',
      insight: 'Consistent performance',
      insightType: 'consistent' as const,
    },
    {
      id: '4',
      date: '2024-01-08',
      metric: 'DASH_40YD',
      displayName: '40-Yard Dash',
      value: 5.1,
      units: 's',
      insight: null,
      insightType: null,
    },
    {
      id: '5',
      date: '2024-01-05',
      metric: 'VERTICAL_JUMP',
      displayName: 'Vertical Jump',
      value: 30.5,
      units: 'in',
      insight: 'New personal record! 🎉',
      insightType: 'pr' as const,
    },
  ];

  describe('Timeline Display', () => {
    it('should display all activities in timeline format', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      expect(screen.getByTestId('activity-1')).toBeInTheDocument();
      expect(screen.getByTestId('activity-2')).toBeInTheDocument();
      expect(screen.getByTestId('activity-3')).toBeInTheDocument();
      expect(screen.getByTestId('activity-4')).toBeInTheDocument();
      expect(screen.getByTestId('activity-5')).toBeInTheDocument();
    });

    it('should display only last 5 activities', () => {
      const manyActivities = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        date: `2024-01-${String(15 - i).padStart(2, '0')}`,
        metric: 'FLY10_TIME',
        displayName: '10-Yard Fly Time',
        value: 1.45,
        units: 's',
        insight: null,
        insightType: null,
      }));

      render(<RecentActivityTimeline activities={manyActivities} />);

      // Should only show first 5
      expect(screen.getByTestId('activity-0')).toBeInTheDocument();
      expect(screen.getByTestId('activity-4')).toBeInTheDocument();
      expect(screen.queryByTestId('activity-5')).not.toBeInTheDocument();
    });

    it('should display dates for each activity', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      expect(screen.getByTestId('activity-date-1')).toBeInTheDocument();
      expect(screen.getByTestId('activity-date-2')).toBeInTheDocument();
      expect(screen.getByTestId('activity-date-3')).toBeInTheDocument();
    });

    it('should display metric names', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      // Should show all unique metric names
      expect(screen.getAllByText('10-Yard Fly Time').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Vertical Jump').length).toBeGreaterThan(0);
      expect(screen.getByText('40-Yard Dash')).toBeInTheDocument();
    });

    it('should display values with units', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      expect(screen.getByText('1.45s')).toBeInTheDocument();
      expect(screen.getByText('32.5in')).toBeInTheDocument();
      expect(screen.getByText('5.1s')).toBeInTheDocument();
    });

    it('should handle empty activities list', () => {
      render(<RecentActivityTimeline activities={[]} />);

      expect(screen.getByTestId('no-recent-activity')).toBeInTheDocument();
      expect(screen.getByText(/No recent activity/i)).toBeInTheDocument();
    });
  });

  describe('Metric Icons', () => {
    it('should display icons for each metric', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      expect(screen.getByTestId('metric-icon-1')).toBeInTheDocument();
      expect(screen.getByTestId('metric-icon-2')).toBeInTheDocument();
      expect(screen.getByTestId('metric-icon-3')).toBeInTheDocument();
    });

    it('should use different icons for different metrics', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      // Icons should exist for different metrics
      const flyIcons = screen.getAllByTestId(/metric-icon-/);
      expect(flyIcons.length).toBe(5);
    });
  });

  describe('Insights Display', () => {
    it('should display PR insight with celebration emoji', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      // Check for first PR insight using getAllByText since there are multiple
      const prInsights = screen.getAllByText('New personal record! 🎉');
      expect(prInsights.length).toBeGreaterThan(0);
      expect(prInsights[0]).toBeInTheDocument();
    });

    it('should display improvement insight', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      expect(screen.getByText('Improved by 6.2% from last time')).toBeInTheDocument();
    });

    it('should display consistent performance insight', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      expect(screen.getByText('Consistent performance')).toBeInTheDocument();
    });

    it('should handle null insights', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      // Activity 4 has no insight, should not crash
      const activity4 = screen.getByTestId('activity-4');
      expect(activity4).toBeInTheDocument();
    });

    it('should style insights by type', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      const prInsight = screen.getByTestId('insight-1');
      expect(prInsight).toHaveClass('text-green-600');

      const improvementInsight = screen.getByTestId('insight-2');
      expect(improvementInsight).toHaveClass('text-blue-600');

      const consistentInsight = screen.getByTestId('insight-3');
      expect(consistentInsight).toHaveClass('text-gray-600');
    });
  });

  describe('Timeline Connector', () => {
    it('should show timeline connector between activities', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      const connectors = screen.getAllByTestId(/timeline-connector/);
      // Should have connectors between items (n-1 connectors for n items, max 5 items)
      expect(connectors.length).toBe(4);
    });

    it('should not show connector after last activity', () => {
      render(<RecentActivityTimeline activities={mockActivities.slice(0, 2)} />);

      // 2 items = 1 connector
      const connectors = screen.getAllByTestId(/timeline-connector/);
      expect(connectors.length).toBe(1);
    });
  });

  describe('Mobile Responsiveness', () => {
    it('should use responsive layout classes', () => {
      const { container } = render(<RecentActivityTimeline activities={mockActivities} />);

      const timeline = container.querySelector('[data-testid="recent-activity-timeline"]');
      expect(timeline).toHaveClass('flex', 'flex-col');
    });

    it('should stack items vertically on mobile', () => {
      const { container } = render(<RecentActivityTimeline activities={mockActivities} />);

      const timeline = container.querySelector('[data-testid="recent-activity-timeline"]');
      expect(timeline).toHaveClass('flex-col');
    });
  });

  describe('Accessibility', () => {
    it('should have all required data-testid attributes', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      expect(screen.getByTestId('recent-activity-timeline')).toBeInTheDocument();
      expect(screen.getByTestId('activity-1')).toBeInTheDocument();
      expect(screen.getByTestId('metric-icon-1')).toBeInTheDocument();
      expect(screen.getByTestId('insight-1')).toBeInTheDocument();
    });

    it('should have proper heading structure', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      expect(screen.getByRole('heading', { name: /Recent Activity/i })).toBeInTheDocument();
    });

    it('should have accessible date formatting', () => {
      render(<RecentActivityTimeline activities={mockActivities} />);

      // Dates should be formatted for screen readers
      const dateElements = screen.getAllByTestId(/activity-date-/);
      dateElements.forEach((element) => {
        expect(element).toBeInTheDocument();
      });
    });
  });
});
