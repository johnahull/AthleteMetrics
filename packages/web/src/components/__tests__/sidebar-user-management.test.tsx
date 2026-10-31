/**
 * User Management menu item in the sidebar: org admins (and site admins) get it,
 * coaches and athletes do not.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Store original mock implementations
let mockUseAuth: any;
let mockUseQuery: any;
let mockUseLocation: any;
let mockUseContextualLabels: any;

// Mock all dependencies
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => mockUseAuth()),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn((options: any) => mockUseQuery(options)),
  };
});

vi.mock('wouter', () => ({
  useLocation: vi.fn(() => mockUseLocation()),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/hooks/useContextualLabels', () => ({
  useContextualLabels: vi.fn(() => mockUseContextualLabels()),
}));

// Mock NavigationMenu to expose navigation items for testing
vi.mock('../navigation-menu', () => ({
  NavigationMenu: ({ navigation }: { navigation: any[] }) => (
    <nav data-testid="navigation-menu">
      {navigation.map((item: any) => (
        <a key={item.name} href={item.href} data-testid={`nav-item-${item.name.toLowerCase().replace(/\s+/g, '-')}`}>
          {item.name}
        </a>
      ))}
    </nav>
  ),
}));

vi.mock('../user-profile-display', () => ({
  UserProfileDisplay: () => <div data-testid="user-profile-display" />,
}));

vi.mock('../organization-display', () => ({
  OrganizationDisplay: () => <div data-testid="organization-display" />,
}));

vi.mock('../athlete/OrgSwitcher', () => ({
  OrgSwitcher: () => <div data-testid="org-switcher" />,
}));

// Mock use-my-reports hook (used by sidebar for report badge)
vi.mock('@/hooks/use-my-reports', () => ({
  useUnreadReportCount: vi.fn(() => ({ data: 0, isLoading: false })),
  useMyReports: vi.fn(() => ({ data: { reports: [] }, isLoading: false })),
  useMarkReportViewed: vi.fn(() => ({ mutate: vi.fn() })),
}));

describe('Sidebar User Management Menu Item', () => {
  const asRole = (role: string, isSiteAdmin = false) => {
    mockUseAuth = () => ({
      user: { id: 'user-1', role, isSiteAdmin, athleteId: role === 'athlete' ? 'athlete-1' : undefined },
      logout: vi.fn(),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocation = () => ['/dashboard'];
    mockUseContextualLabels = () => ({ teams: 'Teams', athletes: 'Athletes' });
    mockUseQuery = (options: any) => {
      const key = options.queryKey?.[0] || '';
      if (key.includes('/api/auth/me/organizations')) return { data: [{ organizationId: 'org-1' }] };
      if (key.includes('/api/site-settings')) return { data: { wellnessModuleEnabled: true } };
      if (key.includes('/api/organizations/')) return { data: { eventsEnabled: true, wellnessEnabled: true } };
      return { data: null };
    };
  });

  it('shows User Management for org admins, linking to /user-management', async () => {
    asRole('org_admin');
    const Sidebar = (await import('../sidebar')).default;
    render(<Sidebar />);

    await waitFor(() => {
      const item = screen.getByTestId('nav-item-user-management');
      expect(item).toHaveAttribute('href', '/user-management');
    });
  });

  it('shows User Management for site admins', async () => {
    asRole('site_admin', true);
    const Sidebar = (await import('../sidebar')).default;
    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByTestId('nav-item-user-management')).toBeInTheDocument();
    });
  });

  it.each(['coach', 'athlete'])('does not show User Management for %s', async (role) => {
    asRole(role);
    const Sidebar = (await import('../sidebar')).default;
    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByTestId('navigation-menu')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('nav-item-user-management')).not.toBeInTheDocument();
  });
});
