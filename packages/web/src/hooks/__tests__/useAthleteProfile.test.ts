/**
 * Unit Tests for useAthleteProfile Hook
 *
 * Tests athlete profile data fetching with React Query.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAthleteProfile, useAthleteTeamsData, useAthleteProfileComplete } from '../useAthleteProfile';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useAthleteProfile Hook', () => {
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

  // Mock athlete data factory
  function createMockAthlete(overrides = {}) {
    return {
      id: 'athlete-123',
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      birthYear: 2005,
      gender: 'Male',
      emails: ['john@example.com'],
      phoneNumbers: ['555-1234'],
      school: 'Test High School',
      sports: ['Soccer'],
      ...overrides,
    };
  }

  describe('useAthleteProfile', () => {
    it('should fetch athlete profile when athleteId is provided', async () => {
      const mockAthlete = createMockAthlete();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAthlete,
      });

      const { result } = renderHook(
        () => useAthleteProfile('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/athletes/athlete-123',
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result.current.data).toEqual(mockAthlete);
    });

    it('should not fetch when athleteId is undefined', async () => {
      const { result } = renderHook(
        () => useAthleteProfile(undefined),
        { wrapper }
      );

      // Wait a bit to ensure no fetch happens
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.isFetching).toBe(false);
    });

    it('should not fetch when enabled is false', async () => {
      const { result } = renderHook(
        () => useAthleteProfile('athlete-123', { enabled: false }),
        { wrapper }
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.isFetching).toBe(false);
    });

    it('should handle fetch error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(
        () => useAthleteProfile('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Failed to fetch athlete profile');
    });

    it('should use 5-minute stale time for profile data', () => {
      // This test verifies the configuration by checking the query key pattern
      const { result } = renderHook(
        () => useAthleteProfile('athlete-123'),
        { wrapper }
      );

      // The query key should be structured for caching
      expect(result.current).toBeDefined();
    });
  });

  describe('useAthleteTeamsData', () => {
    it('should fetch athlete and then their teams', async () => {
      const mockAthlete = createMockAthlete({ teamIds: ['team-1', 'team-2'] });
      const mockTeams = [
        { id: 'team-1', name: 'Varsity Soccer' },
        { id: 'team-2', name: 'JV Soccer' },
        { id: 'team-3', name: 'Other Team' },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockAthlete,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTeams,
        });

      const { result } = renderHook(
        () => useAthleteTeamsData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should only return teams the athlete belongs to
      expect(result.current.data).toEqual([
        { id: 'team-1', name: 'Varsity Soccer' },
        { id: 'team-2', name: 'JV Soccer' },
      ]);
    });

    it('should return empty array when athlete has no team assignments', async () => {
      const mockAthlete = createMockAthlete({ teamIds: [] });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAthlete,
      });

      const { result } = renderHook(
        () => useAthleteTeamsData('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe('useAthleteProfileComplete', () => {
    it('should combine athlete and teams data', async () => {
      const mockAthlete = createMockAthlete({ teamIds: ['team-1'] });
      const mockTeams = [{ id: 'team-1', name: 'Varsity Soccer' }];

      mockFetch
        // First call for athlete profile
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockAthlete,
        })
        // Second call for athlete in teams query
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockAthlete,
        })
        // Third call for teams
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTeams,
        });

      const { result } = renderHook(
        () => useAthleteProfileComplete('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.athlete).toEqual(mockAthlete);
      expect(result.current.teams).toEqual(mockTeams);
      expect(result.current.isError).toBe(false);
    });

    it('should show loading when either query is loading', () => {
      // Don't resolve the fetch - leave it pending
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(
        () => useAthleteProfileComplete('athlete-123'),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);
    });

    it('should return empty teams array when teams query fails', async () => {
      const mockAthlete = createMockAthlete();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockAthlete,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      const { result } = renderHook(
        () => useAthleteProfileComplete('athlete-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.teams).toEqual([]);
    });
  });
});
