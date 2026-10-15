import { describe, it, expect } from 'vitest';
import { isLowerBetterMetric } from '../metric-education-utils';
import { calculateGoalProgress, isGoalAchieved, GoalType, GoalStatus, type Goal } from '../goal-utils';

describe('COD deficit goals run lower-is-better', () => {
  it.each(['AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD'])(
    'isLowerBetterMetric(%s) is true',
    (code) => {
      expect(isLowerBetterMetric(code)).toBe(true);
    },
  );

  it('still returns false for an unknown metric', () => {
    expect(isLowerBetterMetric('NOT_A_METRIC')).toBe(false);
  });

  const goal = {
    id: 'g1',
    userId: 'u1',
    targetDate: '2030-01-01',
    createdAt: '2026-01-01',
    metric: 'AGILITY_COD_DEFICIT_M',
    goalType: GoalType.TARGET_VALUE,
    targetValue: 0.5,
    baselineValue: 0.7,
    currentValue: 0.62,
    status: GoalStatus.ACTIVE,
  } as Goal;

  it('progress 0.70 -> 0.62 towards 0.50 is positive (math is direction-symmetric; achievement check below is the discriminating case)', () => {
    expect(calculateGoalProgress(goal)).toBeGreaterThan(0);
  });

  it('goal is achieved when current <= target', () => {
    expect(isGoalAchieved({ ...goal, currentValue: 0.48 })).toBe(true);
    expect(isGoalAchieved(goal)).toBe(false);
  });
});
