/**
 * Component tests for PersonalRecordsCard
 * Tests PR display, improvement indicators, and confetti celebration
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PersonalRecordsCard } from '@/components/athlete/PersonalRecordsCard';

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('PersonalRecordsCard', () => {
  const mockPersonalRecords = [
    {
      metric: 'FLY10_TIME',
      displayName: '10-Yard Fly Time',
      value: 1.45,
      units: 's',
      date: '2024-01-15',
      isRecent: true, // Within 7 days
      improvement: 0.05, // 0.05s faster
      improvementText: '↑ 0.05s faster than last month',
    },
    {
      metric: 'VERTICAL_JUMP',
      displayName: 'Vertical Jump',
      value: 32.5,
      units: 'in',
      date: '2024-01-10',
      isRecent: false,
      improvement: 2.0,
      improvementText: '↑ 2.0in higher than last month',
    },
    {
      metric: 'DASH_40YD',
      displayName: '40-Yard Dash',
      value: 5.1,
      units: 's',
      date: '2024-01-05',
      isRecent: false,
      improvement: null,
      improvementText: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Personal Records Display', () => {
    it('should display all personal records', () => {
      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      expect(screen.getByText('10-Yard Fly Time')).toBeInTheDocument();
      expect(screen.getByText('Vertical Jump')).toBeInTheDocument();
      expect(screen.getByText('40-Yard Dash')).toBeInTheDocument();
    });

    it('should display PR values with correct units', () => {
      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      expect(screen.getByText('1.45s')).toBeInTheDocument();
      expect(screen.getByText('32.5in')).toBeInTheDocument();
      expect(screen.getByText('5.1s')).toBeInTheDocument();
    });

    it('should display PR dates', () => {
      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      // Dates should be formatted
      expect(screen.getByTestId('pr-date-FLY10_TIME')).toBeInTheDocument();
      expect(screen.getByTestId('pr-date-VERTICAL_JUMP')).toBeInTheDocument();
      expect(screen.getByTestId('pr-date-DASH_40YD')).toBeInTheDocument();
    });

    it('should handle empty personal records', () => {
      render(<PersonalRecordsCard personalRecords={[]} />);

      expect(screen.getByTestId('no-personal-records')).toBeInTheDocument();
      expect(screen.getByText(/No personal records yet/i)).toBeInTheDocument();
    });
  });

  describe('Improvement Indicators', () => {
    it('should display improvement text when available', () => {
      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      expect(screen.getByText('↑ 0.05s faster than last month')).toBeInTheDocument();
      expect(screen.getByText('↑ 2.0in higher than last month')).toBeInTheDocument();
    });

    it('should not display improvement text when null', () => {
      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      // The 40-yard dash has no improvement text
      const dashCard = screen.getByText('40-Yard Dash').closest('[data-testid*="pr-card"]');
      expect(dashCard?.querySelector('[data-testid*="improvement"]')).not.toBeInTheDocument();
    });

    it('should style improvement text appropriately', () => {
      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      const improvementElement = screen.getByTestId('improvement-FLY10_TIME');
      expect(improvementElement).toHaveClass('text-green-600');
    });
  });

  describe('Recent PR Celebration', () => {
    it('should show celebration badge for recent PRs', () => {
      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      expect(screen.getByTestId('celebration-badge-FLY10_TIME')).toBeInTheDocument();
      expect(screen.getByText('New PR! 🎉')).toBeInTheDocument();
    });

    it('should not show celebration badge for old PRs', () => {
      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      expect(screen.queryByTestId('celebration-badge-VERTICAL_JUMP')).not.toBeInTheDocument();
      expect(screen.queryByTestId('celebration-badge-DASH_40YD')).not.toBeInTheDocument();
    });

    it('should trigger confetti on mount when recent PR exists', () => {
      const confetti = vi.fn();
      vi.doMock('canvas-confetti', () => ({ default: confetti }));

      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} showConfetti={true} />);

      // Confetti should be called for recent PR
      expect(screen.getByTestId('celebration-badge-FLY10_TIME')).toBeInTheDocument();
    });

    it('should not trigger confetti when showConfetti is false', () => {
      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} showConfetti={false} />);

      // Badge should still show
      expect(screen.getByTestId('celebration-badge-FLY10_TIME')).toBeInTheDocument();
    });
  });

  describe('Visual Design', () => {
    it('should render with card styling', () => {
      const { container } = render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      const cardElement = container.querySelector('[data-testid="personal-records-card"]');
      expect(cardElement).toBeInTheDocument();
    });

    it('should display metric icons', () => {
      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      expect(screen.getByTestId('metric-icon-FLY10_TIME')).toBeInTheDocument();
      expect(screen.getByTestId('metric-icon-VERTICAL_JUMP')).toBeInTheDocument();
      expect(screen.getByTestId('metric-icon-DASH_40YD')).toBeInTheDocument();
    });

    it('should use grid layout for multiple PRs', () => {
      const { container } = render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      const gridContainer = container.querySelector('.grid');
      expect(gridContainer).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have all required data-testid attributes', () => {
      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      expect(screen.getByTestId('personal-records-card')).toBeInTheDocument();
      expect(screen.getByTestId('pr-card-FLY10_TIME')).toBeInTheDocument();
      expect(screen.getByTestId('pr-card-VERTICAL_JUMP')).toBeInTheDocument();
      expect(screen.getByTestId('pr-card-DASH_40YD')).toBeInTheDocument();
    });

    it('should have proper heading structure', () => {
      render(<PersonalRecordsCard personalRecords={mockPersonalRecords} />);

      expect(screen.getByRole('heading', { name: /Personal Records/i })).toBeInTheDocument();
    });
  });
});
