/**
 * Unit Tests for useGoals Hook
 *
 * Tests all goal-related hooks:
 * - useGoals - Fetch goals with status filter
 * - useActiveGoals - Active goals convenience hook
 * - useGoal - Fetch single goal
 * - useCreateGoal - Create goal mutation
 * - useUpdateGoal - Update goal mutation
 * - useUpdateGoalStatus - Status-only update
 * - useDeleteGoal - Delete goal mutation
 * - useGoalsGrouped - Goals grouped by status
 * - useGoalsByMetric - Goals filtered by metric
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useGoals,
  useActiveGoals,
  useGoal,
  useCreateGoal,
  useUpdateGoal,
  useUpdateGoalStatus,
  useDeleteGoal,
  useGoalsGrouped,
  useGoalsByMetric,
  GoalStatus,
  GoalType,
} from '../useGoals';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useGoals Hooks', () => {
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

  // Mock goal data factory
  function createMockGoal(overrides = {}) {
    return {
      id: 'goal-123',
      userId: 'user-123',
      metric: 'FLY10_TIME',
      goalType: GoalType.TARGET_VALUE,
      targetValue: '1.0',
      baselineValue: '1.2',
      currentValue: '1.1',
      targetDate: '2024-12-31',
      status: GoalStatus.ACTIVE,
      notes: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: null,
      achievedAt: null,
      ...overrides,
    };
  }

  // Setup fetch mock for goals list
  function setupGoalsListFetch(goals: any[], statusFilter?: string) {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/goals')) {
        // Check if status filter applies
        if (statusFilter && !url.includes(`status=${statusFilter}`)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ goals }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ goals }),
        });
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ message: 'Not found' }),
      });
    });
  }

  // ============================================
  // useGoals Tests
  // ============================================
  describe('useGoals', () => {
    it('should fetch all goals successfully', async () => {
      const mockGoals = [
        createMockGoal({ id: 'goal-1' }),
        createMockGoal({ id: 'goal-2', metric: 'VERTICAL_JUMP' }),
      ];

      setupGoalsListFetch(mockGoals);

      const { result } = renderHook(() => useGoals(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data?.[0].id).toBe('goal-1');
    });

    it('should filter goals by status', async () => {
      const activeGoals = [createMockGoal({ status: GoalStatus.ACTIVE })];

      setupGoalsListFetch(activeGoals, GoalStatus.ACTIVE);

      const { result } = renderHook(
        () => useGoals({ status: GoalStatus.ACTIVE }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`status=${GoalStatus.ACTIVE}`),
        expect.any(Object)
      );
    });

    it('should handle fetch error', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ message: 'Failed to fetch goals' }),
        })
      );

      const { result } = renderHook(() => useGoals(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Failed to fetch goals');
    });

    it('should not fetch when disabled', async () => {
      setupGoalsListFetch([]);

      const { result } = renderHook(() => useGoals({ enabled: false }), { wrapper });

      // Should not be loading or have data
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should respect custom stale time', async () => {
      setupGoalsListFetch([createMockGoal()]);

      const { result } = renderHook(
        () => useGoals({ staleTime: 5000 }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Query should use the custom stale time
      expect(result.current.isStale).toBe(false);
    });
  });

  // ============================================
  // useActiveGoals Tests
  // ============================================
  describe('useActiveGoals', () => {
    it('should fetch only active goals', async () => {
      const activeGoals = [
        createMockGoal({ status: GoalStatus.ACTIVE }),
      ];

      setupGoalsListFetch(activeGoals);

      const { result } = renderHook(() => useActiveGoals(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`status=${GoalStatus.ACTIVE}`),
        expect.any(Object)
      );
    });
  });

  // ============================================
  // useGoal Tests
  // ============================================
  describe('useGoal', () => {
    it('should fetch a single goal by ID', async () => {
      const mockGoal = createMockGoal();

      mockFetch.mockImplementation((url: string) => {
        if (url === '/api/goals/goal-123') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockGoal),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useGoal('goal-123'), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.id).toBe('goal-123');
    });

    it('should not fetch when goalId is undefined', async () => {
      const { result } = renderHook(() => useGoal(undefined), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle 404 error', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ message: 'Goal not found' }),
        })
      );

      const { result } = renderHook(() => useGoal('nonexistent'), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Goal not found');
    });
  });

  // ============================================
  // useCreateGoal Tests
  // ============================================
  describe('useCreateGoal', () => {
    it('should create a goal successfully', async () => {
      const newGoal = createMockGoal();

      mockFetch.mockImplementation((url: string, options: any) => {
        if (url === '/api/goals' && options.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(newGoal),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useCreateGoal(), { wrapper });

      let mutationResult: any;
      await act(async () => {
        mutationResult = await result.current.mutateAsync({
          metric: 'FLY10_TIME',
          goalType: GoalType.TARGET_VALUE,
          targetValue: 1.0,
          targetDate: '2024-12-31',
        });
      });

      expect(mutationResult?.id).toBe('goal-123');
    });

    it('should invalidate queries on success', async () => {
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createMockGoal()),
        })
      );

      const { result } = renderHook(() => useCreateGoal(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          metric: 'FLY10_TIME',
          goalType: GoalType.TARGET_VALUE,
          targetValue: 1.0,
          targetDate: '2024-12-31',
        });
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['/api/goals'] })
      );
    });

    it('should handle creation error', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ message: 'Invalid input data' }),
        })
      );

      const { result } = renderHook(() => useCreateGoal(), { wrapper });

      let thrownError: Error | null = null;
      await act(async () => {
        try {
          await result.current.mutateAsync({
            metric: 'FLY10_TIME',
            goalType: GoalType.TARGET_VALUE,
            targetValue: 1.0,
            targetDate: '2024-12-31',
          });
        } catch (error) {
          thrownError = error as Error;
        }
      });

      // Mutation should have thrown
      expect(thrownError).not.toBeNull();
      expect(thrownError?.message).toContain('Invalid input data');
    });
  });

  // ============================================
  // useUpdateGoal Tests
  // ============================================
  describe('useUpdateGoal', () => {
    it('should update a goal successfully', async () => {
      const updatedGoal = createMockGoal({ targetValue: '0.95' });

      mockFetch.mockImplementation((url: string, options: any) => {
        if (url === '/api/goals/goal-123' && options.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(updatedGoal),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useUpdateGoal(), { wrapper });

      let mutationResult: any;
      await act(async () => {
        mutationResult = await result.current.mutateAsync({
          goalId: 'goal-123',
          targetValue: 0.95,
        });
      });

      // Check mutation result directly instead of isSuccess
      expect(mutationResult?.targetValue).toBe('0.95');
    });

    it('should invalidate both list and specific goal queries', async () => {
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createMockGoal()),
        })
      );

      const { result } = renderHook(() => useUpdateGoal(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          goalId: 'goal-123',
          targetValue: 0.95,
        });
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['/api/goals'] })
      );
      expect(invalidateQueriesSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['/api/goals', 'goal-123'] })
      );
    });
  });

  // ============================================
  // useUpdateGoalStatus Tests
  // ============================================
  describe('useUpdateGoalStatus', () => {
    it('should update goal status to achieved', async () => {
      const achievedGoal = {
        id: 'goal-123',
        status: GoalStatus.ACHIEVED,
        achievedAt: new Date().toISOString(),
        message: 'Goal status updated to achieved',
      };

      mockFetch.mockImplementation((url: string, options: any) => {
        if (url === '/api/goals/goal-123/status' && options.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(achievedGoal),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useUpdateGoalStatus(), { wrapper });

      let mutationResult: any;
      await act(async () => {
        mutationResult = await result.current.mutateAsync({
          goalId: 'goal-123',
          status: GoalStatus.ACHIEVED,
        });
      });

      // Check mutation result directly instead of result.current
      expect(mutationResult?.status).toBe(GoalStatus.ACHIEVED);
      expect(mutationResult?.achievedAt).toBeDefined();
    });

    it('should update goal status to abandoned', async () => {
      mockFetch.mockImplementation((url: string, options: any) => {
        if (options.method === 'PATCH') {
          const body = JSON.parse(options.body);
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'goal-123',
                status: body.status,
                message: `Goal status updated to ${body.status}`,
              }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useUpdateGoalStatus(), { wrapper });

      let mutationResult: any;
      await act(async () => {
        mutationResult = await result.current.mutateAsync({
          goalId: 'goal-123',
          status: GoalStatus.ABANDONED,
        });
      });

      // Check mutation result directly instead of result.current.data
      expect(mutationResult?.status).toBe(GoalStatus.ABANDONED);
    });
  });

  // ============================================
  // useDeleteGoal Tests
  // ============================================
  describe('useDeleteGoal', () => {
    it('should delete a goal successfully', async () => {
      mockFetch.mockImplementation((url: string, options: any) => {
        if (url === '/api/goals/goal-123' && options.method === 'DELETE') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ message: 'Goal deleted successfully' }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useDeleteGoal(), { wrapper });

      let mutationResult: any;
      await act(async () => {
        mutationResult = await result.current.mutateAsync('goal-123');
      });

      // Check mutation result directly - delete returns a message on success
      expect(mutationResult?.message).toBe('Goal deleted successfully');
    });

    it('should invalidate queries after deletion', async () => {
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Goal deleted successfully' }),
        })
      );

      const { result } = renderHook(() => useDeleteGoal(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('goal-123');
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['/api/goals'] })
      );
    });

    it('should handle deletion error', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ message: 'Cannot delete goal' }),
        })
      );

      const { result } = renderHook(() => useDeleteGoal(), { wrapper });

      let thrownError: Error | null = null;
      await act(async () => {
        try {
          await result.current.mutateAsync('goal-123');
        } catch (error) {
          thrownError = error as Error;
        }
      });

      // Mutation should have thrown
      expect(thrownError).not.toBeNull();
      expect(thrownError?.message).toContain('Cannot delete goal');
    });
  });

  // ============================================
  // useGoalsGrouped Tests
  // ============================================
  describe('useGoalsGrouped', () => {
    it('should group goals by status', async () => {
      const mockGoals = [
        createMockGoal({ id: 'goal-1', status: GoalStatus.ACTIVE }),
        createMockGoal({ id: 'goal-2', status: GoalStatus.ACTIVE }),
        createMockGoal({ id: 'goal-3', status: GoalStatus.ACHIEVED }),
        createMockGoal({ id: 'goal-4', status: GoalStatus.MISSED }),
      ];

      setupGoalsListFetch(mockGoals);

      const { result } = renderHook(() => useGoalsGrouped(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.goalsByStatus[GoalStatus.ACTIVE]).toHaveLength(2);
      expect(result.current.goalsByStatus[GoalStatus.ACHIEVED]).toHaveLength(1);
      expect(result.current.goalsByStatus[GoalStatus.MISSED]).toHaveLength(1);
      expect(result.current.goalsByStatus[GoalStatus.ABANDONED]).toHaveLength(0);
      expect(result.current.activeCount).toBe(2);
      expect(result.current.achievedCount).toBe(1);
    });

    it('should return empty groups when no goals', async () => {
      setupGoalsListFetch([]);

      const { result } = renderHook(() => useGoalsGrouped(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.activeCount).toBe(0);
      expect(result.current.achievedCount).toBe(0);
    });
  });

  // ============================================
  // useGoalsByMetric Tests
  // ============================================
  describe('useGoalsByMetric', () => {
    it('should filter goals by metric', async () => {
      const mockGoals = [
        createMockGoal({ id: 'goal-1', metric: 'FLY10_TIME' }),
        createMockGoal({ id: 'goal-2', metric: 'VERTICAL_JUMP' }),
        createMockGoal({ id: 'goal-3', metric: 'FLY10_TIME' }),
      ];

      setupGoalsListFetch(mockGoals);

      const { result } = renderHook(
        () => useGoalsByMetric('FLY10_TIME'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.metricGoals).toHaveLength(2);
      expect(result.current.metricGoals[0].metric).toBe('FLY10_TIME');
      expect(result.current.metricGoals[1].metric).toBe('FLY10_TIME');
    });

    it('should return empty array when metric has no goals', async () => {
      const mockGoals = [
        createMockGoal({ id: 'goal-1', metric: 'FLY10_TIME' }),
      ];

      setupGoalsListFetch(mockGoals);

      const { result } = renderHook(
        () => useGoalsByMetric('VERTICAL_JUMP'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.metricGoals).toHaveLength(0);
    });

    it('should return empty array when metric is undefined', async () => {
      setupGoalsListFetch([createMockGoal()]);

      const { result } = renderHook(
        () => useGoalsByMetric(undefined),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.metricGoals).toHaveLength(0);
    });
  });
});
