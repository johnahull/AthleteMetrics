import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardScopeSelector } from '../DashboardScopeSelector';

// Mock data
const mockTeams = [
  { id: 'team-1', name: 'Varsity Team', organizationId: 'org-123' },
  { id: 'team-2', name: 'JV Team', organizationId: 'org-123' },
];

const mockAthletes = [
  { id: 'athlete-1', firstName: 'John', lastName: 'Doe', fullName: 'John Doe' },
  { id: 'athlete-2', firstName: 'Jane', lastName: 'Smith', fullName: 'Jane Smith' },
];

// Mock fetch
global.fetch = vi.fn();

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('DashboardScopeSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default fetch mock
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/teams')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTeams),
        });
      }
      if (url.includes('/api/users?teamId=')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockAthletes),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  describe('Organization Scope', () => {
    it('should render organization view with org name', async () => {
      const mockOnScopeChange = vi.fn();

      render(
        <DashboardScopeSelector
          organizationId="org-123"
          organizationName="Test Org"
          scope={{
            view: 'organization',
            organizationId: 'org-123',
            teamId: null,
            athleteId: null,
          }}
          onScopeChange={mockOnScopeChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/Test Org/i)).toBeInTheDocument();
    });

    it('should fetch teams when organization is selected', async () => {
      const mockOnScopeChange = vi.fn();

      render(
        <DashboardScopeSelector
          organizationId="org-123"
          organizationName="Test Org"
          scope={{
            view: 'organization',
            organizationId: 'org-123',
            teamId: null,
            athleteId: null,
          }}
          onScopeChange={mockOnScopeChange}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/teams?organizationId=org-123'),
          expect.any(Object)
        );
      });
    });

    it('should show placeholder when no organization is selected', () => {
      const mockOnScopeChange = vi.fn();

      render(
        <DashboardScopeSelector
          organizationId={null}
          organizationName={null}
          scope={{
            view: 'organization',
            organizationId: null,
            teamId: null,
            athleteId: null,
          }}
          onScopeChange={mockOnScopeChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/Select an organization/i)).toBeInTheDocument();
    });
  });

  describe('Team Scope', () => {
    it('should display team name when team scope is active', async () => {
      const mockOnScopeChange = vi.fn();

      render(
        <DashboardScopeSelector
          organizationId="org-123"
          organizationName="Test Org"
          scope={{
            view: 'team',
            organizationId: 'org-123',
            teamId: 'team-1',
            athleteId: null,
          }}
          onScopeChange={mockOnScopeChange}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('Varsity Team')).toBeInTheDocument();
      });
    });

    it('should fetch athletes when team is selected', async () => {
      const mockOnScopeChange = vi.fn();

      render(
        <DashboardScopeSelector
          organizationId="org-123"
          organizationName="Test Org"
          scope={{
            view: 'team',
            organizationId: 'org-123',
            teamId: 'team-1',
            athleteId: null,
          }}
          onScopeChange={mockOnScopeChange}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/users?teamId=team-1'),
          expect.any(Object)
        );
      });
    });

    it('should show Team View fallback when team name not loaded', async () => {
      const mockOnScopeChange = vi.fn();

      // Mock empty teams array
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/teams')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      render(
        <DashboardScopeSelector
          organizationId="org-123"
          organizationName="Test Org"
          scope={{
            view: 'team',
            organizationId: 'org-123',
            teamId: 'unknown-team',
            athleteId: null,
          }}
          onScopeChange={mockOnScopeChange}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('Team View')).toBeInTheDocument();
      });
    });
  });

  describe('Athlete Scope', () => {
    it('should display athlete name when athlete scope is active', async () => {
      const mockOnScopeChange = vi.fn();

      render(
        <DashboardScopeSelector
          organizationId="org-123"
          organizationName="Test Org"
          scope={{
            view: 'athlete',
            organizationId: 'org-123',
            teamId: 'team-1',
            athleteId: 'athlete-1',
          }}
          onScopeChange={mockOnScopeChange}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('should show Athlete View fallback when athlete name not loaded', async () => {
      const mockOnScopeChange = vi.fn();

      // Mock empty athletes array
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/teams')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTeams),
          });
        }
        if (url.includes('/api/users?teamId=')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      render(
        <DashboardScopeSelector
          organizationId="org-123"
          organizationName="Test Org"
          scope={{
            view: 'athlete',
            organizationId: 'org-123',
            teamId: 'team-1',
            athleteId: 'unknown-athlete',
          }}
          onScopeChange={mockOnScopeChange}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText('Athlete View')).toBeInTheDocument();
      });
    });
  });

  describe('Props and Callbacks', () => {
    it('should accept organizationId prop', () => {
      const mockOnScopeChange = vi.fn();

      const { rerender } = render(
        <DashboardScopeSelector
          organizationId="org-123"
          organizationName="Test Org"
          scope={{
            view: 'organization',
            organizationId: 'org-123',
            teamId: null,
            athleteId: null,
          }}
          onScopeChange={mockOnScopeChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/Test Org/i)).toBeInTheDocument();

      // Change organization
      rerender(
        <DashboardScopeSelector
          organizationId="org-456"
          organizationName="New Org"
          scope={{
            view: 'organization',
            organizationId: 'org-456',
            teamId: null,
            athleteId: null,
          }}
          onScopeChange={mockOnScopeChange}
        />
      );

      expect(screen.getByText(/New Org/i)).toBeInTheDocument();
    });
  });
});
