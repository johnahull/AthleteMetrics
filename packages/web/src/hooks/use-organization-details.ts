import { useQuery } from '@tanstack/react-query';

export interface OrganizationAiFlags {
  aiEnabled?: boolean;
  aiEnabledBySiteAdmin?: boolean;
}

/**
 * Organization details under the shared ['organizations', id, 'details'] key. The default query
 * fetcher would turn this key into a relative URL, so the queryFn must be explicit.
 */
export function useOrganizationDetails<T extends object = OrganizationAiFlags>(organizationId?: string | null) {
  return useQuery<T>({
    queryKey: ['organizations', organizationId, 'details'],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${organizationId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch organization');
      return response.json();
    },
  });
}
