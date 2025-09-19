import { useMemo } from 'react';
import { useAthleteSelector } from './useAthleteSelector';
import { METRIC_CONFIG } from '@shared/analytics-types';
import type { TrendData } from '@shared/analytics-types';
import { safeNumber } from '@shared/utils/number-conversion';
import { CHART_CONFIG } from '@/constants/chart-config';

interface UsePerformanceAthleteSelectorOptions {
  data: TrendData[];
  selectedAthleteIds: string[];
  onSelectionChange: (athleteIds: string[]) => void;
  maxSelection?: number;
  metric: string;
}

/**
 * Specialized hook for athlete selector with performance-based features
 * Extends base functionality with performance calculations and sorting
 */
export function usePerformanceAthleteSelector({
  data,
  selectedAthleteIds,
  onSelectionChange,
  maxSelection = 10,
  metric
}: UsePerformanceAthleteSelectorOptions) {
  // Process athlete data with performance metrics
  const athleteOptions = useMemo(() => {
    const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
    const lowerIsBetter = metricConfig?.lowerIsBetter || false;

    return data.map(trend => {
      // Calculate best value for this athlete using safe conversion
      const values = trend.data.map(point => safeNumber(point.value));
      const bestValue = lowerIsBetter
        ? Math.min(...values)
        : Math.max(...values);

      return {
        id: trend.athleteId,
        name: trend.athleteName,
        bestValue,
        dataPoints: trend.data.length,
        teamName: trend.teamName || 'No Team'
      };
    }).sort((a, b) => {
      // Sort by performance (best first)
      return lowerIsBetter
        ? a.bestValue - b.bestValue
        : b.bestValue - a.bestValue;
    });
  }, [data, metric]);

  // Use base selector hook with processed data
  const selectorState = useAthleteSelector({
    athletes: athleteOptions,
    maxSelection,
    initialSelection: selectedAthleteIds,
    searchEnabled: true
  });

  // Override selection handlers to use the parent callback
  const toggleAthlete = (athleteId: string) => {
    const newSelection = selectedAthleteIds.includes(athleteId)
      ? selectedAthleteIds.filter(id => id !== athleteId)
      : selectedAthleteIds.length < maxSelection
        ? [...selectedAthleteIds, athleteId]
        : selectedAthleteIds;

    onSelectionChange(newSelection);
  };

  const selectTopPerformers = () => {
    const topIds = athleteOptions.slice(0, maxSelection).map(a => a.id);
    onSelectionChange(topIds);
  };

  const selectAll = () => {
    const allIds = selectorState.filteredAthletes.slice(0, maxSelection).map(a => a.id);
    onSelectionChange(allIds);
  };

  const clearSelection = () => {
    onSelectionChange([]);
  };

  const selectRandom = () => {
    const shuffled = [...athleteOptions].sort(() => Math.random() - CHART_CONFIG.ALGORITHM.RANDOM_SHUFFLE_CENTER);
    const randomIds = shuffled.slice(0, maxSelection).map(a => a.id);
    onSelectionChange(randomIds);
  };

  // Get metric configuration
  const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
  const unit = metricConfig?.unit || '';
  const metricLabel = metricConfig?.label || metric;

  return {
    ...selectorState,
    // Override with performance-specific data
    athleteOptions,

    // Override actions with parent callbacks
    toggleAthlete,
    selectTopPerformers,
    selectAll,
    clearSelection,
    selectRandom,

    // Metric info
    metricConfig,
    unit,
    metricLabel,

    // Performance-specific state
    selectedAthleteIds,
    maxSelection
  };
}