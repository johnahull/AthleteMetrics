import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import type { Team } from '@shared/schema';

interface UseTeamsOptions {
  organizationId?: string;
}

export function useTeams(options?: UseTeamsOptions) {
  const { organizationId } = options || {};

  return useQuery<Team[]>({
    queryKey: ['/api/teams', organizationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (organizationId) {
        params.set('organizationId', organizationId);
      }

      const response = await apiRequest('GET', `/api/teams?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch teams');
      }

      return response.json();
    },
    enabled: !!organizationId, // Only fetch if organizationId is provided
  });
}
