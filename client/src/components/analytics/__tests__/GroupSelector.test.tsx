/**
 * Unit tests for GroupSelector component
 * Tests group creation, selection, and accessibility features
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroupSelector } from '../GroupSelector';
import type { GroupDefinition } from '@shared/analytics-types';

// Mock Radix UI Tabs to work properly in test environment
vi.mock('@radix-ui/react-tabs', () => ({
  Root: ({ children, defaultValue, ...props }: any) => {
    const [value, setValue] = React.useState(defaultValue);
    return (
      <div {...props} data-radix-tabs-root="">
        {React.Children.map(children, child =>
          React.isValidElement(child)
            ? React.cloneElement(child as any, { value, onValueChange: setValue })
            : child
        )}
      </div>
    );
  },
  List: ({ children, ...props }: any) => (
    <div role="tablist" {...props}>
      {children}
    </div>
  ),
  Trigger: ({ children, value: triggerValue, ...props }: any) => {
    const parentProps = (props as any).value !== undefined ? props : {};
    const currentValue = parentProps.value;
    const onValueChange = parentProps.onValueChange;

    return (
      <button
        role="tab"
        aria-selected={currentValue === triggerValue}
        onClick={() => onValueChange?.(triggerValue)}
        {...props}
      >
        {children}
      </button>
    );
  },
  Content: ({ children, value: contentValue, ...props }: any) => {
    const parentProps = (props as any).value !== undefined ? props : {};
    const currentValue = parentProps.value;

    if (currentValue !== contentValue) return null;

    return (
      <div role="tabpanel" {...props}>
        {children}
      </div>
    );
  },
}))

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

      // Team A has 3 athletes, Team B has 2 - use getAllByText since multiple sections may show counts
      const teamAElements = screen.getAllByText(/Team A/);
      const teamBElements = screen.getAllByText(/Team B/);

      // Find the label that contains athlete count for Team A
      const teamALabel = teamAElements.find(el => el.textContent?.includes('3 athlete'));
      const teamBLabel = teamBElements.find(el => el.textContent?.includes('2 athlete'));

      expect(teamALabel).toBeDefined();
      expect(teamBLabel).toBeDefined();
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
    it('should generate age ranges from athlete data', async () => {
      const { getByRole, findByText } = render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      // Switch to age groups tab
      const ageTab = getByRole('tab', { name: /Create groups by age ranges/i });
      fireEvent.click(ageTab);

      // Age ranges: 15-16, 17-18 - use findByText for async rendering
      expect(await findByText(/15-16/)).toBeInTheDocument();
      expect(await findByText(/17-18/)).toBeInTheDocument();
    });

    it('should handle age range selection', async () => {
      const { getByRole, findByRole } = render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const ageTab = getByRole('tab', { name: /Create groups by age ranges/i });
      fireEvent.click(ageTab);

      const ageCheckbox = await findByRole('checkbox', { name: /15-16/i });
      fireEvent.click(ageCheckbox);

      expect(mockOnGroupSelectionChange).toHaveBeenCalledTimes(1);
      const calledGroups = mockOnGroupSelectionChange.mock.calls[0][0];
      expect(calledGroups[0].type).toBe('age');
    });
  });

  describe('Custom Group Creation', () => {
    it('should allow custom group name input', async () => {
      const { getByRole, findByLabelText } = render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const customTab = getByRole('tab', { name: /Create custom groups/i });
      fireEvent.click(customTab);

      const nameInput = await findByLabelText(/Group Name/i);
      fireEvent.change(nameInput, { target: { value: 'My Custom Group' } });

      expect(nameInput).toHaveValue('My Custom Group');
    });

    it('should display validation error when creating group without name', async () => {
      const { getByRole, findByRole } = render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const customTab = getByRole('tab', { name: /Create custom groups/i });
      fireEvent.click(customTab);

      const createButton = await findByRole('button', { name: /Create Custom Group/i });

      // Button should be disabled when name is empty
      expect(createButton).toBeDisabled();
    });

    it('should display validation error when creating group without athletes', async () => {
      const { getByRole, findByLabelText, findByRole } = render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const customTab = getByRole('tab', { name: /Create custom groups/i });
      fireEvent.click(customTab);

      const nameInput = await findByLabelText(/Group Name/i);
      fireEvent.change(nameInput, { target: { value: 'My Group' } });

      const createButton = await findByRole('button', { name: /Create Custom Group/i });

      // Button should be disabled when no athletes are selected
      expect(createButton).toBeDisabled();
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
      const { container } = render(
        <GroupSelector
          organizationId="org-1"
          athletes={mockAthletes}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
          isLoading={true}
        />
      );

      // Look for the Loader2 icon by class name (Lucide icons have specific classes)
      const loadingIcon = container.querySelector('.animate-spin');
      expect(loadingIcon).toBeInTheDocument();
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

    it('should handle athletes without age information', async () => {
      const athletesWithoutAges = [
        { id: 'athlete-1', name: 'John Doe', team: 'Team A' },
        { id: 'athlete-2', name: 'Jane Smith', team: 'Team A' }
      ];

      const { getByRole, findByText } = render(
        <GroupSelector
          organizationId="org-1"
          athletes={athletesWithoutAges}
          selectedGroups={[]}
          onGroupSelectionChange={mockOnGroupSelectionChange}
        />
      );

      const ageTab = getByRole('tab', { name: /Create groups by age ranges/i });
      fireEvent.click(ageTab);

      expect(await findByText(/No age data available/i)).toBeInTheDocument();
    });
  });
});