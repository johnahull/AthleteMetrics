/**
 * User Management page: site-admin-only controls must not render for org admins.
 * (Site admin creation, per-user role change, activate/deactivate and delete all
 * hit endpoints that require a site admin.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

let mockUser: any;
let useQueryCalls: any[] = [];
let orgsResponse: any = undefined; // undefined = use the default fixture; null = no roster (e.g. a coach got a 403)

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mockUser }) }));

vi.mock('wouter', () => ({
  useLocation: () => ['/user-management', vi.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/components/users/UnaffiliatedUsersSection', () => ({
  UnaffiliatedUsersSection: () => <div data-testid="unaffiliated-users" />,
}));

vi.mock('@/components/membership/PendingMembershipRequests', () => ({
  PendingMembershipRequests: () => <div data-testid="pending-membership-requests" />,
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  STALE_TIME: { REALTIME: 0 },
}));

const orgWithUsers = [
  {
    id: 'org-1',
    name: 'Test Org',
    createdAt: '2025-01-01',
    users: [
      {
        id: 'uo-1',
        userId: 'u-2',
        organizationId: 'org-1',
        role: 'coach',
        createdAt: '2025-01-01',
        user: {
          id: 'u-2',
          username: 'coach1',
          email: 'coach1@example.com',
          firstName: 'Casey',
          lastName: 'Coach',
          isActive: true,
          createdAt: '2025-01-01',
        },
      },
    ],
    invitations: [],
  },
];

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
    useQuery: (options: any) => {
      useQueryCalls.push(options);
      const key = options.queryKey?.[0];
      if (key === '/api/organizations-with-users') {
        return { data: orgsResponse === undefined ? orgWithUsers : (orgsResponse ?? undefined) };
      }
      if (key === '/api/site-admins') return { data: [] };
      if (key === '/api/auth/me/organizations') return { data: [{ organizationId: 'org-1' }] };
      return { data: undefined };
    },
  };
});

async function renderPage() {
  const UserManagement = (await import('../user-management')).default;
  const result = render(<UserManagement />);
  // Organizations start collapsed; expand to show the user rows
  fireEvent.click(screen.getByRole('button', { name: /expand test org users/i }));
  return result;
}

describe('User Management page - role-based controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryCalls = [];
    orgsResponse = undefined;
  });

  describe('pending membership requests section', () => {
    it('is shown to an org admin', async () => {
      mockUser = { id: 'u-1', role: 'org_admin', isSiteAdmin: false };
      await renderPage();
      expect(screen.getByTestId('pending-membership-requests')).toBeInTheDocument();
    });

    it('is shown to a site admin', async () => {
      mockUser = { id: 'u-0', role: 'site_admin', isSiteAdmin: true };
      await renderPage();
      expect(screen.getByTestId('pending-membership-requests')).toBeInTheDocument();
    });

    it('is not shown when the server returned no roster (a coach gets a 403 there)', async () => {
      mockUser = { id: 'u-3', role: 'coach', isSiteAdmin: false };
      orgsResponse = null;
      const UserManagement = (await import('../user-management')).default;
      render(<UserManagement />);
      expect(screen.queryByTestId('pending-membership-requests')).not.toBeInTheDocument();
    });
  });

  describe('as org admin', () => {
    beforeEach(() => {
      mockUser = { id: 'u-1', role: 'org_admin', isSiteAdmin: false };
    });

    it('does not render the Site Administrators section or add button', async () => {
      await renderPage();
      expect(screen.queryByTestId('add-site-admin-button')).not.toBeInTheDocument();
      expect(screen.queryByText('Site Administrators')).not.toBeInTheDocument();
    });

    it('does not fetch /api/site-admins (site admin only)', async () => {
      await renderPage();
      const call = useQueryCalls.find((o) => o.queryKey?.[0] === '/api/site-admins');
      expect(call?.enabled).toBe(false);
    });

    it('still offers inviting users', async () => {
      await renderPage();
      expect(screen.getByTestId('send-invitation-button')).toBeInTheDocument();
    });

    it('does not render per-user role select, status toggle or delete', async () => {
      await renderPage();
      expect(screen.getByTestId('user-name-u-2')).toBeInTheDocument();
      expect(screen.queryByTestId('user-role-select-u-2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('user-toggle-status-u-2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('user-delete-u-2')).not.toBeInTheDocument();
    });

    it('shows the user role as plain text', async () => {
      await renderPage();
      expect(screen.getByTestId('user-role-label-u-2')).toHaveTextContent(/coach/i);
    });
  });

  describe('as site admin', () => {
    beforeEach(() => {
      mockUser = { id: 'u-0', role: 'site_admin', isSiteAdmin: true };
    });

    it('renders the Site Administrators section and add button', async () => {
      await renderPage();
      expect(screen.getByTestId('add-site-admin-button')).toBeInTheDocument();
      const call = useQueryCalls.find((o) => o.queryKey?.[0] === '/api/site-admins');
      expect(call?.enabled).toBe(true);
    });

    it('renders per-user role select, status toggle and delete', async () => {
      await renderPage();
      expect(screen.getByTestId('user-role-select-u-2')).toBeInTheDocument();
      expect(screen.getByTestId('user-toggle-status-u-2')).toBeInTheDocument();
      expect(screen.getByTestId('user-delete-u-2')).toBeInTheDocument();
    });
  });
});
