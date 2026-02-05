/**
 * Benchmarks API client and React Query hooks
 * Provides type-safe API calls and data fetching hooks for benchmark management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  SiteBenchmark,
  InsertSiteBenchmark,
  UpdateSiteBenchmark,
  CustomBenchmark,
  InsertCustomBenchmark,
  UpdateCustomBenchmark,
  OrganizationBenchmark,
  OrganizationBenchmarkWithDetails,
  InsertTierGroup,
} from "@shared/schema";
import { STALE_TIME } from "@/lib/queryClient";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Team benchmark aggregation data for dashboard widgets
 */
export interface TeamBenchmarkAggregation {
  benchmarkId: string;
  benchmarkName: string;
  metricCode: string;
  benchmarkValue: number;
  comparisonOperator: 'lte' | 'gte' | 'eq' | 'range';
  minValue?: number;
  maxValue?: number;
  applicableAthletes: number;
  athletesMet: number;
  athletesNoData?: number;
  achievementRate: number;
  averageProgress: number;
  filters?: {
    gender?: string;
    ageMin?: number;
    ageMax?: number;
    position?: string;
  };
}

// ============================================================================
// API Client Functions - Site Benchmarks
// ============================================================================

/**
 * Fetch all site benchmarks (site admin only)
 */
export async function fetchSiteBenchmarks(includeInactive = false): Promise<SiteBenchmark[]> {
  const params = new URLSearchParams();
  if (includeInactive) {
    params.append('includeInactive', 'true');
  }

  const response = await fetch(`/api/site-benchmarks?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch site benchmarks');
  }
  return response.json();
}

/**
 * Fetch site benchmarks available for an organization (org admin)
 * Filters by organization type automatically
 */
export async function fetchSiteBenchmarksForOrg(
  organizationId: string,
  includeInactive = false
): Promise<SiteBenchmark[]> {
  const params = new URLSearchParams();
  if (includeInactive) {
    params.append('includeInactive', 'true');
  }

  const response = await fetch(`/api/benchmarks?${params.toString()}`, {
    headers: {
      'X-Organization-Id': organizationId,
    },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch site benchmarks for organization');
  }
  return response.json();
}

/**
 * Fetch specific site benchmark by ID
 */
export async function fetchSiteBenchmark(id: string): Promise<SiteBenchmark> {
  const response = await fetch(`/api/benchmarks/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch benchmark: ${id}`);
  }
  return response.json();
}

/**
 * Create a new site benchmark (site admin only)
 */
export async function createSiteBenchmark(data: InsertSiteBenchmark): Promise<SiteBenchmark> {
  const response = await fetch('/api/benchmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create benchmark');
  }

  return response.json();
}

/**
 * Update site benchmark (site admin only)
 */
export async function updateSiteBenchmark(id: string, data: Partial<UpdateSiteBenchmark>): Promise<SiteBenchmark> {
  const response = await fetch(`/api/benchmarks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update benchmark');
  }

  return response.json();
}

/**
 * Toggle benchmark active status (site admin only)
 */
export async function toggleSiteBenchmarkStatus(id: string, isActive: boolean): Promise<SiteBenchmark> {
  const response = await fetch(`/api/benchmarks/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to toggle benchmark status');
  }

  return response.json();
}

/**
 * Delete site benchmark (site admin only)
 */
export async function deleteSiteBenchmark(id: string): Promise<void> {
  const response = await fetch(`/api/benchmarks/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete benchmark');
  }
}

/**
 * Create a tier group with multiple benchmarks atomically (site admin only)
 * Creates multiple benchmarks with shared tierGroupId in a single transaction
 */
export async function createTierGroup(data: InsertTierGroup): Promise<{ tierGroupId: string; benchmarks: SiteBenchmark[] }> {
  const response = await fetch('/api/site-benchmarks/tier-group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to create tier group' }));
    throw new Error(errorData.message || 'Failed to create tier group');
  }

  return response.json();
}

