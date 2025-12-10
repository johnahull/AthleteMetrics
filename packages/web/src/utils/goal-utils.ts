/**
 * Goal Utilities
 * Week 4: Goal Setting System
 *
 * Provides utilities for:
 * - Goal progress calculation
 * - Goal status management
 * - Smart goal suggestions based on performance
 * - Goal formatting and display
 */

import { isLowerBetterMetric, formatMetricValue, getMetricEducation } from './metric-education-utils';

/**
 * Types of goals athletes can set
 */
export enum GoalType {
  /** Reach a specific target value (e.g., run 1.05s, jump 36") */
  TARGET_VALUE = 'target_value',
  /** Improve by a percentage from baseline (e.g., 10% faster) */
  IMPROVEMENT_PERCENTAGE = 'improvement_percentage',
  /** Achieve consistency (e.g., 10 measurements this month) */
  CONSISTENCY = 'consistency',
}

/**
 * Status of a goal
 */
export enum GoalStatus {
  /** Goal is currently being worked on */
  ACTIVE = 'active',
  /** Goal has been achieved */
  ACHIEVED = 'achieved',
  /** Goal was not achieved by target date */
  MISSED = 'missed',
  /** Athlete chose to abandon the goal */
  ABANDONED = 'abandoned',
}

/**
 * Goal data structure
 */
export interface Goal {
  id: string;
  userId: string;
  metric: string;
  goalType: GoalType;
  targetValue: number;
  baselineValue: number;
  currentValue: number;
  targetDate: string;
  status: GoalStatus;
  createdAt: string;
  achievedAt?: string;
  notes?: string;
}

/**
 * Goal suggestion from smart suggestions system
 */
export interface GoalSuggestion {
  goalType: GoalType;
  targetValue: number;
  description: string;
  difficulty: 'easy' | 'moderate' | 'challenging';
}

/**
 * Measurement data for goal suggestions
 */
interface Measurement {
  metric: string;
  value: number | string;
  date: string;
}

/**
 * Calculate progress towards a goal (0-100%)
 */
export function calculateGoalProgress(goal: Goal): number {
  const { goalType, targetValue, baselineValue, currentValue, metric } = goal;

  switch (goalType) {
    case GoalType.TARGET_VALUE: {
      const lowerIsBetter = isLowerBetterMetric(metric);

      if (lowerIsBetter) {
        // For time metrics: baseline > target (lower is better)
        // Progress = how much we've reduced from baseline towards target
        const totalImprovement = baselineValue - targetValue;
        if (totalImprovement === 0) return 100;

        const currentImprovement = baselineValue - currentValue;
        const progress = (currentImprovement / totalImprovement) * 100;
        return Math.min(100, Math.max(0, Math.round(progress)));
      } else {
        // For distance/height metrics: baseline < target (higher is better)
        // Progress = how much we've gained from baseline towards target
        const totalImprovement = targetValue - baselineValue;
        if (totalImprovement === 0) return 100;

        const currentImprovement = currentValue - baselineValue;
        const progress = (currentImprovement / totalImprovement) * 100;
        return Math.min(100, Math.max(0, Math.round(progress)));
      }
    }

    case GoalType.IMPROVEMENT_PERCENTAGE: {
      // Target is a percentage improvement (e.g., 10%)
      // currentValue represents current performance
      const lowerIsBetter = isLowerBetterMetric(metric);

      // Calculate current improvement percentage
      let currentImprovementPct: number;
      if (lowerIsBetter) {
        currentImprovementPct = ((baselineValue - currentValue) / baselineValue) * 100;
      } else {
        currentImprovementPct = ((currentValue - baselineValue) / baselineValue) * 100;
      }

      const progress = (currentImprovementPct / targetValue) * 100;
      return Math.min(100, Math.max(0, Math.round(progress)));
    }

    case GoalType.CONSISTENCY: {
      // Target is a count (e.g., 10 measurements)
      // currentValue is how many have been done
      const progress = (currentValue / targetValue) * 100;
      return Math.min(100, Math.max(0, Math.round(progress)));
    }

    default:
      return 0;
  }
}

/**
 * Get color associated with goal status
 */
export function getGoalStatusColor(status: GoalStatus): string {
  switch (status) {
    case GoalStatus.ACHIEVED:
      return 'green';
    case GoalStatus.ACTIVE:
      return 'blue';
    case GoalStatus.MISSED:
      return 'red';
    case GoalStatus.ABANDONED:
      return 'gray';
    default:
      return 'gray';
  }
}

/**
 * Format goal target for display
 */
export function formatGoalTarget(goal: Goal): string {
  const { goalType, targetValue, metric } = goal;

  switch (goalType) {
    case GoalType.TARGET_VALUE:
      return formatMetricValue(targetValue, metric);

    case GoalType.IMPROVEMENT_PERCENTAGE:
      return `${targetValue}% improvement`;

    case GoalType.CONSISTENCY:
      return `${targetValue} measurements`;

    default:
      return String(targetValue);
  }
}

/**
 * Suggest goals based on athlete's measurement history
 */
