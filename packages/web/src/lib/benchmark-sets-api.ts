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
  // Site-level keys (no org scope)
  siteLists: () => [...benchmarkSetKeys.all, 'site-list'] as const,
  siteDetails: () => [...benchmarkSetKeys.all, 'site-detail'] as const,
  siteDetail: (setId: string) => [...benchmarkSetKeys.siteDetails(), setId] as const,
};

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Extended BenchmarkSet type with visibility info for site sets
 */
export type BenchmarkSetWithVisibility = BenchmarkSet & {
  isHiddenForOrg?: boolean;
};

/**
 * Fetch all benchmark sets for an organization
 */
export async function fetchBenchmarkSets(
  organizationId: string,
  options: { includeInactive?: boolean; includeHiddenSiteSets?: boolean } = {}
): Promise<BenchmarkSetWithVisibility[]> {
  const params = new URLSearchParams();
  if (options.includeInactive) {
    params.append('includeInactive', 'true');
  }
  if (options.includeHiddenSiteSets) {
    params.append('includeHiddenSiteSets', 'true');
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
export function useBenchmarkSets(
  organizationId: string,
  options: { includeInactive?: boolean; includeHiddenSiteSets?: boolean } = {}
) {
  const { includeInactive = false, includeHiddenSiteSets = false } = options;
  return useQuery({
    queryKey: [...benchmarkSetKeys.list(organizationId), includeInactive, includeHiddenSiteSets],
    queryFn: () => fetchBenchmarkSets(organizationId, { includeInactive, includeHiddenSiteSets }),
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

// ============================================================================
// SITE BENCHMARK SET VISIBILITY (Org Admin)
// Allows org admins to hide/show site-level benchmark sets for their org
// ============================================================================

/**
 * Type for site benchmark set visibility map
 * Maps siteSetId to isEnabled status
 */
export type SiteBenchmarkSetVisibility = Record<string, boolean>;

/**
 * Toggle visibility of a site benchmark set for an organization
 */
export async function toggleSiteBenchmarkSetVisibility(
  organizationId: string,
  setId: string,
  isEnabled: boolean
): Promise<{ id: string; organizationId: string; siteSetId: string; isEnabled: boolean }> {
  const response = await fetch(
    `/api/organizations/${organizationId}/site-benchmark-sets/${setId}/visibility`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to toggle site benchmark set visibility' }));
    throw new Error(error.message || 'Failed to toggle site benchmark set visibility');
  }

  return response.json();
}

/**
 * Fetch visibility status of all site benchmark sets for an organization
 */
export async function fetchSiteBenchmarkSetVisibility(
  organizationId: string
): Promise<SiteBenchmarkSetVisibility> {
  const response = await fetch(
    `/api/organizations/${organizationId}/site-benchmark-sets/visibility`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch site benchmark set visibility' }));
    throw new Error(error.message || 'Failed to fetch site benchmark set visibility');
  }

  return response.json();
}

/**
 * Hook to toggle site benchmark set visibility for an organization
 */
export function useToggleSiteBenchmarkSetVisibility(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ setId, isEnabled }: { setId: string; isEnabled: boolean }) =>
      toggleSiteBenchmarkSetVisibility(organizationId, setId, isEnabled),
    onSuccess: () => {
      // Invalidate the benchmark sets list to refresh the data
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.list(organizationId) });
    },
  });
}

/**
 * Hook to fetch site benchmark set visibility for an organization
 */
export function useSiteBenchmarkSetVisibility(organizationId: string) {
  return useQuery({
    queryKey: [...benchmarkSetKeys.all, 'visibility', organizationId],
    queryFn: () => fetchSiteBenchmarkSetVisibility(organizationId),
    staleTime: STALE_TIME.STATIC,
    enabled: !!organizationId,
  });
}

// ============================================================================
// SITE-LEVEL BENCHMARK SETS
// These functions manage benchmark sets at the site level (organizationId = NULL)
// Only accessible by site admins
// ============================================================================

/**
 * Fetch all site-level benchmark sets
 */
export async function fetchSiteBenchmarkSets(
  includeInactive = false
): Promise<BenchmarkSet[]> {
  const params = new URLSearchParams();
  if (includeInactive) {
    params.append('includeInactive', 'true');
  }

  const response = await fetch(`/api/site-benchmark-sets?${params.toString()}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch site benchmark sets' }));
    throw new Error(error.message || 'Failed to fetch site benchmark sets');
  }

  return response.json();
}

/**
 * Fetch a single site-level benchmark set with its items
 */
export async function fetchSiteBenchmarkSet(
  setId: string
): Promise<BenchmarkSetWithItems> {
  const response = await fetch(`/api/site-benchmark-sets/${setId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch site benchmark set' }));
    throw new Error(error.message || 'Failed to fetch site benchmark set');
  }

  return response.json();
}

/**
 * Create a new site-level benchmark set
 */
export async function createSiteBenchmarkSet(
  data: InsertBenchmarkSet
): Promise<BenchmarkSet> {
  const response = await fetch('/api/site-benchmark-sets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create site benchmark set' }));
    throw new Error(error.message || 'Failed to create site benchmark set');
  }

  return response.json();
}

