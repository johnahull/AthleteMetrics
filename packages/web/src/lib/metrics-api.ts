/**
 * Metrics API client and React Query hooks
 * Provides type-safe API calls and data fetching hooks for metric management
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import type { DynamicMetricConfig, OrganizationMetricConfig } from "@shared/analytics-types";
import type { SiteMetric, InsertSiteMetric, UpdateSiteMetric, OrganizationMetric, UpdateOrganizationMetric } from "@shared/schema";

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Fetch all site metrics
 */
export async function fetchSiteMetrics(includeInactive = false): Promise<SiteMetric[]> {
  const params = new URLSearchParams();
  if (includeInactive) {
    params.append('includeInactive', 'true');
  }

  const response = await fetch(`/api/metrics?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch site metrics');
  }
  return response.json();
}

/**
 * Fetch specific site metric by code
 */
export async function fetchSiteMetric(code: string): Promise<SiteMetric> {
  const response = await fetch(`/api/metrics/${code}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch metric: ${code}`);
  }
  return response.json();
}

/**
 * Create a new site metric (site admin only)
 */
export async function createSiteMetric(data: InsertSiteMetric): Promise<SiteMetric> {
  const response = await fetch('/api/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create metric');
  }

  return response.json();
}

/**
 * Update site metric (site admin only)
 */
export async function updateSiteMetric(code: string, data: Partial<UpdateSiteMetric>): Promise<SiteMetric> {
  const response = await fetch(`/api/metrics/${code}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update metric');
  }

  return response.json();
}

/**
 * Toggle metric active status (site admin only)
 */
export async function toggleSiteMetricStatus(code: string, isActive: boolean): Promise<SiteMetric> {
  const response = await fetch(`/api/metrics/${code}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to toggle metric status');
  }

  return response.json();
}

/**
 * Delete site metric (site admin only)
 */
export async function deleteSiteMetric(code: string): Promise<void> {
  const response = await fetch(`/api/metrics/${code}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete metric');
  }
}

/**
 * Fetch organization metrics (joined with site metrics)
 */
export async function fetchOrganizationMetrics(
  organizationId: string,
  enabledOnly = false
): Promise<(OrganizationMetric & { siteMetric: SiteMetric })[]> {
  const params = new URLSearchParams();
  if (enabledOnly) {
    params.append('enabledOnly', 'true');
  }

  const response = await fetch(`/api/organizations/${organizationId}/metrics?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch organization metrics');
  }
  return response.json();
}

/**
 * Enable metric for organization
 */
export async function enableMetricForOrganization(
  organizationId: string,
  metricCode: string
): Promise<OrganizationMetric> {
  const response = await fetch(`/api/organizations/${organizationId}/metrics/${metricCode}/enable`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to enable metric');
  }

  return response.json();
}

/**
 * Disable metric for organization
 */
export async function disableMetricForOrganization(
  organizationId: string,
  metricCode: string
): Promise<OrganizationMetric> {
  const response = await fetch(`/api/organizations/${organizationId}/metrics/${metricCode}/disable`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to disable metric');
  }

  return response.json();
}

/**
 * Update organization metric settings
 */
export async function updateOrganizationMetric(
  organizationId: string,
  metricCode: string,
  data: Partial<UpdateOrganizationMetric>
): Promise<OrganizationMetric> {
  const response = await fetch(`/api/organizations/${organizationId}/metrics/${metricCode}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update organization metric');
  }

  return response.json();
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch all site metrics
 */
export function useSiteMetrics(includeInactive = false) {
  return useQuery({
    queryKey: ['siteMetrics', includeInactive],
    queryFn: () => fetchSiteMetrics(includeInactive),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch specific site metric
 */
export function useSiteMetric(code: string) {
  return useQuery({
    queryKey: ['siteMetric', code],
    queryFn: () => fetchSiteMetric(code),
    enabled: !!code,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to create a site metric (site admin only)
 */
export function useCreateSiteMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSiteMetric,
    onSuccess: () => {
      // Invalidate and refetch site metrics
      queryClient.invalidateQueries({ queryKey: ['siteMetrics'] });
    },
  });
}

/**
 * Hook to update a site metric (site admin only)
 */
export function useUpdateSiteMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code, data }: { code: string; data: Partial<UpdateSiteMetric> }) =>
      updateSiteMetric(code, data),
    onSuccess: (_, variables) => {
      // Invalidate both list and individual metric
      queryClient.invalidateQueries({ queryKey: ['siteMetrics'] });
      queryClient.invalidateQueries({ queryKey: ['siteMetric', variables.code] });
    },
  });
}

/**
 * Hook to toggle metric status (site admin only)
 */
export function useToggleSiteMetricStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code, isActive }: { code: string; isActive: boolean }) =>
      toggleSiteMetricStatus(code, isActive),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['siteMetrics'] });
      queryClient.invalidateQueries({ queryKey: ['siteMetric', variables.code] });
    },
  });
}

/**
 * Hook to delete a site metric (site admin only)
 */
export function useDeleteSiteMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSiteMetric,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siteMetrics'] });
    },
  });
}

/**
 * Hook to fetch organization metrics
 */
export function useOrganizationMetrics(organizationId: string, enabledOnly = false) {
  return useQuery({
    queryKey: ['organizationMetrics', organizationId, enabledOnly],
    queryFn: () => fetchOrganizationMetrics(organizationId, enabledOnly),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to enable metric for organization
 */
export function useEnableMetricForOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, metricCode }: { organizationId: string; metricCode: string }) =>
      enableMetricForOrganization(organizationId, metricCode),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organizationMetrics', variables.organizationId] });
    },
  });
}

/**
 * Hook to disable metric for organization
 */
export function useDisableMetricForOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, metricCode }: { organizationId: string; metricCode: string }) =>
      disableMetricForOrganization(organizationId, metricCode),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organizationMetrics', variables.organizationId] });
    },
  });
}

/**
 * Hook to update organization metric settings
 */
export function useUpdateOrganizationMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      organizationId,
      metricCode,
      data,
    }: {
      organizationId: string;
      metricCode: string;
      data: Partial<UpdateOrganizationMetric>;
    }) => updateOrganizationMetric(organizationId, metricCode, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organizationMetrics', variables.organizationId] });
    },
  });
}

/**
 * Helper hook to get metric display label (respects custom labels)
 */
export function useMetricLabel(
  metricCode: string,
  organizationId?: string
): string {
  const { data: orgMetrics } = useOrganizationMetrics(organizationId || '', false);
  const { data: siteMetric } = useSiteMetric(metricCode);

  if (organizationId && orgMetrics) {
    const orgMetric = orgMetrics.find((m: any) => m.metricCode === metricCode);
    if (orgMetric?.customLabel) {
      return orgMetric.customLabel;
    }
  }

  return siteMetric?.label || metricCode;
}
