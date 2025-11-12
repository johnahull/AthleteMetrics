/**
 * Unit tests for benchmark groups API hooks
 * Tests React Query hooks for benchmark group management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSiteBenchmarkGroups,
  useSiteBenchmarkGroup,
  useCreateSiteBenchmarkGroup,
  useUpdateSiteBenchmarkGroup,
  useDeleteSiteBenchmarkGroup,
  useCustomBenchmarkGroups,
  useCustomBenchmarkGroup,
  useCreateCustomBenchmarkGroup,
  useUpdateCustomBenchmarkGroup,
  useDeleteCustomBenchmarkGroup,
} from '../benchmark-groups-api';
import React, { type ReactNode } from 'react';

// Mock fetch
global.fetch = vi.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('Benchmark Groups API Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useSiteBenchmarkGroups', () => {
    it('should fetch site benchmark groups', async () => {
      const mockGroups = [
        {
          id: '1',
          name: 'Elite Standards',
          description: 'Top performer benchmarks',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockGroups,
      });

      const { result } = renderHook(() => useSiteBenchmarkGroups(false, false), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockGroups);
      expect(global.fetch).toHaveBeenCalledWith('/api/benchmark-groups?');
    });

    it('should include inactive groups when requested', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useSiteBenchmarkGroups(true, false), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/benchmark-groups?includeInactive=true'
      );
    });

    it('should include members when requested', async () => {
      const mockGroupsWithMembers = [
        {
          id: '1',
          name: 'Test Group',
          benchmarks: [
            { id: 'b1', name: 'Benchmark 1' },
            { id: 'b2', name: 'Benchmark 2' },
          ],
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockGroupsWithMembers,
      });

      const { result } = renderHook(() => useSiteBenchmarkGroups(false, true), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockGroupsWithMembers);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/benchmark-groups?includeMembers=true'
      );
    });

    it('should handle fetch errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => useSiteBenchmarkGroups(false, false), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeDefined();
    });
  });

  describe('useCustomBenchmarkGroups', () => {
    it('should fetch custom benchmark groups for organization', async () => {
      const mockGroups = [
        {
          id: '1',
          name: 'Custom Group',
          organizationId: 'org-1',
          isActive: true,
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockGroups,
      });

      const { result } = renderHook(
        () => useCustomBenchmarkGroups('org-1', false, false),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockGroups);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/organizations/org-1/benchmark-groups/custom?'
      );
    });

    it('should not fetch when organizationId is empty', () => {
      const { result } = renderHook(
        () => useCustomBenchmarkGroups('', false, false),
        {
          wrapper: createWrapper(),
        }
      );

      // Query should be disabled
      expect(result.current.fetchStatus).toBe('idle');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should use fetchStatus correctly for disabled queries', () => {
      const { result } = renderHook(
        () => useCustomBenchmarkGroups('', false, false),
        {
          wrapper: createWrapper(),
        }
      );

      // When query is disabled, fetchStatus should be 'idle', not 'fetching'
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useCreateSiteBenchmarkGroup', () => {
    it('should create a site benchmark group', async () => {
      const newGroup = {
        name: 'New Group',
        description: 'Test description',
        isActive: true,
      };

      const createdGroup = {
        id: '123',
        ...newGroup,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => createdGroup,
      });

      const { result } = renderHook(() => useCreateSiteBenchmarkGroup(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(newGroup);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(createdGroup);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/benchmark-groups',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newGroup),
        })
      );
    });
  });

  describe('useUpdateSiteBenchmarkGroup', () => {
    it('should update a site benchmark group', async () => {
      const updatedData = {
        name: 'Updated Name',
        description: 'Updated description',
      };

      const updatedGroup = {
        id: '123',
        ...updatedData,
        isActive: true,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => updatedGroup,
      });

      const { result } = renderHook(() => useUpdateSiteBenchmarkGroup(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: '123', data: updatedData });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/benchmark-groups/123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updatedData),
        })
      );
    });
  });

  describe('useDeleteSiteBenchmarkGroup', () => {
    it('should delete a site benchmark group', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      const { result } = renderHook(() => useDeleteSiteBenchmarkGroup(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('123');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/benchmark-groups/123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('useCreateCustomBenchmarkGroup', () => {
    it('should create a custom benchmark group', async () => {
      const newGroup = {
        name: 'Custom Group',
        description: 'Org-specific group',
        isActive: true,
      };

      const createdGroup = {
        id: '456',
        organizationId: 'org-1',
        ...newGroup,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => createdGroup,
      });

      const { result } = renderHook(() => useCreateCustomBenchmarkGroup(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ organizationId: 'org-1', data: newGroup });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/organizations/org-1/benchmark-groups/custom',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newGroup),
        })
      );
    });
  });

  describe('useDeleteCustomBenchmarkGroup', () => {
    it('should delete a custom benchmark group', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      const { result } = renderHook(() => useDeleteCustomBenchmarkGroup(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ organizationId: 'org-1', id: '456' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/organizations/org-1/benchmark-groups/custom/456',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('Query State Management', () => {
    it('should handle loading states correctly with fetchStatus', async () => {
      (global.fetch as any).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ ok: true, json: async () => [] }),
              100
            )
          )
      );

      const { result } = renderHook(
        () => useCustomBenchmarkGroups('org-1', false, false),
        {
          wrapper: createWrapper(),
        }
      );

      // Should be fetching initially
      expect(result.current.fetchStatus).toBe('fetching');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Should be idle after success
      expect(result.current.fetchStatus).toBe('idle');
    });

    it('should not show loading when query is disabled', () => {
      const { result } = renderHook(
        () => useCustomBenchmarkGroups('', false, false),
        {
          wrapper: createWrapper(),
        }
      );

      // Disabled query should have fetchStatus='idle', not 'fetching'
      expect(result.current.fetchStatus).toBe('idle');
      expect(result.current.isLoading).toBe(false);
    });
  });
});
