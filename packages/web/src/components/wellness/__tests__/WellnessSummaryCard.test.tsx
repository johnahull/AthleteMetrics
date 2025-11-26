/**
 * Component tests for WellnessSummaryCard
 * Tests dynamic scale support, rendering with different scaleMax values
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WellnessSummaryCard } from '../WellnessSummaryCard';

describe('WellnessSummaryCard', () => {
  const mockSummary = {
    averageWellness: 7.5,
    trend: 'up' as const,
    totalResponses: 25,
  };

  describe('Dynamic Scale Support', () => {
    it('should display score with default scale of 10', () => {
      render(
        <WellnessSummaryCard
          summary={mockSummary}
          scaleMax={10}
        />
      );

      expect(screen.getByTestId('wellness-score')).toHaveTextContent('7.5');
      expect(screen.getByTestId('wellness-score')).toHaveTextContent('/ 10');
    });

    it('should display score with scale of 5', () => {
      render(
        <WellnessSummaryCard
          summary={{ ...mockSummary, averageWellness: 4.2 }}
          scaleMax={5}
        />
      );

      expect(screen.getByTestId('wellness-score')).toHaveTextContent('4.2');
      expect(screen.getByTestId('wellness-score')).toHaveTextContent('/ 5');
    });

    it('should display score with scale of 7', () => {
      render(
        <WellnessSummaryCard
          summary={{ ...mockSummary, averageWellness: 5.3 }}
          scaleMax={7}
        />
      );

      expect(screen.getByTestId('wellness-score')).toHaveTextContent('5.3');
      expect(screen.getByTestId('wellness-score')).toHaveTextContent('/ 7');
    });

    it('should display score with scale of 100 (percentage scale)', () => {
      render(
        <WellnessSummaryCard
          summary={{ ...mockSummary, averageWellness: 85.5 }}
          scaleMax={100}
        />
      );

      expect(screen.getByTestId('wellness-score')).toHaveTextContent('85.5');
      expect(screen.getByTestId('wellness-score')).toHaveTextContent('/ 100');
    });

    it('should handle scaleMax of 1 (binary scale)', () => {
      render(
        <WellnessSummaryCard
          summary={{ ...mockSummary, averageWellness: 0.8 }}
          scaleMax={1}
        />
      );

      expect(screen.getByTestId('wellness-score')).toHaveTextContent('0.8');
      expect(screen.getByTestId('wellness-score')).toHaveTextContent('/ 1');
    });
  });

  describe('Rendering', () => {
    it('should render with valid summary data', () => {
      render(
        <WellnessSummaryCard
          summary={mockSummary}
          scaleMax={10}
        />
      );

      expect(screen.getByTestId('card-title')).toHaveTextContent('Average Wellness');
      expect(screen.getByTestId('wellness-score')).toBeInTheDocument();
      expect(screen.getByTestId('trend-indicator')).toBeInTheDocument();
    });

    it('should render with null summary', () => {
      render(
        <WellnessSummaryCard
          summary={null}
          scaleMax={10}
        />
      );

      expect(screen.getByTestId('wellness-score')).toHaveTextContent('0.0');
      expect(screen.queryByText(/Based on/)).not.toBeInTheDocument();
    });

    it('should display response count', () => {
      render(
        <WellnessSummaryCard
          summary={mockSummary}
          scaleMax={10}
        />
      );

      expect(screen.getByText(/Based on 25 responses/)).toBeInTheDocument();
    });

    it('should handle singular response count', () => {
      render(
        <WellnessSummaryCard
          summary={{ ...mockSummary, totalResponses: 1 }}
          scaleMax={10}
        />
      );

      expect(screen.getByText(/Based on 1 response$/)).toBeInTheDocument();
    });
  });

  describe('Trend Indicators', () => {
    it('should display "Improving" trend with up arrow', () => {
      render(
        <WellnessSummaryCard
          summary={{ ...mockSummary, trend: 'up' }}
          scaleMax={10}
        />
      );

      expect(screen.getByTestId('trend-indicator')).toHaveTextContent('Improving');
    });

    it('should display "Declining" trend with down arrow', () => {
      render(
        <WellnessSummaryCard
          summary={{ ...mockSummary, trend: 'down' }}
          scaleMax={10}
        />
      );

      expect(screen.getByTestId('trend-indicator')).toHaveTextContent('Declining');
    });

    it('should display "Stable" trend with minus icon', () => {
      render(
        <WellnessSummaryCard
          summary={{ ...mockSummary, trend: 'stable' }}
          scaleMax={10}
        />
      );

      expect(screen.getByTestId('trend-indicator')).toHaveTextContent('Stable');
    });
  });

  describe('Score Formatting', () => {
    it('should format score to 1 decimal place', () => {
      render(
        <WellnessSummaryCard
          summary={{ ...mockSummary, averageWellness: 7.567 }}
          scaleMax={10}
        />
      );

      expect(screen.getByTestId('wellness-score')).toHaveTextContent('7.6');
    });

    it('should display 0.0 for zero score', () => {
      render(
        <WellnessSummaryCard
          summary={{ ...mockSummary, averageWellness: 0 }}
          scaleMax={10}
        />
      );

      expect(screen.getByTestId('wellness-score')).toHaveTextContent('0.0');
    });
  });

  describe('Accessibility', () => {
    it('should have data-testid attributes', () => {
      render(
        <WellnessSummaryCard
          summary={mockSummary}
          scaleMax={10}
          data-testid="wellness-summary"
        />
      );

      expect(screen.getByTestId('wellness-summary')).toBeInTheDocument();
      expect(screen.getByTestId('card-title')).toBeInTheDocument();
      expect(screen.getByTestId('wellness-score')).toBeInTheDocument();
      expect(screen.getByTestId('trend-indicator')).toBeInTheDocument();
    });
  });
});
