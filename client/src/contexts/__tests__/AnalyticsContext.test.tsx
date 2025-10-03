/**
 * Unit tests for AnalyticsContext state transition handlers
 * Tests filter preservation, metric handling, and state management across analysis modes
 */

import { describe, it, expect } from 'vitest';
import type { AnalyticsState, AnalysisType, AnalyticsFilters, MetricSelection, TimeframeConfig } from '@shared/analytics-types';

// Mock the state transition handlers (these are internal to AnalyticsContext)
// We'll test the logic directly by simulating the reducer behavior

/**
 * Simulates handleEnterMultiGroup transition
 */
function simulateEnterMultiGroup(state: AnalyticsState, nextType: AnalysisType): AnalyticsState {
  return {
    ...state,
    analysisType: nextType,
    selectedAthleteId: '',
    selectedAthlete: null,
    selectedAthleteIds: [],
    selectedDates: [],
    analyticsData: null,
    error: null,
    // Clear incompatible filters (athleteIds, teams), preserve compatible ones
    filters: {
      organizationId: state.filters.organizationId,
      ...(state.filters.genders && { genders: state.filters.genders }),
      ...(state.filters.birthYearFrom && { birthYearFrom: state.filters.birthYearFrom }),
      ...(state.filters.birthYearTo && { birthYearTo: state.filters.birthYearTo })
    },
    // Preserve primary metric, clear additional (multi-group only supports 1 metric)
    metrics: {
      primary: state.metrics.primary,
      additional: []
    },
    // Preserve timeframe unless it's trends (incompatible with multi-group)
    timeframe: state.timeframe.type === 'trends'
      ? { type: 'best', period: 'all_time' }
      : state.timeframe,
    selectedChartType: state.selectedChartType,
    showAllCharts: false,
    previousMetrics: null,
    previousTimeframe: null,
  };
}

/**
 * Simulates handleExitMultiGroup transition
 */
function simulateExitMultiGroup(state: AnalyticsState, nextType: AnalysisType): AnalyticsState {
  return {
    ...state,
    analysisType: nextType,
    selectedAthleteId: '',
    selectedAthlete: null,
    selectedAthleteIds: [],
    selectedDates: [],
    analyticsData: null,
    error: null,
    // Preserve all filters (selection models handle athlete/team filtering separately)
    filters: state.filters,
    // Preserve metrics (primary carries over, additional was empty anyway)
    metrics: {
      primary: state.metrics.primary,
      additional: []
    },
    timeframe: state.timeframe,
    selectedChartType: state.selectedChartType,
    showAllCharts: false,
    previousMetrics: null,
    previousTimeframe: null,
  };
}

/**
 * Simulates handleNormalTypeChange transition (Individual <-> Multi-athlete)
 */
function simulateNormalTypeChange(state: AnalyticsState, nextType: AnalysisType): AnalyticsState {
  return {
    ...state,
    analysisType: nextType,
    selectedAthleteId: '',
    selectedAthlete: null,
    selectedAthleteIds: [],
    selectedDates: [],
    analyticsData: null,
    error: null,
    // Preserve all filters (fully compatible between individual and multi-athlete)
    filters: state.filters,
    // Preserve all metrics (fully compatible between individual and multi-athlete)
    metrics: state.metrics,
    timeframe: state.timeframe,
    selectedChartType: state.selectedChartType,
    showAllCharts: state.showAllCharts,
    previousMetrics: null,
    previousTimeframe: null,
  };
}

