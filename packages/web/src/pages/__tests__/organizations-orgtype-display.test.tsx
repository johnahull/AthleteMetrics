/**
 * Component tests for Organizations page - Organization Type Display
 * Tests TDD implementation of organization type display in organization listings
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Organizations from '../organizations';

// Mock the auth context
const mockSetOrganizationContext = vi.fn();
const mockUser = { id: 'user-123', username: 'admin', isSiteAdmin: true };

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    setOrganizationContext: mockSetOrganizationContext,
  }),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock the API mutations module
const mockDeactivateOrganization = vi.fn();
const mockReactivateOrganization = vi.fn();
const mockDeleteOrganization = vi.fn();

vi.mock('@/lib/api', () => ({
  mutations: {
    deactivateOrganization: (...args: any[]) => mockDeactivateOrganization(...args),
    reactivateOrganization: (...args: any[]) => mockReactivateOrganization(...args),
    deleteOrganization: (...args: any[]) => mockDeleteOrganization(...args),
  },
}));

// Mock wouter
vi.mock('wouter', async () => {
  const actual = await vi.importActual('wouter');
  return {
    ...actual,
    useLocation: () => ['/', vi.fn()],
  };
});

describe('Organizations - Organization Type Display', () => {
  let queryClient: QueryClient;

  const mockOrganizations = [
    {
      id: 'org-1',
      name: 'Metro High School Soccer',
      description: 'Varsity soccer program',
      orgType: 'high_school',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'org-2',
      name: 'Elite Performance Academy',
      description: 'Professional training facility',
      orgType: 'elite_academy',
      isActive: true,
      createdAt: '2024-01-02T00:00:00Z',
    },
    {
      id: 'org-3',
      name: 'Youth Soccer League',
      description: 'Recreational youth program',
      orgType: 'youth',
      isActive: false,
      createdAt: '2024-01-03T00:00:00Z',
    },
    {
      id: 'org-4',
      name: 'State University Athletics',
      description: 'College athletics program',
      orgType: 'college',
      isActive: true,
      createdAt: '2024-01-04T00:00:00Z',
    },
    {
      id: 'org-5',
      name: 'Thunder Club',
      description: 'Competitive travel team',
      orgType: 'club',
      isActive: true,
      createdAt: '2024-01-05T00:00:00Z',
    },
    {
      id: 'org-6',
      name: 'Pro Training Center',
      description: 'Private coaching facility',
      orgType: 'private_facility',
      isActive: true,
      createdAt: '2024-01-06T00:00:00Z',
    },
  ];

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

    // Pre-populate the cache with mock organizations
    queryClient.setQueryData(['/api/my-organizations'], mockOrganizations);

    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
    queryClient.unmount();
  });

  describe('Organization Type Display in Listings', () => {
    it('should display organization type badge for each organization', async () => {
      renderWithQueryClient(<Organizations />);

      // Set filter to "all" to see all organizations
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        // Check that organization type badges are displayed
        const org1Card = screen.getByTestId('organization-org-1');
        expect(within(org1Card).getByTestId('org-type-badge')).toHaveTextContent('High School');

        const org2Card = screen.getByTestId('organization-org-2');
        expect(within(org2Card).getByTestId('org-type-badge')).toHaveTextContent('Elite Academy');

        const org3Card = screen.getByTestId('organization-org-3');
        expect(within(org3Card).getByTestId('org-type-badge')).toHaveTextContent('Youth/Recreational');
      });
    });

    it('should display correct human-readable labels for all organization types', async () => {
      renderWithQueryClient(<Organizations />);

      // Set filter to "all" to see all organizations
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        // Verify all organization type labels are correct
        expect(screen.getByTestId('org-type-badge-high_school')).toHaveTextContent('High School');
        expect(screen.getByTestId('org-type-badge-elite_academy')).toHaveTextContent('Elite Academy');
        expect(screen.getByTestId('org-type-badge-youth')).toHaveTextContent('Youth/Recreational');
        expect(screen.getByTestId('org-type-badge-college')).toHaveTextContent('College/University');
        expect(screen.getByTestId('org-type-badge-club')).toHaveTextContent('Club/Travel Team');
        expect(screen.getByTestId('org-type-badge-private_facility')).toHaveTextContent('Private Training Facility');
      });
    });

    it('should style organization type badges appropriately', async () => {
      renderWithQueryClient(<Organizations />);

      // Set filter to "all" to see all organizations
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        const orgTypeBadge = screen.getByTestId('org-type-badge-high_school');
        
        // Should have proper badge styling
        expect(orgTypeBadge).toHaveClass('badge');
        expect(orgTypeBadge).toHaveClass('org-type-badge');
      });
    });

    it('should handle missing organization type gracefully', async () => {
      // Add organization without orgType to test fallback
      const orgsWithMissingType = [
        ...mockOrganizations,
        {
          id: 'org-missing-type',
          name: 'Legacy Organization',
          description: 'No org type set',
          orgType: undefined,
          isActive: true,
          createdAt: '2024-01-07T00:00:00Z',
        },
      ];

      queryClient.setQueryData(['/api/my-organizations'], orgsWithMissingType);

      renderWithQueryClient(<Organizations />);

      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        const orgCard = screen.getByTestId('organization-org-missing-type');
        // Should show fallback text or hide badge
        expect(within(orgCard).queryByTestId('org-type-badge')).not.toBeInTheDocument();
      });
    });
  });

  describe('Organization Type Badge Positioning', () => {
    it('should position organization type badge near organization name', () => {
      renderWithQueryClient(<Organizations />);

      const org1Card = screen.getByTestId('organization-org-1');
      const orgName = within(org1Card).getByTestId('organization-link-org-1');
      const orgTypeBadge = within(org1Card).getByTestId('org-type-badge');

      // Both should be in the same card
      expect(orgName).toBeInTheDocument();
      expect(orgTypeBadge).toBeInTheDocument();
    });

    it('should maintain consistent layout with inactive badge when present', async () => {
      renderWithQueryClient(<Organizations />);

      // Set filter to "all" to see inactive organizations
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        const inactiveOrg = screen.getByTestId('organization-org-3');
        
        // Should have both inactive and org type badges
        expect(within(inactiveOrg).getByText('Inactive')).toBeInTheDocument();
        expect(within(inactiveOrg).getByTestId('org-type-badge')).toBeInTheDocument();
      });
    });
  });

  describe('Organization Creation with Type', () => {
    it('should include organization type field in create dialog', async () => {
      renderWithQueryClient(<Organizations />);

      const createButton = screen.getByTestId('create-organization-button');
      fireEvent.click(createButton);

      await waitFor(() => {
        // Organization type selector should be present in create dialog
        expect(screen.getByTestId('create-org-type-selector')).toBeInTheDocument();
      });
    });

    it('should have organization type as required field in creation', async () => {
      renderWithQueryClient(<Organizations />);

      const createButton = screen.getByTestId('create-organization-button');
      fireEvent.click(createButton);

      // Fill only name, leave orgType empty
      const nameInput = screen.getByTestId('org-name-input');
      fireEvent.change(nameInput, { target: { value: 'Test Org' } });

      // Try to submit without orgType
      const submitButton = screen.getByTestId('submit-org-button');
      fireEvent.click(submitButton);

      await waitFor(() => {
        // Should show validation error
        expect(screen.getByText(/organization type is required/i)).toBeInTheDocument();
      });
    });

    it('should include selected organization type in create request', async () => {
      const mockCreateOrg = vi.fn().mockResolvedValue({ id: 'new-org' });
      
      // Mock the API request for organization creation
      vi.doMock('@/lib/queryClient', () => ({
        apiRequest: mockCreateOrg,
      }));

      renderWithQueryClient(<Organizations />);

      const createButton = screen.getByTestId('create-organization-button');
      fireEvent.click(createButton);

      // Fill form
      const nameInput = screen.getByTestId('org-name-input');
      fireEvent.change(nameInput, { target: { value: 'New Test Org' } });

      // Select organization type
      const orgTypeSelector = screen.getByTestId('create-org-type-selector');
      fireEvent.click(orgTypeSelector);
      const collegeOption = await screen.findByText('College/University');
      fireEvent.click(collegeOption);

      // Submit
      const submitButton = screen.getByTestId('submit-org-button');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateOrg).toHaveBeenCalledWith(
          'POST',
          '/api/organizations',
          expect.objectContaining({
            name: 'New Test Org',
            orgType: 'college',
          })
        );
      });
    });

    it('should default to club organization type in creation form', async () => {
      renderWithQueryClient(<Organizations />);

      const createButton = screen.getByTestId('create-organization-button');
      fireEvent.click(createButton);

      await waitFor(() => {
        const orgTypeSelector = screen.getByTestId('create-org-type-selector');
        // Should default to 'Club/Travel Team' based on schema default
        expect(orgTypeSelector).toHaveDisplayValue('Club/Travel Team');
      });
    });
  });

  describe('Organization Type Filtering', () => {
    it('should add organization type filter to status filter controls', async () => {
      renderWithQueryClient(<Organizations />);

      // Should have additional filter for organization types
      expect(screen.getByTestId('org-type-filter')).toBeInTheDocument();
    });

    it('should filter organizations by selected type', async () => {
      renderWithQueryClient(<Organizations />);

      // Set status filter to "all" first
      const statusFilter = screen.getByTestId('status-filter');
      fireEvent.click(statusFilter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      // Use organization type filter
      const orgTypeFilter = screen.getByTestId('org-type-filter');
      fireEvent.click(orgTypeFilter);
      const highSchoolOption = await screen.findByText('High School Only');
      fireEvent.click(highSchoolOption);

      await waitFor(() => {
        // Only high school organization should be visible
        expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
        expect(screen.queryByTestId('organization-org-2')).not.toBeInTheDocument();
        expect(screen.queryByTestId('organization-org-3')).not.toBeInTheDocument();
        expect(screen.queryByTestId('organization-org-4')).not.toBeInTheDocument();
      });
    });

    it('should combine status and type filters correctly', async () => {
      renderWithQueryClient(<Organizations />);

      // Set status to active only
      const statusFilter = screen.getByTestId('status-filter');
      fireEvent.click(statusFilter);
      const activeOption = await screen.findByText('Active Organizations');
      fireEvent.click(activeOption);

      // Set type filter to college
      const orgTypeFilter = screen.getByTestId('org-type-filter');
      fireEvent.click(orgTypeFilter);
      const collegeOption = await screen.findByText('College/University Only');
      fireEvent.click(collegeOption);

      await waitFor(() => {
        // Only active college organizations should be visible
        expect(screen.getByTestId('organization-org-4')).toBeInTheDocument();
        // Inactive college orgs should not be visible
        // Other type orgs should not be visible
        expect(screen.queryByTestId('organization-org-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('organization-org-3')).not.toBeInTheDocument();
      });
    });

    it('should show appropriate message when no organizations match filters', async () => {
      renderWithQueryClient(<Organizations />);

      // Filter by inactive and college (no matches in our test data)
      const statusFilter = screen.getByTestId('status-filter');
      fireEvent.click(statusFilter);
      const inactiveOption = await screen.findByText('Inactive Organizations');
      fireEvent.click(inactiveOption);

      const orgTypeFilter = screen.getByTestId('org-type-filter');
      fireEvent.click(orgTypeFilter);
      const collegeOption = await screen.findByText('College/University Only');
      fireEvent.click(collegeOption);

      await waitFor(() => {
        expect(screen.getByText(/no organizations found matching the current filters/i)).toBeInTheDocument();
      });
    });
  });
});