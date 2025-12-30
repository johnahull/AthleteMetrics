/**
 * Tests for SelectTeamStep component
 *
 * This component is Step 2 of the Import Wizard:
 * - Fetches available teams from API
 * - Allows selecting one or more teams
 * - Provides Select All / Clear All bulk actions
 * - Shows selection count
 * - Navigation buttons (Back, Next, Cancel)
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { SelectTeamStep } from '../SelectTeamStep';

// Mock teams data
const mockTeams = [
  { id: 'team-1', name: 'Team Alpha', level: 'Varsity', organization: { id: 'org-1', name: 'School A' } },
  { id: 'team-2', name: 'Team Beta', level: 'JV', organization: { id: 'org-1', name: 'School A' } },
  { id: 'team-3', name: 'Team Gamma', level: 'Varsity', organization: { id: 'org-2', name: 'School B' } },
];

describe('SelectTeamStep', () => {
  let queryClient: QueryClient;

  const defaultProps = {
    selectedTeamIds: [],
    onNext: vi.fn(),
    onBack: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    // Mock fetch for teams
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTeams),
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderWithProviders = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SelectTeamStep {...defaultProps} {...props} />
      </QueryClientProvider>
    );
  };

  describe('Loading State', () => {
    it('should show loading spinner while fetching teams', async () => {
      // Delay the response to see loading state
      global.fetch = vi.fn().mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve(mockTeams),
          }), 100)
        )
      );

      renderWithProviders();

      expect(screen.getByText('Loading teams...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading teams...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Teams Display', () => {
    it('should display all teams after loading', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      });

      expect(screen.getByText('Team Beta')).toBeInTheDocument();
      expect(screen.getByText('Team Gamma')).toBeInTheDocument();
    });

    it('should display team details (level and organization)', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      });

      // Level and org should be shown as secondary text
      expect(screen.getByText('Varsity • School A')).toBeInTheDocument();
    });

    it('should show header with instructions', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Select Teams')).toBeInTheDocument();
      });

      expect(screen.getByText(/Choose one or more teams/)).toBeInTheDocument();
    });
  });

  describe('Team Selection', () => {
    it('should toggle team selection when checkbox clicked', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      });

      // Click the checkbox by accessible name (derived from label)
      const checkbox = screen.getByRole('checkbox', { name: /Team Alpha/ });
      fireEvent.click(checkbox);

      // Should show 1 selected
      expect(screen.getByText('1 selected')).toBeInTheDocument();

      // Click again to deselect
      fireEvent.click(checkbox);

      // Should show 0 selected
      expect(screen.getByText('0 selected')).toBeInTheDocument();
    });

    it('should toggle team selection via checkbox by id', async () => {
      const { container } = renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      });

      // Click the checkbox using the team id
      const checkbox = container.querySelector('#team-team-1');
      expect(checkbox).toBeTruthy();
      fireEvent.click(checkbox!);

      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('should initialize with preselected teams', async () => {
      renderWithProviders({ selectedTeamIds: ['team-1', 'team-2'] });

      await waitFor(() => {
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      });

      expect(screen.getByText('2 selected')).toBeInTheDocument();
    });
  });

  describe('Bulk Actions', () => {
    it('should select all teams when Select All clicked', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Select All'));

      expect(screen.getByText('3 selected')).toBeInTheDocument();
    });

    it('should disable Select All when all teams selected', async () => {
      renderWithProviders({ selectedTeamIds: ['team-1', 'team-2', 'team-3'] });

      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Select All' })).toBeDisabled();
    });

    it('should clear all selections when Clear All clicked', async () => {
      renderWithProviders({ selectedTeamIds: ['team-1', 'team-2'] });

      await waitFor(() => {
        expect(screen.getByText('Clear All')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Clear All'));

      expect(screen.getByText('0 selected')).toBeInTheDocument();
    });

    it('should disable Clear All when no teams selected', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Clear All')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Clear All' })).toBeDisabled();
    });
  });

  describe('Navigation', () => {
    it('should call onBack when Back button clicked', async () => {
      const onBack = vi.fn();
      renderWithProviders({ onBack });

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Back'));

      expect(onBack).toHaveBeenCalled();
    });

    it('should call onNext with selected team IDs when Next clicked', async () => {
      const onNext = vi.fn();
      const { container } = renderWithProviders({ onNext });

      await waitFor(() => {
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      });

      // Select a team by clicking the checkbox
      const checkbox = container.querySelector('#team-team-1');
      fireEvent.click(checkbox!);

      // Verify team is selected
      expect(screen.getByText('1 selected')).toBeInTheDocument();

      // Click Next
      fireEvent.click(screen.getByText('Next'));

      expect(onNext).toHaveBeenCalledWith(['team-1']);
    });

    it('should disable Next button when no team selected', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    });

    it('should enable Next button when at least one team selected', async () => {
      renderWithProviders({ selectedTeamIds: ['team-1'] });

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled();
    });

    it('should call onCancel when Cancel button clicked', async () => {
      const onCancel = vi.fn();
      renderWithProviders({ onCancel });

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel'));

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Failed to load teams. Please try again.')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should display message when no teams exist', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('No teams found. Please create a team first before generating import templates.')).toBeInTheDocument();
      });
    });

    it('should show Back and Cancel buttons in empty state', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument();
      });

      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });
});
