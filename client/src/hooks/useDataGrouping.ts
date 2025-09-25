/**
 * Data Grouping Hook
 * Transforms analytics data based on selected grouping dimensions
 */

import { useMemo } from 'react';
import type { ChartDataPoint, StatisticalSummary } from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

export interface GroupedDataPoint {
  groupKey: string;
  groupLabel: string;
  groupType: 'team' | 'gender' | 'birthYear' | 'sport' | 'position';
  athleteCount: number;
  statistics: StatisticalSummary;
  points: ChartDataPoint[];
  bestAthlete?: {
    id: string;
    name: string;
    value: number;
  };
}

export interface GroupingResult {
  isGrouped: boolean;
  groupedData: GroupedDataPoint[];
  ungroupedData: ChartDataPoint[];
  groupingSummary: {
    totalGroups: number;
    totalAthletes: number;
    groupType: string | null;
  };
}

interface UseDataGroupingProps {
  data: ChartDataPoint[] | null;
  groupBy: string[];
  primaryMetric: string;
}

export function useDataGrouping({
  data,
  groupBy,
  primaryMetric
}: UseDataGroupingProps): GroupingResult {
  return useMemo(() => {
    if (!data || data.length === 0 || groupBy.length === 0) {
      return {
        isGrouped: false,
        groupedData: [],
        ungroupedData: data || [],
        groupingSummary: {
          totalGroups: 0,
          totalAthletes: data ? new Set(data.map(d => d.athleteId)).size : 0,
          groupType: null
        }
      };
    }

    // For now, focus on team grouping (most common use case)
    const isTeamGrouping = groupBy.includes('teams');

    if (!isTeamGrouping) {
      // Return ungrouped data if no supported grouping is selected
      return {
        isGrouped: false,
        groupedData: [],
        ungroupedData: data,
        groupingSummary: {
          totalGroups: 0,
          totalAthletes: new Set(data.map(d => d.athleteId)).size,
          groupType: null
        }
      };
    }

    // Group data by teams
    const teamGroups = groupDataByTeams(data, primaryMetric);

    return {
      isGrouped: true,
      groupedData: teamGroups,
      ungroupedData: data,
      groupingSummary: {
        totalGroups: teamGroups.length,
        totalAthletes: new Set(data.map(d => d.athleteId)).size,
        groupType: 'team'
      }
    };
  }, [data, groupBy, primaryMetric]);
}

function groupDataByTeams(data: ChartDataPoint[], primaryMetric: string): GroupedDataPoint[] {
  // Group data points by team
  const teamMap = new Map<string, ChartDataPoint[]>();

  data.forEach(point => {
    const teamKey = point.teamName || 'No Team';
    if (!teamMap.has(teamKey)) {
      teamMap.set(teamKey, []);
    }
    teamMap.get(teamKey)!.push(point);
  });

  // Transform each team group into GroupedDataPoint
  const groupedData: GroupedDataPoint[] = [];

  for (const [teamName, teamPoints] of teamMap.entries()) {
    const uniqueAthletes = new Set(teamPoints.map(p => p.athleteId));

    // Calculate statistics for the primary metric
    const primaryMetricPoints = teamPoints.filter(p => p.metric === primaryMetric);
    const statistics = calculateStatistics(primaryMetricPoints);

    // Find best athlete in this team for the primary metric
    const bestAthlete = findBestAthlete(primaryMetricPoints, primaryMetric);

    groupedData.push({
      groupKey: teamName,
      groupLabel: teamName,
      groupType: 'team',
      athleteCount: uniqueAthletes.size,
      statistics,
      points: teamPoints,
      bestAthlete
    });
  }

  // Sort teams by average performance (best to worst)
  const metricConfig = METRIC_CONFIG[primaryMetric as keyof typeof METRIC_CONFIG];
  const lowerIsBetter = metricConfig?.lowerIsBetter || false;

  groupedData.sort((a, b) => {
    if (lowerIsBetter) {
      return a.statistics.mean - b.statistics.mean;
    } else {
      return b.statistics.mean - a.statistics.mean;
    }
  });

  return groupedData;
}

function calculateStatistics(points: ChartDataPoint[]): StatisticalSummary {
  if (points.length === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      std: 0,
      variance: 0,
      percentiles: {
        p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0
      }
    };
  }

  const values = points.map(p => p.value).sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / count;

  const median = calculatePercentile(values, 50);
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
  const std = Math.sqrt(variance);

  return {
    count,
    mean,
    median,
    min: Math.min(...values),
    max: Math.max(...values),
    std,
    variance,
    percentiles: {
      p5: calculatePercentile(values, 5),
      p10: calculatePercentile(values, 10),
      p25: calculatePercentile(values, 25),
      p50: median,
      p75: calculatePercentile(values, 75),
      p90: calculatePercentile(values, 90),
      p95: calculatePercentile(values, 95)
    }
  };
}

function calculatePercentile(sortedValues: number[], percentile: number): number {
  const index = (percentile / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (upper >= sortedValues.length) return sortedValues[sortedValues.length - 1];
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function findBestAthlete(points: ChartDataPoint[], metric: string) {
  if (points.length === 0) return undefined;

  const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
  const lowerIsBetter = metricConfig?.lowerIsBetter || false;

  let bestPoint = points[0];

  for (const point of points) {
    const isBetter = lowerIsBetter
      ? point.value < bestPoint.value
      : point.value > bestPoint.value;

    if (isBetter) {
      bestPoint = point;
    }
  }

  return {
    id: bestPoint.athleteId,
    name: bestPoint.athleteName,
    value: bestPoint.value
  };
}