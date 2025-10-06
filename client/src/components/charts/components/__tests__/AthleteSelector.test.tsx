/**
 * Comprehensive tests for AthleteSelector component
 *
 * Tests cover collapsible/non-collapsible modes, checkbox interactions,
 * Select All/Clear All with maxAthletes limits, and accessibility features.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AthleteSelector } from '../AthleteSelector';

describe('AthleteSelector', () => {
  const mockAthletes = [
    { id: 'athlete1', name: 'John Doe', color: 0 },
    { id: 'athlete2', name: 'Jane Smith', color: 1 },
    { id: 'athlete3', name: 'Bob Johnson', color: 2 },
    { id: 'athlete4', name: 'Alice Williams', color: 3 },
    { id: 'athlete5', name: 'Charlie Brown', color: 4 }
  ];

  const mockAthleteToggles = {
    athlete1: true,
    athlete2: true,
    athlete3: false,
    athlete4: false,
    athlete5: false
  };

  const mockHandlers = {
    onToggleAthlete: vi.fn(),
    onSelectAll: vi.fn(),
    onClearAll: vi.fn(),
    onToggleGroupAverage: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Non-Collapsible Mode (Default)', () => {
    it('should render all athletes with checkboxes', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      // All athlete names should be visible
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
      expect(screen.getByText('Alice Williams')).toBeInTheDocument();
      expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    });

    it('should display correct selection count', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      expect(screen.getByText(/2 of 5 visible/)).toBeInTheDocument();
    });

    it('should call onToggleAthlete when checkbox is clicked', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      const checkbox = screen.getByLabelText('Toggle John Doe selection');
      fireEvent.click(checkbox);

      expect(mockHandlers.onToggleAthlete).toHaveBeenCalledWith('athlete1');
    });

    it('should call onSelectAll when Select All button is clicked', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      const selectAllButton = screen.getByRole('button', { name: /select all/i });
      fireEvent.click(selectAllButton);

      expect(mockHandlers.onSelectAll).toHaveBeenCalled();
    });

    it('should call onClearAll when Clear All button is clicked', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      const clearAllButton = screen.getByRole('button', { name: /clear all/i });
      fireEvent.click(clearAllButton);

      expect(mockHandlers.onClearAll).toHaveBeenCalled();
    });

    it('should disable Select All button when all athletes are selected', () => {
      const allSelectedToggles = {
        athlete1: true,
        athlete2: true,
        athlete3: true,
        athlete4: true,
        athlete5: true
      };

      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={allSelectedToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      const selectAllButton = screen.getByRole('button', { name: /select all/i });
      expect(selectAllButton).toBeDisabled();
    });

    it('should disable Clear All button when no athletes are selected', () => {
      const noneSelectedToggles = {
        athlete1: false,
        athlete2: false,
        athlete3: false,
        athlete4: false,
        athlete5: false
      };

      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={noneSelectedToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      const clearAllButton = screen.getByRole('button', { name: /clear all/i });
      expect(clearAllButton).toBeDisabled();
    });
  });

  describe('Collapsible Mode', () => {
    it('should render collapsed by default when collapsible and defaultCollapsed are true', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
          collapsible={true}
          defaultCollapsed={true}
        />
      );

      // Athlete checkboxes should not be visible
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();

      // But the toggle button should be visible
      expect(screen.getByText(/Select Athletes/)).toBeInTheDocument();
      expect(screen.getByText(/2 of 5 selected/)).toBeInTheDocument();
    });

    it('should expand when toggle button is clicked', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
          collapsible={true}
          defaultCollapsed={true}
        />
      );

      // Initially collapsed
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();

      // Click toggle button
      const toggleButton = screen.getByRole('button', { name: /Select Athletes/i });
      fireEvent.click(toggleButton);

      // Now expanded - athletes should be visible
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('should collapse when toggle button is clicked again', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
          collapsible={true}
          defaultCollapsed={true}
        />
      );

      const toggleButton = screen.getByRole('button', { name: /Select Athletes/i });

      // Expand
      fireEvent.click(toggleButton);
      expect(screen.getByText('John Doe')).toBeInTheDocument();

      // Collapse
      fireEvent.click(toggleButton);
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });

    it('should have correct ARIA attributes for collapsible', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
          collapsible={true}
          defaultCollapsed={true}
        />
      );

      const toggleButton = screen.getByRole('button', { name: /Select Athletes/i });

      // Initially collapsed
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
      expect(toggleButton).toHaveAttribute('aria-controls', 'athlete-selector-content');

      // After expanding
      fireEvent.click(toggleButton);
      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('maxAthletes Limit', () => {
    it('should display maxAthletes in selection text when provided', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
          maxAthletes={3}
        />
      );

      expect(screen.getByText(/max 3/)).toBeInTheDocument();
    });

    it('should show "Select 3" instead of "Select All" when maxAthletes < total athletes', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
          maxAthletes={3}
        />
      );

      // Check by aria-label/title instead of button text
      expect(screen.getByRole('button', { name: /Select up to 3 athletes/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Select all athletes/i })).not.toBeInTheDocument();
    });

    it('should disable Select button when maxAthletes is reached', () => {
      const maxSelectedToggles = {
        athlete1: true,
        athlete2: true,
        athlete3: true,
        athlete4: false,
        athlete5: false
      };

      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={maxSelectedToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
          maxAthletes={3}
        />
      );

      const selectButton = screen.getByRole('button', { name: /Select up to 3 athletes/i });
      expect(selectButton).toBeDisabled();
    });
  });

  describe('Group Average Toggle', () => {
    it('should render group average toggle when enabled', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          showGroupAverage={true}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
          onToggleGroupAverage={mockHandlers.onToggleGroupAverage}
        />
      );

      expect(screen.getByLabelText('Toggle group average trend line')).toBeInTheDocument();
      expect(screen.getByText('Group Average Trend')).toBeInTheDocument();
    });

    it('should not render group average toggle when not provided', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      expect(screen.queryByText('Group Average Trend')).not.toBeInTheDocument();
    });

    it('should call onToggleGroupAverage when group average checkbox is clicked', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          showGroupAverage={false}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
          onToggleGroupAverage={mockHandlers.onToggleGroupAverage}
        />
      );

      const groupAvgCheckbox = screen.getByLabelText('Toggle group average trend line');
      fireEvent.click(groupAvgCheckbox);

      expect(mockHandlers.onToggleGroupAverage).toHaveBeenCalledWith(true);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on checkboxes', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      expect(screen.getByLabelText('Toggle John Doe selection')).toBeInTheDocument();
      expect(screen.getByLabelText('Toggle Jane Smith selection')).toBeInTheDocument();
    });

    it('should have role="img" on color indicators', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      const colorIndicator = screen.getByLabelText('Color indicator for John Doe');
      expect(colorIndicator).toHaveAttribute('role', 'img');
    });

    it('should have proper button ARIA labels', () => {
      render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      expect(screen.getByLabelText(/Select all athletes/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Clear all athlete selections')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty athletes array', () => {
      render(
        <AthleteSelector
          athletes={[]}
          athleteToggles={{}}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      expect(screen.getByText(/0 of 0 visible/)).toBeInTheDocument();
    });

    it('should handle single athlete', () => {
      const singleAthlete = [{ id: 'athlete1', name: 'John Doe', color: 0 }];
      const singleToggle = { athlete1: true };

      render(
        <AthleteSelector
          athletes={singleAthlete}
          athleteToggles={singleToggle}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
        />
      );

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText(/1 of 1 visible/)).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <AthleteSelector
          athletes={mockAthletes}
          athleteToggles={mockAthleteToggles}
          onToggleAthlete={mockHandlers.onToggleAthlete}
          onSelectAll={mockHandlers.onSelectAll}
          onClearAll={mockHandlers.onClearAll}
          className="custom-class"
        />
      );

      const element = container.querySelector('.custom-class');
      expect(element).toBeInTheDocument();
    });
  });
});
