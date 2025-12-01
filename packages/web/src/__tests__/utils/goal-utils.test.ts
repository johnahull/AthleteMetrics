/**
 * Tests for Goal Utilities
 * Week 4: Goal Setting System - TDD Phase 1 (RED)
 */

import { describe, it, expect } from 'vitest';
import {
  GoalType,
  GoalStatus,
  Goal,
  calculateGoalProgress,
  getGoalStatusColor,
  formatGoalTarget,
  suggestGoals,
  isGoalAchieved,
  getDaysRemaining,
  getGoalProgressText,
} from '@/utils/goal-utils';

describe('goal-utils', () => {
  describe('GoalType enum', () => {
    it('should have target_value type', () => {
      expect(GoalType.TARGET_VALUE).toBe('target_value');
    });

    it('should have improvement_percentage type', () => {
      expect(GoalType.IMPROVEMENT_PERCENTAGE).toBe('improvement_percentage');
    });

    it('should have consistency type', () => {
      expect(GoalType.CONSISTENCY).toBe('consistency');
    });
  });

  describe('GoalStatus enum', () => {
    it('should have active status', () => {
      expect(GoalStatus.ACTIVE).toBe('active');
    });

    it('should have achieved status', () => {
      expect(GoalStatus.ACHIEVED).toBe('achieved');
    });

    it('should have missed status', () => {
      expect(GoalStatus.MISSED).toBe('missed');
    });

    it('should have abandoned status', () => {
      expect(GoalStatus.ABANDONED).toBe('abandoned');
    });
  });

  describe('calculateGoalProgress', () => {
    describe('target value goals (lower is better)', () => {
      const lowerIsBetterGoal: Goal = {
        id: 'goal-1',
        userId: 'user-1',
        metric: 'FLY10_TIME',
        goalType: GoalType.TARGET_VALUE,
        targetValue: 1.0, // Target: 1.0s
        baselineValue: 1.2, // Started at: 1.2s
        currentValue: 1.1, // Currently: 1.1s
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };

      it('should calculate progress for target value goal (lower is better)', () => {
        const progress = calculateGoalProgress(lowerIsBetterGoal);
        // From 1.2 to 1.0 is 0.2 improvement needed
        // Current 1.1 is 0.1 improvement made
        // Progress = 0.1 / 0.2 = 50%
        expect(progress).toBe(50);
      });

      it('should return 100% when goal is achieved', () => {
        const achievedGoal = { ...lowerIsBetterGoal, currentValue: 1.0 };
        expect(calculateGoalProgress(achievedGoal)).toBe(100);
      });

      it('should return 0% when no progress made', () => {
        const noProgressGoal = { ...lowerIsBetterGoal, currentValue: 1.2 };
        expect(calculateGoalProgress(noProgressGoal)).toBe(0);
      });

      it('should cap at 100% when exceeded goal', () => {
        const exceededGoal = { ...lowerIsBetterGoal, currentValue: 0.9 };
        expect(calculateGoalProgress(exceededGoal)).toBe(100);
      });
    });

    describe('target value goals (higher is better)', () => {
      const higherIsBetterGoal: Goal = {
        id: 'goal-2',
        userId: 'user-1',
        metric: 'VERTICAL_JUMP',
        goalType: GoalType.TARGET_VALUE,
        targetValue: 36, // Target: 36"
        baselineValue: 30, // Started at: 30"
        currentValue: 33, // Currently: 33"
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };

      it('should calculate progress for target value goal (higher is better)', () => {
        const progress = calculateGoalProgress(higherIsBetterGoal);
        // From 30 to 36 is 6" improvement needed
        // Current 33 is 3" improvement made
        // Progress = 3 / 6 = 50%
        expect(progress).toBe(50);
      });

      it('should return 100% when goal is achieved', () => {
        const achievedGoal = { ...higherIsBetterGoal, currentValue: 36 };
        expect(calculateGoalProgress(achievedGoal)).toBe(100);
      });

      it('should cap at 100% when exceeded goal', () => {
        const exceededGoal = { ...higherIsBetterGoal, currentValue: 40 };
        expect(calculateGoalProgress(exceededGoal)).toBe(100);
      });
    });

    describe('improvement percentage goals', () => {
      const improvementGoal: Goal = {
        id: 'goal-3',
        userId: 'user-1',
        metric: 'FLY10_TIME',
        goalType: GoalType.IMPROVEMENT_PERCENTAGE,
        targetValue: 10, // Target: 10% improvement
        baselineValue: 1.2, // Started at: 1.2s
        currentValue: 1.14, // Currently: 1.14s (5% improved)
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };

      it('should calculate progress for improvement percentage goal', () => {
        const progress = calculateGoalProgress(improvementGoal);
        // 5% out of 10% target = 50%
        expect(progress).toBe(50);
      });
    });

    describe('consistency goals', () => {
      const consistencyGoal: Goal = {
        id: 'goal-4',
        userId: 'user-1',
        metric: 'FLY10_TIME',
        goalType: GoalType.CONSISTENCY,
        targetValue: 10, // Target: 10 measurements
        baselineValue: 0,
        currentValue: 5, // Currently: 5 measurements
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };

      it('should calculate progress for consistency goal', () => {
        const progress = calculateGoalProgress(consistencyGoal);
        // 5 out of 10 = 50%
        expect(progress).toBe(50);
      });
    });
  });

  describe('getGoalStatusColor', () => {
    it('should return green for achieved status', () => {
      expect(getGoalStatusColor(GoalStatus.ACHIEVED)).toBe('green');
    });

    it('should return blue for active status', () => {
      expect(getGoalStatusColor(GoalStatus.ACTIVE)).toBe('blue');
    });

    it('should return red for missed status', () => {
      expect(getGoalStatusColor(GoalStatus.MISSED)).toBe('red');
    });

    it('should return gray for abandoned status', () => {
      expect(getGoalStatusColor(GoalStatus.ABANDONED)).toBe('gray');
    });
  });

  describe('formatGoalTarget', () => {
    it('should format target value goal for time metric', () => {
      const goal: Goal = {
        id: 'goal-1',
        userId: 'user-1',
        metric: 'FLY10_TIME',
        goalType: GoalType.TARGET_VALUE,
        targetValue: 1.05,
        baselineValue: 1.2,
        currentValue: 1.1,
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };
      expect(formatGoalTarget(goal)).toBe('1.05s');
    });

    it('should format target value goal for distance metric', () => {
      const goal: Goal = {
        id: 'goal-2',
        userId: 'user-1',
        metric: 'VERTICAL_JUMP',
        goalType: GoalType.TARGET_VALUE,
        targetValue: 36,
        baselineValue: 30,
        currentValue: 33,
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };
      expect(formatGoalTarget(goal)).toBe('36.0"');
    });

    it('should format improvement percentage goal', () => {
      const goal: Goal = {
        id: 'goal-3',
        userId: 'user-1',
        metric: 'FLY10_TIME',
        goalType: GoalType.IMPROVEMENT_PERCENTAGE,
        targetValue: 10,
        baselineValue: 1.2,
        currentValue: 1.1,
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };
      expect(formatGoalTarget(goal)).toBe('10% improvement');
    });

    it('should format consistency goal', () => {
      const goal: Goal = {
        id: 'goal-4',
        userId: 'user-1',
        metric: 'FLY10_TIME',
        goalType: GoalType.CONSISTENCY,
        targetValue: 10,
        baselineValue: 0,
        currentValue: 5,
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };
      expect(formatGoalTarget(goal)).toBe('10 measurements');
    });
  });

  describe('suggestGoals', () => {
    const measurements = [
      { metric: 'FLY10_TIME', value: 1.2, date: '2024-01-01' },
      { metric: 'FLY10_TIME', value: 1.15, date: '2024-01-15' },
      { metric: 'FLY10_TIME', value: 1.12, date: '2024-02-01' },
      { metric: 'VERTICAL_JUMP', value: 30, date: '2024-01-01' },
      { metric: 'VERTICAL_JUMP', value: 31, date: '2024-01-15' },
    ];

    it('should suggest improvement goals based on current performance', () => {
      const suggestions = suggestGoals(measurements, 'FLY10_TIME');
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toHaveProperty('goalType');
      expect(suggestions[0]).toHaveProperty('targetValue');
      expect(suggestions[0]).toHaveProperty('description');
    });

    it('should suggest appropriate targets for lower-is-better metrics', () => {
      const suggestions = suggestGoals(measurements, 'FLY10_TIME');
      // For a time metric, suggested target should be lower than current
      const currentBest = 1.12;
      const targetSuggestion = suggestions.find(s => s.goalType === GoalType.TARGET_VALUE);
      expect(targetSuggestion?.targetValue).toBeLessThan(currentBest);
    });

    it('should suggest appropriate targets for higher-is-better metrics', () => {
      const suggestions = suggestGoals(measurements, 'VERTICAL_JUMP');
      // For a jump metric, suggested target should be higher than current
      const currentBest = 31;
      const targetSuggestion = suggestions.find(s => s.goalType === GoalType.TARGET_VALUE);
      expect(targetSuggestion?.targetValue).toBeGreaterThan(currentBest);
    });

    it('should include consistency goal suggestion', () => {
      const suggestions = suggestGoals(measurements, 'FLY10_TIME');
      const consistencySuggestion = suggestions.find(s => s.goalType === GoalType.CONSISTENCY);
      expect(consistencySuggestion).toBeDefined();
    });

    it('should return empty array for unknown metric', () => {
      const suggestions = suggestGoals(measurements, 'UNKNOWN_METRIC');
      expect(suggestions).toEqual([]);
    });
  });

  describe('isGoalAchieved', () => {
    it('should return true when target value achieved (lower is better)', () => {
      const goal: Goal = {
        id: 'goal-1',
        userId: 'user-1',
        metric: 'FLY10_TIME',
        goalType: GoalType.TARGET_VALUE,
        targetValue: 1.1,
        baselineValue: 1.2,
        currentValue: 1.05,
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };
      expect(isGoalAchieved(goal)).toBe(true);
    });

    it('should return true when target value achieved (higher is better)', () => {
      const goal: Goal = {
        id: 'goal-2',
        userId: 'user-1',
        metric: 'VERTICAL_JUMP',
        goalType: GoalType.TARGET_VALUE,
        targetValue: 35,
        baselineValue: 30,
        currentValue: 36,
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };
      expect(isGoalAchieved(goal)).toBe(true);
    });

    it('should return false when target not yet reached', () => {
      const goal: Goal = {
        id: 'goal-1',
        userId: 'user-1',
        metric: 'FLY10_TIME',
        goalType: GoalType.TARGET_VALUE,
        targetValue: 1.0,
        baselineValue: 1.2,
        currentValue: 1.1,
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };
      expect(isGoalAchieved(goal)).toBe(false);
    });

    it('should return true when consistency goal met', () => {
      const goal: Goal = {
        id: 'goal-4',
        userId: 'user-1',
        metric: 'FLY10_TIME',
        goalType: GoalType.CONSISTENCY,
        targetValue: 10,
        baselineValue: 0,
        currentValue: 12,
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };
      expect(isGoalAchieved(goal)).toBe(true);
    });
  });

  describe('getDaysRemaining', () => {
    it('should return positive days for future target date', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const days = getDaysRemaining(futureDate.toISOString().split('T')[0]);
      expect(days).toBeGreaterThanOrEqual(29);
      expect(days).toBeLessThanOrEqual(31);
    });

    it('should return 0 for today', () => {
      const today = new Date().toISOString().split('T')[0];
      expect(getDaysRemaining(today)).toBe(0);
    });

    it('should return negative days for past target date', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      const days = getDaysRemaining(pastDate.toISOString().split('T')[0]);
      expect(days).toBeLessThan(0);
    });
  });

  describe('getGoalProgressText', () => {
    it('should return encouraging text for good progress', () => {
      const goal: Goal = {
        id: 'goal-1',
        userId: 'user-1',
        metric: 'FLY10_TIME',
        goalType: GoalType.TARGET_VALUE,
        targetValue: 1.0,
        baselineValue: 1.2,
        currentValue: 1.05,
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };
      const text = getGoalProgressText(goal);
      expect(text).toContain('75%');
    });

    it('should return achievement text when goal is met', () => {
      const goal: Goal = {
        id: 'goal-1',
        userId: 'user-1',
        metric: 'FLY10_TIME',
        goalType: GoalType.TARGET_VALUE,
        targetValue: 1.1,
        baselineValue: 1.2,
        currentValue: 1.0,
        targetDate: '2024-06-01',
        status: GoalStatus.ACHIEVED,
        createdAt: '2024-01-01',
      };
      const text = getGoalProgressText(goal);
      expect(text.toLowerCase()).toContain('achieved');
    });

    it('should return appropriate text for no progress', () => {
      const goal: Goal = {
        id: 'goal-1',
        userId: 'user-1',
        metric: 'FLY10_TIME',
        goalType: GoalType.TARGET_VALUE,
        targetValue: 1.0,
        baselineValue: 1.2,
        currentValue: 1.2,
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };
      const text = getGoalProgressText(goal);
      expect(text).toContain('0%');
    });
  });
});
