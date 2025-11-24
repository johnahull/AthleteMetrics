/**
 * Wellness Analytics Constants
 *
 * Centralized constants for wellness questionnaire analytics
 * to ensure consistency across frontend and backend.
 */

export const WELLNESS_CONSTANTS = {
  // Date Range
  DEFAULT_DATE_RANGE_DAYS: 30,

  // Alert Thresholds
  ALERT_DROP_PERCENTAGE: 20, // % drop to trigger alert
  ALERT_LOW_SCORE_THRESHOLD: 4, // Score below this is "low"
  ALERT_CONSECUTIVE_LOW_DAYS: 3, // Days of low scores to trigger sustained alert

  // Trend Calculation
  TREND_PERCENTAGE_THRESHOLD: 5, // % change to show up/down trend

  // Chart Limits
  CHART_MAX_QUESTIONS: 10, // Max questions to display on trend chart
  HEATMAP_MAX_VISIBLE_DAYS: 14, // Max days visible without scrolling

  // Wellness Score Ranges
  SCORE_MIN: 1,
  SCORE_MAX: 10,
  SCORE_LOW_THRESHOLD: 3, // Below this is "concerning"
  SCORE_MEDIUM_THRESHOLD: 7, // Above this is "good"

  // Chart Colors (colorblind-friendly palette)
  CHART_COLORS: [
    'rgb(59, 130, 246)',   // blue
    'rgb(16, 185, 129)',   // green
    'rgb(249, 115, 22)',   // orange
    'rgb(168, 85, 247)',   // purple
    'rgb(236, 72, 153)',   // pink
    'rgb(20, 184, 166)',   // teal
    'rgb(251, 191, 36)',   // yellow
    'rgb(239, 68, 68)',    // red
    'rgb(107, 114, 128)',  // gray
    'rgb(139, 92, 246)',   // violet
  ],

  // Heatmap Colors (colorblind-friendly)
  HEATMAP_COLORS: {
    NO_DATA: 'rgb(243, 244, 246)',      // gray-100
    VERY_LOW: 'rgb(254, 202, 202)',     // red-200
    LOW: 'rgb(254, 243, 199)',          // yellow-200
    MEDIUM: 'rgb(191, 219, 254)',       // blue-200
    GOOD: 'rgb(167, 243, 208)',         // green-200
    EXCELLENT: 'rgb(134, 239, 172)',    // green-300
  },
} as const;

// Type exports for constants
export type WellnessScoreLevel = 'very_low' | 'low' | 'medium' | 'good' | 'excellent';

/**
 * Get wellness score level based on score value (legacy 1-10 scale)
 */
export function getWellnessScoreLevel(score: number): WellnessScoreLevel {
  if (score <= WELLNESS_CONSTANTS.SCORE_LOW_THRESHOLD) return 'very_low';
  if (score <= 5) return 'low';
  if (score <= WELLNESS_CONSTANTS.SCORE_MEDIUM_THRESHOLD) return 'medium';
  if (score <= 9) return 'good';
  return 'excellent';
}

/**
 * Get wellness score level with custom thresholds
 * @param score - The wellness score value
 * @param lowThreshold - Scores at or below this are "low"
 * @param mediumThreshold - Scores at or below this are "medium"
 * @param highThreshold - Scores above this are "high"
 * @param scaleMax - Maximum value of the scale
 */
export function getWellnessScoreLevelWithThresholds(
  score: number,
  lowThreshold: number,
  mediumThreshold: number,
  highThreshold: number,
  scaleMax: number
): WellnessScoreLevel {
  // Normalize thresholds if they seem to be on wrong scale
  const normalizedLow = lowThreshold > scaleMax ? lowThreshold / scaleMax : lowThreshold;
  const normalizedMedium = mediumThreshold > scaleMax ? mediumThreshold / scaleMax : mediumThreshold;
  const normalizedHigh = highThreshold > scaleMax ? highThreshold / scaleMax : highThreshold;

  // Calculate mid-points for more granular levels
  const veryLowCutoff = normalizedLow * 0.7; // Bottom 70% of low range
  const goodCutoff = normalizedHigh + (scaleMax - normalizedHigh) * 0.5; // Middle of high range

  if (score <= veryLowCutoff) return 'very_low';
  if (score <= normalizedLow) return 'low';
  if (score <= normalizedMedium) return 'medium';
  if (score <= normalizedHigh) return 'good';
  return 'excellent';
}

/**
 * Extract scale range from template configuration
 * Returns the min and max values from scale questions
 */
export function getTemplateScaleRange(template: any): { min: number; max: number } | null {
  if (!template?.config?.questions) return null;

  const scaleQuestions = template.config.questions.filter((q: any) => q.type === 'scale');
  if (scaleQuestions.length === 0) return null;

  // Find the most common scale range (in case of mixed scales)
  const ranges = scaleQuestions.map((q: any) => ({ min: q.scaleMin, max: q.scaleMax }));

  // Use the first scale range as default (most templates have consistent scales)
  return ranges[0] || null;
}

/**
 * Auto-generate color thresholds based on scale range
 * @param scaleMin - Minimum value of the scale
 * @param scaleMax - Maximum value of the scale
 */
export function autoGenerateColorThresholds(scaleMin: number, scaleMax: number) {
  const range = scaleMax - scaleMin;

  return {
    lowThreshold: scaleMin + Math.round(range * 0.3),      // Bottom 30%
    mediumThreshold: scaleMin + Math.round(range * 0.6),   // Middle 60%
    highThreshold: scaleMin + Math.round(range * 0.8),     // Top 80%
  };
}

/**
 * Get heatmap color based on wellness score
 */
export function getHeatmapColor(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return WELLNESS_CONSTANTS.HEATMAP_COLORS.NO_DATA;
  }

  const level = getWellnessScoreLevel(score);

  switch (level) {
    case 'very_low':
      return WELLNESS_CONSTANTS.HEATMAP_COLORS.VERY_LOW;
    case 'low':
      return WELLNESS_CONSTANTS.HEATMAP_COLORS.LOW;
    case 'medium':
      return WELLNESS_CONSTANTS.HEATMAP_COLORS.MEDIUM;
    case 'good':
      return WELLNESS_CONSTANTS.HEATMAP_COLORS.GOOD;
    case 'excellent':
      return WELLNESS_CONSTANTS.HEATMAP_COLORS.EXCELLENT;
  }
}
