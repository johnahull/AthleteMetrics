import { useMemo } from 'react';
import { CHART_CONFIG } from '@/constants/chart-config';
import { METRIC_CONFIG } from '@shared/analytics-types';
import type { TrendData } from '@shared/analytics-types';
import {
  groupDataByDate,
  calculateBoxPlotStats,
  createAthleteColorMap,
  formatDateLabel
} from '../utils/timeSeriesDataProcessor';
import { generateBoxPlotDatasets } from '../utils/boxPlotDatasetGenerator';
import { generateSwarmPlotDatasets } from '../utils/swarmPlotDatasetGenerator';

interface UseTimeSeriesChartDataParams {
  data: TrendData[];
  selectedDates: string[];
  metric: string;
  showAthleteNames: boolean;
}

export function useTimeSeriesChartData({
  data,
  selectedDates,
  metric,
  showAthleteNames
}: UseTimeSeriesChartDataParams) {
  return useMemo(() => {
    if (!data || data.length === 0 || selectedDates.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
    const unit = metricConfig?.unit || '';

    // Sort selected dates chronologically
    const sortedDates = [...selectedDates].sort();

    // Process data
    const dateDataMap = groupDataByDate(data, selectedDates);
    const athleteColorMap = createAthleteColorMap(data, CHART_CONFIG.COLORS.SERIES);

    // Create date labels
    const dateLabels = sortedDates.map(formatDateLabel);

    const datasets: any[] = [];

    // Create box plot and swarm plot datasets for each date
    sortedDates.forEach((dateStr, dateIndex) => {
      const dateData = dateDataMap.get(dateStr) || [];
      if (dateData.length === 0) return;

      const values = dateData.map(d => d.value);
      const dateLabel = dateLabels[dateIndex];

      if (values.length > 1) {
        // Calculate box plot statistics
        const stats = calculateBoxPlotStats(values);

        // Generate box plot datasets
        const boxPlotDatasets = generateBoxPlotDatasets(dateIndex, stats, dateLabel);
        datasets.push(...boxPlotDatasets);
      }

      // Generate swarm plot datasets
      const swarmDatasets = generateSwarmPlotDatasets(
        dateIndex,
        dateData,
        athleteColorMap,
        dateLabel,
        showAthleteNames
      );
      datasets.push(...swarmDatasets);
    });

    return {
      labels: dateLabels,
      datasets
    };
  }, [data, selectedDates, metric, showAthleteNames]);
}