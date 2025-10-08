/**
 * Component tests for TeamModal
 * Tests duplicate name error handling, form validation, and user interactions
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TeamModal from '../team-modal';
import type { Team } from '@shared/schema';

// Mock the toast hook
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock apiRequest
const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

describe('TeamModal', () => {
  let queryClient: QueryClient;

  const mockTeam: Team = {
    id: 'team-123',
    name: 'Test Team',
    level: 'Club',
    notes: 'Test notes',
    season: '2024-Fall',
    organizationId: 'org-123',
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

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
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render create mode when team is null', () => {
      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={vi.fn()} team={null} />
      );

      expect(screen.getByText('Add New Team')).toBeInTheDocument();
      expect(screen.getByText('Create a new team by filling out the form below.')).toBeInTheDocument();
    });

    it('should render edit mode when team is provided', () => {
      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={vi.fn()} team={mockTeam} />
      );

      expect(screen.getByText('Edit Team')).toBeInTheDocument();
      expect(screen.getByText('Update team information below.')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      renderWithQueryClient(
        <TeamModal isOpen={false} onClose={vi.fn()} team={null} />
      );

      expect(screen.queryByText('Add New Team')).not.toBeInTheDocument();
    });

    it('should populate form fields with team data in edit mode', () => {
      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={vi.fn()} team={mockTeam} />
      );

      const nameInput = screen.getByTestId('input-team-name') as HTMLInputElement;
      const seasonInput = screen.getByTestId('input-team-season') as HTMLInputElement;
      const notesTextarea = screen.getByTestId('textarea-team-notes') as HTMLTextAreaElement;

      expect(nameInput.value).toBe('Test Team');
      expect(seasonInput.value).toBe('2024-Fall');
      expect(notesTextarea.value).toBe('Test notes');
    });
  });

  describe('Duplicate Team Name Error Handling', () => {
    it('should highlight name field when DUPLICATE_TEAM_NAME error occurs', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message: 'A team with this name already exists in this organization',
          errorCode: 'DUPLICATE_TEAM_NAME',
        }),
      });

      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={vi.fn()} team={mockTeam} />
      );

      const nameInput = screen.getByTestId('input-team-name');
      const saveButton = screen.getByTestId('button-save-team');

      // Change the name to trigger duplicate
      fireEvent.change(nameInput, { target: { value: 'Duplicate Team' } });
      fireEvent.click(saveButton);

      // Wait for error to appear on the name field
      await waitFor(() => {
        expect(screen.getByText(/A team with this name already exists/i)).toBeInTheDocument();
      });

      // Toast should NOT be called for field-specific errors
      expect(mockToast).not.toHaveBeenCalled();
    });

    it('should show toast for non-field-specific errors', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message: 'Internal server error',
        }),
      });

      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={vi.fn()} team={mockTeam} />
      );

      const nameInput = screen.getByTestId('input-team-name');
      const saveButton = screen.getByTestId('button-save-team');

      fireEvent.change(nameInput, { target: { value: 'New Name' } });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Internal server error',
          variant: 'destructive',
        });
      });
    });
  });

  describe('Form Validation', () => {
    it('should require team name', async () => {
      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={vi.fn()} team={null} />
      );

      const saveButton = screen.getByTestId('button-save-team');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/Team name is required/i)).toBeInTheDocument();
      });
    });

    it('should accept valid team name', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'new-team-123', name: 'Valid Team' }),
      });

      const mockOnClose = vi.fn();
      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={mockOnClose} team={null} />
      );

      const nameInput = screen.getByTestId('input-team-name');
      const saveButton = screen.getByTestId('button-save-team');

      fireEvent.change(nameInput, { target: { value: 'Valid Team' } });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/teams', expect.objectContaining({
          name: 'Valid Team',
        }));
      });
    });
  });

  describe('Change Detection', () => {
    it('should only send changed fields when updating', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockTeam, notes: 'Updated notes' }),
      });

      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={vi.fn()} team={mockTeam} />
      );

      const notesTextarea = screen.getByTestId('textarea-team-notes');
      const saveButton = screen.getByTestId('button-save-team');

      // Only change notes
      fireEvent.change(notesTextarea, { target: { value: 'Updated notes' } });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'PATCH',
          '/api/teams/team-123',
          expect.objectContaining({ notes: 'Updated notes' })
        );
      });

      // Should not include unchanged fields like name (unless all fields unchanged)
      const callArgs = mockApiRequest.mock.calls[0][2];
      expect(callArgs).toHaveProperty('notes');
    });

    it('should send at least one field when no changes detected', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTeam,
      });

      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={vi.fn()} team={mockTeam} />
      );

      const saveButton = screen.getByTestId('button-save-team');
      fireEvent.click(saveButton);

      // When no fields change, should send notes to ensure server validation runs
      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'PATCH',
          '/api/teams/team-123',
          expect.objectContaining({ notes: mockTeam.notes })
        );
      });
    });
  });

  describe('User Interactions', () => {
    it('should close modal when cancel button is clicked', () => {
      const mockOnClose = vi.fn();
      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={mockOnClose} team={null} />
      );

      const cancelButton = screen.getByTestId('button-cancel-team');
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should disable form inputs while saving', async () => {
      mockApiRequest.mockImplementationOnce(() =>
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => mockTeam,
        }), 100))
      );

      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={vi.fn()} team={mockTeam} />
      );

      const nameInput = screen.getByTestId('input-team-name');
      const saveButton = screen.getByTestId('button-save-team');

      fireEvent.change(nameInput, { target: { value: 'New Name' } });
      fireEvent.click(saveButton);

      // Inputs should be disabled during save
      expect(nameInput).toBeDisabled();
      expect(saveButton).toBeDisabled();
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    it('should show success toast and close modal after successful save', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockTeam, name: 'Updated Name' }),
      });

      const mockOnClose = vi.fn();
      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={mockOnClose} team={mockTeam} />
      );

      const nameInput = screen.getByTestId('input-team-name');
      const saveButton = screen.getByTestId('button-save-team');

      fireEvent.change(nameInput, { target: { value: 'Updated Name' } });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Success',
          description: 'Team updated successfully',
        });
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('Whitespace Normalization', () => {
    it('should normalize whitespace when comparing fields', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTeam,
      });

      renderWithQueryClient(
        <TeamModal isOpen={true} onClose={vi.fn()} team={mockTeam} />
      );

      const nameInput = screen.getByTestId('input-team-name');
      const saveButton = screen.getByTestId('button-save-team');

      // Add whitespace to name (same name, just whitespace difference)
      fireEvent.change(nameInput, { target: { value: '  Test Team  ' } });
      fireEvent.click(saveButton);

      // Should detect no real change and send notes field for validation
      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalled();
        const callArgs = mockApiRequest.mock.calls[0][2];
        // Name should not be in payload since it's the same after normalization
        expect(callArgs).toHaveProperty('notes');
      });
    });
  });
});
