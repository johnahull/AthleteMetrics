/**
 * Benchmark Sets API client and React Query hooks
 * Provides type-safe API calls and data fetching hooks for benchmark set management
 *
 * Benchmark sets are named collections of benchmarks (e.g., "NCAA D1 Women's Soccer")
 * that can be used in reports and analytics for quick selection.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BenchmarkSet,
  BenchmarkSetItem,
  BenchmarkSetWithItems,
  InsertBenchmarkSet,
  UpdateBenchmarkSet,
  InsertBenchmarkSetItem,
  ReorderBenchmarkSetItems,
} from "@shared/schema";
import { STALE_TIME } from "@/lib/queryClient";

// ============================================================================
// Query Keys
// ============================================================================

export const benchmarkSetKeys = {
  all: ['benchmark-sets'] as const,
  lists: () => [...benchmarkSetKeys.all, 'list'] as const,
  list: (orgId: string) => [...benchmarkSetKeys.lists(), orgId] as const,
  details: () => [...benchmarkSetKeys.all, 'detail'] as const,
  detail: (orgId: string, setId: string) => [...benchmarkSetKeys.details(), orgId, setId] as const,
  memberships: (orgId: string) => [...benchmarkSetKeys.all, 'memberships', orgId] as const,
};

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Fetch all benchmark sets for an organization
 */
export async function fetchBenchmarkSets(
  organizationId: string,
  includeInactive = false
): Promise<BenchmarkSet[]> {
  const params = new URLSearchParams();
  if (includeInactive) {
    params.append('includeInactive', 'true');
  }

  const response = await fetch(
    `/api/organizations/${organizationId}/benchmark-sets?${params.toString()}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch benchmark sets' }));
    throw new Error(error.message || 'Failed to fetch benchmark sets');
  }

  return response.json();
}

/**
 * Fetch a single benchmark set with its items
 */
export async function fetchBenchmarkSet(
  organizationId: string,
  setId: string
): Promise<BenchmarkSetWithItems> {
  const response = await fetch(
    `/api/organizations/${organizationId}/benchmark-sets/${setId}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch benchmark set' }));
    throw new Error(error.message || 'Failed to fetch benchmark set');
  }

  return response.json();
}

/**
 * Create a new benchmark set
 */
export async function createBenchmarkSet(
  organizationId: string,
  data: InsertBenchmarkSet
): Promise<BenchmarkSet> {
  const response = await fetch(
    `/api/organizations/${organizationId}/benchmark-sets`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create benchmark set' }));
    throw new Error(error.message || 'Failed to create benchmark set');
  }

  return response.json();
}

/**
 * Update an existing benchmark set
 */
export async function updateBenchmarkSet(
  organizationId: string,
  setId: string,
  data: UpdateBenchmarkSet
): Promise<BenchmarkSet> {
  const response = await fetch(
    `/api/organizations/${organizationId}/benchmark-sets/${setId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update benchmark set' }));
    throw new Error(error.message || 'Failed to update benchmark set');
  }

  return response.json();
}

/**
 * Delete a benchmark set
 */
export async function deleteBenchmarkSet(
  organizationId: string,
  setId: string
): Promise<void> {
  const response = await fetch(
    `/api/organizations/${organizationId}/benchmark-sets/${setId}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete benchmark set' }));
    throw new Error(error.message || 'Failed to delete benchmark set');
  }
}

/**
 * Add a benchmark to a set
 */
export async function addBenchmarkToSet(
  organizationId: string,
  setId: string,
  data: InsertBenchmarkSetItem
): Promise<BenchmarkSetItem & { benchmark?: any }> {
  const response = await fetch(
    `/api/organizations/${organizationId}/benchmark-sets/${setId}/items`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to add benchmark to set' }));
    throw new Error(error.message || 'Failed to add benchmark to set');
  }

  return response.json();
}

/**
 * Remove a benchmark from a set
 */
