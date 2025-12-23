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
      // Fetch the athlete - teams are included in the response
      const athleteResponse = await fetch(`/api/athletes/${athleteId}`, {
        credentials: 'include',
      });
      if (!athleteResponse.ok) {
        throw new Error('Failed to fetch athlete');
      }
      const athlete = await athleteResponse.json();

      // The API returns teams array directly (not teamIds)
      // Return the teams array, or empty array if none
      return athlete.teams || [];
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
