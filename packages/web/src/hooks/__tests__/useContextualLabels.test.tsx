/**
 * Unit tests for useContextualLabels hook
 * Tests contextual label generation based on organization type
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { OrganizationType } from '@shared/organization-type-utils';

// Unmock the module so we can test the actual implementation
vi.unmock('@/hooks/useContextualLabels');

// Import after unmocking
const { useContextualLabels, useContextualLabelsFor } = await import('../useContextualLabels');

// Mock useAuth
const mockOrganizationContext = vi.fn();
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    organizationContext: mockOrganizationContext(),
  }),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useContextualLabels', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    vi.clearAllMocks();
    mockOrganizationContext.mockReturnValue(null);
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('Default behavior (no organization)', () => {
    it('should return default labels when organizationContext is null', () => {
      mockOrganizationContext.mockReturnValue(null);

      const { result } = renderHook(() => useContextualLabels(), { wrapper });

      expect(result.current.team).toBe('Team');
      expect(result.current.teams).toBe('Teams');
      expect(result.current.coach).toBe('Coach');
      expect(result.current.coaches).toBe('Coaches');
      expect(result.current.athlete).toBe('Athlete');
      expect(result.current.athletes).toBe('Athletes');
      expect(result.current.orgType).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should not fetch when organizationContext is null', () => {
      mockOrganizationContext.mockReturnValue(null);

      renderHook(() => useContextualLabels(), { wrapper });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Organization type label mapping', () => {
    const testCases: Array<{
      orgType: OrganizationType;
      expected: {
        team: string;
        teams: string;
        coach: string;
        coaches: string;
        athlete: string;
        athletes: string;
      };
    }> = [
      {
        orgType: 'youth',
        expected: {
          team: 'Group',
          teams: 'Groups',
          coach: 'Coach',
          coaches: 'Coaches',
          athlete: 'Player',
          athletes: 'Players',
        },
      },
      {
        orgType: 'high_school',
        expected: {
          team: 'Team',
          teams: 'Teams',
          coach: 'Coach',
          coaches: 'Coaches',
          athlete: 'Athlete',
          athletes: 'Athletes',
        },
      },
      {
        orgType: 'college',
        expected: {
          team: 'Team',
          teams: 'Teams',
          coach: 'Coach',
          coaches: 'Coaches',
          athlete: 'Athlete',
          athletes: 'Athletes',
        },
      },
      {
        orgType: 'club',
        expected: {
          team: 'Team',
          teams: 'Teams',
          coach: 'Coach',
          coaches: 'Coaches',
          athlete: 'Player',
          athletes: 'Players',
        },
      },
      {
        orgType: 'private_facility',
        expected: {
          team: 'Group',
          teams: 'Groups',
          coach: 'Trainer',
          coaches: 'Trainers',
          athlete: 'Client',
          athletes: 'Clients',
        },
      },
      {
        orgType: 'elite_academy',
        expected: {
          team: 'Squad',
          teams: 'Squads',
          coach: 'Coach',
          coaches: 'Coaches',
          athlete: 'Athlete',
          athletes: 'Athletes',
        },
      },
    ];

    testCases.forEach(({ orgType, expected }) => {
      it(`should return correct labels for ${orgType}`, async () => {
        const orgId = 'test-org-id';
        mockOrganizationContext.mockReturnValue(orgId);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: orgId, orgType }),
        });

        const { result } = renderHook(() => useContextualLabels(), { wrapper });

        await waitFor(() => {
          expect(result.current.orgType).toBe(orgType);
        });

        expect(result.current.team).toBe(expected.team);
        expect(result.current.teams).toBe(expected.teams);
        expect(result.current.coach).toBe(expected.coach);
        expect(result.current.coaches).toBe(expected.coaches);
        expect(result.current.athlete).toBe(expected.athlete);
        expect(result.current.athletes).toBe(expected.athletes);
      });
    });
  });

  describe('Loading and error states', () => {
    it('should show loading state while fetching', async () => {
      const orgId = 'test-org-id';
      mockOrganizationContext.mockReturnValue(orgId);

      // Delay the fetch response
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ id: orgId, orgType: 'club' }),
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useContextualLabels(), { wrapper });

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should return default labels when fetch fails', async () => {
      const orgId = 'test-org-id';
      mockOrganizationContext.mockReturnValue(orgId);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useContextualLabels(), { wrapper });

      // Default labels should always be available
      expect(result.current.team).toBe('Team');
      expect(result.current.teams).toBe('Teams');
      expect(result.current.coach).toBe('Coach');
      expect(result.current.athlete).toBe('Athlete');
    });

    it('should return default labels while loading', () => {
      const orgId = 'test-org-id';
      mockOrganizationContext.mockReturnValue(orgId);

      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useContextualLabels(), { wrapper });

      // While loading, should use defaults
      expect(result.current.team).toBe('Team');
      expect(result.current.teams).toBe('Teams');
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('Caching behavior', () => {
    it('should use correct query key format', async () => {
      const orgId = 'test-org-123';
      mockOrganizationContext.mockReturnValue(orgId);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: orgId, orgType: 'club' }),
      });

      const { result } = renderHook(() => useContextualLabels(), { wrapper });

      await waitFor(() => {
        expect(result.current.orgType).toBe('club');
      });

      // Verify query is cached with structured key
      const cachedData = queryClient.getQueryData(['organizations', orgId, 'details']);
      expect(cachedData).toEqual({ id: orgId, orgType: 'club' });
    });

    it('should not refetch when re-rendering with same organizationId', async () => {
      const orgId = 'test-org-id';
      mockOrganizationContext.mockReturnValue(orgId);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: orgId, orgType: 'club' }),
      });

      const { result, rerender } = renderHook(() => useContextualLabels(), { wrapper });

      await waitFor(() => {
        expect(result.current.orgType).toBe('club');
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Rerender
      rerender();

      // Should still only be 1 fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('API call', () => {
    it('should call correct API endpoint', async () => {
      const orgId = 'org-uuid-123';
      mockOrganizationContext.mockReturnValue(orgId);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: orgId, orgType: 'college' }),
      });

      const { result } = renderHook(() => useContextualLabels(), { wrapper });

      await waitFor(() => {
        expect(result.current.orgType).toBe('college');
      });

      expect(mockFetch).toHaveBeenCalledWith(`/api/organizations/${orgId}`);
    });
  });

  describe('all property', () => {
    it('should include complete terminology set', async () => {
      const orgId = 'test-org-id';
      mockOrganizationContext.mockReturnValue(orgId);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: orgId, orgType: 'private_facility' }),
      });

      const { result } = renderHook(() => useContextualLabels(), { wrapper });

      await waitFor(() => {
        expect(result.current.orgType).toBe('private_facility');
      });

      expect(result.current.all).toBeDefined();
      expect(result.current.all.group).toBeDefined();
      expect(result.current.all.coach).toBeDefined();
      expect(result.current.all.athlete).toBeDefined();
      expect(result.current.all.group.singular).toBe('Group');
      expect(result.current.all.group.plural).toBe('Groups');
    });
  });
});

describe('useContextualLabelsFor', () => {
  it('should return labels for explicit organization type', () => {
    const { result } = renderHook(() => useContextualLabelsFor('private_facility'));

    expect(result.current.team).toBe('Group');
    expect(result.current.teams).toBe('Groups');
    expect(result.current.coach).toBe('Trainer');
    expect(result.current.coaches).toBe('Trainers');
    expect(result.current.athlete).toBe('Client');
    expect(result.current.athletes).toBe('Clients');
    expect(result.current.orgType).toBe('private_facility');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should return default labels for null organization type', () => {
    const { result } = renderHook(() => useContextualLabelsFor(null));

    expect(result.current.team).toBe('Team');
    expect(result.current.teams).toBe('Teams');
    expect(result.current.orgType).toBeNull();
  });

  it('should return default labels for undefined organization type', () => {
    const { result } = renderHook(() => useContextualLabelsFor(undefined));

    expect(result.current.team).toBe('Team');
    expect(result.current.teams).toBe('Teams');
    expect(result.current.orgType).toBeNull();
  });

  it('should update labels when orgType changes', () => {
    const { result, rerender } = renderHook(
      ({ orgType }) => useContextualLabelsFor(orgType),
      { initialProps: { orgType: 'club' as OrganizationType | null } }
    );

    expect(result.current.team).toBe('Team');

    rerender({ orgType: 'elite_academy' });

    expect(result.current.team).toBe('Squad');
    expect(result.current.athlete).toBe('Athlete');
  });

  it('should return correct labels for all organization types', () => {
    const orgTypes: OrganizationType[] = [
      'youth',
      'high_school',
      'college',
      'club',
      'private_facility',
      'elite_academy',
    ];

    orgTypes.forEach((orgType) => {
      const { result } = renderHook(() => useContextualLabelsFor(orgType));

      // All labels should be non-empty strings
      expect(result.current.team.length).toBeGreaterThan(0);
      expect(result.current.teams.length).toBeGreaterThan(0);
      expect(result.current.coach.length).toBeGreaterThan(0);
      expect(result.current.coaches.length).toBeGreaterThan(0);
      expect(result.current.athlete.length).toBeGreaterThan(0);
      expect(result.current.athletes.length).toBeGreaterThan(0);
    });
  });
});
