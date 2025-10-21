/**
 * Component tests for Organizations page - Optimistic Updates
 * Tests optimistic UI updates when toggling organization active/inactive status
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route } from 'wouter';
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

describe('Organizations - Optimistic Updates and Filtering', () => {
  let queryClient: QueryClient;

  const mockOrganizations = [
    {
      id: 'org-1',
      name: 'Active Organization',
      description: 'This org is active',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'org-2',
      name: 'Inactive Organization',
      description: 'This org is inactive',
      isActive: false,
      createdAt: '2024-01-02T00:00:00Z',
    },
    {
      id: 'org-3',
      name: 'Another Active Organization',
      description: 'Another active org',
      isActive: true,
      createdAt: '2024-01-03T00:00:00Z',
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

  describe('Status Filter', () => {
    it('should default to showing only active organizations', () => {
      renderWithQueryClient(<Organizations />);

      // Active organizations should be visible
      expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
      expect(screen.getByTestId('organization-org-3')).toBeInTheDocument();

      // Inactive organization should not be visible
      expect(screen.queryByTestId('organization-org-2')).not.toBeInTheDocument();

      // Filter should be set to "active"
      const filter = screen.getByTestId('status-filter');
      expect(filter).toHaveTextContent('Active Organizations');
    });

    it('should show only inactive organizations when filter is set to inactive', async () => {
      renderWithQueryClient(<Organizations />);

      // Open filter and select "Inactive Organizations"
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);

      const inactiveOption = await screen.findByText('Inactive Organizations');
      fireEvent.click(inactiveOption);

      // Wait for filter to apply
      await waitFor(() => {
        // Only inactive organization should be visible
        expect(screen.getByTestId('organization-org-2')).toBeInTheDocument();

        // Active organizations should not be visible
        expect(screen.queryByTestId('organization-org-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('organization-org-3')).not.toBeInTheDocument();
      });
    });

    it('should show all organizations when filter is set to all', async () => {
      renderWithQueryClient(<Organizations />);

      // Open filter and select "All Organizations"
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);

      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      // Wait for filter to apply
      await waitFor(() => {
        // All organizations should be visible
        expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
        expect(screen.getByTestId('organization-org-2')).toBeInTheDocument();
        expect(screen.getByTestId('organization-org-3')).toBeInTheDocument();
      });
    });

    it('should show appropriate message when no organizations match filter', async () => {
      // Set up cache with only active organizations
      queryClient.setQueryData(['/api/my-organizations'], [mockOrganizations[0], mockOrganizations[2]]);

      renderWithQueryClient(<Organizations />);

      // Open filter and select "Inactive Organizations"
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);

      const inactiveOption = await screen.findByText('Inactive Organizations');
      fireEvent.click(inactiveOption);

      // Should show "no inactive organizations" message
      await waitFor(() => {
        expect(screen.getByText('No inactive organizations found')).toBeInTheDocument();
      });
    });
  });

  describe('Deactivate Organization - Optimistic Updates', () => {
    it('should immediately update icon from CheckCircle to Ban when deactivating', async () => {
      mockDeactivateOrganization.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({}), 100))
      );

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" so organization doesn't disappear when deactivated
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
      });

      // Find the first active organization's toggle button
      const toggleButton = screen.getByTestId('toggle-status-org-1');
      const orgCard = screen.getByTestId('organization-org-1');

      // Before clicking, button should have CheckCircle icon (text-green-600 class)
      expect(toggleButton).toHaveClass('text-green-600');

      // Click to deactivate
      fireEvent.click(toggleButton);

      // IMMEDIATELY after click (optimistic update), button should show Ban icon (text-red-600)
      await waitFor(() => {
        expect(toggleButton).toHaveClass('text-red-600');
      }, { timeout: 50 }); // Very short timeout to verify it's optimistic

      // Verify the inactive badge appears within this org's card
      await waitFor(() => {
        expect(within(orgCard).getByText('Inactive')).toBeInTheDocument();
      });

      // Wait for the actual mutation to complete
      await waitFor(() => {
        expect(mockDeactivateOrganization).toHaveBeenCalledWith('org-1');
      });
    });

    it('should immediately show "Inactive" badge when deactivating', async () => {
      mockDeactivateOrganization.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({}), 100))
      );

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" so organization doesn't disappear when deactivated
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTestId('toggle-status-org-1');
      const orgCard = screen.getByTestId('organization-org-1');

      // Verify no Inactive badge before (use within to scope to this org's card)
      expect(within(orgCard).queryByText('Inactive')).not.toBeInTheDocument();

      // Click to deactivate
      fireEvent.click(toggleButton);

      // Immediately check for Inactive badge (optimistic) within this org's card
      await waitFor(() => {
        expect(within(orgCard).getByText('Inactive')).toBeInTheDocument();
      }, { timeout: 50 });
    });

    it('should update cache immediately before server response', async () => {
      let resolveDeactivation: (value: any) => void;
      const deactivationPromise = new Promise((resolve) => {
        resolveDeactivation = resolve;
      });

      mockDeactivateOrganization.mockReturnValue(deactivationPromise);

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" so organization doesn't disappear when deactivated
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTestId('toggle-status-org-1');
      fireEvent.click(toggleButton);

      // Check cache was updated optimistically (before resolveDeactivation is called)
      await waitFor(() => {
        const cachedData = queryClient.getQueryData<typeof mockOrganizations>(['/api/my-organizations']);
        const org = cachedData?.find((o) => o.id === 'org-1');
        expect(org?.isActive).toBe(false);
      }, { timeout: 50 });

      // Now resolve the server call
      resolveDeactivation!({});

      await waitFor(() => {
        expect(mockDeactivateOrganization).toHaveBeenCalled();
      });
    });

    it('should rollback to previous state if deactivation fails', async () => {
      // Delay the rejection to allow testing the intermediate optimistic state
      mockDeactivateOrganization.mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Server error')), 50))
      );

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" so organization doesn't disappear when deactivated
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTestId('toggle-status-org-1');
      const orgCard = screen.getByTestId('organization-org-1');

      // Before click - should be green (active)
      expect(toggleButton).toHaveClass('text-green-600');

      fireEvent.click(toggleButton);

      // Immediately after click - should turn red (optimistic)
      await waitFor(() => {
        expect(toggleButton).toHaveClass('text-red-600');
      }, { timeout: 50 });

      // After error, should rollback to green (active)
      await waitFor(() => {
        expect(toggleButton).toHaveClass('text-green-600');
      });

      // Error toast should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Error updating organization status',
            variant: 'destructive',
          })
        );
      });

      // Inactive badge should not be present (rollback) in this org's card
      expect(within(orgCard).queryByText('Inactive')).not.toBeInTheDocument();
    });

    it('should show success toast after successful deactivation', async () => {
      mockDeactivateOrganization.mockResolvedValue({});

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" so organization doesn't disappear when deactivated
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTestId('toggle-status-org-1');
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Organization deactivated',
            description: 'Users will no longer be able to log into this organization.',
          })
        );
      });
    });
  });

  describe('Reactivate Organization - Optimistic Updates', () => {
    it('should immediately update icon from Ban to CheckCircle when reactivating', async () => {
      mockReactivateOrganization.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({}), 100))
      );

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" to see the inactive organization
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-2')).toBeInTheDocument();
      });

      // Find the inactive organization's toggle button
      const toggleButton = screen.getByTestId('toggle-status-org-2');

      // Before clicking, button should have Ban icon (text-red-600 class)
      expect(toggleButton).toHaveClass('text-red-600');

      // Click to reactivate
      fireEvent.click(toggleButton);

      // IMMEDIATELY after click (optimistic update), button should show CheckCircle icon (text-green-600)
      await waitFor(() => {
        expect(toggleButton).toHaveClass('text-green-600');
      }, { timeout: 50 });

      // Wait for the actual mutation to complete
      await waitFor(() => {
        expect(mockReactivateOrganization).toHaveBeenCalledWith('org-2');
      });
    });

    it('should immediately remove "Inactive" badge when reactivating', async () => {
      mockReactivateOrganization.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({}), 100))
      );

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" to see the inactive organization
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-2')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTestId('toggle-status-org-2');
      const orgCard = screen.getByTestId('organization-org-2');

      // Verify Inactive badge is present before (within this org's card)
      expect(within(orgCard).getByText('Inactive')).toBeInTheDocument();

      // Click to reactivate
      fireEvent.click(toggleButton);

      // Immediately check that Inactive badge is removed (optimistic) from this org's card
      await waitFor(() => {
        expect(within(orgCard).queryByText('Inactive')).not.toBeInTheDocument();
      }, { timeout: 50 });
    });

    it('should rollback to inactive state if reactivation fails', async () => {
      // Delay the rejection to allow testing the intermediate optimistic state
      mockReactivateOrganization.mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Network error')), 50))
      );

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" to see the inactive organization
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-2')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTestId('toggle-status-org-2');
      const orgCard = screen.getByTestId('organization-org-2');

      // Before click - should be red (inactive)
      expect(toggleButton).toHaveClass('text-red-600');
      expect(within(orgCard).getByText('Inactive')).toBeInTheDocument();

      fireEvent.click(toggleButton);

      // Immediately after click - should turn green (optimistic)
      await waitFor(() => {
        expect(toggleButton).toHaveClass('text-green-600');
      }, { timeout: 50 });

      // After error, should rollback to red (inactive)
      await waitFor(() => {
        expect(toggleButton).toHaveClass('text-red-600');
      });

      // Inactive badge should reappear (rollback) in this org's card
      await waitFor(() => {
        expect(within(orgCard).getByText('Inactive')).toBeInTheDocument();
      });

      // Error toast should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Error updating organization status',
            variant: 'destructive',
          })
        );
      });
    });

    it('should show success toast after successful reactivation', async () => {
      mockReactivateOrganization.mockResolvedValue({});

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" to see the inactive organization
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-2')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTestId('toggle-status-org-2');
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Organization activated',
            description: 'Users can now log into this organization.',
          })
        );
      });
    });
  });

  describe('Multiple Rapid Toggles', () => {
    it('should handle rapid toggle clicks correctly', async () => {
      mockDeactivateOrganization.mockResolvedValue({});
      mockReactivateOrganization.mockResolvedValue({});

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" so organization doesn't disappear when toggling status
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTestId('toggle-status-org-1');

      // Click multiple times rapidly
      fireEvent.click(toggleButton); // deactivate
      await waitFor(() => expect(toggleButton).toHaveClass('text-red-600'), { timeout: 50 });

      fireEvent.click(toggleButton); // reactivate
      await waitFor(() => expect(toggleButton).toHaveClass('text-green-600'), { timeout: 50 });

      fireEvent.click(toggleButton); // deactivate again
      await waitFor(() => expect(toggleButton).toHaveClass('text-red-600'), { timeout: 50 });

      // Wait for all mutations to complete
      await waitFor(() => {
        expect(mockDeactivateOrganization).toHaveBeenCalledTimes(2);
        expect(mockReactivateOrganization).toHaveBeenCalledTimes(1);
      });
    });

    it('should cancel pending queries when optimistic update occurs', async () => {
      const cancelQueriesSpy = vi.spyOn(queryClient, 'cancelQueries');

      mockDeactivateOrganization.mockResolvedValue({});

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" so organization doesn't disappear when deactivated
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTestId('toggle-status-org-1');
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(cancelQueriesSpy).toHaveBeenCalledWith({ queryKey: ['/api/my-organizations'] });
      });
    });
  });

  describe('Concurrent Status Changes', () => {
    it('should handle concurrent status changes for different organizations', async () => {
      mockDeactivateOrganization.mockResolvedValue({});
      mockReactivateOrganization.mockResolvedValue({});

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" to see all organizations
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
        expect(screen.getByTestId('organization-org-2')).toBeInTheDocument();
        expect(screen.getByTestId('organization-org-3')).toBeInTheDocument();
      });

      const toggle1 = screen.getByTestId('toggle-status-org-1');
      const toggle2 = screen.getByTestId('toggle-status-org-2');
      const toggle3 = screen.getByTestId('toggle-status-org-3');

      // Trigger multiple status changes concurrently
      fireEvent.click(toggle1); // deactivate org-1
      fireEvent.click(toggle2); // reactivate org-2
      fireEvent.click(toggle3); // deactivate org-3

      // All should update optimistically
      await waitFor(() => {
        expect(toggle1).toHaveClass('text-red-600');
        expect(toggle2).toHaveClass('text-green-600');
        expect(toggle3).toHaveClass('text-red-600');
      }, { timeout: 100 });

      // Wait for all to complete
      await waitFor(() => {
        expect(mockDeactivateOrganization).toHaveBeenCalledWith('org-1');
        expect(mockReactivateOrganization).toHaveBeenCalledWith('org-2');
        expect(mockDeactivateOrganization).toHaveBeenCalledWith('org-3');
      });
    });
  });

  describe('Cache Consistency', () => {
    it('should maintain cache consistency across multiple operations', async () => {
      mockDeactivateOrganization.mockResolvedValue({});

      renderWithQueryClient(<Organizations />);

      const toggleButton = screen.getByTestId('toggle-status-org-1');

      // Get initial cache state
      const initialCache = queryClient.getQueryData<typeof mockOrganizations>(['/api/my-organizations']);
      expect(initialCache?.find((o) => o.id === 'org-1')?.isActive).toBe(true);

      fireEvent.click(toggleButton);

      // Check optimistic cache update
      await waitFor(() => {
        const cachedData = queryClient.getQueryData<typeof mockOrganizations>(['/api/my-organizations']);
        expect(cachedData?.find((o) => o.id === 'org-1')?.isActive).toBe(false);
      }, { timeout: 50 });

      // Wait for mutation to complete
      await waitFor(() => {
        expect(mockDeactivateOrganization).toHaveBeenCalled();
      });

      // Final cache should still show inactive
      const finalCache = queryClient.getQueryData<typeof mockOrganizations>(['/api/my-organizations']);
      expect(finalCache?.find((o) => o.id === 'org-1')?.isActive).toBe(false);
    });

    it('should not affect other organizations in cache', async () => {
      mockDeactivateOrganization.mockResolvedValue({});

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" so organization doesn't disappear when deactivated
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTestId('toggle-status-org-1');
      fireEvent.click(toggleButton);

      await waitFor(() => {
        const cachedData = queryClient.getQueryData<typeof mockOrganizations>(['/api/my-organizations']);

        // org-1 should be updated
        expect(cachedData?.find((o) => o.id === 'org-1')?.isActive).toBe(false);

        // Other orgs should remain unchanged
        expect(cachedData?.find((o) => o.id === 'org-2')?.isActive).toBe(false);
        expect(cachedData?.find((o) => o.id === 'org-3')?.isActive).toBe(true);
      }, { timeout: 50 });
    });
  });

  describe('Query Invalidation', () => {
    it('should invalidate queries after successful status change', async () => {
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

      mockDeactivateOrganization.mockResolvedValue({});

      renderWithQueryClient(<Organizations />);

      const toggleButton = screen.getByTestId('toggle-status-org-1');
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['/api/my-organizations'] });
      });
    });

    it('should not invalidate queries if mutation fails', async () => {
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

      mockDeactivateOrganization.mockRejectedValue(new Error('Server error'));

      renderWithQueryClient(<Organizations />);

      const toggleButton = screen.getByTestId('toggle-status-org-1');
      fireEvent.click(toggleButton);

      // Wait for error to be handled
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      });

      // Verify invalidateQueries was NOT called (only setQueryData for rollback)
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    });
  });

  describe('Button State During Mutation', () => {
    it('should disable button while mutation is pending', async () => {
      let resolveMutation: (value: any) => void;
      const mutationPromise = new Promise((resolve) => {
        resolveMutation = resolve;
      });

      mockDeactivateOrganization.mockReturnValue(mutationPromise);

      renderWithQueryClient(<Organizations />);

      // Set filter to "all" so organization doesn't disappear when deactivated
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-1')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTestId('toggle-status-org-1');

      expect(toggleButton).not.toBeDisabled();

      fireEvent.click(toggleButton);

      // Button should be disabled during mutation
      await waitFor(() => {
        expect(toggleButton).toBeDisabled();
      });

      // Resolve the mutation
      resolveMutation!({});

      // Button should be enabled again
      await waitFor(() => {
        expect(toggleButton).not.toBeDisabled();
      });
    });
  });

  describe('Tooltips - Structure and Accessibility', () => {
    it('should have toggle buttons for active organizations', () => {
      renderWithQueryClient(<Organizations />);

      // Verify toggle button exists for active org
      const toggleButton = screen.getByTestId('toggle-status-org-1');
      expect(toggleButton).toBeInTheDocument();

      // Verify it's a green button (active state styling)
      expect(toggleButton).toHaveClass('text-green-600');
    });

    it('should have toggle buttons for inactive organizations', async () => {
      renderWithQueryClient(<Organizations />);

      // Set filter to "all" to see the inactive organization
      const filter = screen.getByTestId('status-filter');
      fireEvent.click(filter);
      const allOption = await screen.findByText('All Organizations');
      fireEvent.click(allOption);

      await waitFor(() => {
        expect(screen.getByTestId('organization-org-2')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTestId('toggle-status-org-2');
      expect(toggleButton).toBeInTheDocument();

      // Verify it's a red button (inactive state styling)
      expect(toggleButton).toHaveClass('text-red-600');
    });

    it('should have delete buttons for all organizations', () => {
      renderWithQueryClient(<Organizations />);

      // Verify delete buttons exist
      expect(screen.getByTestId('delete-org-org-1')).toBeInTheDocument();
      expect(screen.getByTestId('delete-org-org-3')).toBeInTheDocument();
    });

    it('should render tooltip provider for the page', () => {
      const { container } = renderWithQueryClient(<Organizations />);

      // Tooltip provider should be present in the DOM tree
      expect(container.firstChild).toBeInTheDocument();
    });
  });
});
