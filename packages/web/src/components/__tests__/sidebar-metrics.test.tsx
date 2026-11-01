/**
 * Coaches get a read-only Metrics nav item pointing at their organization's metrics page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

let mockUseAuth: any;
let mockUseQuery: any;

vi.mock('@/lib/auth', () => ({ useAuth: vi.fn(() => mockUseAuth()) }));
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQuery: vi.fn((options: any) => mockUseQuery(options)) };
});
vi.mock('wouter', () => ({
  useLocation: vi.fn(() => ['/dashboard']),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/hooks/useContextualLabels', () => ({
  useContextualLabels: vi.fn(() => ({ teams: 'Teams', athletes: 'Athletes' })),
}));
vi.mock('../navigation-menu', () => ({
  NavigationMenu: ({ navigation }: { navigation: any[] }) => (
    <nav>
      {navigation.map((item: any) => (
        <a key={item.name} href={item.href} data-testid={`nav-item-${item.name.toLowerCase().replace(/\s+/g, '-')}`}>
          {item.name}
        </a>
      ))}
    </nav>
  ),
}));
vi.mock('../user-profile-display', () => ({ UserProfileDisplay: () => <div /> }));
vi.mock('../organization-display', () => ({ OrganizationDisplay: () => <div /> }));
vi.mock('../athlete/OrgSwitcher', () => ({ OrgSwitcher: () => <div /> }));
vi.mock('@/hooks/use-my-reports', () => ({
  useUnreadReportCount: vi.fn(() => ({ data: 0, isLoading: false })),
  useMyReports: vi.fn(() => ({ data: { reports: [] }, isLoading: false })),
  useMarkReportViewed: vi.fn(() => ({ mutate: vi.fn() })),
}));

describe('Sidebar Metrics menu item', () => {
  beforeEach(() => {
    mockUseAuth = () => ({
      user: { id: 'user-1', role: 'coach', isSiteAdmin: false, athleteId: undefined },
      logout: vi.fn(),
    });
    mockUseQuery = (options: any) => {
      const key = options.queryKey?.[0] || '';
      if (key.includes('/api/auth/me/organizations')) return { data: [{ organizationId: 'org-1' }] };
      if (key.includes('/api/site-settings')) return { data: { wellnessModuleEnabled: true } };
      if (key.includes('/api/organizations/')) return { data: { eventsEnabled: true, wellnessEnabled: true } };
      return { data: null };
    };
  });

  it('shows Metrics for coaches, linked to their organization', async () => {
    const Sidebar = (await import('../sidebar')).default;
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId('nav-item-metrics')).toHaveAttribute('href', '/organizations/org-1/metrics');
    });
  });
});