export function suggestGoals(measurements: Measurement[], metric: string): GoalSuggestion[] {
  const education = getMetricEducation(metric);
  if (!education) return [];

  // Filter measurements for this metric
  const metricMeasurements = measurements
    .filter(m => m.metric === metric)
    .map(m => ({
      ...m,
      value: typeof m.value === 'string' ? parseFloat(m.value) : m.value,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (metricMeasurements.length === 0) return [];

  const lowerIsBetter = education.lowerIsBetter;
  const currentBest = lowerIsBetter
    ? Math.min(...metricMeasurements.map(m => m.value))
    : Math.max(...metricMeasurements.map(m => m.value));

  const suggestions: GoalSuggestion[] = [];

  // Suggest target value goal
  if (lowerIsBetter) {
    // For time metrics, suggest 3-5% improvement
    const easyTarget = currentBest * 0.97; // 3% faster
    const moderateTarget = currentBest * 0.95; // 5% faster
    const challengingTarget = currentBest * 0.92; // 8% faster

    suggestions.push({
      goalType: GoalType.TARGET_VALUE,
      targetValue: parseFloat(moderateTarget.toFixed(2)),
      description: `Improve ${education.name} to ${formatMetricValue(moderateTarget, metric)}`,
      difficulty: 'moderate',
    });

    suggestions.push({
      goalType: GoalType.TARGET_VALUE,
      targetValue: parseFloat(easyTarget.toFixed(2)),
      description: `Reach ${formatMetricValue(easyTarget, metric)} (3% improvement)`,
      difficulty: 'easy',
    });

    suggestions.push({
      goalType: GoalType.TARGET_VALUE,
      targetValue: parseFloat(challengingTarget.toFixed(2)),
      description: `Push for ${formatMetricValue(challengingTarget, metric)} (8% improvement)`,
      difficulty: 'challenging',
    });
  } else {
    // For height/distance metrics, suggest 3-8% improvement
    const easyTarget = currentBest * 1.03; // 3% higher
    const moderateTarget = currentBest * 1.05; // 5% higher
    const challengingTarget = currentBest * 1.08; // 8% higher

    suggestions.push({
      goalType: GoalType.TARGET_VALUE,
      targetValue: parseFloat(moderateTarget.toFixed(1)),
      description: `Improve ${education.name} to ${formatMetricValue(moderateTarget, metric)}`,
      difficulty: 'moderate',
    });

    suggestions.push({
      goalType: GoalType.TARGET_VALUE,
      targetValue: parseFloat(easyTarget.toFixed(1)),
      description: `Reach ${formatMetricValue(easyTarget, metric)} (3% improvement)`,
      difficulty: 'easy',
    });

    suggestions.push({
      goalType: GoalType.TARGET_VALUE,
      targetValue: parseFloat(challengingTarget.toFixed(1)),
      description: `Push for ${formatMetricValue(challengingTarget, metric)} (8% improvement)`,
      difficulty: 'challenging',
    });
  }

  // Suggest improvement percentage goal
  suggestions.push({
    goalType: GoalType.IMPROVEMENT_PERCENTAGE,
    targetValue: 5,
    description: `Improve ${education.name} by 5%`,
    difficulty: 'moderate',
  });

  // Suggest consistency goal
  suggestions.push({
    goalType: GoalType.CONSISTENCY,
    targetValue: 10,
    description: `Complete 10 ${education.name} measurements this month`,
    difficulty: 'easy',
  });

  return suggestions;
}

/**
 * Check if a goal has been achieved
 */
export function isGoalAchieved(goal: Goal): boolean {
  const { goalType, targetValue, currentValue, metric } = goal;

  switch (goalType) {
    case GoalType.TARGET_VALUE: {
      const lowerIsBetter = isLowerBetterMetric(metric);
      if (lowerIsBetter) {
        return currentValue <= targetValue;
      } else {
        return currentValue >= targetValue;
      }
    }

    case GoalType.IMPROVEMENT_PERCENTAGE: {
      // Calculate current improvement percentage
      const { baselineValue } = goal;
      const lowerIsBetter = isLowerBetterMetric(metric);

      let currentImprovementPct: number;
      if (lowerIsBetter) {
        currentImprovementPct = ((baselineValue - currentValue) / baselineValue) * 100;
      } else {
        currentImprovementPct = ((currentValue - baselineValue) / baselineValue) * 100;
      }

      return currentImprovementPct >= targetValue;
    }

    case GoalType.CONSISTENCY:
      return currentValue >= targetValue;

    default:
      return false;
  }
}

/**
 * Calculate days remaining until target date
 */
export function getDaysRemaining(targetDate: string): number {
  // Parse the target date as local date (YYYY-MM-DD format)
  const [year, month, day] = targetDate.split('-').map(Number);
  const target = new Date(year, month - 1, day);

  const today = new Date();
  // Reset time to midnight for accurate day calculation
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Get human-readable progress text for a goal
 */
export function getGoalProgressText(goal: Goal): string {
  if (goal.status === GoalStatus.ACHIEVED) {
    return 'Goal achieved! 🎉';
  }

  if (goal.status === GoalStatus.MISSED) {
    return 'Goal missed - time expired';
  }

  if (goal.status === GoalStatus.ABANDONED) {
    return 'Goal abandoned';
  }

  const progress = calculateGoalProgress(goal);
  const daysRemaining = getDaysRemaining(goal.targetDate);

  if (progress === 100) {
    return 'Goal achieved - ready to mark complete!';
  }

  if (progress === 0) {
    return `0% progress - ${daysRemaining > 0 ? `${daysRemaining} days remaining` : 'deadline passed'}`;
  }

  if (daysRemaining > 0) {
    return `${progress}% complete - ${daysRemaining} days remaining`;
  } else if (daysRemaining === 0) {
    return `${progress}% complete - deadline is today!`;
  } else {
    return `${progress}% complete - ${Math.abs(daysRemaining)} days overdue`;
  }
}
