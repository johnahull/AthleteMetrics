/**
 * Unit Tests for useWellnessDashboard Hook
 *
 * Tests the React Query hook for fetching wellness dashboard data.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useWellnessDashboard } from '../use-wellness-dashboard';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useWellnessDashboard Hook', () => {
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
  });

  afterEach(() => {
    queryClient.clear();
  });

  // Mock dashboard data factory
  function createMockDashboardData(overrides = {}) {
    return {
      teamId: 'team-1',
      teamName: 'Test Team',
      teamStatus: 'green' as const,
      teamAverageScore: 7.5,
      redCount: 1,
      yellowCount: 2,
      greenCount: 7,
      totalAthletes: 10,
      completionRate: 85,
      trend: 'up' as const,
      commonInjuries: [],
      athletes: [],
      ...overrides,
    };
  }

  describe('query initialization', () => {
    it('should enable query when organizationId is provided and enabled is true', async () => {
      const mockData = [createMockDashboardData()];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123', enabled: true }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result.current.data).toEqual(mockData);
    });

    it('should disable query when organizationId is empty', async () => {
      const { result } = renderHook(
        () => useWellnessDashboard({ organizationId: '', enabled: true }),
        { wrapper }
      );

      // Query should not be called
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.data).toBeUndefined();
    });

    it('should disable query when enabled is false', async () => {
      const { result } = renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123', enabled: false }),
        { wrapper }
      );

      // Query should not be called
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.data).toBeUndefined();
    });

    it('should default enabled to true when not specified', async () => {
      const mockData = [createMockDashboardData()];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('URL construction', () => {
    it('should build correct base URL without optional params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/organizations/org-123/wellness/dashboard',
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('should append date param when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123', date: '2025-01-15' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/organizations/org-123/wellness/dashboard?date=2025-01-15',
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('should append teamIds param (comma-joined) when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      renderHook(
        () => useWellnessDashboard({
          organizationId: 'org-123',
          teamIds: ['team-1', 'team-2', 'team-3'],
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/organizations/org-123/wellness/dashboard?teamIds=team-1%2Cteam-2%2Cteam-3',
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('should combine date and teamIds when both provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      renderHook(
        () => useWellnessDashboard({
          organizationId: 'org-123',
          date: '2025-01-15',
          teamIds: ['team-1'],
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/api/organizations/org-123/wellness/dashboard');
      expect(calledUrl).toContain('date=2025-01-15');
      expect(calledUrl).toContain('teamIds=team-1');
    });

    it('should handle empty teamIds array (no param added)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      renderHook(
        () => useWellnessDashboard({
          organizationId: 'org-123',
          teamIds: [],
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/organizations/org-123/wellness/dashboard',
        expect.objectContaining({ credentials: 'include' })
      );
    });
  });

  describe('data fetching', () => {
    it('should return dashboard data array on success', async () => {
      const mockData = [
        createMockDashboardData({ teamId: 'team-1', teamName: 'Team A' }),
        createMockDashboardData({ teamId: 'team-2', teamName: 'Team B' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data![0].teamName).toBe('Team A');
      expect(result.current.data![1].teamName).toBe('Team B');
    });

    it('should set error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Custom error message' }),
      });

      const { result } = renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 5000 });

      expect(result.current.error).toBeInstanceOf(Error);
    });

    it('should include credentials in request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123' }),
        { wrapper }
      );

      // Wait for loading to complete (either success or error)
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 5000 });

      // Error should be set after network failure
      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  describe('return values', () => {
    it('should expose data property with dashboard data', async () => {
      const mockData = [createMockDashboardData()];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      expect(result.current.data).toEqual(mockData);
    });

    it('should expose isLoading property', async () => {
      mockFetch.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: async () => [],
        }), 100))
      );

      const { result } = renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123' }),
        { wrapper }
      );

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should expose error property', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Test error'));

      const { result } = renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 5000 });

      expect(result.current.error).toBeInstanceOf(Error);
    });

    it('should expose refetch function', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [createMockDashboardData({ teamAverageScore: 5 })],
      });

      const { result } = renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      expect(result.current.data![0].teamAverageScore).toBe(5);

      // Setup new data for refetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [createMockDashboardData({ teamAverageScore: 8 })],
      });

      // Refetch
      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.data![0].teamAverageScore).toBe(8);
      });
    });
  });

  describe('query key and caching', () => {
    it('should use correct query key structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      renderHook(
        () => useWellnessDashboard({
          organizationId: 'org-123',
          date: '2025-01-15',
          teamIds: ['team-1'],
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Check cache with query key
      const cacheData = queryClient.getQueryData([
        '/api/organizations/:orgId/wellness/dashboard',
        'org-123',
        '2025-01-15',
        ['team-1'],
      ]);
      expect(cacheData).toEqual([]);
    });

    it('should cache data between renders', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [createMockDashboardData()],
      });

      const { result, rerender } = renderHook(
        () => useWellnessDashboard({ organizationId: 'org-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      // Fetch should only be called once even after rerender
      rerender();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
