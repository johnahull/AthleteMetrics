import { useQuery } from '@tanstack/react-query';

interface AthleteData {
  id: string;
  name: string;
  status: 'red' | 'yellow' | 'green';
  score: number | null;
  injuries: { x: number; y: number; label?: string }[];
  lastSubmission: Date;
}

interface TeamDashboardData {
  teamId: string;
  teamName: string;
  teamStatus: 'red' | 'yellow' | 'green';
  teamAverageScore: number | null;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  totalAthletes: number;
  completionRate: number;
  trend: 'up' | 'down' | 'stable';
  commonInjuries: { label: string; count: number }[];
  athletes: AthleteData[];
}

interface UseWellnessDashboardOptions {
  organizationId: string;
  date?: string; // YYYY-MM-DD format
  teamIds?: string[];
  enabled?: boolean;
}

/**
 * Custom hook for fetching wellness dashboard data
 *
 * Fetches team-level wellness status summaries with athlete details
 */
export function useWellnessDashboard({
  organizationId,
  date,
  teamIds,
  enabled = true,
}: UseWellnessDashboardOptions) {
  const {
    data: dashboardData,
    isLoading,
    error,
    refetch,
  } = useQuery<TeamDashboardData[]>({
    queryKey: [
      '/api/organizations/:orgId/wellness/dashboard',
      organizationId,
      date,
      teamIds,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (date) {
        params.append('date', date);
      }

      if (teamIds && teamIds.length > 0) {
        params.append('teamIds', teamIds.join(','));
      }

      const queryString = params.toString();
      const url = `/api/organizations/${organizationId}/wellness/dashboard${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, { credentials: 'include' });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch dashboard data');
      }

      return response.json();
    },
    enabled: enabled && !!organizationId,
    retry: 2,
    staleTime: 2 * 60 * 1000, // 2 minutes (shorter for dashboard data)
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    data: dashboardData,
    isLoading,
    error,
    refetch,
  };
}
