/**
 * TDD Tests for Events menu item in sidebar
 *
 * RED phase: These tests will fail until sidebar.tsx is updated
 * to include Events menu items and eventsEnabled filtering.
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

describe('Sidebar Events Menu Item', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockUseAuth = () => ({
      user: {
        id: 'user-1',
        role: 'coach',
        isSiteAdmin: false,
        athleteId: undefined,
      },
      logout: vi.fn(),
    });

    mockUseLocation = () => ['/dashboard'];

    mockUseContextualLabels = () => ({
      teams: 'Teams',
      athletes: 'Athletes',
    });

    mockUseQuery = (options: any) => {
      const key = options.queryKey?.[0] || '';

      if (key.includes('/api/auth/me/organizations')) {
        return { data: [{ organizationId: 'org-1' }] };
      }
      if (key.includes('/api/site-settings')) {
        return { data: { wellnessModuleEnabled: true } };
      }
      if (key.includes('/api/organizations/')) {
        // Organization query - return eventsEnabled: true by default
        return { data: { eventsEnabled: true, wellnessEnabled: true } };
      }
      return { data: null };
    };
  });

  describe('Coach Navigation', () => {
    it('should show Events menu item for coaches when eventsEnabled is true', async () => {
      const Sidebar = (await import('../sidebar')).default;
      render(<Sidebar />);

      await waitFor(() => {
        // This test will FAIL until sidebar.tsx includes Events in coach navigation
        expect(screen.getByTestId('nav-item-events')).toBeInTheDocument();
      });
    });

    it('should NOT show Events menu item when eventsEnabled is false', async () => {
      // Override mock to return eventsEnabled: false
      mockUseQuery = (options: any) => {
        const key = options.queryKey?.[0] || '';

        if (key.includes('/api/auth/me/organizations')) {
          return { data: [{ organizationId: 'org-1' }] };
        }
        if (key.includes('/api/site-settings')) {
          return { data: { wellnessModuleEnabled: true } };
        }
        if (key.includes('/api/organizations/')) {
          return { data: { eventsEnabled: false, wellnessEnabled: true } };
        }
        return { data: null };
      };

      const Sidebar = (await import('../sidebar')).default;
      render(<Sidebar />);

      await waitFor(() => {
        // Events should NOT be in the navigation when eventsEnabled is false
        expect(screen.queryByTestId('nav-item-events')).not.toBeInTheDocument();
      });
    });

    it('should position Events menu item after Data Entry', async () => {
      const Sidebar = (await import('../sidebar')).default;
      render(<Sidebar />);

      await waitFor(() => {
        const navMenu = screen.getByTestId('navigation-menu');
        const navItems = navMenu.querySelectorAll('a');
        const navItemNames = Array.from(navItems).map(item => item.textContent);

        const dataEntryIndex = navItemNames.indexOf('Data Entry');
        const eventsIndex = navItemNames.indexOf('Events');

        // Events should come after Data Entry
        expect(eventsIndex).toBeGreaterThan(dataEntryIndex);
      });
    });
  });

  describe('Org Admin Navigation', () => {
    beforeEach(() => {
      mockUseAuth = () => ({
        user: {
          id: 'user-1',
          role: 'org_admin',
          isSiteAdmin: false,
          athleteId: undefined,
        },
        logout: vi.fn(),
      });
    });

    it('should show Events menu item for org admins when eventsEnabled is true', async () => {
      const Sidebar = (await import('../sidebar')).default;
      render(<Sidebar />);

      await waitFor(() => {
        expect(screen.getByTestId('nav-item-events')).toBeInTheDocument();
      });
    });
  });

  describe('Athlete Navigation', () => {
    beforeEach(() => {
      mockUseAuth = () => ({
        user: {
          id: 'user-1',
          role: 'athlete',
          isSiteAdmin: false,
          athleteId: 'athlete-1',
        },
        logout: vi.fn(),
      });
    });

    it('should show My Events menu item for athletes when eventsEnabled is true', async () => {
      const Sidebar = (await import('../sidebar')).default;
      render(<Sidebar />);

      await waitFor(() => {
        // This test will FAIL until sidebar.tsx includes My Events in athlete navigation
        expect(screen.getByTestId('nav-item-my-events')).toBeInTheDocument();
      });
    });

    it('should NOT show My Events when eventsEnabled is false', async () => {
      mockUseQuery = (options: any) => {
        const key = options.queryKey?.[0] || '';

        if (key.includes('/api/auth/me/organizations')) {
          return { data: [{ organizationId: 'org-1' }] };
        }
        if (key.includes('/api/site-settings')) {
          return { data: { wellnessModuleEnabled: true } };
        }
        if (key.includes('/api/organizations/')) {
          return { data: { eventsEnabled: false, wellnessEnabled: true } };
        }
        return { data: null };
      };

      const Sidebar = (await import('../sidebar')).default;
      render(<Sidebar />);

      await waitFor(() => {
        expect(screen.queryByTestId('nav-item-my-events')).not.toBeInTheDocument();
      });
    });

    it('should link My Events to /my-events route', async () => {
      const Sidebar = (await import('../sidebar')).default;
      render(<Sidebar />);

      await waitFor(() => {
        const myEventsLink = screen.getByTestId('nav-item-my-events');
        expect(myEventsLink).toHaveAttribute('href', '/my-events');
      });
    });
  });

  describe('Site Admin Navigation', () => {
    beforeEach(() => {
      mockUseAuth = () => ({
        user: {
          id: 'user-1',
          role: 'site_admin',
          isSiteAdmin: true,
          athleteId: undefined,
        },
        logout: vi.fn(),
      });
    });

    it('should show Events menu item in organization context', async () => {
      // Site admin viewing an organization
      mockUseLocation = () => ['/organizations/org-1/teams'];

      const Sidebar = (await import('../sidebar')).default;
      render(<Sidebar />);

      await waitFor(() => {
        expect(screen.getByTestId('nav-item-events')).toBeInTheDocument();
      });
    });
  });
});
