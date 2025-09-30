/**
 * Custom hook for fetching athlete's team memberships
 * Used to pre-populate team filters for athlete users
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';

export interface AthleteTeam {
  id: string;
  name: string;
  organizationId: string;
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
      // Only fetch if user is an athlete and has an athleteId
      if (!user?.athleteId) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/athletes/${user.athleteId}`, {
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error('Failed to fetch athlete data');
        }

        const athleteData = await response.json();

        // Extract teams from the athlete data
        if (athleteData.teams && Array.isArray(athleteData.teams)) {
          const athleteTeams: AthleteTeam[] = athleteData.teams.map((team: any) => ({
            id: team.id,
            name: team.name,
            organizationId: team.organization?.id || team.organizationId
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
  }, [user?.athleteId]);

  // Extract just the team IDs for easy use in filters
  const teamIds = teams.map(team => team.id);

  return {
    teams,
    teamIds,
    isLoading,
    error
  };
}