// ============================================================================
// API Client Functions - Custom Benchmarks
// ============================================================================

/**
 * Fetch custom benchmarks for organization
 */
export async function fetchCustomBenchmarks(
  organizationId: string,
  includeInactive = false
): Promise<CustomBenchmark[]> {
  const params = new URLSearchParams();
  if (includeInactive) {
    params.append('includeInactive', 'true');
  }

  const response = await fetch(`/api/organizations/${organizationId}/benchmarks/custom?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch custom benchmarks');
  }
  return response.json();
}

/**
 * Create custom benchmark for organization
 */
export async function createCustomBenchmark(
  organizationId: string,
  data: Omit<InsertCustomBenchmark, 'organizationId'>
): Promise<CustomBenchmark> {
  const response = await fetch(`/api/organizations/${organizationId}/benchmarks/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create custom benchmark');
  }

  return response.json();
}

/**
 * Update custom benchmark
 */
export async function updateCustomBenchmark(
  organizationId: string,
  benchmarkId: string,
  data: Partial<UpdateCustomBenchmark>
): Promise<CustomBenchmark> {
  const response = await fetch(`/api/organizations/${organizationId}/benchmarks/custom/${benchmarkId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update custom benchmark');
  }

  return response.json();
}

/**
 * Delete custom benchmark
 */
export async function deleteCustomBenchmark(organizationId: string, benchmarkId: string): Promise<void> {
  const response = await fetch(`/api/organizations/${organizationId}/benchmarks/custom/${benchmarkId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete custom benchmark');
  }
}

// ============================================================================
// API Client Functions - Organization Benchmarks (Enablement)
// ============================================================================

/**
 * Fetch enabled benchmarks for organization with full benchmark details
 */
export async function fetchOrganizationBenchmarks(
  organizationId: string,
  includeInactive = false
): Promise<OrganizationBenchmarkWithDetails[]> {
  const params = new URLSearchParams();
  if (includeInactive) {
    params.append('includeInactive', 'true');
  }

  const response = await fetch(`/api/organizations/${organizationId}/benchmarks?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch organization benchmarks');
  }
  return response.json();
}

/**
 * Enable benchmark for organization
 */
export async function enableBenchmarkForOrganization(
  organizationId: string,
  benchmarkId: string,
  benchmarkType: 'site' | 'custom'
): Promise<OrganizationBenchmark> {
  const response = await fetch(`/api/organizations/${organizationId}/benchmarks/${benchmarkId}/enable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ benchmarkType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to enable benchmark');
  }

  return response.json();
}

/**
 * Disable benchmark for organization
 */
export async function disableBenchmarkForOrganization(
  organizationId: string,
  benchmarkId: string,
  benchmarkType: 'site' | 'custom'
): Promise<OrganizationBenchmark> {
  const response = await fetch(`/api/organizations/${organizationId}/benchmarks/${benchmarkId}/disable`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ benchmarkType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to disable benchmark');
  }

  return response.json();
}

// ============================================================================
// API Client Functions - Evaluation
// ============================================================================

/**
 * Get athlete benchmark status (met/unmet with progress)
 */
export async function fetchAthleteBenchmarkStatus(
  organizationId: string,
  athleteId: string
): Promise<Array<{
  benchmarkId: string;
  benchmarkName: string;
  metricCode: string;
  benchmarkValue: number | null;
  comparisonOperator: 'lte' | 'gte' | 'eq' | 'range';
  minValue?: number | null;
  maxValue?: number | null;
  athleteValue: number | null;
  isMet: boolean;
  progress: number;
}>> {
  const response = await fetch(`/api/organizations/${organizationId}/athletes/${athleteId}/benchmark-status`);
  if (!response.ok) {
    throw new Error('Failed to fetch athlete benchmark status');
  }
  return response.json();
}

// ============================================================================
// React Query Hooks - Site Benchmarks
// ============================================================================

/**
 * Hook to fetch all site benchmarks (site admin only)
 */
export function useSiteBenchmarks(includeInactive = false) {
  return useQuery({
    queryKey: ['siteBenchmarks', includeInactive],
    queryFn: () => fetchSiteBenchmarks(includeInactive),
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch site benchmarks for an organization (org admin)
 * Filters by organization type automatically
 */
export function useSiteBenchmarksForOrg(organizationId: string, includeInactive = false) {
  return useQuery({
    queryKey: ['siteBenchmarksForOrg', organizationId, includeInactive],
    queryFn: () => fetchSiteBenchmarksForOrg(organizationId, includeInactive),
    enabled: !!organizationId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch specific site benchmark
 */
export function useSiteBenchmark(id: string) {
  return useQuery({
    queryKey: ['siteBenchmark', id],
    queryFn: () => fetchSiteBenchmark(id),
    enabled: !!id,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to create a site benchmark (site admin only)
 */
export function useCreateSiteBenchmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSiteBenchmark,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarks'] });
    },
  });
}

/**
 * Hook to update a site benchmark (site admin only)
 */
export function useUpdateSiteBenchmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UpdateSiteBenchmark> }) =>
      updateSiteBenchmark(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarks'] });
      queryClient.invalidateQueries({ queryKey: ['siteBenchmark', variables.id] });
    },
  });
}

/**
 * Hook to toggle benchmark status (site admin only)
 */
export function useToggleSiteBenchmarkStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleSiteBenchmarkStatus(id, isActive),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarks'] });
      queryClient.invalidateQueries({ queryKey: ['siteBenchmark', variables.id] });
    },
  });
}

