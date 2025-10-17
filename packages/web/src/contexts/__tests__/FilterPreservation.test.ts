/**
 * Unit tests for filter preservation across analysis mode transitions
 * Tests edge cases and complex scenarios for filter state management
 */

import { describe, it, expect } from 'vitest';
import type { AnalyticsFilters } from '@shared/analytics-types';

/**
 * Helper to simulate filter preservation when entering multi-group mode
 * Preserves: organizationId, genders, birthYearFrom, birthYearTo
 * Clears: athleteIds, teams
 */
function preserveFiltersEnterMultiGroup(filters: AnalyticsFilters): AnalyticsFilters {
  return {
    organizationId: filters.organizationId,
    ...(filters.genders && { genders: filters.genders }),
    ...(filters.birthYearFrom && { birthYearFrom: filters.birthYearFrom }),
    ...(filters.birthYearTo && { birthYearTo: filters.birthYearTo })
  };
}

/**
 * Helper to simulate filter preservation when exiting multi-group mode
 * Preserves: all filters
 */
function preserveFiltersExitMultiGroup(filters: AnalyticsFilters): AnalyticsFilters {
  return filters;
}

/**
 * Helper to simulate filter preservation for normal type changes (Individual <-> Multi-athlete)
 * Preserves: all filters
 */
function preserveFiltersNormalChange(filters: AnalyticsFilters): AnalyticsFilters {
  return filters;
}

