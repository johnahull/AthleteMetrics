/**
 * TDD Tests for report-utils.ts
 *
 * RED Phase: These tests will FAIL until report-utils.ts is created
 * with the extracted helper functions from TeamReportView and AthleteReportView.
 */

import { describe, it, expect } from 'vitest';
import {
  getPerformanceColor,
  getQuartileBadge,
  formatDateRange,
  getTeamNames,
  getMetricsList,
  getCompositeIndexDescription,
  calculateBenchmarkAchievements,
  extractAthleteId,
  calculateDeviationStats,
  calculateTierDistributions,
} from '../report-utils';
import type { TimeframeConfig, AthleteRanking } from '@/types/report-types';

describe('report-utils', () => {
  // ============================================================================
  // getPerformanceColor
  // ============================================================================
  describe('getPerformanceColor', () => {
    it('should return green for top quartile (>=75th percentile)', () => {
      expect(getPerformanceColor(75)).toBe('text-green-600');
      expect(getPerformanceColor(90)).toBe('text-green-600');
      expect(getPerformanceColor(100)).toBe('text-green-600');
    });

    it('should return yellow for above average (50-74th percentile)', () => {
      expect(getPerformanceColor(50)).toBe('text-yellow-600');
      expect(getPerformanceColor(65)).toBe('text-yellow-600');
      expect(getPerformanceColor(74)).toBe('text-yellow-600');
    });

    it('should return orange for below average (25-49th percentile)', () => {
      expect(getPerformanceColor(25)).toBe('text-orange-600');
      expect(getPerformanceColor(35)).toBe('text-orange-600');
      expect(getPerformanceColor(49)).toBe('text-orange-600');
    });

    it('should return red for bottom quartile (<25th percentile)', () => {
      expect(getPerformanceColor(0)).toBe('text-red-600');
      expect(getPerformanceColor(10)).toBe('text-red-600');
      expect(getPerformanceColor(24)).toBe('text-red-600');
    });

    it('should return muted color for undefined percentile', () => {
      expect(getPerformanceColor(undefined)).toBe('text-muted-foreground');
    });

    it('should return muted color for null percentile', () => {
      expect(getPerformanceColor(null)).toBe('text-muted-foreground');
    });
  });

  // ============================================================================
  // getQuartileBadge
  // ============================================================================
  describe('getQuartileBadge', () => {
    it('should return "Top 25%" badge for >=75th percentile', () => {
      const badge = getQuartileBadge(75);
      expect(badge).toEqual({ label: 'Top 25%', variant: 'default' });

      const badge90 = getQuartileBadge(90);
      expect(badge90).toEqual({ label: 'Top 25%', variant: 'default' });
    });

    it('should return "Above Avg" badge for 50-74th percentile', () => {
      const badge = getQuartileBadge(50);
      expect(badge).toEqual({ label: 'Above Avg', variant: 'secondary' });

      const badge74 = getQuartileBadge(74);
      expect(badge74).toEqual({ label: 'Above Avg', variant: 'secondary' });
    });

    it('should return "Below Avg" badge for 25-49th percentile', () => {
      const badge = getQuartileBadge(25);
      expect(badge).toEqual({ label: 'Below Avg', variant: 'outline' });

      const badge49 = getQuartileBadge(49);
      expect(badge49).toEqual({ label: 'Below Avg', variant: 'outline' });
    });

    it('should return "Bottom 25%" badge for <25th percentile', () => {
      const badge = getQuartileBadge(0);
      expect(badge).toEqual({ label: 'Bottom 25%', variant: 'destructive' });

      const badge24 = getQuartileBadge(24);
      expect(badge24).toEqual({ label: 'Bottom 25%', variant: 'destructive' });
    });

    it('should return null for undefined percentile', () => {
      expect(getQuartileBadge(undefined)).toBeNull();
    });

    it('should return null for null percentile', () => {
      expect(getQuartileBadge(null)).toBeNull();
    });
  });

  // ============================================================================
  // formatDateRange
  // ============================================================================
  describe('formatDateRange', () => {
    it('should format preset timeframes correctly', () => {
      const seasonTimeframe: TimeframeConfig = { type: 'preset', preset: 'season' };
      expect(formatDateRange(seasonTimeframe)).toBe('Current Season');

      const yearTimeframe: TimeframeConfig = { type: 'preset', preset: 'year' };
      expect(formatDateRange(yearTimeframe)).toBe('Past Year');

      const allTimeTimeframe: TimeframeConfig = { type: 'preset', preset: 'all_time' };
      expect(formatDateRange(allTimeTimeframe)).toBe('All Time');
    });

    it('should format custom date ranges correctly', () => {
      // Use ISO format with time to avoid timezone issues
      const customTimeframe: TimeframeConfig = {
        type: 'custom',
        customStart: '2025-01-15T12:00:00',
        customEnd: '2025-06-15T12:00:00',
      };
      expect(formatDateRange(customTimeframe)).toBe('Jan 15, 2025 - Jun 15, 2025');
    });

    it('should handle missing preset by defaulting to All Time', () => {
      const noPresetTimeframe: TimeframeConfig = { type: 'preset' };
      expect(formatDateRange(noPresetTimeframe)).toBe('All Time');
    });

    it('should handle partial custom dates gracefully', () => {
      const partialTimeframe: TimeframeConfig = {
        type: 'custom',
        customStart: '2025-01-15T12:00:00',
        // No customEnd
      };
      expect(formatDateRange(partialTimeframe)).toBe('Jan 15, 2025 - ');
    });
  });

  // ============================================================================
  // getTeamNames
  // ============================================================================
  describe('getTeamNames', () => {
    const mockTeams = [
      { id: 'team-1', name: 'Varsity Football' },
      { id: 'team-2', name: 'JV Basketball' },
      { id: 'team-3', name: 'Track & Field' },
    ];

    it('should return "All Teams" when no teamIds filter is provided', () => {
      const config = { filters: {} };
      expect(getTeamNames(config, mockTeams, 'Teams')).toBe('All Teams');
    });

    it('should return "All Teams" when teamIds is empty', () => {
      const config = { filters: { teamIds: [] } };
      expect(getTeamNames(config, mockTeams, 'Teams')).toBe('All Teams');
    });

    it('should return matching team names joined by comma', () => {
      const config = { filters: { teamIds: ['team-1', 'team-2'] } };
      expect(getTeamNames(config, mockTeams, 'Teams')).toBe('Varsity Football, JV Basketball');
    });

    it('should return single team name when one teamId matches', () => {
      const config = { filters: { teamIds: ['team-3'] } };
      expect(getTeamNames(config, mockTeams, 'Teams')).toBe('Track & Field');
    });

    it('should return "Loading..." when teams array is empty/not loaded', () => {
      const config = { filters: { teamIds: ['team-1'] } };
      expect(getTeamNames(config, [], 'Teams')).toBe('Loading...');
      expect(getTeamNames(config, undefined, 'Teams')).toBe('Loading...');
    });

    it('should filter out non-matching team IDs gracefully', () => {
      const config = { filters: { teamIds: ['team-1', 'non-existent'] } };
      expect(getTeamNames(config, mockTeams, 'Teams')).toBe('Varsity Football');
    });

    it('should use custom labels for "All" text', () => {
      const config = { filters: {} };
      expect(getTeamNames(config, mockTeams, 'Groups')).toBe('All Groups');
    });
  });

  // ============================================================================
  // getMetricsList
  // ============================================================================
  describe('getMetricsList', () => {
    const mockMetricLabels = {
      FLY10_TIME: '10-Yard Fly',
      VERTICAL_JUMP: 'Vertical Jump',
      AGILITY_505: '5-0-5 Agility',
    };

    it('should return "No metrics" when teamStatistics is empty', () => {
      expect(getMetricsList([], undefined)).toBe('No metrics');
    });

    it('should return metric labels joined by comma', () => {
      const teamStatistics = [
        { metric: 'FLY10_TIME' },
        { metric: 'VERTICAL_JUMP' },
      ];
      expect(getMetricsList(teamStatistics, mockMetricLabels)).toBe('10-Yard Fly, Vertical Jump');
    });

    it('falls back to the underscore-split form when label not found', () => {
      const teamStatistics = [
        { metric: 'FLY10_TIME' },
        { metric: 'UNKNOWN_METRIC' },
      ];
      // Codes not in the supplied labels map go through the private
      // resolveFallbackLabel helper: underscore-split prose, not raw code.
      const result = getMetricsList(teamStatistics, mockMetricLabels);
      expect(result).toBe('10-Yard Fly, UNKNOWN METRIC');
    });

    it('falls back to the built-in name map when metricLabels is undefined', () => {
      const teamStatistics = [
        { metric: 'FLY10_TIME' },
        { metric: 'VERTICAL_JUMP' },
      ];
      // Both FLY10_TIME and VERTICAL_JUMP are in the private built-in map,
      // so they render with full labels even with no metricLabels supplied.
      const result = getMetricsList(teamStatistics, undefined);
      expect(result).toBe('10-Yard Fly Time, Vertical Jump');
    });

    it('underscore-splits genuinely unknown codes when metricLabels is undefined', () => {
      const teamStatistics = [{ metric: 'CUSTOM_DEADLIFT_1RM' }];
      const result = getMetricsList(teamStatistics, undefined);
      expect(result).toBe('CUSTOM DEADLIFT 1RM');
    });
  });

  // ============================================================================
  // getCompositeIndexDescription
  // ============================================================================
  describe('getCompositeIndexDescription', () => {
    const mockMetricLabels = {
      FLY10_TIME: '10-Yard Fly',
      VERTICAL_JUMP: 'Vertical Jump',
    };

    it('should return default description when no weights are provided', () => {
      expect(getCompositeIndexDescription(undefined, undefined)).toBe('Weighted average of percentiles');
      expect(getCompositeIndexDescription({}, undefined)).toBe('Weighted average of percentiles');
    });

    it('should format weights with metric names and percentages', () => {
      const weights = {
        FLY10_TIME: 0.4,
        VERTICAL_JUMP: 0.6,
      };
      const result = getCompositeIndexDescription(weights, mockMetricLabels);
      expect(result).toContain('10-Yard Fly (40%)');
      expect(result).toContain('Vertical Jump (60%)');
      expect(result).toContain('Weighted average of percentiles:');
    });

    it('should handle fractional weights correctly', () => {
      const weights = {
        FLY10_TIME: 0.333,
        VERTICAL_JUMP: 0.667,
      };
      const result = getCompositeIndexDescription(weights, mockMetricLabels);
      expect(result).toContain('33%');
      expect(result).toContain('67%');
    });

    it('underscore-splits unknown codes when not in the supplied labels map', () => {
      const weights = {
        FLY10_TIME: 0.5,
        UNKNOWN_METRIC: 0.5,
      };
      const result = getCompositeIndexDescription(weights, mockMetricLabels);
      expect(result).toContain('10-Yard Fly (50%)');
      expect(result).toContain('UNKNOWN METRIC (50%)');
    });

    it('falls back to the built-in name map when metricLabels is undefined', () => {
      const weights = {
        FLY10_TIME: 0.4,
        VERTICAL_JUMP: 0.6,
      };
      const result = getCompositeIndexDescription(weights, undefined);
      // Both codes are in the private built-in map; full labels are used.
      expect(result).toContain('10-Yard Fly Time (40%)');
      expect(result).toContain('Vertical Jump (60%)');
    });
  });

  // ============================================================================
  // calculateBenchmarkAchievements
  // ============================================================================
  describe('calculateBenchmarkAchievements', () => {
    it('should return empty array when athleteRankings is empty', () => {
      expect(calculateBenchmarkAchievements([])).toEqual([]);
      expect(calculateBenchmarkAchievements(undefined as any)).toEqual([]);
    });

    it('should count athletes meeting each benchmark correctly', () => {
      const athleteRankings: AthleteRanking[] = [
        {
          userId: 'athlete-1',
          userName: 'John Doe',
          measurements: { FLY10_TIME: 1.3 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'Good', benchmarkValue: 1.8, meetsOrExceeds: true },
              { benchmarkName: 'Elite', benchmarkValue: 1.4, meetsOrExceeds: true },
            ],
          },
        },
        {
          userId: 'athlete-2',
          userName: 'Jane Smith',
          measurements: { FLY10_TIME: 1.6 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'Good', benchmarkValue: 1.8, meetsOrExceeds: true },
              { benchmarkName: 'Elite', benchmarkValue: 1.4, meetsOrExceeds: false },
            ],
          },
        },
      ];

      const achievements = calculateBenchmarkAchievements(athleteRankings);

      // Find "Good" benchmark - both athletes meet it
      const goodBenchmark = achievements.find(a => a.tier === 'Good');
      expect(goodBenchmark).toBeDefined();
      expect(goodBenchmark?.count).toBe(2);
      expect(goodBenchmark?.percentage).toBe(100);

      // Find "Elite" benchmark - only 1 athlete meets it
      const eliteBenchmark = achievements.find(a => a.tier === 'Elite');
      expect(eliteBenchmark).toBeDefined();
      expect(eliteBenchmark?.count).toBe(1);
      expect(eliteBenchmark?.percentage).toBe(50);
    });

    it('should add "No benchmark met" for athletes who meet no benchmarks', () => {
      const athleteRankings: AthleteRanking[] = [
        {
          userId: 'athlete-1',
          userName: 'John Doe',
          measurements: { FLY10_TIME: 1.3 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'Elite', benchmarkValue: 1.4, meetsOrExceeds: true },
            ],
          },
        },
        {
          userId: 'athlete-2',
          userName: 'Jane Smith',
          measurements: { FLY10_TIME: 2.0 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'Elite', benchmarkValue: 1.4, meetsOrExceeds: false },
            ],
          },
        },
      ];

      const achievements = calculateBenchmarkAchievements(athleteRankings);

      const noBenchmark = achievements.find(a => a.tier === 'No benchmark met');
      expect(noBenchmark).toBeDefined();
      expect(noBenchmark?.count).toBe(1);
      expect(noBenchmark?.percentage).toBe(50);
    });

    it('should filter out benchmarks with zero count', () => {
      const athleteRankings: AthleteRanking[] = [
        {
          userId: 'athlete-1',
          userName: 'John Doe',
          measurements: { FLY10_TIME: 2.5 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'Elite', benchmarkValue: 1.4, meetsOrExceeds: false },
            ],
          },
        },
      ];

      const achievements = calculateBenchmarkAchievements(athleteRankings);

      // Should not include "Elite" since no one meets it
      const eliteBenchmark = achievements.find(a => a.tier === 'Elite');
      expect(eliteBenchmark).toBeUndefined();

      // Should include "No benchmark met"
      const noBenchmark = achievements.find(a => a.tier === 'No benchmark met');
      expect(noBenchmark).toBeDefined();
    });

    it('should sort achievements by count descending', () => {
      const athleteRankings: AthleteRanking[] = [
        {
          userId: 'athlete-1',
          userName: 'Athlete 1',
          measurements: { FLY10_TIME: 1.2 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'A', benchmarkValue: 1.5, meetsOrExceeds: true },
              { benchmarkName: 'B', benchmarkValue: 1.3, meetsOrExceeds: true },
              { benchmarkName: 'C', benchmarkValue: 1.2, meetsOrExceeds: true },
            ],
          },
        },
        {
          userId: 'athlete-2',
          userName: 'Athlete 2',
          measurements: { FLY10_TIME: 1.4 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'A', benchmarkValue: 1.5, meetsOrExceeds: true },
              { benchmarkName: 'B', benchmarkValue: 1.3, meetsOrExceeds: false },
            ],
          },
        },
      ];

      const achievements = calculateBenchmarkAchievements(athleteRankings);

      // Remove "No benchmark met" for this test
      const metAchievements = achievements.filter(a => a.tier !== 'No benchmark met');

      // "A" has 2 athletes, "B" has 1, "C" has 1
      expect(metAchievements[0].tier).toBe('A');
      expect(metAchievements[0].count).toBe(2);
    });

    it('should handle athletes with empty benchmarkComparisons', () => {
      const athleteRankings: AthleteRanking[] = [
        {
          userId: 'athlete-1',
          userName: 'John Doe',
          measurements: { FLY10_TIME: 1.5 },
          benchmarkComparisons: {},
        },
      ];

      const achievements = calculateBenchmarkAchievements(athleteRankings);
      expect(achievements).toEqual([]);
    });
  });

  // ============================================================================
  // extractAthleteId
  // ============================================================================
  describe('extractAthleteId', () => {
    it('should extract athleteId from config with singular athleteId', () => {
      const config = { athleteId: 'athlete-123' };
      expect(extractAthleteId(config)).toBe('athlete-123');
    });

    it('should extract first athleteId from config with athleteIds array', () => {
      const config = { athleteIds: ['athlete-1', 'athlete-2', 'athlete-3'] };
      expect(extractAthleteId(config)).toBe('athlete-1');
    });

    it('should prefer singular athleteId over athleteIds array', () => {
      const config = { athleteId: 'preferred', athleteIds: ['from-array'] };
      expect(extractAthleteId(config)).toBe('preferred');
    });

    it('should return undefined when neither is present', () => {
      const config = {};
      expect(extractAthleteId(config)).toBeUndefined();
    });

    it('should return undefined for empty athleteIds array', () => {
      const config = { athleteIds: [] };
      expect(extractAthleteId(config)).toBeUndefined();
    });
  });

  // ============================================================================
  // calculateDeviationStats
  // ============================================================================
  describe('calculateDeviationStats', () => {
    it('should calculate deviation from average', () => {
      const stats = calculateDeviationStats(10, 8, 2, false);
      expect(stats.deviation).toBe(2); // 10 - 8 = 2
    });

    it('should calculate percent difference from average', () => {
      const stats = calculateDeviationStats(12, 10, 2, false);
      expect(stats.percentDiff).toBe(20); // (12-10)/|10| * 100 = 20%
    });

    it('should calculate z-score when standard deviation is provided', () => {
      const stats = calculateDeviationStats(14, 10, 2, false);
      expect(stats.zScore).toBe(2); // (14-10)/2 = 2
    });

    it('should return null deviation when value is undefined', () => {
      const stats = calculateDeviationStats(undefined, 10, 2, false);
      expect(stats.deviation).toBeNull();
      expect(stats.percentDiff).toBeNull();
      expect(stats.zScore).toBeNull();
    });

    it('should return null deviation when average is null', () => {
      const stats = calculateDeviationStats(10, null, 2, false);
      expect(stats.deviation).toBeNull();
      expect(stats.percentDiff).toBeNull();
    });

    it('should return null percentDiff when average is zero', () => {
      const stats = calculateDeviationStats(5, 0, 1, false);
      expect(stats.deviation).toBe(5);
      expect(stats.percentDiff).toBeNull(); // Division by zero protection
    });

    it('should return null zScore when standardDeviation is null', () => {
      const stats = calculateDeviationStats(10, 8, null, false);
      expect(stats.deviation).toBe(2);
      expect(stats.zScore).toBeNull();
    });

    it('should return null zScore when standardDeviation is zero', () => {
      const stats = calculateDeviationStats(10, 8, 0, false);
      expect(stats.zScore).toBeNull();
    });

    it('should return green color for positive deviation when higher is better', () => {
      const stats = calculateDeviationStats(12, 10, 2, false); // higher is better
      expect(stats.deviationColor).toBe('text-green-600');
      expect(stats.zScoreColor).toBe('text-green-600');
    });

    it('should return red color for negative deviation when higher is better', () => {
      const stats = calculateDeviationStats(8, 10, 2, false); // higher is better
      expect(stats.deviationColor).toBe('text-red-600');
      expect(stats.zScoreColor).toBe('text-red-600');
    });

    it('should return green color for negative deviation when lower is better', () => {
      const stats = calculateDeviationStats(8, 10, 2, true); // lower is better
      expect(stats.deviationColor).toBe('text-green-600');
      expect(stats.zScoreColor).toBe('text-green-600');
    });

    it('should return red color for positive deviation when lower is better', () => {
      const stats = calculateDeviationStats(12, 10, 2, true); // lower is better
      expect(stats.deviationColor).toBe('text-red-600');
      expect(stats.zScoreColor).toBe('text-red-600');
    });

    it('should return empty color when deviation is null', () => {
      const stats = calculateDeviationStats(undefined, 10, 2, false);
      expect(stats.deviationColor).toBe('');
      expect(stats.zScoreColor).toBe('');
    });

    it('should handle negative average correctly for percent difference', () => {
      const stats = calculateDeviationStats(-8, -10, 2, false);
      expect(stats.deviation).toBe(2); // -8 - (-10) = 2
      expect(stats.percentDiff).toBe(20); // 2 / |-10| * 100 = 20%
    });
  });

  // ============================================================================
  // calculateTierDistributions
  // ============================================================================
  describe('calculateTierDistributions', () => {
    it('returns empty array for empty rankings', () => {
      expect(calculateTierDistributions([])).toEqual([]);
    });

    it('returns empty array when no tier comparisons exist', () => {
      const rankings = [
        {
          userId: '1', userName: 'Athlete', measurements: { FLY10: 1.5 },
          benchmarkComparisons: { FLY10: [{ benchmarkName: 'Target', benchmarkValue: 1.4, meetsOrExceeds: false }] },
        },
      ] as any;
      expect(calculateTierDistributions(rankings)).toEqual([]);
    });

    it('counts athletes per tier within a single tier group', () => {
      const rankings = [
        {
          userId: '1', userName: 'A', measurements: {},
          benchmarkComparisons: { FLY10: [{ tierName: 'Elite', tierColor: 'gold', tierOrder: 1, tierGroupName: 'Sprint Tiers' }] },
        },
        {
          userId: '2', userName: 'B', measurements: {},
          benchmarkComparisons: { FLY10: [{ tierName: 'Good', tierColor: 'silver', tierOrder: 2, tierGroupName: 'Sprint Tiers' }] },
        },
        {
          userId: '3', userName: 'C', measurements: {},
          benchmarkComparisons: { FLY10: [{ tierName: 'Elite', tierColor: 'gold', tierOrder: 1, tierGroupName: 'Sprint Tiers' }] },
        },
      ] as any;

      const result = calculateTierDistributions(rankings);
      expect(result).toHaveLength(1);
      expect(result[0].metricCode).toBe('FLY10');
      expect(result[0].tierGroupName).toBe('Sprint Tiers');
      expect(result[0].tiers).toHaveLength(2);
      // Sorted by tierOrder
      expect(result[0].tiers[0]).toEqual({ tierName: 'Elite', tierColor: 'gold', tierOrder: 1, count: 2 });
      expect(result[0].tiers[1]).toEqual({ tierName: 'Good', tierColor: 'silver', tierOrder: 2, count: 1 });
    });

    it('handles multiple metrics with separate tier groups', () => {
      const rankings = [
        {
          userId: '1', userName: 'A', measurements: {},
          benchmarkComparisons: {
            FLY10: [{ tierName: 'Elite', tierColor: 'gold', tierOrder: 1, tierGroupName: 'Sprint' }],
            VERT: [{ tierName: 'Good', tierColor: 'silver', tierOrder: 2, tierGroupName: 'Jump' }],
          },
        },
      ] as any;

      const result = calculateTierDistributions(rankings);
      expect(result).toHaveLength(2);
      expect(result.map(r => r.metricCode).sort()).toEqual(['FLY10', 'VERT']);
    });

    it('skips comparisons without tierName or tierGroupName', () => {
      const rankings = [
        {
          userId: '1', userName: 'A', measurements: {},
          benchmarkComparisons: {
            FLY10: [
              { tierName: 'Elite', tierGroupName: 'Sprint', tierColor: 'gold', tierOrder: 1 },
              { tierName: 'Good', tierGroupName: undefined, tierColor: 'silver', tierOrder: 2 }, // missing group
              { benchmarkName: 'Target', benchmarkValue: 1.4, meetsOrExceeds: true }, // single-value
            ],
          },
        },
      ] as any;

      const result = calculateTierDistributions(rankings);
      expect(result).toHaveLength(1);
      expect(result[0].tiers).toHaveLength(1); // Only the one with both tierName and tierGroupName
    });
  });
});
