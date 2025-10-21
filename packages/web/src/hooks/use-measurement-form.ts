import { useState, useCallback, useRef } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { InsertMeasurement } from '@shared/schema';

// TypeScript interfaces
interface ActiveTeam {
  teamId: string;
  teamName: string;
  season: string | null;
  organizationId: string;
  organizationName: string;
}

interface Athlete {
  id: string;
  fullName: string;
  birthYear: number;
  teams?: Array<{ id: string; name: string }>;
}

interface MeasurementFormState {
  selectedAthlete: Athlete | null;
  activeTeams: ActiveTeam[];
  showTeamOverride: boolean;
  isLoadingTeams: boolean;
}

interface MeasurementFormActions {
  setSelectedAthlete: (athlete: Athlete | null) => void;
  setShowTeamOverride: (show: boolean) => void;
  fetchActiveTeams: (athleteId: string, date: string) => Promise<void>;
  resetTeamState: () => void;
}

export function useMeasurementForm(form: UseFormReturn<InsertMeasurement>) {
  // Consolidated state
  const [state, setState] = useState<MeasurementFormState>({
    selectedAthlete: null,
    activeTeams: [],
    showTeamOverride: false,
    isLoadingTeams: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Actions
  const setSelectedAthlete = useCallback((athlete: Athlete | null) => {
    setState(prev => ({ ...prev, selectedAthlete: athlete }));
  }, []);

  const setShowTeamOverride = useCallback((show: boolean) => {
    setState(prev => ({ ...prev, showTeamOverride: show }));
  }, []);

  const resetTeamState = useCallback(() => {
    setState(prev => ({
      ...prev,
      activeTeams: [],
      showTeamOverride: false,
      isLoadingTeams: false,
    }));
    form.setValue("teamId", "");
    form.setValue("season", "");
  }, [form]);

  const fetchActiveTeams = useCallback(async (athleteId: string, date: string) => {
    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setState(prev => ({ ...prev, isLoadingTeams: true }));

    try {
      const response = await fetch(`/api/athletes/${athleteId}/active-teams?date=${date}`, {
        signal: abortController.signal
      });
      
      // Check if request was aborted
      if (abortController.signal.aborted) {
        return;
      }

      if (response.ok) {
        const teams: unknown = await response.json();
        const safeTeams: ActiveTeam[] = Array.isArray(teams) ? teams as ActiveTeam[] : [];
        
        setState(prev => ({
          ...prev,
          activeTeams: safeTeams,
          isLoadingTeams: false,
        }));
        
        // Auto-populate team if only one active team
        if (safeTeams.length === 1 && safeTeams[0]) {
          form.setValue("teamId", safeTeams[0].teamId);
          form.setValue("season", safeTeams[0].season || "");
          setState(prev => ({ ...prev, showTeamOverride: false }));
        } else if (safeTeams.length > 1) {
          // Multiple teams - require manual selection
          setState(prev => ({ ...prev, showTeamOverride: true }));
          form.setValue("teamId", "");
          form.setValue("season", "");
        } else {
          // No active teams
          setState(prev => ({ ...prev, showTeamOverride: false }));
          form.setValue("teamId", "");
          form.setValue("season", "");
        }
      } else {
        console.error("Failed to fetch active teams:", response.status, response.statusText);
        resetTeamState();
      }
    } catch (error) {
      // Don't log aborted requests as errors
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error("Error fetching active teams:", error);
      resetTeamState();
    } finally {
      setState(prev => ({ ...prev, isLoadingTeams: false }));
    }
  }, [form, resetTeamState]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const actions: MeasurementFormActions = {
    setSelectedAthlete,
    setShowTeamOverride,
    fetchActiveTeams,
    resetTeamState,
  };

  return {
    ...state,
    ...actions,
    cleanup,
  };
}

export type { ActiveTeam, Athlete, MeasurementFormState, MeasurementFormActions };