/**
 * useDeviceImport Hook
 *
 * React Query + useReducer based hook that manages the full device import
 * wizard state: upload → session-select → review → confirm → success.
 */

import { useReducer, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

// ─── Step Types ───────────────────────────────────────────────────────────────

export type DeviceImportStep =
  | 'upload'
  | 'session-select'
  | 'parsing'
  | 'review'
  | 'confirm'
  | 'success';

// ─── API Response Types ───────────────────────────────────────────────────────

export interface DrillResult {
  metric: string;
  value: number;
  units: string;
  splits?: Array<{ metric: string; value: number; units: string }>;
  isOutlier?: boolean;
  outlierReason?: string;
}

export interface AlternativeMatch {
  id: string;
  firstName: string;
  lastName: string;
  score: number;
}

export interface PreviewAthlete {
  csvName: string;
  firstName: string;
  lastName: string;
  matchedAthleteId?: string;
  matchType: 'exact' | 'fuzzy' | 'partial' | 'none';
  matchConfidence: number;
  alternatives?: AlternativeMatch[];
  drills: DrillResult[];
  included: boolean;
}

export interface PreviewSummary {
  totalAthletes: number;
  exactMatches: number;
  fuzzyMatches: number;
  partialMatches: number;
  unmatched: number;
  totalDrills: number;
  outlierCount: number;
}

export interface ParsePreview {
  athletes: PreviewAthlete[];
  summary: PreviewSummary;
}

export interface ParsedSession {
  sessionDate: string;
  sessionLabel: string;
  athleteCount: number;
  drillCount: number;
}

export interface ParseResponse {
  batchId: string;
  preview: ParsePreview;
  sessions: ParsedSession[];
  warnings: string[];
}

export interface CommitResponse {
  measurementsCreated: number;
  measurementsSkipped: number;
  measurementsReplaced: number;
  athletesImported: number;
}

export interface BatchSummary {
  id: string;
  source: string;
  fileName: string;
  status: string;
  sessionDate: string | null;
  eventNameSnapshot: string | null;
  measurementsCreated: number | null;
  athletesImported: number | null;
  createdAt: string;
  committedAt: string | null;
}

// ─── Athlete Overrides ────────────────────────────────────────────────────────

export interface AthleteOverride {
  matchedAthleteId?: string;
  included: boolean;
}

// ─── State ────────────────────────────────────────────────────────────────────

interface DeviceImportState {
  step: DeviceImportStep;
  batchId: string | null;
  preview: ParsePreview | null;
  sessions: ParsedSession[];
  warnings: string[];
  commitResult: CommitResponse | null;
  selectedSessionDate: string | null;
  athleteOverrides: Record<string, AthleteOverride>;
}

const initialState: DeviceImportState = {
  step: 'upload',
  batchId: null,
  preview: null,
  sessions: [],
  warnings: [],
  commitResult: null,
  selectedSessionDate: null,
  athleteOverrides: {},
};

// ─── Actions ──────────────────────────────────────────────────────────────────

type DeviceImportAction =
  | { type: 'SET_STEP'; payload: DeviceImportStep }
  | { type: 'PARSE_SUCCESS'; payload: ParseResponse }
  | { type: 'COMMIT_SUCCESS'; payload: CommitResponse }
  | { type: 'SET_SESSION_DATE'; payload: string | null }
  | { type: 'SET_ATHLETE_OVERRIDE'; payload: { csvName: string; athleteId: string | undefined } }
  | { type: 'SET_ATHLETE_INCLUDED'; payload: { csvName: string; included: boolean } }
  | { type: 'RESET' };

function reducer(
  state: DeviceImportState,
  action: DeviceImportAction
): DeviceImportState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.payload };

    case 'PARSE_SUCCESS': {
      const { batchId, preview, sessions, warnings } = action.payload;
      // Build initial overrides from parsed athlete data
      const athleteOverrides: Record<string, AthleteOverride> = {};
      for (const athlete of preview.athletes) {
        athleteOverrides[athlete.csvName] = {
          matchedAthleteId: athlete.matchedAthleteId,
          included: athlete.included,
        };
      }
      // Determine next step: if multiple sessions, go to session-select; else review
      const nextStep: DeviceImportStep =
        sessions.length > 1 ? 'session-select' : 'review';
      return {
        ...state,
        batchId,
        preview,
        sessions,
        warnings,
        athleteOverrides,
        selectedSessionDate: sessions.length === 1 ? sessions[0].sessionDate : null,
        step: nextStep,
      };
    }

    case 'COMMIT_SUCCESS':
      return { ...state, commitResult: action.payload, step: 'success' };

    case 'SET_SESSION_DATE':
      return { ...state, selectedSessionDate: action.payload };

    case 'SET_ATHLETE_OVERRIDE': {
      const { csvName, athleteId } = action.payload;
      return {
        ...state,
        athleteOverrides: {
          ...state.athleteOverrides,
          [csvName]: {
            ...state.athleteOverrides[csvName],
            matchedAthleteId: athleteId,
          },
        },
      };
    }

    case 'SET_ATHLETE_INCLUDED': {
      const { csvName, included } = action.payload;
      return {
        ...state,
        athleteOverrides: {
          ...state.athleteOverrides,
          [csvName]: {
            ...state.athleteOverrides[csvName],
            included,
          },
        },
      };
    }

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseDeviceImportOptions {
  organizationId: string;
  eventId?: string;
}

