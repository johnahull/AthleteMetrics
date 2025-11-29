/**
 * useGoals Hook
 *
 * Fetches and manages goal data for athletes.
 * Provides CRUD operations for personal performance goals.
 *
 * Uses the /api/goals endpoints.
 */

import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import type { Goal } from '@shared/schema';
import { GoalStatus, GoalType } from '@/utils/goal-utils';

interface UseGoalsOptions {
  /** Whether to fetch the data */
  enabled?: boolean;
  /** Filter by goal status */
  status?: GoalStatus;
  /** Override stale time (default 60 seconds) */
  staleTime?: number;
}

interface CreateGoalInput {
  metric: string;
  goalType: GoalType;
  targetValue: number;
  baselineValue?: number;
  targetDate: string;
  notes?: string;
}

interface UpdateGoalInput {
  metric?: string;
  goalType?: GoalType;
  targetValue?: number;
  currentValue?: number;
  targetDate?: string;
  status?: GoalStatus;
  notes?: string;
}

/**
 * Fetch all goals for the current user
 */
export function useGoals(
  options: UseGoalsOptions = {}
): UseQueryResult<Goal[]> {
  const { enabled = true, status, staleTime = 60 * 1000 } = options;

  const queryParams = new URLSearchParams();
  if (status) {
    queryParams.set('status', status);
  }
  const queryString = queryParams.toString();
  const url = `/api/goals${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: ['/api/goals', { status }],
    queryFn: async () => {
      const response = await fetch(url, {
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch goals' }));
        throw new Error(error.message || 'Failed to fetch goals');
      }
      return response.json();
    },
    enabled,
    staleTime,
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
}

/**
 * Fetch active goals only
 */
export function useActiveGoals(
  options: Omit<UseGoalsOptions, 'status'> = {}
): UseQueryResult<Goal[]> {
  return useGoals({ ...options, status: GoalStatus.ACTIVE });
}

/**
 * Fetch a specific goal by ID
 */
export function useGoal(
  goalId: string | undefined,
  options: Omit<UseGoalsOptions, 'status'> = {}
): UseQueryResult<Goal> {
  const { enabled = true, staleTime = 60 * 1000 } = options;

  return useQuery({
    queryKey: ['/api/goals', goalId],
    queryFn: async () => {
      const response = await fetch(`/api/goals/${goalId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch goal' }));
        throw new Error(error.message || 'Failed to fetch goal');
      }
      return response.json();
    },
    enabled: !!goalId && enabled,
    staleTime,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Create a new goal
 */
export function useCreateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateGoalInput) => {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to create goal' }));
        throw new Error(error.message || 'Failed to create goal');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate goals query to refetch
      queryClient.invalidateQueries({ queryKey: ['/api/goals'] });
    },
  });
}

/**
 * Update an existing goal
 */
export function useUpdateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ goalId, ...input }: UpdateGoalInput & { goalId: string }) => {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to update goal' }));
        throw new Error(error.message || 'Failed to update goal');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate both the list and specific goal queries
      queryClient.invalidateQueries({ queryKey: ['/api/goals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals', variables.goalId] });
    },
  });
}

/**
 * Update goal status (quick status change)
 */
export function useUpdateGoalStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ goalId, status }: { goalId: string; status: GoalStatus }) => {
      const response = await fetch(`/api/goals/${goalId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to update goal status' }));
        throw new Error(error.message || 'Failed to update goal status');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/goals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals', variables.goalId] });
    },
  });
}

/**
 * Delete a goal
 */
export function useDeleteGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (goalId: string) => {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to delete goal' }));
        throw new Error(error.message || 'Failed to delete goal');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/goals'] });
    },
  });
}

/**
 * Get goals grouped by status
 */
export function useGoalsGrouped(
  options: Omit<UseGoalsOptions, 'status'> = {}
): {
  goalsByStatus: Record<GoalStatus, Goal[]>;
  activeCount: number;
  achievedCount: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const query = useGoals(options);

  const goalsByStatus: Record<GoalStatus, Goal[]> = {
    [GoalStatus.ACTIVE]: [],
    [GoalStatus.ACHIEVED]: [],
    [GoalStatus.MISSED]: [],
    [GoalStatus.ABANDONED]: [],
  };

  if (query.data) {
    query.data.forEach((goal: Goal) => {
      const status = goal.status as GoalStatus;
      if (goalsByStatus[status]) {
        goalsByStatus[status].push(goal);
      }
    });
  }

  return {
    goalsByStatus,
    activeCount: goalsByStatus[GoalStatus.ACTIVE].length,
    achievedCount: goalsByStatus[GoalStatus.ACHIEVED].length,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

/**
 * Get goals for a specific metric
 */
export function useGoalsByMetric(
  metric: string | undefined,
  options: UseGoalsOptions = {}
): UseQueryResult<Goal[]> & { metricGoals: Goal[] } {
  const query = useGoals(options);

  const metricGoals = query.data
    ? query.data.filter((goal: Goal) => goal.metric === metric)
    : [];

  return {
    ...query,
    metricGoals,
  };
}
