/**
 * Hook for persisting measurement form state across sessions
 * Stores last selected metric, date, and team in localStorage with user scoping
 */

import { useState, useCallback, useEffect } from 'react';
import { FormStorage, type MeasurementFormState } from '@/lib/form-storage';

const STORAGE_KEY = 'form-state';
const MAX_DATE_AGE_DAYS = 30;

/**
 * Check if a date string is stale (older than MAX_DATE_AGE_DAYS)
 */
function isDateStale(dateStr: string | null): boolean {
  if (!dateStr) return false;

  const date = new Date(dateStr);

  // Check for invalid date (NaN)
  if (isNaN(date.getTime())) {
    return true; // Invalid date is considered stale
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays > MAX_DATE_AGE_DAYS;
}

export function useMeasurementFormState(userId: string) {
  const [storage] = useState(() => new FormStorage(userId));

  const [state, setState] = useState<MeasurementFormState>(() => {
    // Initialize from localStorage on mount
    const stored = storage.get<MeasurementFormState>(STORAGE_KEY);

    if (!stored) {
      return {
        lastMetric: null,
        lastDate: null,
        lastTeamId: null
      };
    }

    // Clear stale dates
    if (stored.lastDate && isDateStale(stored.lastDate)) {
      return {
        lastMetric: stored.lastMetric || null,
        lastDate: null,
        lastTeamId: stored.lastTeamId || null
      };
    }

    // Ensure all fields exist (handle partial state)
    return {
      lastMetric: stored.lastMetric || null,
      lastDate: stored.lastDate || null,
      lastTeamId: stored.lastTeamId || null
    };
  });

  // Persist to localStorage whenever state changes
  // Skip if all values are null (cleared state)
  useEffect(() => {
    const isCleared = !state.lastMetric && !state.lastDate && !state.lastTeamId;
    if (!isCleared) {
      storage.set(STORAGE_KEY, state);
    }
  }, [state, storage]);

  const updateMetric = useCallback((metric: string | null) => {
    setState(prev => ({
      ...prev,
      lastMetric: metric
    }));
  }, []);

  const updateDate = useCallback((date: string | null) => {
    setState(prev => ({
      ...prev,
      lastDate: date
    }));
  }, []);

  const updateTeam = useCallback((teamId: string | null) => {
    setState(prev => ({
      ...prev,
      lastTeamId: teamId
    }));
  }, []);

  const clear = useCallback(() => {
    // Remove from localStorage first
    storage.remove(STORAGE_KEY);
    // Then update state (useEffect will not re-persist because we want it cleared)
    setState({
      lastMetric: null,
      lastDate: null,
      lastTeamId: null
    });
  }, [storage]);

  return {
    lastMetric: state.lastMetric,
    lastDate: state.lastDate,
    lastTeamId: state.lastTeamId,
    updateMetric,
    updateDate,
    updateTeam,
    clear
  };
}
