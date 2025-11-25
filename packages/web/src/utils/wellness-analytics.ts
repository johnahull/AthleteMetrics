/**
 * Wellness Analytics Utilities
 *
 * Shared calculation utilities for wellness questionnaire analytics.
 * Extracted to eliminate code duplication across components.
 */

import type { WellnessResponse, WellnessResponseData, WellnessTemplate, TrendDirection } from '@shared/wellness-types';
import type { StatusCounts } from '@shared/wellness-analytics-types';
import { WELLNESS_CONSTANTS } from '@shared/wellness-constants';
import { calculateAthleteStatus as calculateAthleteStatusFromShared } from '@shared/wellness-status-utils';

// Re-export calculateAthleteStatus for convenience
export { calculateAthleteStatus } from '@shared/wellness-status-utils';

/**
 * Calculate arithmetic mean of all numeric response values
 * @param responses - Array of wellness responses
 * @param questionFilter - Optional filter function to include specific questions only
 * @returns Average wellness score, or 0 if no valid responses
 */
export function calculateAverageWellness(
  responses: WellnessResponse[],
  questionFilter?: (questionId: string) => boolean
): number {
  if (!responses || responses.length === 0) return 0;

  let totalScore = 0;
  let scoreCount = 0;

  responses.forEach((response) => {
    const responseData = response.responses as WellnessResponseData;
    Object.entries(responseData).forEach(([questionId, data]) => {
      // Apply question filter if provided
      if (questionFilter && !questionFilter(questionId)) {
        return;
      }

      // Only count numeric values
      if (typeof data.value === 'number') {
        totalScore += data.value;
        scoreCount++;
      }
    });
  });

  return scoreCount > 0 ? totalScore / scoreCount : 0;
}

/**
 * Calculate trend direction by comparing first half vs second half of responses
 * @param responses - Array of wellness responses
 * @param scaleOrientation - Whether higher or lower scores are better
 * @param scaleRange - Maximum value of the scale (for calculating threshold)
 * @returns 'up' (improving), 'down' (declining), or 'stable'
 */
export function calculateTrend(
  responses: WellnessResponse[],
  scaleOrientation: 'higher_is_better' | 'lower_is_better' = 'higher_is_better',
  scaleRange: number = 10
): TrendDirection {
  if (!responses || responses.length < 2) return 'stable';

  // Sort by date ascending
  const sorted = [...responses].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Split into two halves
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  // Calculate averages for each half
  const firstAvg = calculateAverageWellness(firstHalf);
  const secondAvg = calculateAverageWellness(secondHalf);

  // Calculate difference
  const difference = secondAvg - firstAvg;

  // Use 5% of scale range as threshold
  // For 1-10 scale: 5% of (10-1) = 0.45
  const scaleMin = 1; // Assuming standard 1-based scales
  const threshold = (WELLNESS_CONSTANTS.TREND_PERCENTAGE_THRESHOLD / 100) *
    (scaleRange - scaleMin);

  // Determine trend based on orientation
  if (scaleOrientation === 'higher_is_better') {
    // Higher scores are better
    if (difference > threshold) return 'up';
    if (difference < -threshold) return 'down';
  } else {
    // Lower scores are better - invert the meaning
    if (difference < -threshold) return 'up';   // Score decreased = improving
    if (difference > threshold) return 'down';  // Score increased = declining
  }

  return 'stable';
}

/**
 * Group responses by date
 * @param responses - Array of wellness responses
 * @returns Map of date strings to arrays of responses
 */
export function groupResponsesByDate(
  responses: WellnessResponse[]
): Map<string, WellnessResponse[]> {
  const grouped = new Map<string, WellnessResponse[]>();

  responses.forEach(response => {
    const date = response.date;
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push(response);
  });

  return grouped;
}

/**
 * Filter responses by date range and sort by date ascending
 * @param responses - Array of wellness responses
 * @param fromDate - Start date (inclusive) in YYYY-MM-DD format
 * @param toDate - End date (inclusive) in YYYY-MM-DD format
 * @returns Filtered and sorted array of responses
 */
export function filterResponsesByDateRange(
  responses: WellnessResponse[],
  fromDate: string,
  toDate: string
): WellnessResponse[] {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  const filtered = responses.filter(response => {
    const responseDate = new Date(response.date);
    return responseDate >= from && responseDate <= to;
  });

  // Sort by date ascending
  return filtered.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

/**
 * Aggregate status counts from responses
 * @param responses - Array of wellness responses
 * @param template - Wellness template with status configuration
 * @returns Count of red, yellow, green statuses and total
 */
export function aggregateStatusCounts(
  responses: WellnessResponse[],
  template: WellnessTemplate
): StatusCounts {
  const counts: StatusCounts = { red: 0, yellow: 0, green: 0, total: 0 };

  if (!responses || responses.length === 0) {
    return counts;
  }

  responses.forEach(response => {
    const athleteStatus = calculateAthleteStatusFromShared(response, template);
    counts[athleteStatus.status]++;
    counts.total++;
  });

  return counts;
}

/**
 * Group responses by athlete and sort each athlete's responses by date
 * @param responses - Array of wellness responses
 * @returns Map of userId to arrays of responses (sorted by date)
 */
export function groupResponsesByAthlete(
  responses: WellnessResponse[]
): Map<string, WellnessResponse[]> {
  const grouped = new Map<string, WellnessResponse[]>();

  responses.forEach(response => {
    const userId = response.userId;
    if (!grouped.has(userId)) {
      grouped.set(userId, []);
    }
    grouped.get(userId)!.push(response);
  });

  // Sort each athlete's responses by date ascending
  grouped.forEach((athleteResponses, userId) => {
    grouped.set(
      userId,
      athleteResponses.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
    );
  });

  return grouped;
}
