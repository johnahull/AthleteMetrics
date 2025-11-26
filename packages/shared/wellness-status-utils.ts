/**
 * Wellness Status Utilities
 *
 * Utilities for calculating athlete wellness status based on template configuration.
 * Supports both "higher_is_better" and "lower_is_better" scale orientations.
 */

import type { WellnessResponse, WellnessTemplate, WellnessResponseData, ScaleOrientation } from './wellness-types';

export interface AthleteStatus {
  status: 'red' | 'yellow' | 'green';
  score: number | null;
  injuries: { x: number; y: number; label?: string }[];
}

export interface InjurySummary {
  label: string;
  count: number;
}

/**
 * Get default status configuration when template doesn't specify one
 * Auto-detects scale range and orientation from template questions
 */
export function getDefaultStatusConfig(template?: WellnessTemplate) {
  // Default to higher_is_better orientation (typical wellness scales)
  let scaleOrientation: ScaleOrientation = 'higher_is_better';
  let calculationMethod: 'average' | 'sum' = 'average';
  let redThreshold = 3;
  let yellowThreshold = 7;

  // Try to auto-detect from template
  if (template?.config?.questions) {
    const scaleQuestions = template.config.questions.filter(q => q.type === 'scale');

    // Get calculation method from template config if specified
    if (template.config.statusConfig?.calculationMethod) {
      calculationMethod = template.config.statusConfig.calculationMethod;
    }

    if (scaleQuestions.length > 0) {
      const firstScale = scaleQuestions[0];
      if ('scaleMin' in firstScale && 'scaleMax' in firstScale) {
        if (calculationMethod === 'sum') {
          // Calculate thresholds for sum method
          const minSum = firstScale.scaleMin * scaleQuestions.length;
          const maxSum = firstScale.scaleMax * scaleQuestions.length;
          const sumRange = maxSum - minSum;

          // For sum calculation, generate thresholds based on total range
          if (template.config.statusConfig?.scaleOrientation === 'lower_is_better') {
            // Lower scores are better, so red is at high end
            // For 4 questions with 1-5 range: minSum=4, maxSum=20, range=16
            // Red = 4 + 16*0.75 = 4 + 12 = 16 (top 25%)
            // Yellow = 4 + 16*0.5 = 4 + 8 = 12 (top 50%)
            redThreshold = minSum + Math.round(sumRange * 0.75);
            yellowThreshold = minSum + Math.round(sumRange * 0.5);
          } else {
            // Higher scores are better, so red is at low end
            redThreshold = minSum + Math.round(sumRange * 0.3); // Bottom 30%
            yellowThreshold = minSum + Math.round(sumRange * 0.7); // Bottom 70%
          }
        } else {
          // Average calculation (existing logic)
          const range = firstScale.scaleMax - firstScale.scaleMin;
          redThreshold = firstScale.scaleMin + Math.round(range * 0.3);
          yellowThreshold = firstScale.scaleMin + Math.round(range * 0.7);
        }
      }
    }

    // Use template's scale orientation if specified
    if (template.config.statusConfig?.scaleOrientation) {
      scaleOrientation = template.config.statusConfig.scaleOrientation;
    }
  }

  return {
    scaleOrientation,
    calculationMethod,
    redThreshold,
    yellowThreshold,
    injuryQuestionIds: [], // Will be auto-detected from body_map questions
    injuryOverride: true,
  };
}

/**
 * Calculate athlete status based on wellness response and template configuration
 * Handles both "higher_is_better" and "lower_is_better" scale orientations
 * Supports both "average" and "sum" calculation methods
 */
