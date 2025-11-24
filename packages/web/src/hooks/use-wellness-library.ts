/**
 * Wellness Template Library Hooks
 *
 * React Query hooks for browsing and cloning wellness templates
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { WellnessTemplate } from '@shared/wellness-types';

interface LibraryResponse {
  systemTemplates: WellnessTemplate[];
  orgTemplates: WellnessTemplate[];
  total: number;
}

interface LibraryFilters {
  category?: string;
  tags?: string;
  search?: string;
}

/**
 * Fetch wellness template library (system + org templates)
 */
export function useWellnessLibrary(organizationId: string, filters?: LibraryFilters) {
  return useQuery<LibraryResponse>({
    queryKey: ['/api/organizations/:organizationId/wellness/library', organizationId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.category) params.append('category', filters.category);
      if (filters?.tags) params.append('tags', filters.tags);
      if (filters?.search) params.append('search', filters.search);

      const queryString = params.toString();
      const url = `/api/organizations/${organizationId}/wellness/library${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch wellness library: ${response.statusText}`);
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

/**
 * Clone a wellness template to the organization
 */
export function useCloneWellnessTemplate(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(
        `/api/organizations/${organizationId}/wellness/templates/${templateId}/clone`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to clone template');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate library and templates list to refresh
      queryClient.invalidateQueries({
        queryKey: ['/api/organizations/:organizationId/wellness/library', organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/wellness/templates', organizationId],
      });
    },
  });
}
