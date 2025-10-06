/**
 * Custom hook for managing athlete selection state
 *
 * Supports both controlled and uncontrolled modes:
 * - Controlled: When selectedAthleteIds and onAthleteSelectionChange are provided
 * - Uncontrolled: When only athletes and maxAthletes are provided
 *
 * Performance optimizations:
 * - Uses useRef for callback dependencies to prevent unnecessary re-renders
 * - Memoizes athlete IDs for stable dependencies
 * - Optimized state updates with functional updates
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DEFAULT_SELECTION_COUNT } from '@/utils/chart-constants';
import { validateMaxAthletes, logValidationResult } from '@/utils/chart-validation';
import { useDebouncedCallback } from './useDebounce';

interface Athlete {
  id: string;
  name: string;
  color: number;
}

interface UseAthleteSelectionProps {
  athletes: Athlete[];
  /**
   * External selected athlete IDs (controlled mode)
   * When provided, component becomes controlled
   */
  selectedAthleteIds?: string[];
  /**
   * Callback for selection changes (controlled mode)
   * Required when selectedAthleteIds is provided
   */
  onAthleteSelectionChange?: (athleteIds: string[]) => void;
  /** Maximum number of athletes that can be selected */
  maxAthletes?: number;
  /**
   * Force controlled mode even without selectedAthleteIds
   * When true, selection state is always managed externally
   */
  forceControlled?: boolean;
  /**
   * Debounce delay for selection changes in milliseconds
   * Helps performance when user rapidly changes selections
   * @default 150
   */
  debounceDelay?: number;
}

interface UseAthleteSelectionReturn {
  athleteToggles: Record<string, boolean>;
  handleToggleAthlete: (athleteId: string) => void;
  handleSelectAll: () => void;
  handleClearAll: () => void;
  /** Whether the hook is operating in controlled mode */
  isControlled: boolean;
  /** Current selection count */
  selectedCount: number;
  /** Whether selection has reached the maximum limit */
  isAtMaximum: boolean;
}

export function useAthleteSelection({
  athletes,
  selectedAthleteIds,
  onAthleteSelectionChange,
  maxAthletes = DEFAULT_SELECTION_COUNT,
  forceControlled = false,
  debounceDelay = 150
}: UseAthleteSelectionProps): UseAthleteSelectionReturn {
  // Validate and sanitize maxAthletes prop
  const maxAthletesValidation = validateMaxAthletes(maxAthletes, athletes.length);
  logValidationResult('useAthleteSelection', maxAthletesValidation);
  const validatedMaxAthletes = maxAthletesValidation.value;

  // Determine operation mode (controlled vs uncontrolled)
  const isControlled = !!(selectedAthleteIds || onAthleteSelectionChange || forceControlled);

  // Validate controlled mode setup
  if (process.env.NODE_ENV === 'development') {
    if (selectedAthleteIds && !onAthleteSelectionChange) {
      console.warn(
        '[useAthleteSelection] selectedAthleteIds provided without onAthleteSelectionChange. ' +
        'This creates a read-only selection state. Consider providing onAthleteSelectionChange for controlled mode.'
      );
    }
    if (!selectedAthleteIds && onAthleteSelectionChange) {
      console.warn(
        '[useAthleteSelection] onAthleteSelectionChange provided without selectedAthleteIds. ' +
        'Consider providing selectedAthleteIds for full controlled mode, or omit both for uncontrolled mode.'
      );
    }
  }

  // Internal state for when no external state is provided
  const [internalSelectedAthleteIds, setInternalSelectedAthleteIds] = useState<string[]>([]);
  const [athleteToggles, setAthleteToggles] = useState<Record<string, boolean>>({});

  // Use ref to avoid recreating callbacks when toggles change
  const togglesRef = useRef<Record<string, boolean>>({});
  togglesRef.current = athleteToggles;

  // Create debounced version of external selection change callback
  // Wrap in useCallback to ensure stable reference when callback changes
  const debouncedOnAthleteSelectionChange = useDebouncedCallback(
    useCallback((athleteIds: string[]) => {
      if (onAthleteSelectionChange) {
        onAthleteSelectionChange(athleteIds);
      }
    }, [onAthleteSelectionChange]),
    debounceDelay
  );

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
      debouncedOnAthleteSelectionChange(newSelected);
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
      debouncedOnAthleteSelectionChange(idsToSelect);
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
      debouncedOnAthleteSelectionChange([]);
    } else {
      setInternalSelectedAthleteIds([]);
    }
  }, [athletes, onAthleteSelectionChange]);

  // Calculate derived state
  const selectedCount = Object.values(athleteToggles).filter(Boolean).length;
  const isAtMaximum = selectedCount >= validatedMaxAthletes;

  return {
    athleteToggles,
    handleToggleAthlete,
    handleSelectAll,
    handleClearAll,
    isControlled,
    selectedCount,
    isAtMaximum
  };
}