/**
 * Custom hook for athlete data processing and management
 *
 * Extracts athlete data transformation logic from chart components
 * to improve reusability and maintainability.
 */

import { useMemo, useEffect, useCallback, useRef, useState } from 'react';
import type { TrendData } from '@shared/analytics-types';

export interface AthleteInfo {
  id: string;
  name: string;
  color: number;
}

interface UseAthleteDataParams {
  data: TrendData[];
  selectedAthleteIds?: string[];
  onAthleteSelectionChange?: (ids: string[]) => void;
  maxAthletes?: number;
}

interface UseAthleteDataResult {
  allAthletes: AthleteInfo[];
  displayedAthletes: AthleteInfo[];
  athleteToggles: Record<string, boolean>;
  effectiveSelectedIds: string[];
  toggleAthlete: (athleteId: string) => void;
  handleSelectionChange: (ids: string[]) => void;
  availableMetrics: string[];
  hasValidData: boolean;
}

export function useAthleteData({
  data,
  selectedAthleteIds,
  onAthleteSelectionChange,
  maxAthletes = 10
}: UseAthleteDataParams): UseAthleteDataResult {
  const isMountedRef = useRef(true);

  // Internal state for when no external selection is provided
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const [athleteToggles, setAthleteToggles] = useState<Record<string, boolean>>({});

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Process all athletes from trend data
  const allAthletes = useMemo((): AthleteInfo[] => {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    const athleteMap = new Map<string, AthleteInfo>();

    data.forEach(trend => {
      if (trend?.athleteId && trend?.athleteName && !athleteMap.has(trend.athleteId)) {
        athleteMap.set(trend.athleteId, {
          id: trend.athleteId,
          name: trend.athleteName,
          color: athleteMap.size
        });
      }
    });

    return Array.from(athleteMap.values());
  }, [data]);

  // Get available metrics for validation
  const availableMetrics = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }
    return Array.from(new Set(data.map(trend => trend?.metric).filter(Boolean)));
  }, [data]);

  // Use external or internal selection state
  const effectiveSelectedIds = selectedAthleteIds || internalSelectedIds;
  const handleSelectionChange = onAthleteSelectionChange || setInternalSelectedIds;

  // Set up initial athlete selection
  useEffect(() => {
    if (!selectedAthleteIds && allAthletes.length > 0 && effectiveSelectedIds.length === 0) {
      const initialSelection = allAthletes.slice(0, maxAthletes).map(a => a.id);
      if (isMountedRef.current) {
        handleSelectionChange(initialSelection);
      }
    }
  }, [allAthletes, maxAthletes, selectedAthleteIds, effectiveSelectedIds.length, handleSelectionChange]);

  // Initialize athlete toggles when athletes change
  useEffect(() => {
    const newToggles: Record<string, boolean> = {};
    allAthletes.forEach(athlete => {
      newToggles[athlete.id] = effectiveSelectedIds.includes(athlete.id);
    });
    if (isMountedRef.current) {
      setAthleteToggles(newToggles);
    }
  }, [allAthletes, effectiveSelectedIds]);

  // Memoized toggle function to prevent re-renders
  const toggleAthlete = useCallback((athleteId: string) => {
    if (!isMountedRef.current) return;

    setAthleteToggles(prev => ({
      ...prev,
      [athleteId]: !prev[athleteId]
    }));
  }, []);

  // Filter displayed athletes based on selection and toggles
  const displayedAthletes = useMemo((): AthleteInfo[] => {
    if (!Array.isArray(allAthletes) || allAthletes.length === 0) {
      return [];
    }

    return allAthletes.filter(athlete =>
      effectiveSelectedIds.includes(athlete.id) && athleteToggles[athlete.id]
    );
  }, [allAthletes, effectiveSelectedIds, athleteToggles]);

  return {
    allAthletes,
    displayedAthletes,
    athleteToggles,
    effectiveSelectedIds,
    toggleAthlete,
    handleSelectionChange,
    // Additional utility data
    availableMetrics,
    hasValidData: allAthletes.length > 0 && availableMetrics.length >= 2
  };
}