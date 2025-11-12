/**
 * React Query hooks for benchmark group management
 * Handles both site-level and organization-level benchmark groups
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  SiteBenchmarkGroup,
  CustomBenchmarkGroup,
  SiteBenchmarkGroupWithMembers,
  CustomBenchmarkGroupWithMembers,
  InsertSiteBenchmarkGroup,
  InsertCustomBenchmarkGroup,
  UpdateSiteBenchmarkGroup,
  UpdateCustomBenchmarkGroup,
} from '@shared/schema';

// ========================================================================
// API FETCH FUNCTIONS
// ========================================================================

/**
 * Fetch all site benchmark groups
 */
async function fetchSiteBenchmarkGroups(includeInactive = false, includeMembers = false): Promise<SiteBenchmarkGroupWithMembers[] | SiteBenchmarkGroup[]> {
  const params = new URLSearchParams();
  if (includeInactive) params.append('includeInactive', 'true');
  if (includeMembers) params.append('includeMembers', 'true');

  const response = await fetch(`/api/benchmark-groups?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch site benchmark groups: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch specific site benchmark group
 */
async function fetchSiteBenchmarkGroup(id: string, includeMembers = false): Promise<SiteBenchmarkGroupWithMembers | SiteBenchmarkGroup> {
  const params = new URLSearchParams();
  if (includeMembers) params.append('includeMembers', 'true');

  const response = await fetch(`/api/benchmark-groups/${id}?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch site benchmark group: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Create a site benchmark group
 */
async function createSiteBenchmarkGroup(data: InsertSiteBenchmarkGroup): Promise<SiteBenchmarkGroup> {
  const response = await fetch('/api/benchmark-groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create site benchmark group');
  }
  return response.json();
}

/**
 * Update a site benchmark group
 */
async function updateSiteBenchmarkGroup(id: string, data: Partial<UpdateSiteBenchmarkGroup>): Promise<SiteBenchmarkGroup> {
  const response = await fetch(`/api/benchmark-groups/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update site benchmark group');
  }
  return response.json();
}

/**
 * Delete a site benchmark group
 */
async function deleteSiteBenchmarkGroup(id: string): Promise<void> {
  const response = await fetch(`/api/benchmark-groups/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete site benchmark group');
  }
}

/**
 * Add benchmark to site group
 */
async function addBenchmarkToSiteGroup(groupId: string, benchmarkId: string, displayOrder?: number): Promise<void> {
  const response = await fetch(`/api/benchmark-groups/${groupId}/benchmarks/${benchmarkId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayOrder }),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to add benchmark to group');
  }
}

/**
 * Remove benchmark from site group
 */
async function removeBenchmarkFromSiteGroup(groupId: string, benchmarkId: string): Promise<void> {
  const response = await fetch(`/api/benchmark-groups/${groupId}/benchmarks/${benchmarkId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to remove benchmark from group');
  }
}

/**
 * Fetch custom benchmark groups for organization
 */
async function fetchCustomBenchmarkGroups(organizationId: string, includeInactive = false, includeMembers = false): Promise<CustomBenchmarkGroupWithMembers[] | CustomBenchmarkGroup[]> {
  const params = new URLSearchParams();
  if (includeInactive) params.append('includeInactive', 'true');
  if (includeMembers) params.append('includeMembers', 'true');

  const response = await fetch(`/api/organizations/${organizationId}/benchmark-groups/custom?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch custom benchmark groups: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch specific custom benchmark group
 */
async function fetchCustomBenchmarkGroup(organizationId: string, id: string, includeMembers = false): Promise<CustomBenchmarkGroupWithMembers | CustomBenchmarkGroup> {
  const params = new URLSearchParams();
  if (includeMembers) params.append('includeMembers', 'true');

  const response = await fetch(`/api/organizations/${organizationId}/benchmark-groups/custom/${id}?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch custom benchmark group: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Create a custom benchmark group
 */
async function createCustomBenchmarkGroup(organizationId: string, data: Omit<InsertCustomBenchmarkGroup, 'organizationId'>): Promise<CustomBenchmarkGroup> {
  const response = await fetch(`/api/organizations/${organizationId}/benchmark-groups/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create custom benchmark group');
  }
  return response.json();
}

/**
 * Update a custom benchmark group
 */
async function updateCustomBenchmarkGroup(organizationId: string, id: string, data: Partial<UpdateCustomBenchmarkGroup>): Promise<CustomBenchmarkGroup> {
  const response = await fetch(`/api/organizations/${organizationId}/benchmark-groups/custom/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update custom benchmark group');
  }
  return response.json();
}

/**
 * Delete a custom benchmark group
 */
async function deleteCustomBenchmarkGroup(organizationId: string, id: string): Promise<void> {
  const response = await fetch(`/api/organizations/${organizationId}/benchmark-groups/custom/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete custom benchmark group');
  }
}

/**
 * Add benchmark to custom group
 */
async function addBenchmarkToCustomGroup(organizationId: string, groupId: string, benchmarkId: string, displayOrder?: number): Promise<void> {
  const response = await fetch(`/api/organizations/${organizationId}/benchmark-groups/custom/${groupId}/benchmarks/${benchmarkId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayOrder }),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to add benchmark to custom group');
  }
}

/**
 * Remove benchmark from custom group
 */
async function removeBenchmarkFromCustomGroup(organizationId: string, groupId: string, benchmarkId: string): Promise<void> {
  const response = await fetch(`/api/organizations/${organizationId}/benchmark-groups/custom/${groupId}/benchmarks/${benchmarkId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to remove benchmark from custom group');
  }
}

// ========================================================================
// REACT QUERY HOOKS - SITE BENCHMARK GROUPS
// ========================================================================

/**
 * Hook to fetch all site benchmark groups
 */
export function useSiteBenchmarkGroups(includeInactive = false, includeMembers = false) {
  return useQuery({
    queryKey: ['siteBenchmarkGroups', includeInactive, includeMembers],
    queryFn: () => fetchSiteBenchmarkGroups(includeInactive, includeMembers),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch specific site benchmark group
 */
export function useSiteBenchmarkGroup(id: string, includeMembers = false) {
  return useQuery({
    queryKey: ['siteBenchmarkGroup', id, includeMembers],
    queryFn: () => fetchSiteBenchmarkGroup(id, includeMembers),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to create a site benchmark group
 */
export function useCreateSiteBenchmarkGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSiteBenchmarkGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarkGroups'] });
    },
  });
}

/**
 * Hook to update a site benchmark group
 */
export function useUpdateSiteBenchmarkGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UpdateSiteBenchmarkGroup> }) =>
      updateSiteBenchmarkGroup(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarkGroups'] });
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarkGroup', variables.id] });
    },
  });
}

/**
 * Hook to delete a site benchmark group
 */
export function useDeleteSiteBenchmarkGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSiteBenchmarkGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarkGroups'] });
    },
  });
}

/**
 * Hook to add benchmark to site group
 */
export function useAddBenchmarkToSiteGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupId, benchmarkId, displayOrder }: { groupId: string; benchmarkId: string; displayOrder?: number }) =>
      addBenchmarkToSiteGroup(groupId, benchmarkId, displayOrder),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarkGroup', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarkGroups'] });
    },
  });
}

/**
 * Hook to remove benchmark from site group
 */
export function useRemoveBenchmarkFromSiteGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupId, benchmarkId }: { groupId: string; benchmarkId: string }) =>
      removeBenchmarkFromSiteGroup(groupId, benchmarkId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarkGroup', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['siteBenchmarkGroups'] });
    },
  });
}

// ========================================================================
// REACT QUERY HOOKS - CUSTOM BENCHMARK GROUPS
// ========================================================================

/**
 * Hook to fetch custom benchmark groups for organization
 */
export function useCustomBenchmarkGroups(organizationId: string, includeInactive = false, includeMembers = false) {
  return useQuery({
    queryKey: ['customBenchmarkGroups', organizationId, includeInactive, includeMembers],
    queryFn: () => fetchCustomBenchmarkGroups(organizationId, includeInactive, includeMembers),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch specific custom benchmark group
 */
export function useCustomBenchmarkGroup(organizationId: string, id: string, includeMembers = false) {
  return useQuery({
    queryKey: ['customBenchmarkGroup', organizationId, id, includeMembers],
    queryFn: () => fetchCustomBenchmarkGroup(organizationId, id, includeMembers),
    enabled: !!organizationId && !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to create a custom benchmark group
 */
export function useCreateCustomBenchmarkGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, data }: { organizationId: string; data: Omit<InsertCustomBenchmarkGroup, 'organizationId'> }) =>
      createCustomBenchmarkGroup(organizationId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customBenchmarkGroups', variables.organizationId] });
    },
  });
}

/**
 * Hook to update a custom benchmark group
 */
export function useUpdateCustomBenchmarkGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, id, data }: { organizationId: string; id: string; data: Partial<UpdateCustomBenchmarkGroup> }) =>
      updateCustomBenchmarkGroup(organizationId, id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customBenchmarkGroups', variables.organizationId] });
      queryClient.invalidateQueries({ queryKey: ['customBenchmarkGroup', variables.organizationId, variables.id] });
    },
  });
}

/**
 * Hook to delete a custom benchmark group
 */
export function useDeleteCustomBenchmarkGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, id }: { organizationId: string; id: string }) =>
      deleteCustomBenchmarkGroup(organizationId, id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customBenchmarkGroups', variables.organizationId] });
    },
  });
}

/**
 * Hook to add benchmark to custom group
 */
export function useAddBenchmarkToCustomGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, groupId, benchmarkId, displayOrder }: { organizationId: string; groupId: string; benchmarkId: string; displayOrder?: number }) =>
      addBenchmarkToCustomGroup(organizationId, groupId, benchmarkId, displayOrder),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customBenchmarkGroup', variables.organizationId, variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['customBenchmarkGroups', variables.organizationId] });
    },
  });
}

/**
 * Hook to remove benchmark from custom group
 */
export function useRemoveBenchmarkFromCustomGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, groupId, benchmarkId }: { organizationId: string; groupId: string; benchmarkId: string }) =>
      removeBenchmarkFromCustomGroup(organizationId, groupId, benchmarkId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customBenchmarkGroup', variables.organizationId, variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['customBenchmarkGroups', variables.organizationId] });
    },
  });
}
