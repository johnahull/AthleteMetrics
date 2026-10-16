import { useMemo } from 'react';
import { useAthleteSelector } from './useAthleteSelector';
import { isLowerBetterType, type TrendData } from '@shared/analytics-types';
import { formatMeasurement } from '@shared/duration-format';
import { safeNumberArray } from '@shared/utils/number-conversion';
import { CHART_CONFIG } from '@/constants/chart-config';
import { useMetricConfig } from '@/hooks/use-metric-config';

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
  const { getMetricConfig, isLoaded: isMetricConfigLoaded } = useMetricConfig();
  const metricConfig = getMetricConfig(metric);
  const metricType = metricConfig?.metricType;

  // Process athlete data with performance metrics
  const athleteOptions = useMemo(() => {
    const lowerIsBetter = isLowerBetterType(metric, metricType);
    const isTracking = metricType === 'tracking';

    return data.map(trend => {
      // Drop non-numeric values: as 0 they would rank first for a lower-is-better metric
      const values = safeNumberArray(trend.data.map(point => point.value));
      // For tracking metrics, use the most recent value; otherwise use best performance
      const bestValue = isTracking
        ? values[values.length - 1] || 0
        : lowerIsBetter
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
      // For tracking metrics, sort alphabetically by name
      if (isTracking) {
        return a.name.localeCompare(b.name);
      }
      // Sort by performance (best first)
      return lowerIsBetter
        ? a.bestValue - b.bestValue
        : b.bestValue - a.bestValue;
    });
  }, [data, metric, metricType]);

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

  // Duration metrics show mm:ss, so a unit suffix would be wrong
  const isDuration = metricConfig?.displayFormat === 'duration';
  const unit = isDuration ? '' : metricConfig?.unit ?? '';
  const metricLabel = metricConfig?.label ?? metric;
  const formatValue = (value: number) =>
    metricConfig
      ? formatMeasurement(value, { ...metricConfig, decimalPrecision: metricConfig.decimalPrecision ?? (isDuration ? 1 : 2) })
      : value.toFixed(2);

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
    unit,
    metricLabel,
    formatValue,
    isMetricConfigLoaded,

    // Performance-specific state
    selectedAthleteIds,
    maxSelection
  };
}