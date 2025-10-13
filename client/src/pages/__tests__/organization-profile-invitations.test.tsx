/**
 * TDD Tests for Organization Profile - User Invitation Functionality
 *
 * These tests verify that org admins and coaches can invite new users
 * (org admins and coaches) to their organization through the "Manage Users" button.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import OrganizationProfile from '../organization-profile';

// Mock dependencies
vi.mock('wouter', () => ({
  useParams: () => ({ id: 'org-123' }),
  useLocation: () => ['/organizations/org-123', vi.fn()],
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Helper to create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

// Helper to render component with providers
function renderWithProviders(component: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
}

describe('Organization Profile - User Invitation Functionality (TDD)', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock successful organization profile API response
    global.fetch = vi.fn((url) => {
      if (typeof url === 'string' && url.includes('/api/organizations/org-123/profile')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'org-123',
            name: 'Test Organization',
            description: 'Test description',
            coaches: [
              {
                user: {
                  id: 'user-1',
                  firstName: 'John',
                  lastName: 'Doe',
                  email: 'john@test.com',
                },
                role: 'org_admin',
              },
            ],
            athletes: [],
            invitations: [],
          }),
        });
      }

      if (typeof url === 'string' && url.includes('/api/auth/me/organizations')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              organizationId: 'org-123',
              role: 'org_admin',
              organization: {
                id: 'org-123',
                name: 'Test Organization',
              },
            },
          ]),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }) as any;
  });

  describe('Manage Users Button Visibility', () => {
    it('should show "Manage Users" button when user is an org admin', async () => {
      const { useAuth } = await import('@/lib/auth');
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'user-1',
          username: 'orgadmin',
          firstName: 'Org',
          lastName: 'Admin',
          email: 'admin@test.com',
          isSiteAdmin: false,
        },
        isLoading: false,
        organizationContext: 'org-123',
        userOrganizations: [
          {
            organizationId: 'org-123',
            role: 'org_admin',
          },
        ],
        setOrganizationContext: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        impersonationStatus: null,
        startImpersonation: vi.fn(),
        stopImpersonation: vi.fn(),
        checkImpersonationStatus: vi.fn(),
      });

      renderWithProviders(<OrganizationProfile />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('Test Organization')).toBeInTheDocument();
      });

      // THIS TEST WILL FAIL because button doesn't exist yet
      const manageUsersButton = await screen.findByRole('button', { name: /manage users/i });
      expect(manageUsersButton).toBeInTheDocument();
    });

    it('should show "Manage Users" button when user is a coach', async () => {
      const { useAuth } = await import('@/lib/auth');
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'user-2',
          username: 'coach',
          firstName: 'Coach',
          lastName: 'Smith',
          email: 'coach@test.com',
          isSiteAdmin: false,
        },
        isLoading: false,
        organizationContext: 'org-123',
        userOrganizations: [
          {
            organizationId: 'org-123',
            role: 'coach',
          },
        ],
        setOrganizationContext: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        impersonationStatus: null,
        startImpersonation: vi.fn(),
        stopImpersonation: vi.fn(),
        checkImpersonationStatus: vi.fn(),
      });

      renderWithProviders(<OrganizationProfile />);

      await waitFor(() => {
        expect(screen.getByText('Test Organization')).toBeInTheDocument();
      });

      // THIS TEST WILL FAIL because button doesn't exist yet
      const manageUsersButton = await screen.findByRole('button', { name: /manage users/i });
      expect(manageUsersButton).toBeInTheDocument();
    });

    it('should show "Manage Users" button when user is a site admin', async () => {
      const { useAuth } = await import('@/lib/auth');
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'user-3',
          username: 'siteadmin',
          firstName: 'Site',
          lastName: 'Admin',
          email: 'siteadmin@test.com',
          isSiteAdmin: true,
        },
        isLoading: false,
        organizationContext: null,
        userOrganizations: null,
        setOrganizationContext: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        impersonationStatus: null,
        startImpersonation: vi.fn(),
        stopImpersonation: vi.fn(),
        checkImpersonationStatus: vi.fn(),
      });

      renderWithProviders(<OrganizationProfile />);

      await waitFor(() => {
        expect(screen.getByText('Test Organization')).toBeInTheDocument();
      });

      // THIS TEST WILL FAIL because button doesn't exist yet
      const manageUsersButton = await screen.findByRole('button', { name: /manage users/i });
      expect(manageUsersButton).toBeInTheDocument();
    });

    it('should NOT show "Manage Users" button when user is an athlete', async () => {
      const { useAuth } = await import('@/lib/auth');
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'user-4',
          username: 'athlete',
          firstName: 'Athlete',
          lastName: 'Jones',
          email: 'athlete@test.com',
          isSiteAdmin: false,
        },
        isLoading: false,
        organizationContext: 'org-123',
        userOrganizations: [
          {
            organizationId: 'org-123',
            role: 'athlete',
          },
        ],
        setOrganizationContext: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        impersonationStatus: null,
        startImpersonation: vi.fn(),
        stopImpersonation: vi.fn(),
        checkImpersonationStatus: vi.fn(),
      });

      renderWithProviders(<OrganizationProfile />);

      await waitFor(() => {
        expect(screen.getByText('Test Organization')).toBeInTheDocument();
      });

      // Athletes should NOT see the button
      const manageUsersButton = screen.queryByRole('button', { name: /manage users/i });
      expect(manageUsersButton).not.toBeInTheDocument();
    });
  });

  describe('Manage Users Modal Functionality', () => {
    it('should open modal when "Manage Users" button is clicked', async () => {
      const user = userEvent.setup();
      const { useAuth } = await import('@/lib/auth');
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'user-1',
          username: 'orgadmin',
          firstName: 'Org',
          lastName: 'Admin',
          email: 'admin@test.com',
          isSiteAdmin: false,
        },
        isLoading: false,
        organizationContext: 'org-123',
        userOrganizations: [
          {
            organizationId: 'org-123',
            role: 'org_admin',
          },
        ],
        setOrganizationContext: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        impersonationStatus: null,
        startImpersonation: vi.fn(),
        stopImpersonation: vi.fn(),
        checkImpersonationStatus: vi.fn(),
      });

      renderWithProviders(<OrganizationProfile />);

      await waitFor(() => {
        expect(screen.getByText('Test Organization')).toBeInTheDocument();
      });

      // THIS TEST WILL FAIL because button doesn't exist yet
      const manageUsersButton = await screen.findByRole('button', { name: /manage users/i });
      await user.click(manageUsersButton);

      // Modal should appear with title
      await waitFor(() => {
        expect(screen.getByText('User Management')).toBeInTheDocument();
      });
    });

    it('should have two tabs: "Create User" and "Send Invitation"', async () => {
      const user = userEvent.setup();
      const { useAuth } = await import('@/lib/auth');
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'user-1',
          username: 'orgadmin',
          firstName: 'Org',
          lastName: 'Admin',
          email: 'admin@test.com',
          isSiteAdmin: false,
        },
        isLoading: false,
        organizationContext: 'org-123',
        userOrganizations: [
          {
            organizationId: 'org-123',
            role: 'org_admin',
          },
        ],
        setOrganizationContext: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        impersonationStatus: null,
        startImpersonation: vi.fn(),
        stopImpersonation: vi.fn(),
        checkImpersonationStatus: vi.fn(),
      });

      renderWithProviders(<OrganizationProfile />);

      await waitFor(() => {
        expect(screen.getByText('Test Organization')).toBeInTheDocument();
      });

      // THIS TEST WILL FAIL because button doesn't exist yet
      const manageUsersButton = await screen.findByRole('button', { name: /manage users/i });
      await user.click(manageUsersButton);

      // Both tabs should be visible
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /create user/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /send invitation/i })).toBeInTheDocument();
      });
    });

    it('should have role selection with org_admin and coach options', async () => {
      const user = userEvent.setup();
      const { useAuth } = await import('@/lib/auth');
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'user-1',
          username: 'orgadmin',
          firstName: 'Org',
          lastName: 'Admin',
          email: 'admin@test.com',
          isSiteAdmin: false,
        },
        isLoading: false,
        organizationContext: 'org-123',
        userOrganizations: [
          {
            organizationId: 'org-123',
            role: 'org_admin',
          },
        ],
        setOrganizationContext: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        impersonationStatus: null,
        startImpersonation: vi.fn(),
        stopImpersonation: vi.fn(),
        checkImpersonationStatus: vi.fn(),
      });

      renderWithProviders(<OrganizationProfile />);

      await waitFor(() => {
        expect(screen.getByText('Test Organization')).toBeInTheDocument();
      });

      // THIS TEST WILL FAIL because button doesn't exist yet
      const manageUsersButton = await screen.findByRole('button', { name: /manage users/i });
      await user.click(manageUsersButton);

      // Check that role options include org_admin and coach
      await waitFor(() => {
        // In the Create User tab (default)
        expect(screen.getByLabelText(/organization admin/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^coach$/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^athlete$/i)).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    it('should validate required fields in "Send Invitation" tab', async () => {
      const user = userEvent.setup();
      const { useAuth } = await import('@/lib/auth');
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'user-1',
          username: 'orgadmin',
          firstName: 'Org',
          lastName: 'Admin',
          email: 'admin@test.com',
          isSiteAdmin: false,
        },
        isLoading: false,
        organizationContext: 'org-123',
        userOrganizations: [
          {
            organizationId: 'org-123',
            role: 'org_admin',
          },
        ],
        setOrganizationContext: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        impersonationStatus: null,
        startImpersonation: vi.fn(),
        stopImpersonation: vi.fn(),
        checkImpersonationStatus: vi.fn(),
      });

      renderWithProviders(<OrganizationProfile />);

      await waitFor(() => {
        expect(screen.getByText('Test Organization')).toBeInTheDocument();
      });

      // THIS TEST WILL FAIL because button doesn't exist yet
      const manageUsersButton = await screen.findByRole('button', { name: /manage users/i });
      await user.click(manageUsersButton);

      // Switch to "Send Invitation" tab
      const inviteTab = await screen.findByRole('tab', { name: /send invitation/i });
      await user.click(inviteTab);

      // Try to submit without filling fields
      const submitButton = screen.getByTestId('button-send-invitation');
      await user.click(submitButton);

      // Should show validation errors
      await waitFor(() => {
        expect(screen.getByText(/email.*required/i) || screen.getByText(/invalid email/i)).toBeInTheDocument();
      });
    });
  });
});
