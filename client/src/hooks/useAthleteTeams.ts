/**
 * Custom hook for fetching athlete's team memberships
 * Used to pre-populate team filters for athlete users
 *
 * Uses React Query for automatic caching, deduplication, and background refetching
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getAthleteUserId } from '@/lib/athlete-utils';

export interface AthleteTeam {
  id: string;
  name: string;
  organizationId: string;
}

interface AthleteTeamResponse {
  id: string;
  name: string;
  organization?: { id: string };
  organizationId?: string;
}

interface UseAthleteTeamsResult {
  teams: AthleteTeam[];
  teamIds: string[];
  isLoading: boolean;
  error: string | null;
}

export function useAthleteTeams(): UseAthleteTeamsResult {
  const { user } = useAuth();

  // getAthleteUserId is trivial, no need for memoization
  const athleteUserId = getAthleteUserId(user);

  const { data, isLoading, error } = useQuery({
    queryKey: ['athlete-teams', athleteUserId],
    queryFn: async (): Promise<AthleteTeam[]> => {
      if (!athleteUserId) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(`/api/athletes/${athleteUserId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Session expired. Please log in again.');
        } else if (response.status === 403) {
          throw new Error('Access denied');
        } else if (response.status === 404) {
          throw new Error('Athlete profile not found');
        }
        throw new Error('Failed to fetch athlete data');
      }

      const athleteData = await response.json();

      // Extract teams from the athlete data
      if (athleteData.teams && Array.isArray(athleteData.teams)) {
        return athleteData.teams.map((team: AthleteTeamResponse) => ({
          id: team.id,
          name: team.name,
          organizationId: team.organization?.id || team.organizationId || ''
        }));
      }

      return [];
    },
    enabled: Boolean(athleteUserId),
    staleTime: 5 * 60 * 1000, // 5 minutes - teams don't change frequently
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache for 10 minutes after last use
    retry: 2, // Retry failed requests twice
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });

  const teams = data || [];
  // React Query maintains referential stability for cached data, no memoization needed
  const teamIds = teams.map(team => team.id);

  return {
    teams,
    teamIds,
    isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null
  };
}