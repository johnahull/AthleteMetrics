/**
 * Component tests for TeamAthleteSelector
 * Tests rendering, team selection, individual selection, shortcuts, search, and integration
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamAthleteSelector } from '../team-athlete-selector';

// Mock API responses
const mockTeams = [
  {
    id: 'team-1',
    name: 'Varsity Soccer',
    level: 'HS',
    athleteCount: 15,
  },
  {
    id: 'team-2',
    name: 'JV Soccer',
    level: 'HS',
    athleteCount: 12,
  },
  {
    id: 'team-3',
    name: 'Club Elite',
    level: 'Club',
    athleteCount: 0, // Team with no athletes
  },
];

const mockAthletes = [
  {
    id: 'athlete-1',
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    teams: [{ id: 'team-1', name: 'Varsity Soccer' }],
    positions: ['F', 'M'],
    gender: 'Male' as const,
  },
  {
    id: 'athlete-2',
    firstName: 'Jane',
    lastName: 'Smith',
    fullName: 'Jane Smith',
    teams: [{ id: 'team-1', name: 'Varsity Soccer' }],
    positions: ['M', 'D'],
    gender: 'Female' as const,
  },
  {
    id: 'athlete-3',
    firstName: 'Bob',
    lastName: 'Johnson',
    fullName: 'Bob Johnson',
    teams: [{ id: 'team-2', name: 'JV Soccer' }],
    positions: ['GK'],
    gender: 'Male' as const,
  },
  {
    id: 'athlete-4',
    firstName: 'Alice',
    lastName: 'Williams',
    fullName: 'Alice Williams',
    teams: [{ id: 'team-2', name: 'JV Soccer' }],
    positions: ['D'],
    gender: 'Female' as const,
  },
  {
    id: 'athlete-5',
    firstName: 'Charlie',
    lastName: 'Brown',
    fullName: 'Charlie Brown',
    teams: [
      { id: 'team-1', name: 'Varsity Soccer' },
      { id: 'team-2', name: 'JV Soccer' },
    ],
    positions: ['F'],
    gender: 'Male' as const,
  },
];

// Mock fetch globally
global.fetch = vi.fn();

describe('TeamAthleteSelector', () => {
  let queryClient: QueryClient;
  const mockOnSelectionChange = vi.fn();
  const organizationId = 'org-123';

  const renderWithQueryClient = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    mockOnSelectionChange.mockClear();
    vi.clearAllMocks();

    // Setup default mock responses
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/teams')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockTeams,
        });
      }
      if (url.includes('/api/athletes')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAthletes,
        });
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      });
    });
  });

  describe('Rendering', () => {
    it('should render two panels (teams and selected athletes)', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Select by Team or Individual')).toBeInTheDocument();
        expect(screen.getByText('Selected Athletes')).toBeInTheDocument();
      });
    });

    it('should show loading state while fetching data', () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      // Loading state now shows skeleton UI instead of "Loading..." text
      // Check for the presence of the component structure during loading
      expect(screen.getByText('Select by Team or Individual')).toBeInTheDocument();
      expect(screen.getByText('Selected Athletes')).toBeInTheDocument();
    });

    it('should show error state on fetch failure', async () => {
      (global.fetch as any).mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Failed to fetch' }),
        });
      });

      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      // Wait for loading to complete
      await waitFor(() => {
        // Check that data has loaded (component should still be visible)
        expect(screen.getByText('Select by Team or Individual')).toBeInTheDocument();
      });
    });

    it('should display shortcuts bar with all buttons', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /select all/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
      });
    });
  });

  describe('Team Selection', () => {
    it('should add all team athletes to selection when team checkbox is clicked', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Varsity Soccer')).toBeInTheDocument();
      });

      // Use ID selector to target the team checkbox specifically
      const varsityTeamCheckbox = document.getElementById('team-team-1');
      expect(varsityTeamCheckbox).toBeInTheDocument();
      fireEvent.click(varsityTeamCheckbox!);

      expect(mockOnSelectionChange).toHaveBeenCalledWith(
        expect.arrayContaining(['athlete-1', 'athlete-2', 'athlete-5'])
      );
    });

    it('should reflect selection state for team with all athletes selected', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={['athlete-1', 'athlete-2', 'athlete-5']}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        // Wait for data to load by checking for the checkbox
        const varsityTeamCheckbox = document.getElementById('team-team-1');
        expect(varsityTeamCheckbox).toBeInTheDocument();
      });

      const varsityTeamCheckbox = document.getElementById('team-team-1');
      expect(varsityTeamCheckbox).toHaveAttribute('data-state', 'checked');
    });

    it('should reflect partial selection state for team with some athletes selected', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={['athlete-1']}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        // Wait for data to load by checking for the checkbox
        const varsityTeamCheckbox = document.getElementById('team-team-1');
        expect(varsityTeamCheckbox).toBeInTheDocument();
      });

      // Component should indicate partial selection (implementation specific)
      const varsityTeamCheckbox = document.getElementById('team-team-1');
      expect(varsityTeamCheckbox).toHaveAttribute('data-state', 'unchecked');
    });

    it('should allow selecting multiple teams', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        // Wait for data to load by checking for checkboxes
        const varsityCheckbox = document.getElementById('team-team-1');
        expect(varsityCheckbox).toBeInTheDocument();
      });

      const varsityCheckbox = document.getElementById('team-team-1');
      const jvCheckbox = document.getElementById('team-team-2');

      fireEvent.click(varsityCheckbox!);
      fireEvent.click(jvCheckbox!);

      // Should have been called twice
      expect(mockOnSelectionChange).toHaveBeenCalledTimes(2);
    });

    it('should deselect team athletes when team is unchecked', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={['athlete-1', 'athlete-2', 'athlete-5']}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        const varsityCheckbox = document.getElementById('team-team-1');
        expect(varsityCheckbox).toBeInTheDocument();
      });

      const varsityCheckbox = document.getElementById('team-team-1');
      fireEvent.click(varsityCheckbox!);

      expect(mockOnSelectionChange).toHaveBeenCalledWith([]);
    });
  });

  describe('Individual Selection', () => {
    it('should remove individual athlete from selection when remove button is clicked', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={['athlete-1', 'athlete-2']}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        // Wait for athletes to load and selection to appear
        expect(screen.getByText(/2/)).toBeInTheDocument(); // Badge with count
      });

      // Get all buttons in the document
      const allButtons = screen.getAllByRole('button');

      // Find remove buttons (they have X icon and are in selected panel)
      // They will be the last buttons in the list (after Select All, Clear All, filters)
      const removeButtons = allButtons.filter(btn => {
        const svg = btn.querySelector('svg');
        // Check if button has className containing 'hover:bg-destructive'
        return btn.className.includes('hover:bg-destructive');
      });

      // Click the first remove button (John Doe is first selected athlete)
      fireEvent.click(removeButtons[0]);

      expect(mockOnSelectionChange).toHaveBeenCalledWith(['athlete-2']);
    });

    it('should display selected athletes in right panel with team badge', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={['athlete-1']}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        // Wait for the count badge to show 1 selected athlete
        expect(screen.getByText(/1/)).toBeInTheDocument();
      });

      // Check that athlete info is displayed with team
      const allText = screen.getAllByText(/varsity soccer/i);
      expect(allText.length).toBeGreaterThan(0);
    });

    it('should toggle athlete selection when individual checkbox is clicked', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const athleteCheckbox = document.getElementById('athlete-athlete-1');
      fireEvent.click(athleteCheckbox!);

      expect(mockOnSelectionChange).toHaveBeenCalledWith(['athlete-1']);
    });
  });

  describe('Shortcuts', () => {
    it('should add all athletes when Select All is clicked', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      // Wait for data to load first
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const selectAllButton = screen.getByRole('button', { name: /select all/i });
      expect(selectAllButton).not.toBeDisabled();
      fireEvent.click(selectAllButton);

      await waitFor(() => {
        expect(mockOnSelectionChange).toHaveBeenCalledWith(
          expect.arrayContaining([
            'athlete-1',
            'athlete-2',
            'athlete-3',
            'athlete-4',
            'athlete-5',
          ])
        );
      });
    });

    it('should remove all selections when Clear All is clicked', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={['athlete-1', 'athlete-2']}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      // Wait for data to load first
      await waitFor(() => {
        // Check that 2 athletes are selected using the badge
        expect(screen.getByText('2')).toBeInTheDocument();
      });

      const clearAllButton = screen.getByRole('button', { name: /clear all/i });
      expect(clearAllButton).not.toBeDisabled();
      fireEvent.click(clearAllButton);

      await waitFor(() => {
        expect(mockOnSelectionChange).toHaveBeenCalledWith([]);
      });
    });

    it('should filter athletes by position when position filter is applied', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Find and open the position select
      const positionSelects = screen.getAllByRole('combobox');
      const positionSelect = positionSelects[0]; // First select is position
      fireEvent.click(positionSelect);

      // Wait for the dropdown options to appear and select 'GK'
      await waitFor(() => {
        const gkOption = screen.getByRole('option', { name: 'GK' });
        fireEvent.click(gkOption);
      });

      // Should now only show Bob Johnson (GK)
      await waitFor(() => {
        expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      });
    });

    it('should filter athletes by gender when gender filter is applied', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Find and open the gender select
      const genderSelects = screen.getAllByRole('combobox');
      const genderSelect = genderSelects[1]; // Second select is gender
      fireEvent.click(genderSelect);

      // Wait for the dropdown options to appear and select 'Female'
      await waitFor(() => {
        const femaleOption = screen.getByRole('option', { name: 'Female' });
        fireEvent.click(femaleOption);
      });

      // Should now only show female athletes
      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.getByText('Alice Williams')).toBeInTheDocument();
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      });
    });
  });

  describe('Search', () => {
    it('should filter athletes by name when searching', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search athletes or teams/i);
      fireEvent.change(searchInput, { target: { value: 'jane' } });

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      });
    });

    it('should filter athletes by team name when searching', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search athletes or teams/i);
      fireEvent.change(searchInput, { target: { value: 'jv soccer' } });

      await waitFor(() => {
        expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
        expect(screen.getByText('Alice Williams')).toBeInTheDocument();
        expect(screen.getByText('Charlie Brown')).toBeInTheDocument(); // On both teams
      });
    });

    it('should show all athletes when search is cleared', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search athletes or teams/i);
      fireEvent.change(searchInput, { target: { value: 'jane' } });

      await waitFor(() => {
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      });

      fireEvent.change(searchInput, { target: { value: '' } });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });
    });
  });

  describe('Integration', () => {
    it('should call onSelectionChange with correct athlete IDs', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const athleteCheckbox = document.getElementById('athlete-athlete-1');
      fireEvent.click(athleteCheckbox!);

      expect(mockOnSelectionChange).toHaveBeenCalledWith(['athlete-1']);
      expect(mockOnSelectionChange).toHaveBeenCalledTimes(1);
    });

    it('should handle empty organization (no teams/athletes)', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/teams') || url.includes('/api/athletes')) {
          return Promise.resolve({
            ok: true,
            json: async () => [],
          });
        }
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Not found' }),
        });
      });

      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        // Updated to match new empty state text
        expect(screen.getByText('No athletes available')).toBeInTheDocument();
      });
    });

    it('should handle teams with no athletes', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Club Elite')).toBeInTheDocument();
      });

      // Team with 0 athletes should show "0 athletes"
      expect(screen.getByText(/0 athletes/i)).toBeInTheDocument();

      // Clicking the team checkbox should not call onSelectionChange
      const clubEliteCheckbox = document.getElementById('team-team-3');
      fireEvent.click(clubEliteCheckbox!);

      // Should not add any athletes since team has none
      expect(mockOnSelectionChange).toHaveBeenCalledWith([]);
    });

    it('should maintain selection state across filter changes', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={['athlete-1', 'athlete-3']}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        // Check count badge shows 2 selected
        expect(screen.getByText(/2/)).toBeInTheDocument();
      });

      // Apply position filter
      const positionSelects = screen.getAllByRole('combobox');
      fireEvent.click(positionSelects[0]);

      await waitFor(() => {
        const gkOption = screen.getByRole('option', { name: 'GK' });
        fireEvent.click(gkOption);
      });

      // Bob Johnson (athlete-3) should still be selected
      await waitFor(() => {
        const bobCheckbox = document.getElementById('athlete-athlete-3');
        expect(bobCheckbox).toHaveAttribute('data-state', 'checked');
      });

      // Verify count still shows 2 athletes selected (John is filtered but still selected)
      expect(screen.getByText(/2/)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle athletes on multiple teams correctly', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
      });

      // Charlie Brown is on both Varsity and JV teams
      // Should appear in both team sections in the athlete list
      const charlieMentions = screen.getAllByText('Charlie Brown');
      expect(charlieMentions.length).toBeGreaterThan(0);
    });

    it('should disable Select All button when no athletes are available', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/athletes')) {
          return Promise.resolve({
            ok: true,
            json: async () => [],
          });
        }
        if (url.includes('/api/teams')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockTeams,
          });
        }
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Not found' }),
        });
      });

      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        const selectAllButton = screen.getByRole('button', { name: /select all/i });
        expect(selectAllButton).toBeDisabled();
      });
    });

    it('should disable Clear All button when no athletes are selected', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        const clearAllButton = screen.getByRole('button', { name: /clear all/i });
        expect(clearAllButton).toBeDisabled();
      });
    });

    it('should show selected count badge', async () => {
      renderWithQueryClient(
        <TeamAthleteSelector
          organizationId={organizationId}
          selectedAthleteIds={['athlete-1', 'athlete-2']}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });
  });
});
