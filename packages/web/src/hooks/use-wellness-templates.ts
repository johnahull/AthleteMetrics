import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type {
  WellnessTemplate,
  CreateWellnessTemplate,
} from '@shared/wellness-types';

interface UseWellnessTemplatesOptions {
  organizationId: string;
  activeOnly?: boolean;
}

/**
 * Fetch all wellness templates for an organization
 */
export function useWellnessTemplates(options: UseWellnessTemplatesOptions) {
  const { organizationId, activeOnly = false } = options;

  return useQuery<WellnessTemplate[]>({
    queryKey: ['/api/wellness/templates', organizationId, activeOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeOnly) {
        params.set('activeOnly', 'true');
      }

      const response = await apiRequest(
        'GET',
        `/api/organizations/${organizationId}/wellness/templates?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch wellness templates');
      }

      return response.json();
    },
    enabled: !!organizationId,
  });
}

/**
 * Fetch single wellness template by ID
 */
export function useWellnessTemplate(templateId: string, organizationId: string) {
  return useQuery<WellnessTemplate>({
    queryKey: ['/api/wellness/templates', templateId],
    queryFn: async () => {
      const response = await apiRequest(
        'GET',
        `/api/organizations/${organizationId}/wellness/templates/${templateId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch wellness template');
      }

      return response.json();
    },
    enabled: !!templateId && !!organizationId,
  });
}

/**
 * Create a new wellness template
 */
export function useCreateWellnessTemplate(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWellnessTemplate) => {
      const response = await apiRequest(
        'POST',
        `/api/organizations/${organizationId}/wellness/templates`,
        data
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create wellness template');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate templates list to refetch
      queryClient.invalidateQueries({
        queryKey: ['/api/wellness/templates', organizationId],
      });
    },
  });
}

/**
 * Update an existing wellness template
 */
export function useUpdateWellnessTemplate(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; updates: Partial<CreateWellnessTemplate> }) => {
      const response = await apiRequest(
        'PUT',
        `/api/organizations/${organizationId}/wellness/templates/${data.id}`,
        data.updates
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update wellness template');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate both list and single template queries
      queryClient.invalidateQueries({
        queryKey: ['/api/wellness/templates', organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/wellness/templates', variables.id],
      });
    },
  });
}

/**
 * Delete a wellness template
 */
export function useDeleteWellnessTemplate(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const response = await apiRequest(
        'DELETE',
        `/api/organizations/${organizationId}/wellness/templates/${templateId}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete wellness template');
      }

      return templateId;
    },
    onSuccess: () => {
      // Invalidate templates list
      queryClient.invalidateQueries({
        queryKey: ['/api/wellness/templates', organizationId],
      });
    },
  });
}
