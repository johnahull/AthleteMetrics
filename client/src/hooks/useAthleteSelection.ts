/**
 * Custom hook for managing athlete selection state
 * Encapsulates complex state logic and provides optimized callback handlers
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DEFAULT_SELECTION_COUNT } from '@/utils/chart-constants';

interface Athlete {
  id: string;
  name: string;
  color: number;
}

interface UseAthleteSelectionProps {
  athletes: Athlete[];
  selectedAthleteIds?: string[];
  onAthleteSelectionChange?: (athleteIds: string[]) => void;
  maxAthletes?: number;
}

interface UseAthleteSelectionReturn {
  athleteToggles: Record<string, boolean>;
  handleToggleAthlete: (athleteId: string) => void;
  handleSelectAll: () => void;
  handleClearAll: () => void;
}

export function useAthleteSelection({
  athletes,
  selectedAthleteIds,
  onAthleteSelectionChange,
  maxAthletes = DEFAULT_SELECTION_COUNT
}: UseAthleteSelectionProps): UseAthleteSelectionReturn {
  // Validate maxAthletes
  const validatedMaxAthletes = Math.max(1, maxAthletes);

  // Internal state for when no external state is provided
  const [internalSelectedAthleteIds, setInternalSelectedAthleteIds] = useState<string[]>([]);
  const [athleteToggles, setAthleteToggles] = useState<Record<string, boolean>>({});

  // Use ref to avoid recreating callbacks when toggles change
  const togglesRef = useRef<Record<string, boolean>>({});
  togglesRef.current = athleteToggles;

  // Memoize athlete IDs for stable dependencies
  const athleteIds = useMemo(() => athletes.map(a => a.id), [athletes]);

  // Use external selectedAthleteIds if provided, otherwise use internal state
  const effectiveSelectedAthleteIds = selectedAthleteIds || internalSelectedAthleteIds;

  // Initialize selections when athletes or external state changes
  useEffect(() => {
    if (athleteIds.length > 0) {
      if (!selectedAthleteIds) {
        // Use internal state - select first few athletes by default
        const defaultSelected = athleteIds.slice(0, Math.min(DEFAULT_SELECTION_COUNT, validatedMaxAthletes));
        setInternalSelectedAthleteIds(defaultSelected);

        const defaultToggles = athletes.reduce((acc, athlete) => {
          acc[athlete.id] = defaultSelected.includes(athlete.id);
          return acc;
        }, {} as Record<string, boolean>);
        setAthleteToggles(defaultToggles);
      } else {
        // Use external state
        const toggles = athletes.reduce((acc, athlete) => {
          acc[athlete.id] = selectedAthleteIds.includes(athlete.id);
          return acc;
        }, {} as Record<string, boolean>);
        setAthleteToggles(toggles);
      }
    }
  }, [athleteIds, athletes, selectedAthleteIds, validatedMaxAthletes]);

  // Handle athlete toggle with optimized dependencies
  const handleToggleAthlete = useCallback((athleteId: string) => {
    const currentToggles = togglesRef.current;
    const isCurrentlySelected = currentToggles[athleteId];
    const currentSelectedCount = Object.values(currentToggles).filter(Boolean).length;

    // If trying to select and already at limit, don't allow
    if (!isCurrentlySelected && currentSelectedCount >= validatedMaxAthletes) {
      return; // Prevent selecting more than validatedMaxAthletes
    }

    const newToggles = { ...currentToggles, [athleteId]: !currentToggles[athleteId] };
    setAthleteToggles(newToggles);

    const newSelected = Object.keys(newToggles).filter(id => newToggles[id]);

    if (onAthleteSelectionChange) {
      onAthleteSelectionChange(newSelected);
    } else {
      setInternalSelectedAthleteIds(newSelected);
    }
  }, [validatedMaxAthletes, onAthleteSelectionChange]);

  // Handle select all with optimized dependencies
  const handleSelectAll = useCallback(() => {
    const idsToSelect = athletes.slice(0, validatedMaxAthletes).map(a => a.id);
    const newToggles = athletes.reduce((acc, athlete) => {
      acc[athlete.id] = idsToSelect.includes(athlete.id);
      return acc;
    }, {} as Record<string, boolean>);
    setAthleteToggles(newToggles);

    if (onAthleteSelectionChange) {
      onAthleteSelectionChange(idsToSelect);
    } else {
      setInternalSelectedAthleteIds(idsToSelect);
    }
  }, [athletes, validatedMaxAthletes, onAthleteSelectionChange]);

  // Handle clear all with optimized dependencies
  const handleClearAll = useCallback(() => {
    const newToggles = athletes.reduce((acc, athlete) => {
      acc[athlete.id] = false;
      return acc;
    }, {} as Record<string, boolean>);
    setAthleteToggles(newToggles);

    if (onAthleteSelectionChange) {
      onAthleteSelectionChange([]);
    } else {
      setInternalSelectedAthleteIds([]);
    }
  }, [athletes, onAthleteSelectionChange]);

  return {
    athleteToggles,
    handleToggleAthlete,
    handleSelectAll,
    handleClearAll
  };
}