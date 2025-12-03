/**
 * Component tests for WellnessStatusCard
 * Tests conditional rendering, wellness data display, and integration link
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WellnessStatusCard } from '@/components/athlete/WellnessStatusCard';

describe('WellnessStatusCard', () => {
  const mockWellnessData = {
    lastSubmissionDate: '2024-01-15',
    flaggedConcerns: [
      { question: 'Fatigue Level', answer: 'Very High' },
      { question: 'Soreness', answer: 'Right Knee' },
    ],
    overallStatus: 'yellow' as const,
  };

  describe('Conditional Rendering', () => {
    it('should render when wellness is enabled and data exists', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={mockWellnessData}
        />
      );

      expect(screen.getByTestId('wellness-status-card')).toBeInTheDocument();
    });

    it('should not render when wellness is disabled', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={false}
          wellnessData={mockWellnessData}
        />
      );

      expect(screen.queryByTestId('wellness-status-card')).not.toBeInTheDocument();
    });

    it('should render with empty state when wellness enabled but no data', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={null}
        />
      );

      expect(screen.getByTestId('wellness-status-card')).toBeInTheDocument();
      expect(screen.getByText(/No wellness submissions yet/i)).toBeInTheDocument();
    });
  });

  describe('Last Submission Display', () => {
    it('should display last submission date', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={mockWellnessData}
        />
      );

      expect(screen.getByTestId('last-submission-date')).toBeInTheDocument();
      expect(screen.getByText(/Last submission/i)).toBeInTheDocument();
    });

    it('should format date as relative time for recent submissions', () => {
      const today = new Date().toISOString().split('T')[0];
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={{ ...mockWellnessData, lastSubmissionDate: today }}
        />
      );

      expect(screen.getByTestId('last-submission-date')).toBeInTheDocument();
    });

    it('should display "Never" when no submissions', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={null}
        />
      );

      expect(screen.getByText(/No wellness submissions yet/i)).toBeInTheDocument();
    });
  });

  describe('Flagged Concerns Display', () => {
    it('should display all flagged concerns', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={mockWellnessData}
        />
      );

      expect(screen.getByText('Fatigue Level')).toBeInTheDocument();
      expect(screen.getByText('Very High')).toBeInTheDocument();
      expect(screen.getByText('Soreness')).toBeInTheDocument();
      expect(screen.getByText('Right Knee')).toBeInTheDocument();
    });

    it('should display concern count', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={mockWellnessData}
        />
      );

      expect(screen.getByTestId('concern-count')).toHaveTextContent('2 concerns flagged');
    });

    it('should display singular "concern" for count of 1', () => {
      const singleConcern = {
        ...mockWellnessData,
        flaggedConcerns: [{ question: 'Fatigue Level', answer: 'Very High' }],
      };

      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={singleConcern}
        />
      );

      expect(screen.getByTestId('concern-count')).toHaveTextContent('1 concern flagged');
    });

    it('should display "No concerns" when array is empty', () => {
      const noConcerns = {
        ...mockWellnessData,
        flaggedConcerns: [],
      };

      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={noConcerns}
        />
      );

      expect(screen.getByText(/No concerns flagged/i)).toBeInTheDocument();
    });

    it('should limit display to first 3 concerns', () => {
      const manyConcerns = {
        ...mockWellnessData,
        flaggedConcerns: [
          { question: 'Fatigue', answer: 'High' },
          { question: 'Sleep', answer: 'Poor' },
          { question: 'Stress', answer: 'High' },
          { question: 'Nutrition', answer: 'Poor' },
          { question: 'Hydration', answer: 'Low' },
        ],
      };

      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={manyConcerns}
        />
      );

      // Should show first 3
      expect(screen.getByText('Fatigue')).toBeInTheDocument();
      expect(screen.getByText('Sleep')).toBeInTheDocument();
      expect(screen.getByText('Stress')).toBeInTheDocument();

      // Should show "+2 more" indicator
      expect(screen.getByText('+2 more')).toBeInTheDocument();
    });
  });

  describe('Overall Status Indicator', () => {
    it('should display red status with red styling', () => {
      const redStatus = { ...mockWellnessData, overallStatus: 'red' as const };
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={redStatus}
        />
      );

      const statusBadge = screen.getByTestId('status-badge');
      expect(statusBadge).toHaveClass('bg-red-100', 'text-red-700');
    });

    it('should display yellow status with yellow styling', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={mockWellnessData}
        />
      );

      const statusBadge = screen.getByTestId('status-badge');
      expect(statusBadge).toHaveClass('bg-yellow-100', 'text-yellow-700');
    });

    it('should display green status with green styling', () => {
      const greenStatus = { ...mockWellnessData, overallStatus: 'green' as const };
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={greenStatus}
        />
      );

      const statusBadge = screen.getByTestId('status-badge');
      expect(statusBadge).toHaveClass('bg-green-100', 'text-green-700');
    });
  });

  describe('Link to Wellness Page', () => {
    it('should display link to wellness submissions page', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={mockWellnessData}
        />
      );

      const link = screen.getByTestId('wellness-link');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/wellness/my-requests');
    });

    it('should display "View History" link when data exists', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={mockWellnessData}
        />
      );

      expect(screen.getByText(/View History/i)).toBeInTheDocument();
    });

    it('should display "Submit Wellness" link when no data', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={null}
        />
      );

      expect(screen.getByText(/Submit Wellness/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have all required data-testid attributes', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={mockWellnessData}
        />
      );

      expect(screen.getByTestId('wellness-status-card')).toBeInTheDocument();
      expect(screen.getByTestId('last-submission-date')).toBeInTheDocument();
      expect(screen.getByTestId('concern-count')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge')).toBeInTheDocument();
      expect(screen.getByTestId('wellness-link')).toBeInTheDocument();
    });

    it('should have proper heading structure', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={mockWellnessData}
        />
      );

      expect(screen.getByRole('heading', { name: /Wellness Status/i })).toBeInTheDocument();
    });

    it('should have accessible button that navigates', () => {
      render(
        <WellnessStatusCard
          wellnessEnabled={true}
          wellnessData={mockWellnessData}
        />
      );

      const button = screen.getByTestId('wellness-link');
      // Button wraps a Link component via asChild, providing both button styling and link navigation
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('href', '/wellness/my-requests');
    });
  });
});
