/**
 * Component tests for AthleteHomeHero
 * Tests welcome message, streak tracking, and last activity display
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AthleteHomeHero } from '@/components/athlete/AthleteHomeHero';

describe('AthleteHomeHero', () => {
  const mockAthlete = {
    id: '1',
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
  };

  describe('Welcome Message', () => {
    it('should display welcome message with first name', () => {
      render(
        <AthleteHomeHero
          athlete={mockAthlete}
          measurementCount={5}
          lastMeasurementDate={new Date('2024-01-15')}
        />
      );

      expect(screen.getByTestId('welcome-message')).toHaveTextContent('Welcome back, John!');
    });

    it('should handle athlete with no first name gracefully', () => {
      const athleteNoName = { ...mockAthlete, firstName: '' };
      render(
        <AthleteHomeHero
          athlete={athleteNoName}
          measurementCount={5}
          lastMeasurementDate={new Date('2024-01-15')}
        />
      );

      expect(screen.getByTestId('welcome-message')).toHaveTextContent('Welcome back!');
    });
  });

  describe('Streak Tracking', () => {
    it('should display measurement count for this month', () => {
      render(
        <AthleteHomeHero
          athlete={mockAthlete}
          measurementCount={5}
          lastMeasurementDate={new Date('2024-01-15')}
        />
      );

      expect(screen.getByTestId('streak-tracker')).toHaveTextContent('5 measurements this month');
    });

    it('should display singular "measurement" for count of 1', () => {
      render(
        <AthleteHomeHero
          athlete={mockAthlete}
          measurementCount={1}
          lastMeasurementDate={new Date('2024-01-15')}
        />
      );

      expect(screen.getByTestId('streak-tracker')).toHaveTextContent('1 measurement this month');
    });

    it('should display 0 measurements when count is 0', () => {
      render(
        <AthleteHomeHero
          athlete={mockAthlete}
          measurementCount={0}
          lastMeasurementDate={null}
        />
      );

      expect(screen.getByTestId('streak-tracker')).toHaveTextContent('0 measurements this month');
    });

    it('should show fire emoji for measurements', () => {
      render(
        <AthleteHomeHero
          athlete={mockAthlete}
          measurementCount={5}
          lastMeasurementDate={new Date('2024-01-15')}
        />
      );

      expect(screen.getByTestId('streak-tracker')).toHaveTextContent('🔥');
    });
  });

  describe('Last Activity', () => {
    it('should display last measured date when available', () => {
      render(
        <AthleteHomeHero
          athlete={mockAthlete}
          measurementCount={5}
          lastMeasurementDate={new Date('2024-01-15')}
        />
      );

      expect(screen.getByTestId('last-activity')).toBeInTheDocument();
      expect(screen.getByTestId('last-activity')).toHaveTextContent('Last measured:');
    });

    it('should display "Never measured" when no measurements', () => {
      render(
        <AthleteHomeHero
          athlete={mockAthlete}
          measurementCount={0}
          lastMeasurementDate={null}
        />
      );

      expect(screen.getByTestId('last-activity')).toHaveTextContent('Last measured: Never');
    });

    it('should format date as relative time for recent measurements', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      render(
        <AthleteHomeHero
          athlete={mockAthlete}
          measurementCount={5}
          lastMeasurementDate={yesterday}
        />
      );

      expect(screen.getByTestId('last-activity')).toBeInTheDocument();
    });
  });

  describe('Visual Design', () => {
    it('should render with gradient background', () => {
      const { container } = render(
        <AthleteHomeHero
          athlete={mockAthlete}
          measurementCount={5}
          lastMeasurementDate={new Date('2024-01-15')}
        />
      );

      const heroElement = container.querySelector('[data-testid="athlete-home-hero"]');
      expect(heroElement).toBeInTheDocument();
      expect(heroElement).toHaveClass('bg-gradient-to-r');
    });

    it('should have hero banner styling', () => {
      const { container } = render(
        <AthleteHomeHero
          athlete={mockAthlete}
          measurementCount={5}
          lastMeasurementDate={new Date('2024-01-15')}
        />
      );

      const heroElement = container.querySelector('[data-testid="athlete-home-hero"]');
      expect(heroElement).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have all required data-testid attributes', () => {
      render(
        <AthleteHomeHero
          athlete={mockAthlete}
          measurementCount={5}
          lastMeasurementDate={new Date('2024-01-15')}
        />
      );

      expect(screen.getByTestId('athlete-home-hero')).toBeInTheDocument();
      expect(screen.getByTestId('welcome-message')).toBeInTheDocument();
      expect(screen.getByTestId('streak-tracker')).toBeInTheDocument();
      expect(screen.getByTestId('last-activity')).toBeInTheDocument();
    });
  });
});