export function useDeviceImport({ organizationId, eventId }: UseDeviceImportOptions) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { toast } = useToast();

  // ── Parse Mutation ───────────────────────────────────────────────────────────
  const parseMutation = useMutation({
    mutationFn: async ({
      file,
      source,
      sessionDate,
    }: {
      file: File;
      source: string;
      sessionDate?: string;
    }): Promise<ParseResponse> => {
      // Fetch CSRF token
      const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include',
      });
      if (!csrfResponse.ok) {
        throw new Error('Failed to fetch CSRF token');
      }
      const { csrfToken } = await csrfResponse.json();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', source);
      formData.append('organizationId', organizationId);
      if (eventId) formData.append('eventId', eventId);
      if (sessionDate) formData.append('sessionDate', sessionDate);

      const response = await fetch('/api/import/device/parse', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        let message = 'Failed to parse file';
        try {
          const parsed = JSON.parse(errorText);
          message = parsed.message || message;
        } catch {
          message = errorText || message;
        }
        throw new Error(message);
      }

      return response.json();
    },
    onSuccess: (data) => {
      dispatch({ type: 'PARSE_SUCCESS', payload: data });
    },
    onError: (error: Error) => {
      dispatch({ type: 'SET_STEP', payload: 'upload' });
      toast({
        title: 'Parse Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // ── Commit Mutation ──────────────────────────────────────────────────────────
  const commitMutation = useMutation({
    mutationFn: async ({
      duplicateStrategy,
      addMissingEventMetrics,
    }: {
      duplicateStrategy: 'skip' | 'replace';
      addMissingEventMetrics: boolean;
    }): Promise<CommitResponse> => {
      if (!state.batchId || !state.preview) {
        throw new Error('No batch to commit');
      }

      // Build athletes array merging parsed data with overrides
      const athletes = state.preview.athletes.map((athlete) => {
        const override = state.athleteOverrides[athlete.csvName];
        return {
          csvName: athlete.csvName,
          matchedAthleteId: override?.matchedAthleteId ?? athlete.matchedAthleteId,
          included: override?.included ?? athlete.included,
        };
      });

      const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include',
      });
      if (!csrfResponse.ok) throw new Error('Failed to fetch CSRF token');
      const { csrfToken } = await csrfResponse.json();

      const response = await fetch('/api/import/device/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({
          batchId: state.batchId,
          organizationId,
          duplicateStrategy,
          addMissingEventMetrics,
          athletes,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let message = 'Failed to commit import';
        try {
          const parsed = JSON.parse(errorText);
          message = parsed.message || message;
        } catch {
          message = errorText || message;
        }
        throw new Error(message);
      }

      return response.json();
    },
    onSuccess: (data) => {
      dispatch({ type: 'COMMIT_SUCCESS', payload: data });
    },
    onError: (error: Error) => {
      toast({
        title: 'Import Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // ── Rollback Mutation ────────────────────────────────────────────────────────
  const rollbackMutation = useMutation({
    mutationFn: async (): Promise<{ message: string }> => {
      if (!state.batchId) throw new Error('No batch to rollback');

      const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include',
      });
      if (!csrfResponse.ok) throw new Error('Failed to fetch CSRF token');
      const { csrfToken } = await csrfResponse.json();

      const response = await fetch(
        `/api/import/device/batches/${state.batchId}/rollback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({ organizationId }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let message = 'Failed to rollback import';
        try {
          const parsed = JSON.parse(errorText);
          message = parsed.message || message;
        } catch {
          message = errorText || message;
        }
        throw new Error(message);
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Import Undone', description: data.message });
      dispatch({ type: 'RESET' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Rollback Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // ── Navigation helpers ───────────────────────────────────────────────────────
  const setStep = useCallback((step: DeviceImportStep) => {
    dispatch({ type: 'SET_STEP', payload: step });
  }, []);

  const goBack = useCallback(() => {
    const backMap: Partial<Record<DeviceImportStep, DeviceImportStep>> = {
      'session-select': 'upload',
      review: state.sessions.length > 1 ? 'session-select' : 'upload',
      confirm: 'review',
    };
    const prev = backMap[state.step];
    if (prev) dispatch({ type: 'SET_STEP', payload: prev });
  }, [state.step, state.sessions.length]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const setSelectedSessionDate = useCallback((date: string | null) => {
    dispatch({ type: 'SET_SESSION_DATE', payload: date });
  }, []);

  const setAthleteOverride = useCallback((csvName: string, athleteId: string | undefined) => {
    dispatch({ type: 'SET_ATHLETE_OVERRIDE', payload: { csvName, athleteId } });
  }, []);

  const setAthleteIncluded = useCallback((csvName: string, included: boolean) => {
    dispatch({ type: 'SET_ATHLETE_INCLUDED', payload: { csvName, included } });
  }, []);

  return {
    // State
    step: state.step,
    batchId: state.batchId,
    preview: state.preview,
    sessions: state.sessions,
    warnings: state.warnings,
    commitResult: state.commitResult,
    selectedSessionDate: state.selectedSessionDate,
    athleteOverrides: state.athleteOverrides,

    // Mutations
    parseMutation,
    commitMutation,
    rollbackMutation,

    // Navigation
    setStep,
    goBack,
    reset,

    // Athlete controls
    setSelectedSessionDate,
    setAthleteOverride,
    setAthleteIncluded,
  };
}
