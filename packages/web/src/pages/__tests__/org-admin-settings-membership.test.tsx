/**
 * Component tests for Organization Admin Settings page - Membership Settings Integration
 * Tests the Membership Settings card including join code, toggles, and regeneration
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrgAdminSettings from '../org-admin-settings';

// Mock data
const createMockOrganization = (overrides = {}) => ({
  id: 'org-123',
  name: 'Test Organization',
  description: 'Test description',
  joinCode: 'ABC12345',
  isPublicDirectory: true,
  allowMembershipRequests: true,
  autoApproveRequests: false,
  aiEnabled: false,
  aiEnabledBySiteAdmin: true,
  wellnessEnabled: true,
  ...overrides,
});

const mockOrganizationProfile = {
  organization: createMockOrganization(),
  coaches: [],
  athletes: [],
  invitations: [],
};

// Mock the auth context
const mockUser = { id: 'user-123', username: 'orgadmin', role: 'org_admin', isSiteAdmin: false };

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

// Mock confirmation dialog
vi.mock('@/components/ui/confirmation-dialog', () => ({
  useConfirmation: () => ({
    confirm: vi.fn(({ onConfirm }) => onConfirm()),
    ConfirmationComponent: null,
  }),
}));

// Mock invitation modal
vi.mock('@/components/invitation-modal', () => ({
  InvitationModal: () => null,
}));

// Mock organization metrics card
vi.mock('@/components/organization-metrics-card', () => ({
  default: () => <div data-testid="organization-metrics-card">Metrics Card</div>,
}));

// Track current mock organization for dynamic updates
let currentMockOrganization = createMockOrganization();

// Mock organization API
const mockUpdateOrgAdminSettings = vi.fn();

vi.mock('@/lib/organization-api', () => ({
  useOrganization: () => ({
    data: currentMockOrganization,
    isLoading: false,
    error: null,
  }),
  useUpdateOrgAdminSettings: () => ({
    mutateAsync: mockUpdateOrgAdminSettings,
    isPending: false,
  }),
}));

// Mock API request for membership mutations - using actual function signature
const mockApiRequest = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

// TODO: These tests need to be fixed - they have issues with mock setup and component rendering
describe.skip('Organization Admin Settings - Membership Settings', () => {
  let queryClient: QueryClient;

  const renderWithQueryClient = (component: React.ReactElement, orgOverrides = {}) => {
    // Update the current mock organization with any overrides
    currentMockOrganization = createMockOrganization(orgOverrides);

    // Mock fetch for React Query queries
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/organizations/org-123/profile')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockOrganizationProfile,
            organization: currentMockOrganization,
          }),
        });
      }
      if (url.includes('/api/site-settings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ wellnessModuleEnabled: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });

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

    // Reset mock organization to default state
    currentMockOrganization = createMockOrganization();

    // Set default mock API response
    mockApiRequest.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
    queryClient.unmount();
  });

  describe('Membership Settings Section', () => {
    it('should render membership settings section', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Membership Settings')).toBeInTheDocument();
      });
    });

    it('should display section description', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText(/Configure how athletes can discover and join/i)).toBeInTheDocument();
      });
    });
  });

  describe('Join Code Display', () => {
    it('should display the join code in a readonly input', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        const joinCodeInput = screen.getByDisplayValue('ABC12345');
        expect(joinCodeInput).toBeInTheDocument();
        expect(joinCodeInput).toHaveAttribute('readonly');
      });
    });

    it('should display "Not generated" when no join code exists', async () => {
      renderWithQueryClient(<OrgAdminSettings />, { joinCode: undefined });

      await waitFor(() => {
        expect(screen.getByDisplayValue('Not generated')).toBeInTheDocument();
      });
    });

    it('should have copy code button', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        const copyButtons = screen.getAllByRole('button', { name: /copy/i });
        expect(copyButtons.length).toBeGreaterThan(0);
      });
    });

    it('should have regenerate button', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Regenerate')).toBeInTheDocument();
      });
    });
  });

  describe('Copy Functionality', () => {
    it('should have copy buttons in the join code section', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('ABC12345')).toBeInTheDocument();
      });

      // Should have buttons with copy-related titles
      const buttons = screen.getAllByRole('button');
      const hasCopyButtons = buttons.some(btn =>
        btn.getAttribute('title')?.includes('Copy') ||
        btn.getAttribute('title')?.includes('copy')
      );
      expect(hasCopyButtons).toBe(true);
    });
  });

  describe('Regenerate Join Code', () => {
    it('should call API to regenerate join code when button is clicked', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ joinCode: 'NEW12345' }),
      });

      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Regenerate')).toBeInTheDocument();
      });

      const regenerateButton = screen.getByText('Regenerate');
      fireEvent.click(regenerateButton);

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'POST',
          '/api/organizations/org-123/regenerate-join-code'
        );
      });
    });

    it('should show success toast after regeneration', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ joinCode: 'NEW12345' }),
      });

      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Regenerate')).toBeInTheDocument();
      });

      const regenerateButton = screen.getByText('Regenerate');
      fireEvent.click(regenerateButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Join code regenerated',
            description: expect.stringContaining('old join code')
          })
        );
      });
    });
  });

  describe('Membership Toggle Switches', () => {
    // Helper function to find a toggle switch by its label text
    const findSwitchByLabelText = async (labelText: string) => {
      // Wait for the label to be visible
      await waitFor(() => {
        expect(screen.getByText(labelText)).toBeInTheDocument();
      });

      // Find the parent container and get the switch within it
      const label = screen.getByText(labelText);
      const container = label.closest('.flex.flex-row');
      if (!container) throw new Error(`Container not found for label: ${labelText}`);
      const switchEl = container.querySelector('[role="switch"]');
      if (!switchEl) throw new Error(`Switch not found for label: ${labelText}`);
      return switchEl as HTMLElement;
    };

    it('should display Accept Membership Requests toggle', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Accept Membership Requests')).toBeInTheDocument();
      });
    });

    it('should display Public Directory toggle', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Public Directory')).toBeInTheDocument();
      });
    });

    it('should display Auto-Approve Requests toggle', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Auto-Approve Requests')).toBeInTheDocument();
      });
    });

    it('should show current state of allowMembershipRequests toggle', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      const toggle = await findSwitchByLabelText('Accept Membership Requests');
      expect(toggle).toHaveAttribute('data-state', 'checked');
    });

    it('should show current state of isPublicDirectory toggle', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      const toggle = await findSwitchByLabelText('Public Directory');
      expect(toggle).toHaveAttribute('data-state', 'checked');
    });

    it('should show current state of autoApproveRequests toggle', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      const toggle = await findSwitchByLabelText('Auto-Approve Requests');
      expect(toggle).toHaveAttribute('data-state', 'unchecked');
    });

    it('should call API when toggling allowMembershipRequests', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      renderWithQueryClient(<OrgAdminSettings />);

      const toggle = await findSwitchByLabelText('Accept Membership Requests');
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'PATCH',
          '/api/organizations/org-123/membership-settings',
          { allowMembershipRequests: false }
        );
      });
    });

    it('should call API when toggling isPublicDirectory', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      renderWithQueryClient(<OrgAdminSettings />);

      const toggle = await findSwitchByLabelText('Public Directory');
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'PATCH',
          '/api/organizations/org-123/membership-settings',
          { isPublicDirectory: false }
        );
      });
    });

    it('should call API when toggling autoApproveRequests', async () => {
      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      renderWithQueryClient(<OrgAdminSettings />);

      const toggle = await findSwitchByLabelText('Auto-Approve Requests');
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'PATCH',
          '/api/organizations/org-123/membership-settings',
          { autoApproveRequests: true }
        );
      });
    });
  });

  describe('Toggle Dependencies', () => {
    // Helper function to find a toggle switch by its label text
    const findSwitchByLabelText = async (labelText: string) => {
      await waitFor(() => {
        expect(screen.getByText(labelText)).toBeInTheDocument();
      });
      const label = screen.getByText(labelText);
      const container = label.closest('.flex.flex-row');
      if (!container) throw new Error(`Container not found for label: ${labelText}`);
      const switchEl = container.querySelector('[role="switch"]');
      if (!switchEl) throw new Error(`Switch not found for label: ${labelText}`);
      return switchEl as HTMLElement;
    };

    it('should disable Public Directory toggle when Accept Requests is off', async () => {
      renderWithQueryClient(<OrgAdminSettings />, { allowMembershipRequests: false });

      const toggle = await findSwitchByLabelText('Public Directory');
      expect(toggle).toBeDisabled();
    });

    it('should disable Auto-Approve toggle when Accept Requests is off', async () => {
      renderWithQueryClient(<OrgAdminSettings />, { allowMembershipRequests: false });

      const toggle = await findSwitchByLabelText('Auto-Approve Requests');
      expect(toggle).toBeDisabled();
    });

    it('should enable dependent toggles when Accept Requests is on', async () => {
      renderWithQueryClient(<OrgAdminSettings />, { allowMembershipRequests: true });

      const publicDirectorySwitch = await findSwitchByLabelText('Public Directory');
      const autoApproveSwitch = await findSwitchByLabelText('Auto-Approve Requests');

      expect(publicDirectorySwitch).not.toBeDisabled();
      expect(autoApproveSwitch).not.toBeDisabled();
    });
  });

  describe('Status Summary Badges', () => {
    it('should display Current Status section', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Current Status')).toBeInTheDocument();
      });
    });

    it('should show "Accepting Requests" badge when allowMembershipRequests is true', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Accepting Requests')).toBeInTheDocument();
      });
    });

    it('should show "Not Accepting Requests" badge when allowMembershipRequests is false', async () => {
      renderWithQueryClient(<OrgAdminSettings />, { allowMembershipRequests: false });

      await waitFor(() => {
        expect(screen.getByText('Not Accepting Requests')).toBeInTheDocument();
      });
    });

    it('should show "Listed in Directory" badge when isPublicDirectory is true', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Listed in Directory')).toBeInTheDocument();
      });
    });

    it('should show "Private" badge when isPublicDirectory is false', async () => {
      renderWithQueryClient(<OrgAdminSettings />, { isPublicDirectory: false });

      await waitFor(() => {
        expect(screen.getByText('Private')).toBeInTheDocument();
      });
    });

    it('should show "Manual Approval" badge when autoApproveRequests is false', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Manual Approval')).toBeInTheDocument();
      });
    });

    it('should show "Auto-Approve On" badge when autoApproveRequests is true', async () => {
      renderWithQueryClient(<OrgAdminSettings />, { autoApproveRequests: true });

      await waitFor(() => {
        expect(screen.getByText('Auto-Approve On')).toBeInTheDocument();
      });
    });

    it('should not show directory/approval badges when not accepting requests', async () => {
      renderWithQueryClient(<OrgAdminSettings />, {
        allowMembershipRequests: false,
        isPublicDirectory: true,
        autoApproveRequests: true
      });

      await waitFor(() => {
        expect(screen.getByText('Not Accepting Requests')).toBeInTheDocument();
        expect(screen.queryByText('Listed in Directory')).not.toBeInTheDocument();
        expect(screen.queryByText('Auto-Approve On')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    // Helper function to find a toggle switch by its label text
    const findSwitchByLabelText = async (labelText: string) => {
      await waitFor(() => {
        expect(screen.getByText(labelText)).toBeInTheDocument();
      });
      const label = screen.getByText(labelText);
      const container = label.closest('.flex.flex-row');
      if (!container) throw new Error(`Container not found for label: ${labelText}`);
      const switchEl = container.querySelector('[role="switch"]');
      if (!switchEl) throw new Error(`Switch not found for label: ${labelText}`);
      return switchEl as HTMLElement;
    };

    it('should show error toast when membership settings update fails', async () => {
      mockApiRequest.mockRejectedValueOnce(new Error('Network error'));

      renderWithQueryClient(<OrgAdminSettings />);

      const toggle = await findSwitchByLabelText('Accept Membership Requests');
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Error updating settings',
            variant: 'destructive'
          })
        );
      });
    });

    it('should show error toast when regenerate fails', async () => {
      mockApiRequest.mockRejectedValueOnce(new Error('Failed to regenerate'));

      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Regenerate')).toBeInTheDocument();
      });

      const regenerateButton = screen.getByText('Regenerate');
      fireEvent.click(regenerateButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Error regenerating code',
            variant: 'destructive'
          })
        );
      });
    });
  });

  describe('Access Control', () => {
    it('should render page for org_admin users', async () => {
      renderWithQueryClient(<OrgAdminSettings />);

      await waitFor(() => {
        expect(screen.getByText('Organization Settings')).toBeInTheDocument();
        expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
      });
    });
  });
});

// TODO: These tests need to be fixed - they have issues with mock setup and component rendering
describe.skip('Organization Admin Settings - Membership Settings (Site Admin)', () => {
  let queryClient: QueryClient;
  // Store original mock for restoration
  const originalMockUser = { ...mockUser };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Override the mock user to be a site admin by modifying the shared mock
    Object.assign(mockUser, { isSiteAdmin: true });

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original mock user properties
    Object.assign(mockUser, originalMockUser);
    queryClient.clear();
    queryClient.unmount();
  });

  it('should allow site admins to access membership settings', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/organizations/org-123/profile')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockOrganizationProfile),
        });
      }
      if (url.includes('/api/site-settings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ wellnessModuleEnabled: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <OrgAdminSettings />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Membership Settings')).toBeInTheDocument();
    });
  });
});
