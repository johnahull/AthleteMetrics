/**
 * Unit tests for GroupSelector component
 * Tests group creation, selection, and accessibility features
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroupSelector } from '../GroupSelector';
import type { GroupDefinition } from '@shared/analytics-types';

describe('GroupSelector', () => {
  const mockAthletes = [
    { id: 'athlete-1', name: 'John Doe', team: 'Team A', age: 16, birthYear: 2008 },
    { id: 'athlete-2', name: 'Jane Smith', team: 'Team A', age: 17, birthYear: 2007 },
    { id: 'athlete-3', name: 'Bob Johnson', team: 'Team B', age: 15, birthYear: 2009 },
    { id: 'athlete-4', name: 'Alice Williams', team: 'Team B', age: 16, birthYear: 2008 },
    { id: 'athlete-5', name: 'Charlie Brown', team: 'Team A', age: 18, birthYear: 2006 },
  ];

  const mockOnGroupSelectionChange = vi.fn();

  beforeEach(() => {
    mockOnGroupSelectionChange.mockClear();
  });

  describe('Rendering', () => {
    it('should render with empty selection', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      expect(screen.getByText(/Selected Groups \(0\/8\)/i)).toBeInTheDocument();
      expect(screen.getByText(/No groups selected/i)).toBeInTheDocument();
    });

    it('should render selected groups with correct count', () => {
      const selectedGroups: GroupDefinition[] = [
        {
          id: 'group-1',
          name: 'Team A',
          type: 'team',
          memberIds: ['athlete-1', 'athlete-2', 'athlete-5'],
          color: '#3B82F6',
          criteria: { teams: ['Team A'] }
        }
      ];

      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={selectedGroups}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      expect(screen.getByText(/Selected Groups \(1\/8\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Team A \(3 athletes\)/i)).toBeInTheDocument();
    });

    it('should render all three tabs (Teams, Age Groups, Custom)', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      expect(screen.getByRole('tab', { name: /Create groups by teams/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Create groups by age ranges/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Create custom groups/i })).toBeInTheDocument();
    });
  });

  describe('Team Selection', () => {
    it('should extract and display unique teams', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      // Check that both teams are displayed
      expect(screen.getByText(/Team A/)).toBeInTheDocument();
      expect(screen.getByText(/Team B/)).toBeInTheDocument();
    });

    it('should display correct athlete count per team', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      // Team A has 3 athletes, Team B has 2
      expect(screen.getByText(/\(3 athletes\)/)).toBeInTheDocument();
      expect(screen.getByText(/\(2 athletes\)/)).toBeInTheDocument();
    });

    it('should handle team selection via checkbox', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const teamACheckbox = screen.getByRole('checkbox', { name: /Team A/i });
      fireEvent.click(teamACheckbox);

      expect(mockOnGroupSelectionChange).toHaveBeenCalledTimes(1);
      const calledGroups = mockOnGroupSelectionChange.mock.calls[0][0];
      expect(calledGroups).toHaveLength(1);
      expect(calledGroups[0].name).toBe('Team A');
      expect(calledGroups[0].type).toBe('team');
    });

    it('should enforce max groups limit', () => {
      const maxedOutGroups: GroupDefinition[] = Array.from({ length: 3 }, (_, i) => ({
        id: `group-${i}`,
        name: `Group ${i}`,
        type: 'team' as const,
        memberIds: ['athlete-1'],
        color: '#3B82F6',
        criteria: { teams: [`Team ${i}`] }
      }));

      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={maxedOutGroups}
          onGroupSelectionChange={mockOnGroupSelectionChange}
          maxGroups={3}
        />
      );

      // Unselected checkboxes should be disabled
      const teamACheckbox = screen.getByRole('checkbox', { name: /Team A/i });
      expect(teamACheckbox).toBeDisabled();
    });
  });

  describe('Age Group Selection', () => {
    it('should generate age ranges from athlete data', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      // Switch to age groups tab
      const ageTab = screen.getByRole('tab', { name: /Create groups by age ranges/i });
      fireEvent.click(ageTab);

      // Age ranges: 15-16, 17-18
      expect(screen.getByText(/15-16/)).toBeInTheDocument();
      expect(screen.getByText(/17-18/)).toBeInTheDocument();
    });

    it('should handle age range selection', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const ageTab = screen.getByRole('tab', { name: /Create groups by age ranges/i });
      fireEvent.click(ageTab);

      const ageCheckbox = screen.getByRole('checkbox', { name: /15-16/i });
      fireEvent.click(ageCheckbox);

      expect(mockOnGroupSelectionChange).toHaveBeenCalledTimes(1);
      const calledGroups = mockOnGroupSelectionChange.mock.calls[0][0];
      expect(calledGroups[0].type).toBe('age');
    });
  });

  describe('Custom Group Creation', () => {
    it('should allow custom group name input', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const customTab = screen.getByRole('tab', { name: /Create custom groups/i });
      fireEvent.click(customTab);

      const nameInput = screen.getByLabelText(/Group Name/i);
      fireEvent.change(nameInput, { target: { value: 'My Custom Group' } });

      expect(nameInput).toHaveValue('My Custom Group');
    });

    it('should display validation error when creating group without name', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const customTab = screen.getByRole('tab', { name: /Create custom groups/i });
      fireEvent.click(customTab);

      const createButton = screen.getByRole('button', { name: /Create Group/i });
      fireEvent.click(createButton);

      expect(screen.getByText(/Please enter a group name/i)).toBeInTheDocument();
    });

    it('should display validation error when creating group without athletes', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const customTab = screen.getByRole('tab', { name: /Create custom groups/i });
      fireEvent.click(customTab);

      const nameInput = screen.getByLabelText(/Group Name/i);
      fireEvent.change(nameInput, { target: { value: 'My Group' } });

      const createButton = screen.getByRole('button', { name: /Create Group/i });
      fireEvent.click(createButton);

      expect(screen.getByText(/Please select at least one athlete/i)).toBeInTheDocument();
    });
  });

  describe('Group Removal', () => {
    it('should handle group removal', () => {
      const selectedGroups: GroupDefinition[] = [
        {
          id: 'group-1',
          name: 'Team A',
          type: 'team',
          memberIds: ['athlete-1', 'athlete-2'],
          color: '#3B82F6',
          criteria: { teams: ['Team A'] }
        }
      ];

      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={selectedGroups}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const removeButton = screen.getByRole('button', { name: /Remove Team A group/i });
      fireEvent.click(removeButton);

      expect(mockOnGroupSelectionChange).toHaveBeenCalledWith([]);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on tabs', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      expect(screen.getByRole('tablist', { name: /Group selection methods/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Create groups by teams/i })).toBeInTheDocument();
    });

    it('should have aria-live region for group selection changes', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const selectedGroupsList = screen.getByRole('list', { name: /Selected Groups/i });
      expect(selectedGroupsList).toHaveAttribute('aria-live', 'polite');
    });

    it('should have accessible remove buttons', () => {
      const selectedGroups: GroupDefinition[] = [
        {
          id: 'group-1',
          name: 'Team A',
          type: 'team',
          memberIds: ['athlete-1'],
          color: '#3B82F6',
          criteria: { teams: ['Team A'] }
        }
      ];

      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={selectedGroups}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const removeButton = screen.getByRole('button', { name: /Remove Team A group/i });
      expect(removeButton).toBeInTheDocument();
      expect(removeButton).toHaveAccessibleName('Remove Team A group');
    });
  });

  describe('Loading State', () => {
    it('should display loading state correctly', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
          isLoading={true}
        />
      );

      expect(screen.getByRole('img', { name: /loading/i, hidden: true })).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty athlete list', () => {
      render(
        <GroupSelector
          organizationId="org-1"
          athletes={[]}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      expect(screen.getByText(/No teams found/i)).toBeInTheDocument();
    });

    it('should handle athletes without team information', () => {
      const athletesWithoutTeams = [
        { id: 'athlete-1', name: 'John Doe', age: 16 },
        { id: 'athlete-2', name: 'Jane Smith', age: 17 }
      ];

      render(
        <GroupSelector
          organizationId="org-1"
          athletes={athletesWithoutTeams}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      expect(screen.getByText(/No teams found/i)).toBeInTheDocument();
    });

    it('should handle athletes without age information', () => {
      const athletesWithoutAges = [
        { id: 'athlete-1', name: 'John Doe', team: 'Team A' },
        { id: 'athlete-2', name: 'Jane Smith', team: 'Team A' }
      ];

      render(
        <GroupSelector
          organizationId="org-1"
          athletes={athletesWithoutAges}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const ageTab = screen.getByRole('tab', { name: /Create groups by age ranges/i });
      fireEvent.click(ageTab);

      expect(screen.getByText(/No athletes with age data/i)).toBeInTheDocument();
    });
  });
});