export function calculateAthleteStatus(
  response: WellnessResponse,
  template: WellnessTemplate
): AthleteStatus {
  const config = template.config.statusConfig || getDefaultStatusConfig(template);
  const responses = response.responses as WellnessResponseData;

  // Calculate wellness score from scale questions
  const scaleQuestions = template.config.questions.filter(q => q.type === 'scale');
  const scaleValues = scaleQuestions
    .map(q => responses[q.id]?.value)
    .filter((v): v is number => typeof v === 'number');

  let score: number | null = null;
  if (scaleValues.length > 0) {
    const calculationMethod = config.calculationMethod || 'average';
    if (calculationMethod === 'sum') {
      // Sum all scale values
      score = scaleValues.reduce((sum, val) => sum + val, 0);
    } else {
      // Average all scale values (default behavior)
      score = scaleValues.reduce((sum, val) => sum + val, 0) / scaleValues.length;
    }
  }

  // Extract injuries from configured injury questions
  let injuryQuestionIds = config.injuryQuestionIds;

  // Auto-detect body_map questions if not configured
  if (injuryQuestionIds.length === 0) {
    injuryQuestionIds = template.config.questions
      .filter(q => q.type === 'body_map')
      .map(q => q.id);
  }

  const injuries: { x: number; y: number; label?: string }[] = [];
  injuryQuestionIds.forEach(questionId => {
    const response = responses[questionId];
    if (response && Array.isArray(response.value)) {
      // Type guard to ensure we only push valid injury objects
      response.value.forEach(injury => {
        if (typeof injury === 'object' && injury !== null && 'x' in injury && 'y' in injury) {
          injuries.push(injury);
        }
      });
    }
  });

  // Determine status based on scale orientation
  let status: 'red' | 'yellow' | 'green';

  // Check injury override
  if (config.injuryOverride && injuries.length > 0) {
    status = 'red';
  } else if (score === null) {
    // No scale questions - default to green if no injuries
    status = injuries.length > 0 ? 'red' : 'green';
  } else {
    // Apply thresholds based on orientation
    if (config.scaleOrientation === 'higher_is_better') {
      // Higher scores are better: red <= redThreshold, yellow <= yellowThreshold, green > yellowThreshold
      if (score <= config.redThreshold) {
        status = 'red';
      } else if (score <= config.yellowThreshold) {
        status = 'yellow';
      } else {
        status = 'green';
      }
    } else {
      // Lower scores are better: red >= redThreshold, yellow >= yellowThreshold, green < yellowThreshold
      if (score >= config.redThreshold) {
        status = 'red';
      } else if (score >= config.yellowThreshold) {
        status = 'yellow';
      } else {
        status = 'green';
      }
    }
  }

  return { status, score, injuries };
}

/**
 * Aggregate and count common injuries across athletes
 */
export function getCommonInjuries(
  athleteStatuses: AthleteStatus[]
): InjurySummary[] {
  const injuryCounts = new Map<string, number>();

  athleteStatuses.forEach(athlete => {
    athlete.injuries.forEach(injury => {
      if (injury.label) {
        injuryCounts.set(injury.label, (injuryCounts.get(injury.label) || 0) + 1);
      }
    });
  });

  return Array.from(injuryCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count); // Sort by most common first
}

/**
 * Calculate trend by comparing current and previous scores
 * Handles edge cases: empty arrays, zero averages, NaN values
 */
export function calculateTrend(
  currentScores: number[],
  previousScores: number[]
): 'up' | 'down' | 'stable' {
  // Handle empty arrays
  if (previousScores.length === 0 || currentScores.length === 0) {
    return 'stable';
  }

  const currentAvg = currentScores.reduce((sum, val) => sum + val, 0) / currentScores.length;
  const previousAvg = previousScores.reduce((sum, val) => sum + val, 0) / previousScores.length;

  // Handle NaN values (shouldn't happen with filtered data, but defensive)
  if (isNaN(currentAvg) || isNaN(previousAvg)) {
    return 'stable';
  }

  // Handle zero previous average (can't calculate percentage change)
  if (previousAvg === 0) {
    // If previous was 0 and current is positive, that's an increase
    if (currentAvg > 0) return 'up';
    // If previous was 0 and current is negative, that's a decrease (unlikely in wellness)
    if (currentAvg < 0) return 'down';
    // Both are 0
    return 'stable';
  }

  const percentChange = ((currentAvg - previousAvg) / previousAvg) * 100;

  // Handle Infinity or NaN from division (shouldn't happen now, but defensive)
  if (!isFinite(percentChange)) {
    return 'stable';
  }

  if (percentChange > 5) return 'up';
  if (percentChange < -5) return 'down';
  return 'stable';
}
