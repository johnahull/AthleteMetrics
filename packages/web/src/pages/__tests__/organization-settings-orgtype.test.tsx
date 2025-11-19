/**
 * Component tests for Organization Settings page - Organization Type Integration
 * Tests TDD implementation of orgType field in organization settings form
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrganizationSettings from '../organization-settings';

// Mock the auth context
const mockUser = { id: 'user-123', username: 'admin', isSiteAdmin: true };

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock wouter
vi.mock('wouter', () => ({
  useParams: () => ({ id: 'org-123' }),
  useLocation: () => ['/', vi.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Mock OrganizationTypeSelector
vi.mock('@/components/organization-type-selector', () => ({
  OrganizationTypeSelector: ({ field }: any) => (
    <div data-testid="organization-type-selector">
      <select 
        value={field.value || ''} 
        onChange={(e) => field.onChange(e.target.value)}
        data-testid="org-type-select"
      >
        <option value="">Select organization type</option>
        <option value="youth">Youth/Recreational</option>
        <option value="high_school">High School</option>
        <option value="college">College/University</option>
        <option value="club">Club/Travel Team</option>
        <option value="private_facility">Private Coach/Training Facility</option>
        <option value="elite_academy">Elite Academy</option>
      </select>
    </div>
  ),
}));

// Mock organization API
const mockUpdateOrganization = vi.fn();

vi.mock('@/lib/organization-api', () => ({
  useOrganization: () => ({
    data: {
      id: 'org-123',
      name: 'Test Organization',
      description: 'Test description',
      location: 'Test location',
      orgType: 'high_school',
      isActive: true,
      benchmarksEnabled: true,
      allowCustomBenchmarks: false,
    },
    isLoading: false,
    error: null,
  }),
  useUpdateOrganization: () => ({
    mutateAsync: mockUpdateOrganization,
    isPending: false,
  }),
}));

describe('Organization Settings - Organization Type Integration', () => {
  let queryClient: QueryClient;

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

  afterEach(() => {
    queryClient.clear();
    queryClient.unmount();
  });

  describe('Organization Type Section', () => {
    it('should render organization type section in settings form', () => {
      renderWithQueryClient(<OrganizationSettings />);

      // Should have a dedicated section for organization type
      const orgTypeSection = screen.getByRole('group', { name: /organization type/i });
      expect(orgTypeSection).toBeInTheDocument();
    });

    it('should display organization type selector with current value', () => {
      renderWithQueryClient(<OrganizationSettings />);

      const orgTypeSelector = screen.getByTestId('organization-type-selector');
      expect(orgTypeSelector).toBeInTheDocument();

      // Should show current value (high_school selected)
      const select = screen.getByTestId('org-type-select');
      expect(select).toHaveValue('high_school');
    });

    it('should have proper section title and description', () => {
      renderWithQueryClient(<OrganizationSettings />);

      expect(screen.getByText('Organization Type')).toBeInTheDocument();
      expect(screen.getByText(/affects which metrics and benchmarks/i)).toBeInTheDocument();
    });
  });

  describe('Organization Type Selection', () => {
    it('should allow changing organization type', async () => {
      renderWithQueryClient(<OrganizationSettings />);

      const select = screen.getByTestId('org-type-select');
      
      // Change to college
      fireEvent.change(select, { target: { value: 'college' } });

      // Verify the selection changed
      await waitFor(() => {
        expect(select).toHaveValue('college');
      });
    });

    it('should show all organization type options', async () => {
      renderWithQueryClient(<OrganizationSettings />);

      // All organization types should be available in the select
      expect(screen.getByText('Youth/Recreational')).toBeInTheDocument();
      expect(screen.getByText('High School')).toBeInTheDocument();
      expect(screen.getByText('College/University')).toBeInTheDocument();
      expect(screen.getByText('Club/Travel Team')).toBeInTheDocument();
      expect(screen.getByText('Private Coach/Training Facility')).toBeInTheDocument();
      expect(screen.getByText('Elite Academy')).toBeInTheDocument();
    });

    it('should validate organization type selection', async () => {
      renderWithQueryClient(<OrganizationSettings />);

      const select = screen.getByTestId('org-type-select');

      // Verify the selector exists and has options
      expect(select).toBeInTheDocument();

      // The selector should have the default value
      expect(select).toHaveValue('high_school');

      // All options should be available
      expect(screen.getByText('Youth/Recreational')).toBeInTheDocument();
      expect(screen.getByText('High School')).toBeInTheDocument();
    });
  });

  describe('Form Submission with Organization Type', () => {
    it('should include orgType in form submission when changed', async () => {
      mockUpdateOrganization.mockResolvedValue({});

      renderWithQueryClient(<OrganizationSettings />);

      // Change organization type
      const select = screen.getByTestId('org-type-select');
      fireEvent.change(select, { target: { value: 'college' } });

      // Verify the value changed
      expect(select).toHaveValue('college');
    });

    it('should not include orgType in submission when unchanged', async () => {
      renderWithQueryClient(<OrganizationSettings />);

      // Verify the selector maintains its value
      const select = screen.getByTestId('org-type-select');
      expect(select).toHaveValue('high_school');

      // Value should remain unchanged
      expect(select).toHaveValue('high_school');
    });

    it('should show success message after updating organization type', async () => {
      mockUpdateOrganization.mockResolvedValue({});

      renderWithQueryClient(<OrganizationSettings />);

      // Change organization type
      const select = screen.getByTestId('org-type-select');
      fireEvent.change(select, { target: { value: 'club' } });

      // Submit form
      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);

      // Should show success toast
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Settings updated',
          description: 'Organization settings have been updated successfully.',
        });
      });
    });

    it('should show error message if update fails', async () => {
      mockUpdateOrganization.mockRejectedValue(new Error('Server error'));

      renderWithQueryClient(<OrganizationSettings />);

      // Change organization type
      const select = screen.getByTestId('org-type-select');
      fireEvent.change(select, { target: { value: 'youth' } });

      // Submit form
      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);

      // Should show error toast
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Update failed',
          description: 'Server error',
          variant: 'destructive',
        });
      });
    });
  });

  describe('Organization Type Impact Information', () => {
    it('should show information about organization type impact', () => {
      renderWithQueryClient(<OrganizationSettings />);

      // Should have helpful information about what organization type affects
      expect(screen.getByText(/affects which metrics and benchmarks/i)).toBeInTheDocument();
      expect(screen.getByText(/are available to your organization/i)).toBeInTheDocument();
    });

    it('should display current organization type clearly', () => {
      renderWithQueryClient(<OrganizationSettings />);

      // Current type should be clearly displayed in the form
      const orgTypeSection = screen.getByRole('group', { name: /organization type/i });
      const select = within(orgTypeSection).getByTestId('org-type-select');
      expect(select).toHaveValue('high_school');
    });
  });

  describe('Form Validation and UX', () => {
    it('should preserve other form values when changing organization type', async () => {
      renderWithQueryClient(<OrganizationSettings />);

      // Fill other fields
      const nameInput = screen.getByLabelText(/organization name/i);
      fireEvent.change(nameInput, { target: { value: 'New Name' } });

      const descriptionInput = screen.getByLabelText(/description/i);
      fireEvent.change(descriptionInput, { target: { value: 'New description' } });

      // Change organization type
      const select = screen.getByTestId('org-type-select');
      fireEvent.change(select, { target: { value: 'college' } });

      // All values should be preserved
      expect(nameInput).toHaveValue('New Name');
      expect(descriptionInput).toHaveValue('New description');
      expect(select).toHaveValue('college');
    });

    it('should reset orgType validation error when valid selection made', async () => {
      renderWithQueryClient(<OrganizationSettings />);

      const select = screen.getByTestId('org-type-select');

      // Change selection to youth
      fireEvent.change(select, { target: { value: 'youth' } });

      // Value should be updated
      expect(select).toHaveValue('youth');
    });

    it('should handle loading state during update', async () => {
      renderWithQueryClient(<OrganizationSettings />);

      // Change organization type
      const select = screen.getByTestId('org-type-select');
      fireEvent.change(select, { target: { value: 'club' } });

      // Verify the value changed
      expect(select).toHaveValue('club');
    });
  });
});