/**
 * Hook to delete a site benchmark (site admin only)
 */
export function useDeleteSiteBenchmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSiteBenchmark,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarks'] });
    },
  });
}

/**
 * Hook to create a tier group with multiple benchmarks (site admin only)
 * Creates multiple benchmarks atomically with shared tierGroupId
 */
export function useCreateTierGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTierGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/site-benchmarks/tier-groups'] });
    },
  });
}

// ============================================================================
// React Query Hooks - Custom Benchmarks
// ============================================================================

/**
 * Hook to fetch custom benchmarks for organization
 */
export function useCustomBenchmarks(organizationId: string, includeInactive = false) {
  return useQuery({
    queryKey: ['customBenchmarks', organizationId, includeInactive],
    queryFn: () => fetchCustomBenchmarks(organizationId, includeInactive),
    enabled: !!organizationId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to create custom benchmark
 */
export function useCreateCustomBenchmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, data }: { organizationId: string; data: Omit<InsertCustomBenchmark, 'organizationId'> }) =>
      createCustomBenchmark(organizationId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customBenchmarks', variables.organizationId] });
      queryClient.invalidateQueries({ queryKey: ['organizationBenchmarks', variables.organizationId] });
    },
  });
}

/**
 * Hook to update custom benchmark
 */
export function useUpdateCustomBenchmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      organizationId,
      benchmarkId,
      data,
    }: {
      organizationId: string;
      benchmarkId: string;
      data: Partial<UpdateCustomBenchmark>;
    }) => updateCustomBenchmark(organizationId, benchmarkId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customBenchmarks', variables.organizationId] });
      queryClient.invalidateQueries({ queryKey: ['organizationBenchmarks', variables.organizationId] });
    },
  });
}

/**
 * Hook to delete custom benchmark
 */
export function useDeleteCustomBenchmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, benchmarkId }: { organizationId: string; benchmarkId: string }) =>
      deleteCustomBenchmark(organizationId, benchmarkId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customBenchmarks', variables.organizationId] });
      queryClient.invalidateQueries({ queryKey: ['organizationBenchmarks', variables.organizationId] });
    },
  });
}

// ============================================================================
// React Query Hooks - Organization Benchmarks (Enablement)
// ============================================================================

/**
 * Hook to fetch enabled benchmarks for organization
 */
