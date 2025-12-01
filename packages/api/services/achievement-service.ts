/**
 * Achievement Service
 *
 * Handles achievement detection logic for:
 * - Performance badges (PRs, elite metrics)
 * - Consistency badges (streaks, milestones)
 * - Improvement badges (PR streaks, comebacks)
 * - Goal badges (first goal, achievement)
 */

import { storage } from '../storage';
import type { Measurement, AchievementDefinition, UserAchievement } from '@shared/schema';
import { startOfMonth, endOfMonth, subMonths, differenceInMonths } from 'date-fns';

const LOWER_IS_BETTER_METRICS = ['FLY10_TIME', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD'];

export class AchievementService {
  /**
   * Get all achievement definitions
   */
  async getAchievementDefinitions(filters?: { isActive?: boolean }): Promise<AchievementDefinition[]> {
    return await storage.getAchievementDefinitions(filters);
  }

  /**
   * Get user's unlocked achievements
   */
  async getUserAchievements(
    userId: string,
    organizationId: string
  ): Promise<(UserAchievement & { achievement: AchievementDefinition })[]> {
    return await storage.getUserAchievements(userId, organizationId);
  }

  /**
   * Award achievement to user (if not already unlocked)
   */
  async awardAchievement(
    userId: string,
    organizationId: string,
    achievementCode: string,
    metadata?: any
  ): Promise<UserAchievement | null> {
    const alreadyUnlocked = await storage.checkAchievementExists(userId, organizationId, achievementCode);
    if (alreadyUnlocked) {
      return null;
    }

    return await storage.awardAchievement(userId, organizationId, achievementCode, metadata);
  }

  /**
   * Check for PR-related badges
   */
  async checkPRBadges(
    userId: string,
    organizationId: string,
    measurement: Measurement,
    allMeasurements: Measurement[]
  ): Promise<Array<{ code: string; metadata?: any }>> {
    const achievements: Array<{ code: string; metadata?: any }> = [];
    const metric = measurement.metric;
    const value = parseFloat(measurement.value as string);

    // Get measurements for this specific metric
    const metricMeasurements = allMeasurements.filter(m => m.metric === metric);
    const isLowerBetter = LOWER_IS_BETTER_METRICS.includes(metric);

    // Sort to find best value
    const sortedMeasurements = [...metricMeasurements].sort((a, b) => {
      const aVal = parseFloat(a.value as string);
      const bVal = parseFloat(b.value as string);
      return isLowerBetter ? aVal - bVal : bVal - aVal;
    });

    const bestValue = parseFloat(sortedMeasurements[0].value as string);
    const isCurrentBest = Math.abs(value - bestValue) < 0.01;

    // FIRST_PR: First personal record in any metric
    if (metricMeasurements.length === 1 || (isCurrentBest && metricMeasurements.length === 2)) {
      achievements.push({
        code: 'FIRST_PR',
        metadata: { metric, value },
      });
    }

    // Metric-specific thresholds
    if (metric === 'FLY10_TIME' && value < 1.0) {
      achievements.push({
        code: 'SPEED_DEMON',
        metadata: { metric, value },
      });
    }

    if (metric === 'VERTICAL_JUMP' && value > 30) {
      achievements.push({
        code: 'SKY_HIGH',
        metadata: { metric, value },
      });
    }

    if (metric === 'DASH_40YD' && value < 5.0) {
      achievements.push({
        code: 'SUB_5_FORTY',
        metadata: { metric, value },
      });
    }

    return achievements;
  }

  /**
   * Check for consistency badges
   */
  async checkConsistencyBadges(
    userId: string,
    organizationId: string
  ): Promise<Array<{ code: string; metadata?: any }>> {
    const achievements: Array<{ code: string; metadata?: any }> = [];

    const allMeasurements = await storage.getMeasurements({ userId, includeUnverified: false });

    // FIRST_MEASUREMENT: First measurement ever
    if (allMeasurements.length === 1) {
      achievements.push({ code: 'FIRST_MEASUREMENT', metadata: {} });
    }

    // Monthly streak badges
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const thisMonthMeasurements = allMeasurements.filter(m => {
      const measurementDate = new Date(m.date);
      return measurementDate >= monthStart && measurementDate <= monthEnd;
    });

    if (thisMonthMeasurements.length >= 5) {
      achievements.push({
        code: 'STREAK_5',
        metadata: { count: thisMonthMeasurements.length },
      });
    }

    if (thisMonthMeasurements.length >= 10) {
      achievements.push({
        code: 'STREAK_10',
        metadata: { count: thisMonthMeasurements.length },
      });
    }

    // 3-month consecutive streak
    let consecutiveMonths = 0;
    for (let i = 0; i < 3; i++) {
      const checkDate = subMonths(now, i);
      const checkStart = startOfMonth(checkDate);
      const checkEnd = endOfMonth(checkDate);

      const monthMeasurements = allMeasurements.filter(m => {
        const measurementDate = new Date(m.date);
        return measurementDate >= checkStart && measurementDate <= checkEnd;
      });

      if (monthMeasurements.length > 0) {
        consecutiveMonths++;
      } else {
        break;
      }
    }

    if (consecutiveMonths >= 3) {
      achievements.push({
        code: 'STREAK_3_MONTHS',
        metadata: { months: consecutiveMonths },
      });
    }

    // CENTURY_CLUB: 100 total measurements
    if (allMeasurements.length >= 100) {
      achievements.push({
        code: 'CENTURY_CLUB',
        metadata: { count: allMeasurements.length },
      });
    }

    return achievements;
  }

  /**
   * Check for improvement badges
   */
  async checkImprovementBadges(
    userId: string,
    organizationId: string,
    metric: string
  ): Promise<Array<{ code: string; metadata?: any }>> {
    const achievements: Array<{ code: string; metadata?: any }> = [];

    const metricMeasurements = await storage.getMeasurements({
      userId,
      metric,
      includeUnverified: false,
    });

    if (metricMeasurements.length < 2) {
      return achievements;
    }

    // Sort by date
    const sorted = [...metricMeasurements].sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    const isLowerBetter = LOWER_IS_BETTER_METRICS.includes(metric);
    const latest = sorted[sorted.length - 1];
    const latestValue = parseFloat(latest.value as string);

    // RISING_STAR: 10% improvement over 3 months
    const threeMonthsAgo = subMonths(new Date(), 3);
    const oldMeasurements = sorted.filter(m => new Date(m.date) <= threeMonthsAgo);

    if (oldMeasurements.length > 0) {
      const oldestInWindow = oldMeasurements[oldMeasurements.length - 1];
      const oldValue = parseFloat(oldestInWindow.value as string);

      const improvement = Math.abs((latestValue - oldValue) / oldValue) * 100;
      const hasImproved = isLowerBetter ? latestValue < oldValue : latestValue > oldValue;

      if (hasImproved && improvement >= 10) {
        achievements.push({
          code: 'RISING_STAR',
          metadata: { metric, improvement: improvement.toFixed(1) },
        });
      }
    }

    // PR_STREAK_3: 3 consecutive PRs
    if (sorted.length >= 3) {
      let prStreak = 0;
      let currentBest = parseFloat(sorted[0].value as string);

      for (let i = 1; i < sorted.length; i++) {
        const currentValue = parseFloat(sorted[i].value as string);
        const isPR = isLowerBetter ? currentValue < currentBest : currentValue > currentBest;

        if (isPR) {
          prStreak++;
          currentBest = currentValue;

          if (prStreak >= 3) {
            achievements.push({
              code: 'PR_STREAK_3',
              metadata: { metric },
            });
            break;
          }
        } else {
          prStreak = 0;
        }
      }
    }

    // COMEBACK_KID: PR after 3 declining measurements
    if (sorted.length >= 5) {
      const lastFive = sorted.slice(-5);
      const values = lastFive.map(m => parseFloat(m.value as string));

      // Check if last 3 were declining, then newest is PR
      let declining = true;
      for (let i = 1; i < 4; i++) {
        const isWorse = isLowerBetter ? values[i] > values[i - 1] : values[i] < values[i - 1];
        if (!isWorse) {
          declining = false;
          break;
        }
      }

      if (declining) {
        const latestIsPR = isLowerBetter ? values[4] < values[3] : values[4] > values[3];
        if (latestIsPR) {
          achievements.push({
            code: 'COMEBACK_KID',
            metadata: { metric },
          });
        }
      }
    }

    return achievements;
  }

  /**
   * Check for goal badges
   */
  async checkGoalBadges(
    userId: string,
    organizationId: string
  ): Promise<Array<{ code: string; metadata?: any }>> {
    const achievements: Array<{ code: string; metadata?: any }> = [];

    const goals = await storage.getGoalsByUser(userId);

    // FIRST_GOAL: Set first goal
    if (goals.length === 1) {
      achievements.push({ code: 'FIRST_GOAL', metadata: {} });
    }

    // GOAL_ACHIEVED: Achieved a goal
    const achievedGoals = goals.filter(g => g.status === 'achieved');
    if (achievedGoals.length > 0) {
      const latestAchieved = achievedGoals[0]; // Already sorted by createdAt desc
      achievements.push({
        code: 'GOAL_ACHIEVED',
        metadata: { goalId: latestAchieved.id },
      });

      // GOAL_EARLY: Achieved before target date
      if (latestAchieved.achievedAt && latestAchieved.targetDate) {
        const achievedDate = new Date(latestAchieved.achievedAt);
        const targetDate = new Date(latestAchieved.targetDate);

        if (achievedDate < targetDate) {
          achievements.push({
            code: 'GOAL_EARLY',
            metadata: { goalId: latestAchieved.id },
          });
        }
      }
    }

    return achievements;
  }

  /**
   * Check ALL_AROUND_PR: PRs in all 8 metrics
   */
  async checkAllAroundPR(
    userId: string,
    organizationId: string
  ): Promise<Array<{ code: string; metadata?: any }>> {
    const achievements: Array<{ code: string; metadata?: any }> = [];

    const allMetrics = [
      'FLY10_TIME',
      'VERTICAL_JUMP',
      'AGILITY_505',
      'AGILITY_5105',
      'T_TEST',
      'DASH_40YD',
      'TOP_SPEED',
      'RSI',
    ];

    const allMeasurements = await storage.getMeasurements({ userId, includeUnverified: false });
    const metricsWithData = new Set(allMeasurements.map(m => m.metric));

    const hasAllMetrics = allMetrics.every(metric => metricsWithData.has(metric));

    if (hasAllMetrics) {
      achievements.push({
        code: 'ALL_AROUND_PR',
        metadata: { metrics: allMetrics },
      });
    }

    return achievements;
  }

  /**
   * Orchestrator: Check all achievement conditions after a measurement
   */
  async checkAchievements(
    userId: string,
    organizationId: string,
    measurement: Measurement
  ): Promise<Array<{ code: string; metadata?: any }>> {
    const newAchievements: Array<{ code: string; metadata?: any }> = [];

    try {
      // Get all measurements for context
      const allMeasurements = await storage.getMeasurements({ userId, includeUnverified: false });

      // Check PR badges
      const prBadges = await this.checkPRBadges(userId, organizationId, measurement, allMeasurements);
      newAchievements.push(...prBadges);

      // Check consistency badges
      const consistencyBadges = await this.checkConsistencyBadges(userId, organizationId);
      newAchievements.push(...consistencyBadges);

      // Check improvement badges for this metric
      const improvementBadges = await this.checkImprovementBadges(userId, organizationId, measurement.metric);
      newAchievements.push(...improvementBadges);

      // Check all-around PR
      const allAroundBadges = await this.checkAllAroundPR(userId, organizationId);
      newAchievements.push(...allAroundBadges);

      // Award each achievement (if not already unlocked)
      const awarded: Array<{ code: string; metadata?: any }> = [];
      for (const achievement of newAchievements) {
        const result = await this.awardAchievement(
          userId,
          organizationId,
          achievement.code,
          achievement.metadata
        );
        if (result) {
          awarded.push(achievement);
        }
      }

      return awarded;
    } catch (error) {
      console.error('Error checking achievements:', error);
      return [];
    }
  }
}