/**
 * Update an existing site-level benchmark set
 */
export async function updateSiteBenchmarkSet(
  setId: string,
  data: UpdateBenchmarkSet
): Promise<BenchmarkSet> {
  const response = await fetch(`/api/site-benchmark-sets/${setId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update site benchmark set' }));
    throw new Error(error.message || 'Failed to update site benchmark set');
  }

  return response.json();
}

/**
 * Delete a site-level benchmark set
 */
export async function deleteSiteBenchmarkSet(setId: string): Promise<void> {
  const response = await fetch(`/api/site-benchmark-sets/${setId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete site benchmark set' }));
    throw new Error(error.message || 'Failed to delete site benchmark set');
  }
}

/**
 * Add a benchmark to a site-level set
 */
export async function addBenchmarkToSiteSet(
  setId: string,
  data: InsertBenchmarkSetItem
): Promise<BenchmarkSetItem & { benchmark?: any }> {
  const response = await fetch(`/api/site-benchmark-sets/${setId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to add benchmark to site set' }));
    throw new Error(error.message || 'Failed to add benchmark to site set');
  }

  return response.json();
}

/**
 * Remove a benchmark from a site-level set
 */
export async function removeBenchmarkFromSiteSet(
  setId: string,
  itemId: string
): Promise<void> {
  const response = await fetch(`/api/site-benchmark-sets/${setId}/items/${itemId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to remove benchmark from site set' }));
    throw new Error(error.message || 'Failed to remove benchmark from site set');
  }
}

/**
 * Reorder benchmarks in a site-level set
 */
export async function reorderSiteBenchmarkSetItems(
  setId: string,
  data: ReorderBenchmarkSetItems
): Promise<{ items: (BenchmarkSetItem & { benchmark?: any })[] }> {
  const response = await fetch(`/api/site-benchmark-sets/${setId}/items/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to reorder benchmarks in site set' }));
    throw new Error(error.message || 'Failed to reorder benchmarks in site set');
  }

  return response.json();
}

// ============================================================================
// Site-Level React Query Hooks
// ============================================================================

/**
 * Hook to fetch all site-level benchmark sets
 */
export function useSiteBenchmarkSets(includeInactive = false) {
  return useQuery({
    queryKey: [...benchmarkSetKeys.siteLists(), includeInactive],
    queryFn: () => fetchSiteBenchmarkSets(includeInactive),
    staleTime: STALE_TIME.STATIC,
  });
}

/**
 * Hook to fetch a single site-level benchmark set with items
 */
export function useSiteBenchmarkSet(setId: string) {
  return useQuery({
    queryKey: benchmarkSetKeys.siteDetail(setId),
    queryFn: () => fetchSiteBenchmarkSet(setId),
    staleTime: STALE_TIME.STATIC,
    enabled: !!setId,
  });
}

/**
 * Hook to create a new site-level benchmark set
 */
export function useCreateSiteBenchmarkSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InsertBenchmarkSet) => createSiteBenchmarkSet(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.siteLists() });
    },
  });
}

/**
 * Hook to update a site-level benchmark set
 */
export function useUpdateSiteBenchmarkSet(setId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateBenchmarkSet) => updateSiteBenchmarkSet(setId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.siteLists() });
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.siteDetail(setId) });
    },
  });
}

/**
 * Hook to delete a site-level benchmark set
 */
export function useDeleteSiteBenchmarkSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (setId: string) => deleteSiteBenchmarkSet(setId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.siteLists() });
    },
  });
}

/**
 * Hook to add a benchmark to a site-level set
 */
export function useAddBenchmarkToSiteSet(setId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InsertBenchmarkSetItem) => addBenchmarkToSiteSet(setId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.siteDetail(setId) });
    },
  });
}

/**
 * Hook to remove a benchmark from a site-level set
 */
export function useRemoveBenchmarkFromSiteSet(setId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => removeBenchmarkFromSiteSet(setId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.siteDetail(setId) });
    },
  });
}

/**
 * Hook to reorder benchmarks in a site-level set
 */
export function useReorderSiteBenchmarkSetItems(setId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ReorderBenchmarkSetItems) => reorderSiteBenchmarkSetItems(setId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSetKeys.siteDetail(setId) });
    },
  });
}