export function useOrganizationBenchmarks(organizationId: string, includeInactive = false) {
  return useQuery({
    queryKey: ['organizationBenchmarks', organizationId, includeInactive],
    queryFn: () => fetchOrganizationBenchmarks(organizationId, includeInactive),
    enabled: !!organizationId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to enable benchmark for organization
 */
export function useEnableBenchmarkForOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      organizationId,
      benchmarkId,
      benchmarkType,
    }: {
      organizationId: string;
      benchmarkId: string;
      benchmarkType: 'site' | 'custom';
    }) => enableBenchmarkForOrganization(organizationId, benchmarkId, benchmarkType),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organizationBenchmarks', variables.organizationId] });
    },
  });
}

/**
 * Hook to disable benchmark for organization
 */
export function useDisableBenchmarkForOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      organizationId,
      benchmarkId,
      benchmarkType
    }: {
      organizationId: string;
      benchmarkId: string;
      benchmarkType: 'site' | 'custom';
    }) =>
      disableBenchmarkForOrganization(organizationId, benchmarkId, benchmarkType),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organizationBenchmarks', variables.organizationId] });
    },
  });
}

// ============================================================================
// React Query Hooks - Evaluation
// ============================================================================

/**
 * Hook to fetch athlete benchmark status
 */
export function useAthleteBenchmarkStatus(organizationId: string, athleteId: string) {
  return useQuery({
    queryKey: ['athleteBenchmarkStatus', organizationId, athleteId],
    queryFn: () => fetchAthleteBenchmarkStatus(organizationId, athleteId),
    enabled: !!organizationId && !!athleteId,
    staleTime: STALE_TIME.REALTIME, // 1 minute (more frequent updates for athlete status)
  });
}

// ============================================================================
// API Client Functions - Chart Overlay (Analytics Integration)
// ============================================================================

/**
 * Fetch benchmarks for chart overlay
 * Returns benchmarks filtered by metric code for display on charts
 */
export async function fetchBenchmarksForMetric(
  organizationId: string,
  metricCode: string
): Promise<Array<{
  id: string;
  name: string;
  benchmarkValue: number | null;  // Allow null for tier group benchmarks (they use minValue/maxValue instead)
  minValue?: number;          // For range benchmarks
  maxValue?: number;          // For range benchmarks
  comparisonOperator: 'lte' | 'gte' | 'eq' | 'range';
  metricCode: string;
  color?: string;             // Benchmark's defined color
  filters?: {
    gender?: string;
    ageMin?: number;
    ageMax?: number;
    position?: string;
  };
}>> {
  const response = await fetch(
    `/api/analytics/benchmarks/for-metric/${encodeURIComponent(metricCode)}?organizationId=${encodeURIComponent(organizationId)}`
  );
  if (!response.ok) {
    throw new Error('Failed to fetch benchmarks for metric');
  }
  return response.json();
}

// ============================================================================
// React Query Hooks - Chart Overlay
// ============================================================================

/**
 * Hook to fetch benchmarks for chart overlay
 */
export function useBenchmarksForMetric(organizationId: string, metricCode: string) {
  return useQuery({
    queryKey: ['benchmarksForMetric', organizationId, metricCode],
    queryFn: () => fetchBenchmarksForMetric(organizationId, metricCode),
    enabled: !!organizationId && !!metricCode,
    staleTime: STALE_TIME.DEFAULT,
  });
}

// ============================================================================
// API Client Functions - Team Benchmark Aggregation
// ============================================================================

/**
 * Fetch team benchmark aggregation data
 * Returns achievement rates and progress for all enabled benchmarks
 */
