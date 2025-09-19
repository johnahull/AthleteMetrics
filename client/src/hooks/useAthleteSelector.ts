import { useState, useEffect, useMemo } from 'react';
import { CHART_CONFIG } from '@/constants/chart-config';

export interface Athlete {
  id: string;
  name?: string;
  fullName: string;
  teamName?: string;
  teams?: Array<{ id: string; name: string }>;
  birthYear?: number;
}

export interface AthleteInfo {
  id: string;
  name: string;
  bestValue?: number;
  dataPoints?: number;
  teamName?: string;
}

interface UseAthleteSelectorOptions {
  athletes: Athlete[] | AthleteInfo[];
  maxSelection?: number;
  initialSelection?: string[];
  searchEnabled?: boolean;
}

/**
 * Shared hook for athlete selector functionality
 * Provides common state management and filtering logic
 */
export function useAthleteSelector({
  athletes,
  maxSelection = 10,
  initialSelection = [],
  searchEnabled = true
}: UseAthleteSelectorOptions) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelection);
  const [isExpanded, setIsExpanded] = useState(false);

  // Normalize athlete data to handle different shapes
  const normalizedAthletes = useMemo(() => {
    return athletes.map(athlete => ({
      id: athlete.id,
      name: 'fullName' in athlete ? athlete.fullName : athlete.name,
      teamName: athlete.teamName,
      ...('bestValue' in athlete ? { bestValue: athlete.bestValue } : {}),
      ...('dataPoints' in athlete ? { dataPoints: athlete.dataPoints } : {}),
      ...('birthYear' in athlete ? { birthYear: athlete.birthYear } : {})
    }));
  }, [athletes]);

  // Filter athletes based on search term
  const filteredAthletes = useMemo(() => {
    if (!searchEnabled || !searchTerm.trim()) {
      return normalizedAthletes;
    }

    const term = searchTerm.toLowerCase();
    return normalizedAthletes.filter(athlete =>
      athlete.name?.toLowerCase().includes(term) ||
      athlete.teamName?.toLowerCase().includes(term)
    );
  }, [normalizedAthletes, searchTerm, searchEnabled]);

  // Get athlete color mapping using chart config
  const athleteColorMap = useMemo(() => {
    const colorMap = new Map<string, string>();
    selectedIds.forEach((id, index) => {
      colorMap.set(id, CHART_CONFIG.COLORS.SERIES[index % CHART_CONFIG.COLORS.SERIES.length]);
    });
    return colorMap;
  }, [selectedIds]);

  // Selection handlers
  const toggleAthlete = (athleteId: string) => {
    setSelectedIds(prev => {
      if (prev.includes(athleteId)) {
        return prev.filter(id => id !== athleteId);
      } else if (prev.length < maxSelection) {
        return [...prev, athleteId];
      }
      return prev;
    });
  };

  const selectAll = () => {
    const allIds = filteredAthletes.slice(0, maxSelection).map(a => a.id);
    setSelectedIds(allIds);
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const selectRandom = (count: number = Math.min(5, maxSelection)) => {
    const shuffled = [...filteredAthletes].sort(() => Math.random() - CHART_CONFIG.ALGORITHM.RANDOM_SHUFFLE_CENTER);
    const randomIds = shuffled.slice(0, count).map(a => a.id);
    setSelectedIds(randomIds);
  };

  // Get selected athletes with their data
  const selectedAthletes = useMemo(() => {
    return selectedIds
      .map(id => normalizedAthletes.find(a => a.id === id))
      .filter(Boolean) as typeof normalizedAthletes;
  }, [selectedIds, normalizedAthletes]);

  // Selection state
  const canSelectMore = selectedIds.length < maxSelection;
  const hasSelection = selectedIds.length > 0;

  // Cleanup effect for removed athletes
  useEffect(() => {
    const validIds = new Set(normalizedAthletes.map(a => a.id));
    setSelectedIds(prev => prev.filter(id => validIds.has(id)));
  }, [normalizedAthletes]);

  return {
    // State
    searchTerm,
    selectedIds,
    isExpanded,

    // Computed
    filteredAthletes,
    selectedAthletes,
    athleteColorMap,
    canSelectMore,
    hasSelection,

    // Actions
    setSearchTerm,
    setSelectedIds,
    setIsExpanded,
    toggleAthlete,
    selectAll,
    clearSelection,
    selectRandom
  };
}