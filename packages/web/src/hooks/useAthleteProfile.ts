/**
 * useAthleteProfile Hook
 *
 * Fetches static athlete profile information (name, birth year, gender, teams, contact).
 * This data changes infrequently, so uses a longer staleTime for caching.
 *
 * Uses the existing /api/athletes/:id endpoint.
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { Athlete, Team } from '@shared/schema';

export interface AthleteProfileData {
  athlete: Athlete;
  teams: Team[];
}

interface UseAthleteProfileOptions {
  /** Whether to fetch the data */
  enabled?: boolean;
}

/**
 * Fetch athlete profile data
 */
export function useAthleteProfile(
  athleteId: string | undefined,
  options: UseAthleteProfileOptions = {}
): UseQueryResult<Athlete> {
  const { enabled = true } = options;

  return useQuery({
    queryKey: ['athlete', athleteId, 'profile'],
    queryFn: async () => {
      const response = await fetch(`/api/athletes/${athleteId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch athlete profile');
      }
      return response.json();
    },
    enabled: !!athleteId && enabled,
    staleTime: 5 * 60 * 1000, // Profile data changes rarely - 5 minute stale time
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });
}

/**
 * Fetch teams for an athlete
 */
export function useAthleteTeamsData(
  athleteId: string | undefined,
  options: UseAthleteProfileOptions = {}
): UseQueryResult<Team[]> {
  const { enabled = true } = options;

  return useQuery({
    queryKey: ['athlete', athleteId, 'teams'],
    queryFn: async () => {
      // First fetch the athlete to get their team IDs
      const athleteResponse = await fetch(`/api/athletes/${athleteId}`, {
        credentials: 'include',
      });
      if (!athleteResponse.ok) {
        throw new Error('Failed to fetch athlete');
      }
      const athlete = await athleteResponse.json();

      // If no team assignments, return empty array
      if (!athlete.teamIds || athlete.teamIds.length === 0) {
        return [];
      }

      // Fetch teams - use the teams endpoint and filter
      const teamsResponse = await fetch('/api/teams', {
        credentials: 'include',
      });
      if (!teamsResponse.ok) {
        throw new Error('Failed to fetch teams');
      }
      const allTeams = await teamsResponse.json();

      // Filter to only teams the athlete belongs to
      return allTeams.filter((team: Team) =>
        athlete.teamIds?.includes(team.id)
      );
    },
    enabled: !!athleteId && enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Combined hook for fetching complete athlete profile data
 */
export function useAthleteProfileComplete(
  athleteId: string | undefined,
  options: UseAthleteProfileOptions = {}
): {
  athlete: Athlete | undefined;
  teams: Team[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const athleteQuery = useAthleteProfile(athleteId, options);
  const teamsQuery = useAthleteTeamsData(athleteId, options);

  return {
    athlete: athleteQuery.data,
    teams: teamsQuery.data || [],
    isLoading: athleteQuery.isLoading || teamsQuery.isLoading,
    isError: athleteQuery.isError || teamsQuery.isError,
    error: athleteQuery.error || teamsQuery.error,
  };
}
