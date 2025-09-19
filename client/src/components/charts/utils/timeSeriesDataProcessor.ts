import type { TrendData } from '@shared/analytics-types';
import { safeNumber } from '@shared/utils/number-conversion';

export interface ProcessedDateData {
  athleteId: string;
  athleteName: string;
  value: number;
  isPersonalBest?: boolean;
}

export interface BoxPlotStats {
  min: number;
  max: number;
  q1: number;
  median: number;
  q3: number;
  mean: number;
}

/**
 * Groups trend data by date and filters by selected dates
 */
export function groupDataByDate(
  data: TrendData[],
  selectedDates: string[]
): Map<string, ProcessedDateData[]> {
  const dateDataMap = new Map<string, ProcessedDateData[]>();

  data.forEach(trend => {
    trend.data.forEach(point => {
      const date = point.date instanceof Date ? point.date : new Date(point.date);
      const dateStr = date.toISOString().split('T')[0];

      if (selectedDates.includes(dateStr)) {
        if (!dateDataMap.has(dateStr)) {
          dateDataMap.set(dateStr, []);
        }
        dateDataMap.get(dateStr)!.push({
          athleteId: trend.athleteId,
          athleteName: trend.athleteName,
          value: safeNumber(point.value),
          isPersonalBest: point.isPersonalBest
        });
      }
    });
  });

  return dateDataMap;
}

/**
 * Calculates box plot statistics for a set of values
 */
export function calculateBoxPlotStats(values: number[]): BoxPlotStats {
  const sortedValues = [...values].sort((a, b) => a - b);

  const q1Index = Math.floor(sortedValues.length * 0.25);
  const medianIndex = Math.floor(sortedValues.length * 0.5);
  const q3Index = Math.floor(sortedValues.length * 0.75);

  const min = sortedValues[0];
  const max = sortedValues[sortedValues.length - 1];
  const q1 = sortedValues[q1Index];
  const median = sortedValues[medianIndex];
  const q3 = sortedValues[q3Index];
  const mean = sortedValues.reduce((sum, val) => sum + val, 0) / sortedValues.length;

  return { min, max, q1, median, q3, mean };
}

/**
 * Creates athlete color mapping using a cycling color palette
 */
export function createAthleteColorMap(
  data: TrendData[],
  colorPalette: readonly string[]
): Map<string, string> {
  const uniqueAthletes = [...new Set(data.map(trend => trend.athleteId))];
  const athleteColorMap = new Map<string, string>();

  uniqueAthletes.forEach((athleteId, index) => {
    athleteColorMap.set(athleteId, colorPalette[index % colorPalette.length]);
  });

  return athleteColorMap;
}

/**
 * Formats date string for chart labels
 */
export function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}