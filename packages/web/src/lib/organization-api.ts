/**
 * Organization API client and React Query hooks
 * Provides type-safe API calls and data fetching hooks for organization management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Organization, UpdateOrganization } from "@shared/schema";

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Fetch organization by ID
 */
export async function fetchOrganization(organizationId: string): Promise<Organization> {
  const response = await fetch(`/api/organizations/${organizationId}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch organization');
  }
  return response.json();
}

/**
 * Update organization settings (site admin only)
 */
export async function updateOrganization(
  organizationId: string,
  updates: UpdateOrganization
): Promise<Organization> {
  const response = await fetch(`/api/organizations/${organizationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update organization');
  }

  return response.json();
}

/**
 * Update organization settings (Org Admin - limited fields)
 */
export async function updateOrgAdminSettings(
  organizationId: string,
  settings: { aiEnabled?: boolean; wellnessEnabled?: boolean; eventsEnabled?: boolean }
): Promise<Organization> {
  const response = await fetch(`/api/organizations/${organizationId}/org-settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update organization settings');
  }

  return response.json();
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch organization by ID
 */
export function useOrganization(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => fetchOrganization(organizationId!),
    enabled: !!organizationId,
  });
}

/**
 * Hook to update organization settings (site admin only)
 * Automatically invalidates organization queries on success
 */
export function useUpdateOrganization(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: UpdateOrganization) => updateOrganization(organizationId, updates),
    onSuccess: (updatedOrg) => {
      // Invalidate and refetch organization queries
      queryClient.invalidateQueries({ queryKey: ['organization', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });

      // Optimistically update the cache with the new data
      queryClient.setQueryData(['organization', organizationId], updatedOrg);
    },
  });
}

/**
 * Hook to update organization settings (org admin only - limited fields)
 * Automatically invalidates organization queries on success
 */
export function useUpdateOrgAdminSettings(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: { aiEnabled?: boolean; wellnessEnabled?: boolean; eventsEnabled?: boolean }) => updateOrgAdminSettings(organizationId, settings),
    onSuccess: (updatedOrg) => {
      // Invalidate and refetch organization queries
      queryClient.invalidateQueries({ queryKey: ['organization', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });

      // Optimistically update the cache with the new data
      queryClient.setQueryData(['organization', organizationId], updatedOrg);
    },
  });
}
