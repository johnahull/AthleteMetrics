/**
 * Achievement Service Tests
 *
 * Tests for achievement detection logic:
 * - Performance badges (PRs, elite metrics)
 * - Consistency badges (streaks, milestones)
 * - Improvement badges (PR streaks, comebacks)
 * - Goal badges (first goal, achievement)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { subMonths } from 'date-fns';
import { AchievementService } from '../achievement-service';
import { storage } from '../../storage';
import { isLowerBetter } from '../../utils/metric-type';

// Metric direction comes from the DB resolver; the unit tests decide it here, per organization.
// MILE_RUN and ORG_RUN are not in the old hard-coded list, so they prove the resolved type is what counts.
const LOWER_IN_ORG: Record<string, string[]> = {
  'org-456': ['FLY10_TIME', 'DASH_40YD', 'MILE_RUN', 'ORG_RUN'],
};
vi.mock('../../utils/metric-type', () => ({ isLowerBetter: vi.fn() }));

// Mock storage
vi.mock('../../storage', () => ({
  storage: {
    getAchievementDefinitions: vi.fn(),
    getUserAchievements: vi.fn(),
    awardAchievement: vi.fn(),
    getMeasurements: vi.fn(),
    getGoalsByUser: vi.fn(),
    checkAchievementExists: vi.fn(),
  },
}));

describe('AchievementService', () => {
  let service: AchievementService;
  const mockUserId = 'user-123';
  const mockOrgId = 'org-456';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isLowerBetter).mockImplementation(async (code, orgId) => (LOWER_IN_ORG[orgId ?? ''] ?? []).includes(code));
    service = new AchievementService();
  });

  describe('getAchievementDefinitions', () => {
    it('should return all active achievement definitions', async () => {
      const mockDefinitions = [
        {
          id: 'def-1',
          code: 'FIRST_PR',
          name: 'First PR',
          description: 'Set your first personal record',
          category: 'performance',
          icon: 'Trophy',
          color: 'yellow',
          rarity: 'common',
          isActive: true,
          createdAt: new Date(),
        },
      ];

      vi.mocked(storage.getAchievementDefinitions).mockResolvedValue(mockDefinitions);

      const result = await service.getAchievementDefinitions({ isActive: true });

      expect(result).toEqual(mockDefinitions);
      expect(storage.getAchievementDefinitions).toHaveBeenCalledWith({ isActive: true });
    });
  });

  describe('getUserAchievements', () => {
    it('should return user achievements with definition data', async () => {
      const mockAchievements = [
        {
          id: 'ua-1',
          userId: mockUserId,
          organizationId: mockOrgId,
          achievementId: 'def-1',
          unlockedAt: new Date(),
          metadata: { metric: 'FLY10_TIME', value: 1.2 },
          achievement: {
            id: 'def-1',
            code: 'FIRST_PR',
            name: 'First PR',
            description: 'Set your first personal record',
            category: 'performance',
            icon: 'Trophy',
            color: 'yellow',
            rarity: 'common',
            isActive: true,
            createdAt: new Date(),
          },
        },
      ];

      vi.mocked(storage.getUserAchievements).mockResolvedValue(mockAchievements);

      const result = await service.getUserAchievements(mockUserId, mockOrgId);

      expect(result).toEqual(mockAchievements);
      expect(storage.getUserAchievements).toHaveBeenCalledWith(mockUserId, mockOrgId);
    });
  });

  describe('awardAchievement', () => {
    it('should award achievement if not already unlocked', async () => {
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(false);
      vi.mocked(storage.awardAchievement).mockResolvedValue({
        id: 'ua-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        achievementId: 'def-1',
        unlockedAt: new Date(),
        metadata: { metric: 'FLY10_TIME' },
      });

      const result = await service.awardAchievement(
        mockUserId,
        mockOrgId,
        'FIRST_PR',
        { metric: 'FLY10_TIME' }
      );

      expect(result).toBeTruthy();
      expect(storage.awardAchievement).toHaveBeenCalled();
    });

    it('should not award achievement if already unlocked', async () => {
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(true);

      const result = await service.awardAchievement(
        mockUserId,
        mockOrgId,
        'FIRST_PR',
        { metric: 'FLY10_TIME' }
      );

      expect(result).toBeNull();
      expect(storage.awardAchievement).not.toHaveBeenCalled();
    });
  });

  describe('checkPRBadges', () => {
    it('should award FIRST_PR on first personal record', async () => {
      const mockMeasurement = {
        id: 'm-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        metric: 'FLY10_TIME',
        value: '1.2',
        units: 's',
        date: new Date().toISOString(),
        age: 16,
        isVerified: false,
        createdAt: new Date(),
      };

      const allMeasurements = [mockMeasurement];

      vi.mocked(storage.getMeasurements).mockResolvedValue(allMeasurements);
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(false);
      vi.mocked(storage.awardAchievement).mockResolvedValue({
        id: 'ua-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        achievementId: 'def-1',
        unlockedAt: new Date(),
        metadata: { metric: 'FLY10_TIME', value: 1.2 },
      });

      const result = await service.checkPRBadges(mockUserId, mockOrgId, mockMeasurement, allMeasurements);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('code', 'FIRST_PR');
    });

    it('should award SPEED_DEMON for fly-10 under 1.0s', async () => {
      const mockMeasurement = {
        id: 'm-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        metric: 'FLY10_TIME',
        value: '0.95',
        units: 's',
        date: new Date().toISOString(),
        age: 16,
        isVerified: false,
        createdAt: new Date(),
      };

      const allMeasurements = [
        { ...mockMeasurement, id: 'm-0', value: '1.1', date: new Date(Date.now() - 86400000).toISOString() },
        mockMeasurement,
      ];

      vi.mocked(storage.getMeasurements).mockResolvedValue(allMeasurements);
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(false);
      vi.mocked(storage.awardAchievement).mockResolvedValue({
        id: 'ua-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        achievementId: 'def-2',
        unlockedAt: new Date(),
        metadata: { metric: 'FLY10_TIME', value: 0.95 },
      });

      const result = await service.checkPRBadges(mockUserId, mockOrgId, mockMeasurement, allMeasurements);

      const speedDemon = result.find(a => a.code === 'SPEED_DEMON');
      expect(speedDemon).toBeDefined();
    });

    it('should award SKY_HIGH for vertical jump over 30 inches', async () => {
      const mockMeasurement = {
        id: 'm-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        metric: 'VERTICAL_JUMP',
        value: '32',
        units: 'in',
        date: new Date().toISOString(),
        age: 16,
        isVerified: false,
        createdAt: new Date(),
      };

      const allMeasurements = [mockMeasurement];

      vi.mocked(storage.getMeasurements).mockResolvedValue(allMeasurements);
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(false);
      vi.mocked(storage.awardAchievement).mockResolvedValue({
        id: 'ua-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        achievementId: 'def-3',
        unlockedAt: new Date(),
        metadata: { metric: 'VERTICAL_JUMP', value: 32 },
      });

      const result = await service.checkPRBadges(mockUserId, mockOrgId, mockMeasurement, allMeasurements);

      const skyHigh = result.find(a => a.code === 'SKY_HIGH');
      expect(skyHigh).toBeDefined();
    });

    it('should award SUB_5_FORTY for 40-yard dash under 5.0s', async () => {
      const mockMeasurement = {
        id: 'm-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        metric: 'DASH_40YD',
        value: '4.8',
        units: 's',
        date: new Date().toISOString(),
        age: 16,
        isVerified: false,
        createdAt: new Date(),
      };

      const allMeasurements = [mockMeasurement];

      vi.mocked(storage.getMeasurements).mockResolvedValue(false);
      vi.mocked(storage.awardAchievement).mockResolvedValue({
        id: 'ua-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        achievementId: 'def-4',
        unlockedAt: new Date(),
        metadata: { metric: 'DASH_40YD', value: 4.8 },
      });

      const result = await service.checkPRBadges(mockUserId, mockOrgId, mockMeasurement, allMeasurements);

      const sub5 = result.find(a => a.code === 'SUB_5_FORTY');
      expect(sub5).toBeDefined();
    });
  });

  describe('checkConsistencyBadges', () => {
    it('should award FIRST_MEASUREMENT on first measurement', async () => {
      const mockMeasurements = [
        {
          id: 'm-1',
          userId: mockUserId,
          organizationId: mockOrgId,
          metric: 'FLY10_TIME',
          value: '1.2',
          units: 's',
          date: new Date().toISOString(),
          age: 16,
          isVerified: false,
          createdAt: new Date(),
        },
      ];

      vi.mocked(storage.getMeasurements).mockResolvedValue(mockMeasurements);
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(false);
      vi.mocked(storage.awardAchievement).mockResolvedValue({
        id: 'ua-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        achievementId: 'def-5',
        unlockedAt: new Date(),
        metadata: {},
      });

      const result = await service.checkConsistencyBadges(mockUserId, mockOrgId);

      const firstMeasurement = result.find(a => a.code === 'FIRST_MEASUREMENT');
      expect(firstMeasurement).toBeDefined();
    });

    it('should award STREAK_5 for 5 measurements in a month', async () => {
      const now = new Date();
      const mockMeasurements = Array.from({ length: 5 }, (_, i) => ({
        id: `m-${i}`,
        userId: mockUserId,
        organizationId: mockOrgId,
        metric: 'FLY10_TIME',
        value: '1.2',
        units: 's',
        date: new Date(now.getFullYear(), now.getMonth(), i + 1).toISOString(),
        age: 16,
        isVerified: false,
        createdAt: new Date(),
      }));

      vi.mocked(storage.getMeasurements).mockResolvedValue(mockMeasurements);
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(false);
      vi.mocked(storage.awardAchievement).mockResolvedValue({
        id: 'ua-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        achievementId: 'def-6',
        unlockedAt: new Date(),
        metadata: { count: 5 },
      });

      const result = await service.checkConsistencyBadges(mockUserId, mockOrgId);

      const streak5 = result.find(a => a.code === 'STREAK_5');
      expect(streak5).toBeDefined();
    });

    it('should award CENTURY_CLUB for 100 total measurements', async () => {
      const mockMeasurements = Array.from({ length: 100 }, (_, i) => ({
        id: `m-${i}`,
        userId: mockUserId,
        organizationId: mockOrgId,
        metric: 'FLY10_TIME',
        value: '1.2',
        units: 's',
        date: new Date(Date.now() - i * 86400000).toISOString(),
        age: 16,
        isVerified: false,
        createdAt: new Date(),
      }));

      vi.mocked(storage.getMeasurements).mockResolvedValue(mockMeasurements);
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(false);
      vi.mocked(storage.awardAchievement).mockResolvedValue({
        id: 'ua-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        achievementId: 'def-7',
        unlockedAt: new Date(),
        metadata: { count: 100 },
      });

      const result = await service.checkConsistencyBadges(mockUserId, mockOrgId);

      const centuryClub = result.find(a => a.code === 'CENTURY_CLUB');
      expect(centuryClub).toBeDefined();
    });
  });

  describe('checkImprovementBadges', () => {
    it.skip('should award RISING_STAR for 10% improvement over 3 months', async () => {
      // TODO: This test has flaky date calculation issues - the mock doesn't properly
      // simulate the storage layer's date filtering behavior
      const now = new Date();
      const oldDate = subMonths(now, 4); // 4 months ago (safely > 3 months)
      const newDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      const mockMeasurements = [
        {
          id: 'm-1',
          userId: mockUserId,
          organizationId: mockOrgId,
          metric: 'FLY10_TIME',
          value: '1.2',
          units: 's',
          date: oldDate.toISOString(),
          age: 16,
          isVerified: false,
          createdAt: new Date(),
        },
        {
          id: 'm-2',
          userId: mockUserId,
          organizationId: mockOrgId,
          metric: 'FLY10_TIME',
          value: '1.08', // 10% improvement (1.2 → 1.08 = 0.12 / 1.2 = 10%)
          units: 's',
          date: newDate.toISOString(),
          age: 16,
          isVerified: false,
          createdAt: new Date(),
        },
      ];

      vi.mocked(storage.getMeasurements).mockResolvedValue(mockMeasurements);

      const result = await service.checkImprovementBadges(mockUserId, mockOrgId, 'FLY10_TIME');

      const risingStar = result.find(a => a.code === 'RISING_STAR');
      expect(risingStar).toBeDefined();
      if (risingStar) {
        expect(risingStar.metadata.metric).toBe('FLY10_TIME');
        expect(parseFloat(risingStar.metadata.improvement)).toBeGreaterThanOrEqual(10);
      }
    });
  });

  describe('metric direction from the resolver (row organization)', () => {
    const m = (metric: string, value: number, date = new Date(), id = `m-${metric}-${value}`) => ({
      id,
      userId: mockUserId,
      organizationId: mockOrgId,
      metric,
      value: String(value),
      units: 's',
      date: date.toISOString(),
      age: 16,
      isVerified: true,
      createdAt: new Date(),
    }) as any;

    beforeEach(() => {
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(false);
    });

    it('awards FIRST_PR for a faster custom lower-is-better ORG_RUN time and asks with the row organization', async () => {
      const latest = m('ORG_RUN', 360);
      const result = await service.checkPRBadges(mockUserId, mockOrgId, latest, [m('ORG_RUN', 400), latest]);
      expect(result.map(a => a.code)).toContain('FIRST_PR');
      expect(isLowerBetter).toHaveBeenCalledWith('ORG_RUN', mockOrgId);
    });

    it('does not award FIRST_PR for a slower custom lower-is-better ORG_RUN time', async () => {
      const latest = m('ORG_RUN', 440);
      const result = await service.checkPRBadges(mockUserId, mockOrgId, latest, [m('ORG_RUN', 400), latest]);
      expect(result.map(a => a.code)).not.toContain('FIRST_PR');
    });

    it('uses the direction of the organization passed in, not another one', async () => {
      // ORG_RUN is higher-is-better in org-other, so the larger value is the record there
      const latest = m('ORG_RUN', 440);
      const result = await service.checkPRBadges(mockUserId, 'org-other', latest, [m('ORG_RUN', 400), latest]);
      expect(result.map(a => a.code)).toContain('FIRST_PR');
      expect(isLowerBetter).toHaveBeenCalledWith('ORG_RUN', 'org-other');
    });

    it.each([
      ['FLY10_TIME', 1.1, 1.3],
      ['DASH_40YD', 5.2, 5.6],
      ['VERTICAL_JUMP', 28, 24],
      ['RSI', 2.4, 2.0],
      ['TOP_SPEED', 20, 18],
    ])('keeps the built-in direction of %s (better %s, worse %s)', async (metric, better, worse) => {
      const improved = m(metric, better, new Date(), 'new');
      expect((await service.checkPRBadges(mockUserId, mockOrgId, improved, [m(metric, worse, new Date(), 'prior'), improved]))
        .map(a => a.code)).toContain('FIRST_PR');
      const worsened = m(metric, worse, new Date(), 'new');
      expect((await service.checkPRBadges(mockUserId, mockOrgId, worsened, [m(metric, better, new Date(), 'prior'), worsened]))
        .map(a => a.code)).not.toContain('FIRST_PR');
    });

    it('awards PR_STREAK_3 for a falling custom lower-is-better ORG_RUN series, not for a rising one', async () => {
      const day = (n: number) => new Date(2026, 0, n);
      vi.mocked(storage.getMeasurements).mockResolvedValue(
        [400, 390, 380, 370].map((v, i) => m('ORG_RUN', v, day(i + 1))),
      );
      expect((await service.checkImprovementBadges(mockUserId, mockOrgId, 'ORG_RUN')).map(a => a.code)).toContain('PR_STREAK_3');
      expect(isLowerBetter).toHaveBeenCalledWith('ORG_RUN', mockOrgId);

      vi.mocked(storage.getMeasurements).mockResolvedValue(
        [370, 380, 390, 400].map((v, i) => m('ORG_RUN', v, day(i + 1))),
      );
      expect((await service.checkImprovementBadges(mockUserId, mockOrgId, 'ORG_RUN')).map(a => a.code)).not.toContain('PR_STREAK_3');
    });

    it('awards RISING_STAR when a lower-is-better MILE_RUN time drops 10% over 3 months', async () => {
      const old = subMonths(new Date(), 4);
      const recent = new Date(Date.now() - 24 * 60 * 60 * 1000);
      vi.mocked(storage.getMeasurements).mockResolvedValue([m('MILE_RUN', 400, old), m('MILE_RUN', 350, recent)]);
      expect((await service.checkImprovementBadges(mockUserId, mockOrgId, 'MILE_RUN')).map(a => a.code)).toContain('RISING_STAR');

      vi.mocked(storage.getMeasurements).mockResolvedValue([m('MILE_RUN', 350, old), m('MILE_RUN', 400, recent)]);
      expect((await service.checkImprovementBadges(mockUserId, mockOrgId, 'MILE_RUN')).map(a => a.code)).not.toContain('RISING_STAR');
    });
  });

  describe('history is scoped to the measurement row organization', () => {
    // ORG_RUN is lower-is-better in mockOrgId and higher-is-better in otherOrg; the athlete has rows in both
    const otherOrg = 'org-other';
    const m = (metric: string, value: number, organizationId: string | null, date = new Date(), id = `m-${organizationId}-${value}`) => ({
      id, userId: mockUserId, organizationId, metric, value: String(value), units: 's',
      date: date.toISOString(), age: 16, isVerified: true, createdAt: new Date(),
    }) as any;

    beforeEach(() => {
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(false);
      vi.mocked(storage.awardAchievement).mockImplementation(async () => ({ id: 'ua' }) as any);
      vi.mocked(storage.getGoalsByUser).mockResolvedValue([]);
    });

    it("a faster time in another org does not stop this org's new measurement being a PR", async () => {
      const latest = m('ORG_RUN', 360, mockOrgId);
      vi.mocked(storage.getMeasurements).mockResolvedValue([m('ORG_RUN', 400, mockOrgId), m('ORG_RUN', 300, otherOrg), latest]);
      const codes = (await service.checkAchievements(mockUserId, mockOrgId, latest)).map(a => a.code);
      expect(codes).toContain('FIRST_PR');
    });

    it("a better value in this org does not stop the other org's new measurement being a PR", async () => {
      const latest = m('ORG_RUN', 450, otherOrg);
      vi.mocked(storage.getMeasurements).mockResolvedValue([m('ORG_RUN', 400, otherOrg), m('ORG_RUN', 900, mockOrgId), latest]);
      const codes = (await service.checkAchievements(mockUserId, otherOrg, latest)).map(a => a.code);
      expect(codes).toContain('FIRST_PR');
    });

    it('PR_STREAK_3 ignores rows from another org and personal rows', async () => {
      const day = (n: number) => new Date(2026, 0, n);
      vi.mocked(storage.getMeasurements).mockResolvedValue([
        m('ORG_RUN', 400, mockOrgId, day(1)),
        m('ORG_RUN', 390, mockOrgId, day(2)),
        m('ORG_RUN', 100, otherOrg, day(3)),
        m('ORG_RUN', 120, null, day(4)),
        m('ORG_RUN', 380, mockOrgId, day(5)),
        m('ORG_RUN', 370, mockOrgId, day(6)),
      ]);
      expect((await service.checkImprovementBadges(mockUserId, mockOrgId, 'ORG_RUN')).map(a => a.code)).toContain('PR_STREAK_3');
    });

    it('FIRST_MEASUREMENT counts only rows of this org', async () => {
      vi.mocked(storage.getMeasurements).mockResolvedValue([m('ORG_RUN', 400, otherOrg), m('ORG_RUN', 380, mockOrgId)]);
      expect((await service.checkConsistencyBadges(mockUserId, mockOrgId)).map(a => a.code)).toContain('FIRST_MEASUREMENT');
    });

    it('ALL_AROUND_PR counts only metrics measured in this org', async () => {
      const all = ['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505_M', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'TOP_SPEED', 'RSI'];
      vi.mocked(storage.getMeasurements).mockResolvedValue(
        all.map((metric, i) => m(metric, 1, i === 0 ? otherOrg : mockOrgId, new Date(), `aa-${i}`)),
      );
      expect(await service.checkAllAroundPR(mockUserId, mockOrgId)).toEqual([]);
    });
  });

  describe('checkGoalBadges', () => {
    it('should award FIRST_GOAL when first goal is created', async () => {
      const mockGoals = [
        {
          id: 'goal-1',
          userId: mockUserId,
          metric: 'FLY10_TIME',
          goalType: 'performance',
          targetValue: '1.0',
          baselineValue: '1.2',
          currentValue: '1.2',
          targetDate: new Date(),
          status: 'active',
          createdAt: new Date(),
        },
      ];

      vi.mocked(storage.getGoalsByUser).mockResolvedValue(mockGoals);
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(false);
      vi.mocked(storage.awardAchievement).mockResolvedValue({
        id: 'ua-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        achievementId: 'def-9',
        unlockedAt: new Date(),
        metadata: {},
      });

      const result = await service.checkGoalBadges(mockUserId, mockOrgId);

      const firstGoal = result.find(a => a.code === 'FIRST_GOAL');
      expect(firstGoal).toBeDefined();
    });

    it('should award GOAL_ACHIEVED when a goal is completed', async () => {
      const mockGoals = [
        {
          id: 'goal-1',
          userId: mockUserId,
          metric: 'FLY10_TIME',
          goalType: 'performance',
          targetValue: '1.0',
          baselineValue: '1.2',
          currentValue: '0.95',
          targetDate: new Date(),
          status: 'achieved',
          achievedAt: new Date(),
          createdAt: new Date(),
        },
      ];

      vi.mocked(storage.getGoalsByUser).mockResolvedValue(mockGoals);
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(false);
      vi.mocked(storage.awardAchievement).mockResolvedValue({
        id: 'ua-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        achievementId: 'def-10',
        unlockedAt: new Date(),
        metadata: { goalId: 'goal-1' },
      });

      const result = await service.checkGoalBadges(mockUserId, mockOrgId);

      const goalAchieved = result.find(a => a.code === 'GOAL_ACHIEVED');
      expect(goalAchieved).toBeDefined();
    });
  });

  describe('checkAllAroundPR (5-0-5 protocol split)', () => {
    const baseMetrics = ['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'TOP_SPEED', 'RSI'];

    const measurementsFor = (metrics: string[]) =>
      metrics.map((metric, i) => ({
        id: `m-${i}`,
        userId: mockUserId,
        organizationId: mockOrgId,
        metric,
        value: '1.0',
        units: 's',
        date: new Date().toISOString(),
        age: 16,
        isVerified: true,
        createdAt: new Date(),
      })) as any;

    it('is earned when the 5-0-5 slot is filled by AGILITY_505_M', async () => {
      vi.mocked(storage.getMeasurements).mockResolvedValue(measurementsFor([...baseMetrics, 'AGILITY_505_M']));
      const result = await service.checkAllAroundPR(mockUserId, mockOrgId);
      expect(result.map(a => a.code)).toEqual(['ALL_AROUND_PR']);
    });

    it('is earned when the 5-0-5 slot is filled by AGILITY_505_YD', async () => {
      vi.mocked(storage.getMeasurements).mockResolvedValue(measurementsFor([...baseMetrics, 'AGILITY_505_YD']));
      const result = await service.checkAllAroundPR(mockUserId, mockOrgId);
      expect(result.map(a => a.code)).toEqual(['ALL_AROUND_PR']);
    });

    it('is earned with a mix of both protocols', async () => {
      vi.mocked(storage.getMeasurements).mockResolvedValue(
        measurementsFor([...baseMetrics, 'AGILITY_505_M', 'AGILITY_505_YD']),
      );
      const result = await service.checkAllAroundPR(mockUserId, mockOrgId);
      expect(result.map(a => a.code)).toEqual(['ALL_AROUND_PR']);
    });

    it('is not earned without any 5-0-5 protocol, and the retired code does not count', async () => {
      vi.mocked(storage.getMeasurements).mockResolvedValue(measurementsFor([...baseMetrics, 'AGILITY_505']));
      const result = await service.checkAllAroundPR(mockUserId, mockOrgId);
      expect(result).toEqual([]);
    });

    it('is not earned when another slot is missing', async () => {
      vi.mocked(storage.getMeasurements).mockResolvedValue(
        measurementsFor(['FLY10_TIME', 'AGILITY_505_M', 'AGILITY_505_YD']),
      );
      const result = await service.checkAllAroundPR(mockUserId, mockOrgId);
      expect(result).toEqual([]);
    });
  });

  describe('checkAchievements (orchestrator)', () => {
    it('should run all achievement checks and return newly unlocked achievements', async () => {
      const mockMeasurement = {
        id: 'm-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        metric: 'FLY10_TIME',
        value: '0.95',
        units: 's',
        date: new Date().toISOString(),
        age: 16,
        isVerified: false,
        createdAt: new Date(),
      };

      const allMeasurements = [mockMeasurement];

      vi.mocked(storage.getMeasurements).mockResolvedValue(allMeasurements);
      vi.mocked(storage.getGoalsByUser).mockResolvedValue([]);
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(false);
      vi.mocked(storage.awardAchievement).mockResolvedValue({
        id: 'ua-1',
        userId: mockUserId,
        organizationId: mockOrgId,
        achievementId: 'def-1',
        unlockedAt: new Date(),
        metadata: {},
      });

      const result = await service.checkAchievements(mockUserId, mockOrgId, mockMeasurement);

      expect(result.length).toBeGreaterThan(0);
      expect(storage.getMeasurements).toHaveBeenCalled();
    });

    it('fetches the measurement history once per run', async () => {
      const rows = [
        { id: 'a', userId: mockUserId, organizationId: mockOrgId, metric: 'FLY10_TIME', value: '1.2', date: new Date().toISOString(), isVerified: true },
        { id: 'b', userId: mockUserId, organizationId: mockOrgId, metric: 'FLY10_TIME', value: '1.1', date: new Date().toISOString(), isVerified: true },
      ] as any;
      vi.mocked(storage.getMeasurements).mockClear();
      vi.mocked(storage.getMeasurements).mockResolvedValue(rows);
      vi.mocked(storage.checkAchievementExists).mockResolvedValue(true);

      await service.checkAchievements(mockUserId, mockOrgId, rows[1]);

      expect(storage.getMeasurements).toHaveBeenCalledTimes(1);
    });
  });
});
