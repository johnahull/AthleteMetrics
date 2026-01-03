/**
 * Custom Organization Metrics API client and React Query hooks
 * Provides type-safe API calls and data fetching hooks for custom org metric management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CustomOrgMetric,
  InsertCustomOrgMetric,
  UpdateCustomOrgMetric,
} from "@shared/schema";
import { STALE_TIME } from "@/lib/queryClient";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Result from formula validation endpoint
 */
export interface FormulaValidationResult {
  isValid: boolean;
  errors?: string[];
  referencedMetrics?: string[];
  warnings?: string[];
}

/**
 * Available metrics for formula building
 */
export interface FormulaSources {
  availableMetrics: Array<{
    code: string;
    label: string;
    isCustom: boolean;
  }>;
}

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Fetch custom metrics for organization
 */
export async function fetchCustomOrgMetrics(
  organizationId: string,
  options?: {
    includeArchived?: boolean;
    category?: string;
  }
): Promise<CustomOrgMetric[]> {
  const params = new URLSearchParams();
  if (options?.includeArchived) {
    params.append('includeArchived', 'true');
  }
  if (options?.category) {
    params.append('category', options.category);
  }

  const response = await fetch(
    `/api/organizations/${organizationId}/custom-metrics?${params.toString()}`
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch custom metrics' }));
    throw new Error(error.error || 'Failed to fetch custom metrics');
  }
  return response.json();
}

/**
 * Fetch a single custom metric by code
 */
export async function fetchCustomOrgMetric(
  organizationId: string,
  code: string
): Promise<CustomOrgMetric> {
  const response = await fetch(
    `/api/organizations/${organizationId}/custom-metrics/${encodeURIComponent(code)}`
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch custom metric' }));
    throw new Error(error.error || 'Failed to fetch custom metric');
  }
  return response.json();
}

/**
 * Create a custom metric for organization
 */
export async function createCustomOrgMetric(
  organizationId: string,
  data: Omit<InsertCustomOrgMetric, 'organizationId' | 'code' | 'createdBy'>
): Promise<CustomOrgMetric> {
  const response = await fetch(`/api/organizations/${organizationId}/custom-metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create custom metric' }));
    throw new Error(error.error || 'Failed to create custom metric');
  }

  return response.json();
}

/**
 * Update a custom metric
 */
export async function updateCustomOrgMetric(
  organizationId: string,
  code: string,
  data: Partial<UpdateCustomOrgMetric>
): Promise<CustomOrgMetric> {
  const response = await fetch(
    `/api/organizations/${organizationId}/custom-metrics/${encodeURIComponent(code)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update custom metric' }));
    throw new Error(error.error || 'Failed to update custom metric');
  }

  return response.json();
}

/**
 * Archive a custom metric (soft delete)
 */
export async function archiveCustomOrgMetric(
  organizationId: string,
  code: string
): Promise<CustomOrgMetric> {
  const response = await fetch(
    `/api/organizations/${organizationId}/custom-metrics/${encodeURIComponent(code)}/archive`,
    {
      method: 'POST',
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to archive custom metric' }));
    throw new Error(error.error || 'Failed to archive custom metric');
  }

  return response.json();
}

/**
 * Restore an archived custom metric
 */
export async function restoreCustomOrgMetric(
  organizationId: string,
  code: string
): Promise<CustomOrgMetric> {
  const response = await fetch(
    `/api/organizations/${organizationId}/custom-metrics/${encodeURIComponent(code)}/restore`,
    {
      method: 'POST',
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to restore custom metric' }));
    throw new Error(error.error || 'Failed to restore custom metric');
  }

  return response.json();
}

/**
 * Validate a formula for derived metrics
 */
export async function validateFormula(
  organizationId: string,
  formula: string,
  excludeCode?: string
): Promise<FormulaValidationResult> {
  const response = await fetch(
    `/api/organizations/${organizationId}/custom-metrics/validate-formula`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formula, excludeCode }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to validate formula' }));
    throw new Error(error.error || 'Failed to validate formula');
  }

  return response.json();
}

/**
 * Get available metrics for use in formulas
 */
export async function fetchFormulaSources(
  organizationId: string
): Promise<FormulaSources> {
  const response = await fetch(
    `/api/organizations/${organizationId}/custom-metrics/formula-sources`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch formula sources' }));
    throw new Error(error.error || 'Failed to fetch formula sources');
  }

  return response.json();
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch custom metrics for organization
 */
export function useCustomOrgMetrics(
  organizationId: string,
  options?: {
    includeArchived?: boolean;
    category?: string;
  }
) {
  return useQuery({
    queryKey: ['customOrgMetrics', organizationId, options?.includeArchived, options?.category],
    queryFn: () => fetchCustomOrgMetrics(organizationId, options),
    enabled: !!organizationId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to fetch a single custom metric
 */
export function useCustomOrgMetric(organizationId: string, code: string) {
  return useQuery({
    queryKey: ['customOrgMetric', organizationId, code],
    queryFn: () => fetchCustomOrgMetric(organizationId, code),
    enabled: !!organizationId && !!code,
    staleTime: STALE_TIME.DEFAULT,
  });
}

/**
 * Hook to create a custom metric
 */
export function useCreateCustomOrgMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      organizationId,
      data,
    }: {
      organizationId: string;
      data: Omit<InsertCustomOrgMetric, 'organizationId' | 'code' | 'createdBy'>;
    }) => createCustomOrgMetric(organizationId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customOrgMetrics', variables.organizationId] });
      // Invalidate available metrics since a new metric was added
      queryClient.invalidateQueries({ queryKey: ['availableMetrics'] });
    },
  });
}

/**
 * Hook to update a custom metric
 */
export function useUpdateCustomOrgMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      organizationId,
      code,
      data,
    }: {
      organizationId: string;
      code: string;
      data: Partial<UpdateCustomOrgMetric>;
    }) => updateCustomOrgMetric(organizationId, code, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customOrgMetrics', variables.organizationId] });
      queryClient.invalidateQueries({ queryKey: ['customOrgMetric', variables.organizationId, variables.code] });
      queryClient.invalidateQueries({ queryKey: ['availableMetrics'] });
    },
  });
}

/**
 * Hook to archive a custom metric
 */
export function useArchiveCustomOrgMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      organizationId,
      code,
    }: {
      organizationId: string;
      code: string;
    }) => archiveCustomOrgMetric(organizationId, code),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customOrgMetrics', variables.organizationId] });
      queryClient.invalidateQueries({ queryKey: ['availableMetrics'] });
    },
  });
}

/**
 * Hook to restore an archived custom metric
 */
export function useRestoreCustomOrgMetric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      organizationId,
      code,
    }: {
      organizationId: string;
      code: string;
    }) => restoreCustomOrgMetric(organizationId, code),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customOrgMetrics', variables.organizationId] });
      queryClient.invalidateQueries({ queryKey: ['availableMetrics'] });
    },
  });
}

/**
 * Hook to validate a formula
 */
export function useValidateFormula() {
  return useMutation({
    mutationFn: ({
      organizationId,
      formula,
      excludeCode,
    }: {
      organizationId: string;
      formula: string;
      excludeCode?: string;
    }) => validateFormula(organizationId, formula, excludeCode),
  });
}

/**
 * Hook to fetch available metrics for formulas
 */
export function useFormulaSources(organizationId: string) {
  return useQuery({
    queryKey: ['formulaSources', organizationId],
    queryFn: () => fetchFormulaSources(organizationId),
    enabled: !!organizationId,
    staleTime: STALE_TIME.STATIC, // 15 minutes - sources don't change often
  });
}