export async function removeBenchmarkFromSet(
  organizationId: string,
  setId: string,
  itemId: string
): Promise<void> {
  const response = await fetch(
    `/api/organizations/${organizationId}/benchmark-sets/${setId}/items/${itemId}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to remove benchmark from set' }));
    throw new Error(error.message || 'Failed to remove benchmark from set');
  }
}

/**
 * Reorder benchmarks in a set
 */
export async function reorderBenchmarkSetItems(
  organizationId: string,
  setId: string,
  data: ReorderBenchmarkSetItems
): Promise<{ items: (BenchmarkSetItem & { benchmark?: any })[] }> {
  const response = await fetch(
    `/api/organizations/${organizationId}/benchmark-sets/${setId}/items/reorder`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to reorder benchmarks' }));
    throw new Error(error.message || 'Failed to reorder benchmarks');
  }

  return response.json();
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch all benchmark sets for an organization
 */
export function useBenchmarkSets(organizationId: string, includeInactive = false) {
  return useQuery({
    queryKey: benchmarkSetKeys.list(organizationId),
    queryFn: () => fetchBenchmarkSets(organizationId, includeInactive),
    staleTime: STALE_TIME.STATIC,
    enabled: !!organizationId,
  });
}

/**
 * Hook to fetch a single benchmark set with items
 */
export function useBenchmarkSet(organizationId: string, setId: string) {
  return useQuery({
    queryKey: benchmarkSetKeys.detail(organizationId, setId),
    queryFn: () => fetchBenchmarkSet(organizationId, setId),
    staleTime: STALE_TIME.STATIC,
    enabled: !!organizationId && !!setId,
  });
}

/**
 * Hook to create a new benchmark set
 */
export function useCreateBenchmarkSet(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InsertBenchmarkSet) =>
      createBenchmarkSet(organizationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.list(organizationId) });
    },
  });
}

/**
 * Hook to update a benchmark set
 */
export function useUpdateBenchmarkSet(organizationId: string, setId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateBenchmarkSet) =>
      updateBenchmarkSet(organizationId, setId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.list(organizationId) });
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.detail(organizationId, setId) });
    },
  });
}

/**
 * Hook to delete a benchmark set
 */
export function useDeleteBenchmarkSet(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (setId: string) => deleteBenchmarkSet(organizationId, setId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.list(organizationId) });
    },
  });
}

/**
 * Hook to add a benchmark to a set
 */
export function useAddBenchmarkToSet(organizationId: string, setId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InsertBenchmarkSetItem) =>
      addBenchmarkToSet(organizationId, setId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.detail(organizationId, setId) });
    },
  });
}

/**
 * Hook to remove a benchmark from a set
 */
export function useRemoveBenchmarkFromSet(organizationId: string, setId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) =>
      removeBenchmarkFromSet(organizationId, setId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.detail(organizationId, setId) });
    },
  });
}

/**
 * Hook to reorder benchmarks in a set
 */
export function useReorderBenchmarkSetItems(organizationId: string, setId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ReorderBenchmarkSetItems) =>
      reorderBenchmarkSetItems(organizationId, setId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.detail(organizationId, setId) });
    },
  });
}

// ============================================================================
// Benchmark Memberships
// ============================================================================

/**
 * Type for benchmark membership lookup
 * Maps benchmarkId to array of sets containing that benchmark
 */
export type BenchmarkMemberships = Record<
  string,
  Array<{ setId: string; setName: string }>
>;

/**
 * Fetch benchmark memberships for an organization
 * Returns a map of benchmarkId → sets that contain that benchmark
 */
export async function fetchBenchmarkMemberships(
  organizationId: string
): Promise<BenchmarkMemberships> {
  const response = await fetch(
    `/api/organizations/${organizationId}/benchmark-memberships`
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch benchmark memberships');
  }
  return response.json();
}

/**
 * Hook to fetch benchmark memberships for an organization
 * Shows which sets each benchmark belongs to
 */
export function useBenchmarkMemberships(organizationId: string) {
  return useQuery({
    queryKey: benchmarkSetKeys.memberships(organizationId),
    queryFn: () => fetchBenchmarkMemberships(organizationId),
    staleTime: STALE_TIME.STATIC,
    enabled: !!organizationId,
  });
}
