/**
 * Custom hook for fetching athlete's team memberships
 * Used to pre-populate team filters for athlete users
 */

import { useState, useEffect, useMemo } from 'react';
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
  const [teams, setTeams] = useState<AthleteTeam[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAthleteTeams = async () => {
      // Get athlete user ID using utility function
      const athleteUserId = getAthleteUserId(user);

      if (!athleteUserId) {
        setError('User not authenticated');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
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
          const athleteTeams: AthleteTeam[] = athleteData.teams.map((team: AthleteTeamResponse) => ({
            id: team.id,
            name: team.name,
            organizationId: team.organization?.id || team.organizationId || ''
          }));
          setTeams(athleteTeams);
        } else {
          setTeams([]);
        }
      } catch (err) {
        console.error('Error fetching athlete teams:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch teams');
        setTeams([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAthleteTeams();
  }, [user?.athleteId, user?.id]);

  // Memoize team IDs array to prevent unnecessary re-renders
  const teamIds = useMemo(() => teams.map(team => team.id), [teams]);

  return {
    teams,
    teamIds,
    isLoading,
    error
  };
}