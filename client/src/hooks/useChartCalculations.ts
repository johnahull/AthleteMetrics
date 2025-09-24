/**
 * Custom hook for memoized chart calculations
 *
 * Provides memoized chart calculations to improve performance by avoiding
 * expensive recalculations when data hasn't changed.
 */

import { useMemo } from 'react';
import type { TrendData, StatisticalSummary } from '@shared/analytics-types';
import {
  getPerformanceQuadrantLabels,
  processAthleteDatasets,
  calculateAthleteAnalytics
} from '@/utils/chart-calculations';

interface UseChartCalculationsParams {
  data: TrendData[];
  displayedAthletes: Array<{ id: string; name: string; color: number }>;
  highlightAthlete?: string;
  statistics?: Record<string, StatisticalSummary>;
}

export function useChartCalculations({
  data,
  displayedAthletes,
  highlightAthlete,
  statistics
}: UseChartCalculationsParams) {
  // Memoized processing of trend data for scatter plot
  const scatterData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const metrics = Array.from(new Set(data.map(trend => trend.metric)));
    if (metrics.length < 2) return null;

    const [xMetric, yMetric] = metrics;

    // Group ALL trends by athlete FIRST
    const allAthleteTrends = data.reduce((acc, trend) => {
      if (!acc[trend.athleteId]) {
        acc[trend.athleteId] = {
          athleteId: trend.athleteId,
          athleteName: trend.athleteName,
          metrics: {}
        };
      }
      acc[trend.athleteId].metrics[trend.metric] = trend.data;
      return acc;
    }, {} as Record<string, any>);

    // Filter to highlighted athlete or use displayedAthletes for multi-athlete selection
    const athletesToShow = highlightAthlete ?
      [allAthleteTrends[highlightAthlete]].filter(Boolean) :
      displayedAthletes.map(athlete => allAthleteTrends[athlete.id]).filter(Boolean);

    // Ensure we have athletes with both metrics and valid data
    const validAthletes = athletesToShow.filter((athlete: any) => {
      if (!athlete) return false;

      // Only require the specific two metrics being used for X and Y axes
      const hasXMetric = athlete.metrics[xMetric]?.length > 0;
      const hasYMetric = athlete.metrics[yMetric]?.length > 0;

      return hasXMetric && hasYMetric;
    });

    if (validAthletes.length === 0) {
      return null;
    }

    // Use valid athletes for chart data
    const athleteTrends = validAthletes.reduce((acc, athlete: any) => {
      acc[athlete.athleteId] = athlete;
      return acc;
    }, {} as Record<string, any>);

    const colors = [
      'rgba(59, 130, 246, 1)',
      'rgba(16, 185, 129, 1)',
      'rgba(239, 68, 68, 1)'
    ];

    // Process athlete datasets using utility function
    const datasets = processAthleteDatasets(athleteTrends, xMetric, yMetric, colors, highlightAthlete);

    // Get metric configuration
    const { METRIC_CONFIG } = require('@shared/analytics-types');
    const xUnit = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG]?.unit || '';
    const yUnit = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG]?.unit || '';
    const xLabel = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG]?.label || xMetric;
    const yLabel = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG]?.label || yMetric;

    // Calculate analytics using utility function
    const analytics = calculateAthleteAnalytics(validAthletes, xMetric, yMetric, statistics, highlightAthlete);

    return {
      datasets,
      xMetric,
      yMetric,
      xUnit,
      yUnit,
      xLabel,
      yLabel,
      athleteTrends,
      analytics,
      chartData: {
        datasets,
        analytics
      }
    };
  }, [data, displayedAthletes, highlightAthlete, statistics]);

  // Memoized performance quadrant labels
  const quadrantLabels = useMemo(() => {
    if (!scatterData) return null;
    return getPerformanceQuadrantLabels(scatterData.xMetric, scatterData.yMetric);
  }, [scatterData?.xMetric, scatterData?.yMetric]);

  return {
    scatterData,
    quadrantLabels
  };
}