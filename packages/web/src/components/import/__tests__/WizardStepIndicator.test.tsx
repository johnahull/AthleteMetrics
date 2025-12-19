/**
 * Tests for WizardStepIndicator component
 *
 * This component displays the progress through the wizard:
 * - Shows step circles with numbers or checkmarks
 * - Highlights current step
 * - Shows connecting lines between steps
 * - Different labels for athletes vs measurements flow
 * - Mobile view shows simplified text indicator
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WizardStepIndicator } from '../WizardStepIndicator';

describe('WizardStepIndicator', () => {
  // Mock matchMedia for responsive tests
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  describe('Athletes Flow (3 steps)', () => {
    it('should display 3 steps for athletes import', () => {
      render(
        <WizardStepIndicator
          currentStep={1}
          totalSteps={3}
          importType="athletes"
        />
      );

      expect(screen.getByText('Select Type')).toBeInTheDocument();
      expect(screen.getByText('Select Teams')).toBeInTheDocument();
      expect(screen.getByText('Preview Template')).toBeInTheDocument();
    });

    it('should highlight current step', () => {
      render(
        <WizardStepIndicator
          currentStep={2}
          totalSteps={3}
          importType="athletes"
        />
      );

      // Current step label should have primary color
      const selectTeamsLabel = screen.getByText('Select Teams');
      expect(selectTeamsLabel.className).toContain('text-primary');
    });

    it('should show checkmark for completed steps', () => {
      const { container } = render(
        <WizardStepIndicator
          currentStep={2}
          totalSteps={3}
          importType="athletes"
        />
      );

      // Step 1 should show checkmark (completed)
      // The Check icon from lucide-react renders as an SVG
      const checkIcons = container.querySelectorAll('svg.lucide-check');
      expect(checkIcons.length).toBe(1);
    });

    it('should show step number for current and future steps', () => {
      render(
        <WizardStepIndicator
          currentStep={2}
          totalSteps={3}
          importType="athletes"
        />
      );

      // Step 2 (current) and step 3 (future) should show numbers
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  describe('Measurements Flow (4 steps)', () => {
    it('should display 4 steps for measurements import', () => {
      render(
        <WizardStepIndicator
          currentStep={1}
          totalSteps={4}
          importType="measurements"
        />
      );

      expect(screen.getByText('Select Type')).toBeInTheDocument();
      expect(screen.getByText('Select Teams')).toBeInTheDocument();
      expect(screen.getByText('Select Metrics')).toBeInTheDocument();
      expect(screen.getByText('Preview Template')).toBeInTheDocument();
    });

    it('should include Select Metrics step for measurements', () => {
      render(
        <WizardStepIndicator
          currentStep={3}
          totalSteps={4}
          importType="measurements"
        />
      );

      expect(screen.getByText('Select Metrics')).toBeInTheDocument();
    });
  });

  describe('Mobile View', () => {
    it('should show simplified text indicator for mobile', () => {
      render(
        <WizardStepIndicator
          currentStep={2}
          totalSteps={3}
          importType="athletes"
        />
      );

      // Mobile view shows "Step X of Y: Label" text
      expect(screen.getByText('Step 2 of 3: Select Teams')).toBeInTheDocument();
    });
  });

  describe('Step States', () => {
    it('should apply correct styling to completed steps', () => {
      const { container } = render(
        <WizardStepIndicator
          currentStep={3}
          totalSteps={3}
          importType="athletes"
        />
      );

      // All step circles before current should have primary background
      const circles = container.querySelectorAll('.rounded-full');

      // Steps 1 and 2 are completed, step 3 is current
      // All should have primary background
      circles.forEach((circle, index) => {
        if (index < 2) {
          // Completed steps
          expect(circle.className).toContain('bg-primary');
        }
      });
    });

    it('should apply ring styling to current step', () => {
      const { container } = render(
        <WizardStepIndicator
          currentStep={2}
          totalSteps={3}
          importType="athletes"
        />
      );

      // Current step should have ring-4 styling
      const circles = container.querySelectorAll('.rounded-full');
      const currentCircle = circles[1]; // Second step (index 1)
      expect(currentCircle.className).toContain('ring-4');
    });

    it('should apply muted styling to future steps', () => {
      const { container } = render(
        <WizardStepIndicator
          currentStep={1}
          totalSteps={3}
          importType="athletes"
        />
      );

      // Future steps should have muted background
      const circles = container.querySelectorAll('.rounded-full');
      // Steps 2 and 3 are future
      expect(circles[1].className).toContain('bg-muted');
      expect(circles[2].className).toContain('bg-muted');
    });
  });

  describe('Connector Lines', () => {
    it('should render connector lines between steps', () => {
      const { container } = render(
        <WizardStepIndicator
          currentStep={2}
          totalSteps={3}
          importType="athletes"
        />
      );

      // Should have 2 connector lines for 3 steps
      const connectors = container.querySelectorAll('.h-1.flex-1');
      expect(connectors.length).toBe(2);
    });

    it('should apply primary color to completed connector lines', () => {
      const { container } = render(
        <WizardStepIndicator
          currentStep={3}
          totalSteps={3}
          importType="athletes"
        />
      );

      // All connectors should be primary (all steps completed except current)
      const connectors = container.querySelectorAll('.h-1.flex-1');
      connectors.forEach((connector) => {
        expect(connector.className).toContain('bg-primary');
      });
    });

    it('should apply muted color to future connector lines', () => {
      const { container } = render(
        <WizardStepIndicator
          currentStep={1}
          totalSteps={3}
          importType="athletes"
        />
      );

      // All connectors should be muted (no steps completed yet)
      const connectors = container.querySelectorAll('.h-1.flex-1');
      connectors.forEach((connector) => {
        expect(connector.className).toContain('bg-muted');
      });
    });
  });
});
