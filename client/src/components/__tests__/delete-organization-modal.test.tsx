/**
 * Component tests for DeleteOrganizationModal
 * Tests dependency count display, confirmation validation, error states, and deletion flow
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeleteOrganizationModal from '../delete-organization-modal';

// Mock useQuery
const mockUseQuery = vi.fn();
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (options: any) => mockUseQuery(options),
  };
});

describe('DeleteOrganizationModal', () => {
  let queryClient: QueryClient;

  const mockOrganization = {
    id: 'org-123',
    name: 'Test Organization',
    description: 'Test description',
    isActive: true,
  };

  const mockDependencies = {
    users: 0,
    teams: 0,
    measurements: 0,
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

    // Default mock for useQuery (successful dependency fetch)
    mockUseQuery.mockReturnValue({
      data: mockDependencies,
      isError: false,
      error: null,
      isLoading: false,
    });
  });

  afterEach(() => {
    queryClient.clear();
    queryClient.unmount();
  });

  describe('Rendering', () => {
    it('should render modal when open', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText(/Delete Organization: Test Organization/i)).toBeInTheDocument();
      // Use getAllByText since this text appears in multiple places (description and warning list)
      const undoneTexts = screen.getAllByText(/This action cannot be undone/i);
      expect(undoneTexts.length).toBeGreaterThan(0);
    });

    it('should not render when closed', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.queryByText(/Delete Organization/i)).not.toBeInTheDocument();
    });

    it('should display organization name in title', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={{ ...mockOrganization, name: 'Custom Org Name' }}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText(/Delete Organization: Custom Org Name/i)).toBeInTheDocument();
    });
  });

  describe('Dependency Count Display', () => {
    it('should display zero dependency counts for empty organization', () => {
      mockUseQuery.mockReturnValue({
        data: { users: 0, teams: 0, measurements: 0 },
        isError: false,
        error: null,
      });

      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      // Check for '0' appearing multiple times (users, teams, measurements all show 0)
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBe(3); // Should show 0 for users, teams, and measurements
      expect(screen.getByText('Users')).toBeInTheDocument();
      expect(screen.getByText('Teams')).toBeInTheDocument();
      expect(screen.getByText('Measurements')).toBeInTheDocument();
    });

    it('should display non-zero dependency counts', () => {
      mockUseQuery.mockReturnValue({
        data: { users: 5, teams: 3, measurements: 120 },
        isError: false,
        error: null,
      });

      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('120')).toBeInTheDocument();
    });

    it('should show warning when organization has dependencies', () => {
      mockUseQuery.mockReturnValue({
        data: { users: 1, teams: 0, measurements: 0 },
        isError: false,
        error: null,
      });

      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText(/Cannot Delete/i)).toBeInTheDocument();
      expect(screen.getByText(/active dependencies/i)).toBeInTheDocument();
      expect(screen.getByText(/Deactivate.*instead/i)).toBeInTheDocument();
    });

    it('should not show confirmation input when dependencies exist', () => {
      mockUseQuery.mockReturnValue({
        data: { users: 1, teams: 1, measurements: 1 },
        isError: false,
        error: null,
      });

      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.queryByPlaceholderText(mockOrganization.name)).not.toBeInTheDocument();
    });
  });

  describe('Confirmation Input Validation', () => {
    beforeEach(() => {
      // Empty organization (no dependencies)
      mockUseQuery.mockReturnValue({
        data: { users: 0, teams: 0, measurements: 0 },
        isError: false,
        error: null,
      });
    });

    it('should show confirmation input when organization has no dependencies', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByPlaceholderText(mockOrganization.name)).toBeInTheDocument();
      expect(screen.getByText(/Type.*to confirm deletion/i)).toBeInTheDocument();
    });

    it('should enable delete button when confirmation matches (exact match)', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      const input = screen.getByTestId('delete-org-confirmation-input');
      const deleteButton = screen.getByTestId('confirm-delete-org-button');

      expect(deleteButton).toBeDisabled();

      fireEvent.change(input, { target: { value: 'Test Organization' } });

      expect(deleteButton).not.toBeDisabled();
    });

    it('should enable delete button when confirmation matches (case-insensitive)', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      const input = screen.getByTestId('delete-org-confirmation-input');
      const deleteButton = screen.getByTestId('confirm-delete-org-button');

      fireEvent.change(input, { target: { value: 'test organization' } });

      expect(deleteButton).not.toBeDisabled();
    });

    it('should enable delete button when confirmation matches (with trimming)', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      const input = screen.getByTestId('delete-org-confirmation-input');
      const deleteButton = screen.getByTestId('confirm-delete-org-button');

      fireEvent.change(input, { target: { value: '  Test Organization  ' } });

      expect(deleteButton).not.toBeDisabled();
    });

    it('should disable delete button when confirmation does not match', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      const input = screen.getByTestId('delete-org-confirmation-input');
      const deleteButton = screen.getByTestId('confirm-delete-org-button');

      fireEvent.change(input, { target: { value: 'Wrong Name' } });

      expect(deleteButton).toBeDisabled();
    });

    it('should show error message for non-matching confirmation', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      const input = screen.getByTestId('delete-org-confirmation-input');

      fireEvent.change(input, { target: { value: 'Wrong' } });

      expect(screen.getByText(/Name does not match/i)).toBeInTheDocument();
    });

    it('should clear error message when confirmation matches', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      const input = screen.getByTestId('delete-org-confirmation-input');

      fireEvent.change(input, { target: { value: 'Wrong' } });
      expect(screen.getByText(/Name does not match/i)).toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'Test Organization' } });
      expect(screen.queryByText(/Name does not match/i)).not.toBeInTheDocument();
    });

    it('should reset confirmation input when modal closes and reopens', () => {
      const { rerender } = renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      const input = screen.getByTestId('delete-org-confirmation-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Test Organization' } });
      expect(input.value).toBe('Test Organization');

      // Close modal
      rerender(
        <QueryClientProvider client={queryClient}>
          <DeleteOrganizationModal
            organization={mockOrganization}
            isOpen={false}
            onClose={vi.fn()}
            onConfirm={vi.fn()}
          />
        </QueryClientProvider>
      );

      // Reopen modal
      rerender(
        <QueryClientProvider client={queryClient}>
          <DeleteOrganizationModal
            organization={mockOrganization}
            isOpen={true}
            onClose={vi.fn()}
            onConfirm={vi.fn()}
          />
        </QueryClientProvider>
      );

      const newInput = screen.getByTestId('delete-org-confirmation-input') as HTMLInputElement;
      expect(newInput.value).toBe('');
    });

    it('should reset confirmation input when organization changes', () => {
      const { rerender } = renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      const input = screen.getByTestId('delete-org-confirmation-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Test Organization' } });
      expect(input.value).toBe('Test Organization');

      // Change organization
      rerender(
        <QueryClientProvider client={queryClient}>
          <DeleteOrganizationModal
            organization={{ ...mockOrganization, id: 'org-456', name: 'New Org' }}
            isOpen={true}
            onClose={vi.fn()}
            onConfirm={vi.fn()}
          />
        </QueryClientProvider>
      );

      const newInput = screen.getByTestId('delete-org-confirmation-input') as HTMLInputElement;
      expect(newInput.value).toBe('');
    });
  });

  describe('Error States', () => {
    it('should display error when dependency fetch fails', () => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isError: true,
        error: new Error('Network error'),
      });

      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText(/Error Loading Dependencies/i)).toBeInTheDocument();
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });

    it('should disable delete button when dependency fetch fails', () => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isError: true,
        error: new Error('Failed to load'),
      });

      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      const deleteButton = screen.getByTestId('confirm-delete-org-button');
      expect(deleteButton).toBeDisabled();
    });

    it('should display generic error message when error has no message', () => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isError: true,
        error: {},
      });

      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText(/Failed to load organization dependencies/i)).toBeInTheDocument();
    });
  });

  describe('Deletion Flow', () => {
    beforeEach(() => {
      mockUseQuery.mockReturnValue({
        data: { users: 0, teams: 0, measurements: 0 },
        isError: false,
        error: null,
      });
    });

    it('should call onConfirm with confirmation name when delete button clicked', async () => {
      const mockOnConfirm = vi.fn();

      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={mockOnConfirm}
        />
      );

      const input = screen.getByTestId('delete-org-confirmation-input');
      const deleteButton = screen.getByTestId('confirm-delete-org-button');

      fireEvent.change(input, { target: { value: 'Test Organization' } });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalledWith('Test Organization');
      });
    });

    it('should disable inputs while deletion is in progress', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={true}
        />
      );

      const input = screen.getByTestId('delete-org-confirmation-input');
      const deleteButton = screen.getByTestId('confirm-delete-org-button');
      const cancelButton = screen.getByTestId('cancel-delete-org-button');

      expect(input).toBeDisabled();
      expect(deleteButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();
    });

    it('should show "Deleting..." text when deletion is in progress', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={true}
        />
      );

      expect(screen.getByText('Deleting...')).toBeInTheDocument();
    });

    it('should call onClose when cancel button clicked', () => {
      const mockOnClose = vi.fn();

      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={vi.fn()}
        />
      );

      const cancelButton = screen.getByTestId('cancel-delete-org-button');
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not call onConfirm when form submitted with non-matching confirmation', async () => {
      const mockOnConfirm = vi.fn();

      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={mockOnConfirm}
        />
      );

      const input = screen.getByTestId('delete-org-confirmation-input');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'Wrong Name' } });
      if (form) {
        fireEvent.submit(form);
      }

      await waitFor(() => {
        expect(mockOnConfirm).not.toHaveBeenCalled();
      });
    });
  });

  describe('Warning Messages', () => {
    beforeEach(() => {
      mockUseQuery.mockReturnValue({
        data: { users: 0, teams: 0, measurements: 0 },
        isError: false,
        error: null,
      });
    });

    it('should display permanent deletion warning', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText(/Warning: Permanent Deletion/i)).toBeInTheDocument();
      // Use getAllByText since this text appears multiple times
      const undoneTexts = screen.getAllByText(/This action cannot be undone/i);
      expect(undoneTexts.length).toBeGreaterThan(0);
      expect(screen.getByText(/Consider deactivation/i)).toBeInTheDocument();
    });

    it('should suggest deactivation as alternative', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      // Check for deactivation suggestion text
      expect(screen.getByText(/might need this data later/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      mockUseQuery.mockReturnValue({
        data: { users: 0, teams: 0, measurements: 0 },
        isError: false,
        error: null,
      });
    });

    it('should have accessible label for confirmation input', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      const input = screen.getByTestId('delete-org-confirmation-input');
      expect(input).toHaveAttribute('id', 'confirmation');
      expect(screen.getByText(/Type.*to confirm deletion/i)).toBeInTheDocument();
    });

    it('should have test IDs for all interactive elements', () => {
      renderWithQueryClient(
        <DeleteOrganizationModal
          organization={mockOrganization}
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByTestId('delete-org-confirmation-input')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-delete-org-button')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-delete-org-button')).toBeInTheDocument();
    });
  });
});