export async function fetchTeamBenchmarkAggregation(
  organizationId: string,
  options?: {
    teamIds?: string[];
    genders?: string[];
    birthYearFrom?: number;
    birthYearTo?: number;
  }
): Promise<TeamBenchmarkAggregation[]> {
  const params = new URLSearchParams({ organizationId });

  if (options?.teamIds?.length) {
    params.append('teamIds', options.teamIds.join(','));
  }

  if (options?.genders?.length) {
    params.append('genders', options.genders.join(','));
  }

  if (options?.birthYearFrom !== undefined) {
    params.append('birthYearFrom', options.birthYearFrom.toString());
  }

  if (options?.birthYearTo !== undefined) {
    params.append('birthYearTo', options.birthYearTo.toString());
  }

  const response = await fetch(`/api/analytics/benchmarks/aggregation?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch team benchmark aggregation');
  }
  return response.json();
}

// ============================================================================
// React Query Hooks - Team Benchmark Aggregation
// ============================================================================

/**
 * Hook to fetch team benchmark aggregation data
 */
export function useTeamBenchmarkAggregation(
  organizationId: string,
  options?: {
    teamIds?: string[];
    genders?: string[];
    birthYearFrom?: number;
    birthYearTo?: number;
  }
) {
  return useQuery({
    queryKey: [
      'teamBenchmarkAggregation',
      organizationId,
      options?.teamIds,
      options?.genders,
      options?.birthYearFrom,
      options?.birthYearTo,
    ],
    queryFn: () => fetchTeamBenchmarkAggregation(organizationId, options),
    enabled: !!organizationId,
    staleTime: STALE_TIME.STATIC, // 15 minutes - benchmarks don't change frequently
    refetchOnWindowFocus: true, // Refetch when user returns for real-time feel
  });
}

// ============================================================================
// API Client Functions - Benchmark Progress Over Time
// ============================================================================

/**
 * Fetch benchmark progress over time
 * Returns time-series snapshots of benchmark achievement rates
 */
export async function fetchBenchmarkProgressOverTime(
  organizationId: string,
  benchmarkId: string,
  options?: {
    startDate?: string;
    endDate?: string;
    interval?: 'day' | 'week' | 'month';
    teamIds?: string[];
    genders?: string[];
  }
): Promise<{
  benchmarkId: string;
  benchmarkName: string;
  metricCode: string;
  benchmarkValue: number;
  snapshots: Array<{
    date: string;
    applicableAthletes: number;
    athletesMet: number;
    achievementRate: number;
  }>;
}> {
  const params = new URLSearchParams({ organizationId });

  if (options?.startDate) {
    params.append('startDate', options.startDate);
  }

  if (options?.endDate) {
    params.append('endDate', options.endDate);
  }

  if (options?.interval) {
    params.append('interval', options.interval);
  }

  if (options?.teamIds?.length) {
    params.append('teamIds', options.teamIds.join(','));
  }

  if (options?.genders?.length) {
    params.append('genders', options.genders.join(','));
  }

  const response = await fetch(
    `/api/analytics/benchmarks/${encodeURIComponent(benchmarkId)}/progress?${params.toString()}`
  );
  if (!response.ok) {
    throw new Error('Failed to fetch benchmark progress over time');
  }
  return response.json();
}

// ============================================================================
// React Query Hooks - Benchmark Progress Over Time
// ============================================================================

/**
 * Hook to fetch benchmark progress over time
 * Used for BenchmarkProgressChart component
 */
export function useBenchmarkProgressOverTime(
  organizationId: string,
  benchmarkId: string | undefined,
  options?: {
    startDate?: string;
    endDate?: string;
    interval?: 'day' | 'week' | 'month';
    teamIds?: string[];
    genders?: string[];
  }
) {
  return useQuery({
    queryKey: [
      'benchmarkProgressOverTime',
      organizationId,
      benchmarkId,
      options?.startDate,
      options?.endDate,
      options?.interval,
      options?.teamIds,
      options?.genders,
    ],
    queryFn: () =>
      fetchBenchmarkProgressOverTime(organizationId, benchmarkId!, options),
    enabled: !!organizationId && !!benchmarkId,
    staleTime: STALE_TIME.STATIC, // 15 minutes - historical progress doesn't change frequently
    refetchOnWindowFocus: true, // Refetch when user returns for real-time feel
  });
}