describe('Filter Preservation Logic', () => {
  describe('Enter Multi-Group Mode', () => {
    it('should preserve organizationId (required field)', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-456',
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result.organizationId).toBe('org-456');
    });

    it('should clear athleteIds when entering multi-group', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        athleteIds: ['athlete-1', 'athlete-2', 'athlete-3'],
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result.athleteIds).toBeUndefined();
    });

    it('should clear teams when entering multi-group', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        teams: ['Team A', 'Team B', 'Team C'],
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result.teams).toBeUndefined();
    });

    it('should preserve genders filter', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        genders: ['Male', 'Female'],
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result.genders).toEqual(['Male', 'Female']);
    });

    it('should preserve single gender filter', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        genders: ['Not Specified'],
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result.genders).toEqual(['Not Specified']);
    });

    it('should preserve birthYearFrom', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        birthYearFrom: 2005,
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result.birthYearFrom).toBe(2005);
    });

    it('should preserve birthYearTo', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        birthYearTo: 2010,
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result.birthYearTo).toBe(2010);
    });

    it('should preserve both birthYear boundaries', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        birthYearFrom: 2000,
        birthYearTo: 2010,
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result.birthYearFrom).toBe(2000);
      expect(result.birthYearTo).toBe(2010);
    });

    it('should handle complex filter set with mixed preservation', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        athleteIds: ['athlete-1', 'athlete-2'],
        teams: ['Team A', 'Team B'],
        genders: ['Male'],
        birthYearFrom: 2000,
        birthYearTo: 2010,
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      // Should preserve
      expect(result.organizationId).toBe('org-123');
      expect(result.genders).toEqual(['Male']);
      expect(result.birthYearFrom).toBe(2000);
      expect(result.birthYearTo).toBe(2010);

      // Should clear
      expect(result.athleteIds).toBeUndefined();
      expect(result.teams).toBeUndefined();
    });

    it('should not include undefined fields when genders is not set', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result).toEqual({
        organizationId: 'org-123',
      });
      expect('genders' in result).toBe(false);
    });

    it('should not include undefined fields when birthYear is not set', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        genders: ['Male'],
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result).toEqual({
        organizationId: 'org-123',
        genders: ['Male'],
      });
      expect('birthYearFrom' in result).toBe(false);
      expect('birthYearTo' in result).toBe(false);
    });
  });

  describe('Exit Multi-Group Mode', () => {
    it('should preserve all filters when exiting multi-group', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        genders: ['Female'],
        birthYearFrom: 2005,
        birthYearTo: 2008,
      };

      const result = preserveFiltersExitMultiGroup(filters);

      expect(result).toEqual(filters);
    });

    it('should preserve organizationId only when no other filters set', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
      };

      const result = preserveFiltersExitMultiGroup(filters);

      expect(result).toEqual({
        organizationId: 'org-123',
      });
    });

    it('should preserve state even with athleteIds/teams present', () => {
      // This could happen if filters were manually set during multi-group mode
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        athleteIds: ['athlete-1'],
        teams: ['Team A'],
      };

      const result = preserveFiltersExitMultiGroup(filters);

      expect(result).toEqual(filters);
    });
  });

  describe('Normal Type Change (Individual <-> Multi-athlete)', () => {
    it('should preserve all filters', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        athleteIds: ['athlete-1', 'athlete-2'],
        teams: ['Team A', 'Team B'],
        genders: ['Male', 'Female'],
        birthYearFrom: 2000,
        birthYearTo: 2010,
      };

      const result = preserveFiltersNormalChange(filters);

      expect(result).toEqual(filters);
    });

    it('should preserve filters with only organizationId', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
      };

      const result = preserveFiltersNormalChange(filters);

      expect(result).toEqual({
        organizationId: 'org-123',
      });
    });

    it('should preserve partial filter sets', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        athleteIds: ['athlete-1'],
        birthYearFrom: 2005,
      };

      const result = preserveFiltersNormalChange(filters);

      expect(result).toEqual(filters);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty athleteIds array', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        athleteIds: [],
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result.athleteIds).toBeUndefined();
    });

    it('should handle empty teams array', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        teams: [],
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result.teams).toBeUndefined();
    });

    it('should handle empty genders array', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        genders: [],
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      // Empty array is truthy, so it gets preserved
      expect(result.genders).toEqual([]);
    });

    it('should handle birthYearFrom of 0', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        birthYearFrom: 0,
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      // 0 is falsy, so it won't be preserved with current implementation
      // This is an edge case that might need handling if year 0 is valid
      expect(result.birthYearFrom).toBeUndefined();
    });

    it('should handle birthYearTo of 0', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        birthYearTo: 0,
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      // 0 is falsy, so it won't be preserved with current implementation
      expect(result.birthYearTo).toBeUndefined();
    });

    it('should handle very large birthYear values', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        birthYearFrom: 2050,
        birthYearTo: 2100,
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result.birthYearFrom).toBe(2050);
      expect(result.birthYearTo).toBe(2100);
    });

    it('should handle old birthYear values', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        birthYearFrom: 1950,
        birthYearTo: 1960,
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      expect(result.birthYearFrom).toBe(1950);
      expect(result.birthYearTo).toBe(1960);
    });
  });

  describe('Complex Multi-Transition Scenarios', () => {
    it('should handle Individual -> Multi-Group -> Individual round trip', () => {
      // Start with full filter set in Individual mode
      let filters: AnalyticsFilters = {
        organizationId: 'org-123',
        athleteIds: ['athlete-1', 'athlete-2'],
        teams: ['Team A'],
        genders: ['Male'],
        birthYearFrom: 2000,
        birthYearTo: 2010,
      };

      // Transition to Multi-Group: athleteIds and teams should be cleared
      filters = preserveFiltersEnterMultiGroup(filters);
      expect(filters.athleteIds).toBeUndefined();
      expect(filters.teams).toBeUndefined();
      expect(filters.genders).toEqual(['Male']);
      expect(filters.birthYearFrom).toBe(2000);

      // Transition back to Individual: should preserve current state
      filters = preserveFiltersExitMultiGroup(filters);
      expect(filters.genders).toEqual(['Male']);
      expect(filters.birthYearFrom).toBe(2000);
      // athleteIds and teams remain cleared (as expected)
      expect(filters.athleteIds).toBeUndefined();
      expect(filters.teams).toBeUndefined();
    });

    it('should handle Individual -> Multi-Athlete -> Individual round trip', () => {
      // Start with full filter set
      let filters: AnalyticsFilters = {
        organizationId: 'org-123',
        athleteIds: ['athlete-1'],
        teams: ['Team A'],
        genders: ['Female'],
        birthYearFrom: 2005,
      };

      // Transition to Multi-Athlete: all filters preserved
      filters = preserveFiltersNormalChange(filters);
      expect(filters).toEqual({
        organizationId: 'org-123',
        athleteIds: ['athlete-1'],
        teams: ['Team A'],
        genders: ['Female'],
        birthYearFrom: 2005,
      });

      // Transition back to Individual: all filters still preserved
      filters = preserveFiltersNormalChange(filters);
      expect(filters).toEqual({
        organizationId: 'org-123',
        athleteIds: ['athlete-1'],
        teams: ['Team A'],
        genders: ['Female'],
        birthYearFrom: 2005,
      });
    });

    it('should handle Individual -> Multi-Athlete -> Multi-Group transitions', () => {
      // Start in Individual
      let filters: AnalyticsFilters = {
        organizationId: 'org-123',
        athleteIds: ['athlete-1', 'athlete-2'],
        genders: ['Male', 'Female'],
        birthYearFrom: 2000,
      };

      // Individual -> Multi-Athlete: preserve everything
      filters = preserveFiltersNormalChange(filters);
      expect(filters.athleteIds).toEqual(['athlete-1', 'athlete-2']);
      expect(filters.genders).toEqual(['Male', 'Female']);

      // Multi-Athlete -> Multi-Group: clear athleteIds, preserve genders
      filters = preserveFiltersEnterMultiGroup(filters);
      expect(filters.athleteIds).toBeUndefined();
      expect(filters.genders).toEqual(['Male', 'Female']);
      expect(filters.birthYearFrom).toBe(2000);
    });

    it('should handle repeated multi-group entries', () => {
      let filters: AnalyticsFilters = {
        organizationId: 'org-123',
        athleteIds: ['athlete-1'],
        teams: ['Team A'],
        genders: ['Male'],
        birthYearFrom: 2005,
        birthYearTo: 2010,
      };

      // First entry to multi-group
      filters = preserveFiltersEnterMultiGroup(filters);
      expect(filters.athleteIds).toBeUndefined();
      expect(filters.teams).toBeUndefined();
      expect(filters.genders).toEqual(['Male']);

      // Exit multi-group
      filters = preserveFiltersExitMultiGroup(filters);

      // Re-entry to multi-group (filters still don't have athleteIds/teams)
      filters = preserveFiltersEnterMultiGroup(filters);
      expect(filters.athleteIds).toBeUndefined();
      expect(filters.teams).toBeUndefined();
      expect(filters.genders).toEqual(['Male']);
    });
  });

  describe('Filter Consistency Validation', () => {
    it('should never lose organizationId in any transition', () => {
      const filters: AnalyticsFilters = { organizationId: 'org-xyz' };

      const afterEnterMultiGroup = preserveFiltersEnterMultiGroup(filters);
      expect(afterEnterMultiGroup.organizationId).toBe('org-xyz');

      const afterExitMultiGroup = preserveFiltersExitMultiGroup(filters);
      expect(afterExitMultiGroup.organizationId).toBe('org-xyz');

      const afterNormalChange = preserveFiltersNormalChange(filters);
      expect(afterNormalChange.organizationId).toBe('org-xyz');
    });

    it('should maintain filter type consistency', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        genders: ['Male'],
        birthYearFrom: 2005,
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      // genders should still be array
      expect(Array.isArray(result.genders)).toBe(true);

      // birthYearFrom should still be number
      expect(typeof result.birthYearFrom).toBe('number');

      // organizationId should still be string
      expect(typeof result.organizationId).toBe('string');
    });

    it('should not introduce new filter properties', () => {
      const filters: AnalyticsFilters = {
        organizationId: 'org-123',
        genders: ['Male'],
      };

      const result = preserveFiltersEnterMultiGroup(filters);

      const originalKeys = Object.keys(filters);
      const resultKeys = Object.keys(result);

      // Result should not have more keys than original (except for cleared fields)
      const expectedKeys = ['organizationId', 'genders'];
      expect(resultKeys.sort()).toEqual(expectedKeys.sort());
    });
  });
});