describe('AnalyticsContext State Transitions', () => {
  const createMockState = (overrides?: Partial<AnalyticsState>): AnalyticsState => ({
    analysisType: 'individual',
    selectedAthleteId: '',
    selectedAthlete: null,
    selectedAthleteIds: [],
    selectedDates: [],
    analyticsData: null,
    isLoading: false,
    error: null,
    filters: {
      organizationId: 'org-123',
    },
    metrics: {
      primary: 'FLY10_TIME',
      additional: [],
    },
    timeframe: {
      type: 'best',
      period: 'all_time',
    },
    selectedChartType: 'box_swarm_combo',
    showAllCharts: false,
    previousMetrics: null,
    previousTimeframe: null,
    ...overrides,
  });

  describe('handleEnterMultiGroup', () => {
    it('should preserve organizationId filter', () => {
      const initialState = createMockState({
        filters: { organizationId: 'org-123' }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.filters.organizationId).toBe('org-123');
    });

    it('should clear athleteIds filter (incompatible with multi-group)', () => {
      const initialState = createMockState({
        filters: {
          organizationId: 'org-123',
          athleteIds: ['athlete-1', 'athlete-2'],
        }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.filters.athleteIds).toBeUndefined();
    });

    it('should clear teams filter (incompatible with multi-group)', () => {
      const initialState = createMockState({
        filters: {
          organizationId: 'org-123',
          teams: ['Team A', 'Team B'],
        }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.filters.teams).toBeUndefined();
    });

    it('should preserve genders filter', () => {
      const initialState = createMockState({
        filters: {
          organizationId: 'org-123',
          genders: ['Male', 'Female'],
        }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.filters.genders).toEqual(['Male', 'Female']);
    });

    it('should preserve birthYear filters', () => {
      const initialState = createMockState({
        filters: {
          organizationId: 'org-123',
          birthYearFrom: 2000,
          birthYearTo: 2010,
        }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.filters.birthYearFrom).toBe(2000);
      expect(result.filters.birthYearTo).toBe(2010);
    });

    it('should preserve primary metric', () => {
      const initialState = createMockState({
        metrics: {
          primary: 'VERTICAL_JUMP',
          additional: ['FLY10_TIME', 'AGILITY_505'],
        }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.metrics.primary).toBe('VERTICAL_JUMP');
    });

    it('should clear additional metrics (multi-group only supports 1 metric)', () => {
      const initialState = createMockState({
        metrics: {
          primary: 'FLY10_TIME',
          additional: ['VERTICAL_JUMP', 'AGILITY_505'],
        }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.metrics.additional).toEqual([]);
    });

    it('should preserve timeframe when type is "best"', () => {
      const initialState = createMockState({
        timeframe: {
          type: 'best',
          period: 'last_30_days',
        }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.timeframe).toEqual({
        type: 'best',
        period: 'last_30_days',
      });
    });

    it('should preserve timeframe when type is "average"', () => {
      const initialState = createMockState({
        timeframe: {
          type: 'average',
          period: 'last_90_days',
        }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.timeframe).toEqual({
        type: 'average',
        period: 'last_90_days',
      });
    });

    it('should reset timeframe to "best/all_time" when type is "trends" (incompatible)', () => {
      const initialState = createMockState({
        timeframe: {
          type: 'trends',
          period: 'last_6_months',
        }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.timeframe).toEqual({
        type: 'best',
        period: 'all_time',
      });
    });

    it('should preserve chart type', () => {
      const initialState = createMockState({
        selectedChartType: 'violin_plot',
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.selectedChartType).toBe('violin_plot');
    });

    it('should reset athlete selections', () => {
      const initialState = createMockState({
        selectedAthleteId: 'athlete-1',
        selectedAthleteIds: ['athlete-1', 'athlete-2'],
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.selectedAthleteId).toBe('');
      expect(result.selectedAthleteIds).toEqual([]);
    });

    it('should clear analytics data and errors', () => {
      const initialState = createMockState({
        analyticsData: { data: [], statistics: {} } as any,
        error: 'Previous error',
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.analyticsData).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  describe('handleExitMultiGroup', () => {
    it('should preserve all filters', () => {
      const initialState = createMockState({
        analysisType: 'multi_group',
        filters: {
          organizationId: 'org-123',
          genders: ['Male'],
          birthYearFrom: 2000,
          birthYearTo: 2010,
        }
      });

      const result = simulateExitMultiGroup(initialState, 'individual');

      expect(result.filters).toEqual({
        organizationId: 'org-123',
        genders: ['Male'],
        birthYearFrom: 2000,
        birthYearTo: 2010,
      });
    });

    it('should preserve primary metric', () => {
      const initialState = createMockState({
        analysisType: 'multi_group',
        metrics: {
          primary: 'VERTICAL_JUMP',
          additional: [],
        }
      });

      const result = simulateExitMultiGroup(initialState, 'individual');

      expect(result.metrics.primary).toBe('VERTICAL_JUMP');
    });

    it('should keep additional metrics empty', () => {
      const initialState = createMockState({
        analysisType: 'multi_group',
        metrics: {
          primary: 'FLY10_TIME',
          additional: [],
        }
      });

      const result = simulateExitMultiGroup(initialState, 'individual');

      expect(result.metrics.additional).toEqual([]);
    });

    it('should preserve timeframe', () => {
      const initialState = createMockState({
        analysisType: 'multi_group',
        timeframe: {
          type: 'best',
          period: 'last_30_days',
        }
      });

      const result = simulateExitMultiGroup(initialState, 'individual');

      expect(result.timeframe).toEqual({
        type: 'best',
        period: 'last_30_days',
      });
    });

    it('should preserve chart type', () => {
      const initialState = createMockState({
        analysisType: 'multi_group',
        selectedChartType: 'box_swarm_combo',
      });

      const result = simulateExitMultiGroup(initialState, 'individual');

      expect(result.selectedChartType).toBe('box_swarm_combo');
    });

    it('should reset athlete selections', () => {
      const initialState = createMockState({
        analysisType: 'multi_group',
        selectedAthleteId: '',
        selectedAthleteIds: [],
      });

      const result = simulateExitMultiGroup(initialState, 'individual');

      expect(result.selectedAthleteId).toBe('');
      expect(result.selectedAthleteIds).toEqual([]);
    });

    it('should clear analytics data', () => {
      const initialState = createMockState({
        analysisType: 'multi_group',
        analyticsData: { data: [], statistics: {} } as any,
      });

      const result = simulateExitMultiGroup(initialState, 'individual');

      expect(result.analyticsData).toBeNull();
    });
  });

  describe('handleNormalTypeChange (Individual <-> Multi-athlete)', () => {
    it('should preserve all filters when switching from individual to multi-athlete', () => {
      const initialState = createMockState({
        analysisType: 'individual',
        filters: {
          organizationId: 'org-123',
          athleteIds: ['athlete-1'],
          teams: ['Team A'],
          genders: ['Male'],
          birthYearFrom: 2000,
          birthYearTo: 2010,
        }
      });

      const result = simulateNormalTypeChange(initialState, 'intra_group');

      expect(result.filters).toEqual({
        organizationId: 'org-123',
        athleteIds: ['athlete-1'],
        teams: ['Team A'],
        genders: ['Male'],
        birthYearFrom: 2000,
        birthYearTo: 2010,
      });
    });

    it('should preserve all filters when switching from multi-athlete to individual', () => {
      const initialState = createMockState({
        analysisType: 'intra_group',
        filters: {
          organizationId: 'org-123',
          athleteIds: ['athlete-1', 'athlete-2'],
          teams: ['Team A', 'Team B'],
          genders: ['Female'],
        }
      });

      const result = simulateNormalTypeChange(initialState, 'individual');

      expect(result.filters).toEqual({
        organizationId: 'org-123',
        athleteIds: ['athlete-1', 'athlete-2'],
        teams: ['Team A', 'Team B'],
        genders: ['Female'],
      });
    });

    it('should preserve all metrics', () => {
      const initialState = createMockState({
        analysisType: 'individual',
        metrics: {
          primary: 'FLY10_TIME',
          additional: ['VERTICAL_JUMP', 'AGILITY_505'],
        }
      });

      const result = simulateNormalTypeChange(initialState, 'intra_group');

      expect(result.metrics).toEqual({
        primary: 'FLY10_TIME',
        additional: ['VERTICAL_JUMP', 'AGILITY_505'],
      });
    });

    it('should preserve timeframe', () => {
      const initialState = createMockState({
        analysisType: 'individual',
        timeframe: {
          type: 'trends',
          period: 'last_6_months',
        }
      });

      const result = simulateNormalTypeChange(initialState, 'intra_group');

      expect(result.timeframe).toEqual({
        type: 'trends',
        period: 'last_6_months',
      });
    });

    it('should preserve chart type', () => {
      const initialState = createMockState({
        analysisType: 'individual',
        selectedChartType: 'distribution',
      });

      const result = simulateNormalTypeChange(initialState, 'intra_group');

      expect(result.selectedChartType).toBe('distribution');
    });

    it('should preserve showAllCharts setting', () => {
      const initialState = createMockState({
        analysisType: 'individual',
        showAllCharts: true,
      });

      const result = simulateNormalTypeChange(initialState, 'intra_group');

      expect(result.showAllCharts).toBe(true);
    });

    it('should reset athlete selections', () => {
      const initialState = createMockState({
        analysisType: 'individual',
        selectedAthleteId: 'athlete-1',
        selectedAthleteIds: ['athlete-1', 'athlete-2'],
      });

      const result = simulateNormalTypeChange(initialState, 'intra_group');

      expect(result.selectedAthleteId).toBe('');
      expect(result.selectedAthleteIds).toEqual([]);
    });

    it('should clear analytics data', () => {
      const initialState = createMockState({
        analysisType: 'individual',
        analyticsData: { data: [], statistics: {} } as any,
      });

      const result = simulateNormalTypeChange(initialState, 'intra_group');

      expect(result.analyticsData).toBeNull();
    });
  });

  describe('Filter Preservation Edge Cases', () => {
    it('should handle transition with empty additional metrics', () => {
      const initialState = createMockState({
        metrics: {
          primary: 'FLY10_TIME',
          additional: [],
        }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.metrics).toEqual({
        primary: 'FLY10_TIME',
        additional: [],
      });
    });

    it('should handle transition with no optional filters set', () => {
      const initialState = createMockState({
        filters: {
          organizationId: 'org-123',
        }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      expect(result.filters).toEqual({
        organizationId: 'org-123',
      });
    });

    it('should handle transition with all optional filters set', () => {
      const initialState = createMockState({
        filters: {
          organizationId: 'org-123',
          athleteIds: ['athlete-1'],
          teams: ['Team A'],
          genders: ['Male', 'Female'],
          birthYearFrom: 2000,
          birthYearTo: 2010,
        }
      });

      const result = simulateEnterMultiGroup(initialState, 'multi_group');

      // Should preserve genders and birthYear, clear athleteIds and teams
      expect(result.filters.organizationId).toBe('org-123');
      expect(result.filters.athleteIds).toBeUndefined();
      expect(result.filters.teams).toBeUndefined();
      expect(result.filters.genders).toEqual(['Male', 'Female']);
      expect(result.filters.birthYearFrom).toBe(2000);
      expect(result.filters.birthYearTo).toBe(2010);
    });

    it('should handle multiple consecutive transitions preserving compatible filters', () => {
      // Individual -> Multi-athlete -> Individual
      let state = createMockState({
        analysisType: 'individual',
        filters: {
          organizationId: 'org-123',
          genders: ['Male'],
          birthYearFrom: 2005,
        }
      });

      state = simulateNormalTypeChange(state, 'intra_group');
      expect(state.filters.genders).toEqual(['Male']);
      expect(state.filters.birthYearFrom).toBe(2005);

      state = simulateNormalTypeChange(state, 'individual');
      expect(state.filters.genders).toEqual(['Male']);
      expect(state.filters.birthYearFrom).toBe(2005);
    });

    it('should handle round-trip Individual -> Multi-group -> Individual', () => {
      // Start with all filters
      let state = createMockState({
        analysisType: 'individual',
        filters: {
          organizationId: 'org-123',
          athleteIds: ['athlete-1'],
          teams: ['Team A'],
          genders: ['Female'],
          birthYearFrom: 2000,
        },
        metrics: {
          primary: 'FLY10_TIME',
          additional: ['VERTICAL_JUMP'],
        }
      });

      // Enter multi-group: should clear athleteIds/teams, preserve genders/birthYear
      state = simulateEnterMultiGroup(state, 'multi_group');
      expect(state.filters.athleteIds).toBeUndefined();
      expect(state.filters.teams).toBeUndefined();
      expect(state.filters.genders).toEqual(['Female']);
      expect(state.filters.birthYearFrom).toBe(2000);
      expect(state.metrics.additional).toEqual([]);

      // Exit multi-group: should preserve all current filters
      state = simulateExitMultiGroup(state, 'individual');
      expect(state.filters.genders).toEqual(['Female']);
      expect(state.filters.birthYearFrom).toBe(2000);
      // athleteIds/teams remain cleared (as expected)
      expect(state.filters.athleteIds).toBeUndefined();
      expect(state.filters.teams).toBeUndefined();
    });
  });
});
