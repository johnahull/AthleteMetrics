/**
 * Peer Comparison Filter Logic - Unit Tests
 *
 * Tests the filter building logic in isolation without database dependencies.
 * These tests verify:
 * - Filter criteria validation
 * - Age range calculation
 * - Sports array overlap logic
 * - Team filter combination logic
 * - Edge case handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Filter criteria for peer pool selection (mirrors service type)
 */
interface PeerFilterCriteria {
  ageRange?: [number, number];
  gender?: 'Male' | 'Female';
  orgTypes?: string[];
  sports?: string[];
  teamIds?: string[];
}

/**
 * Calculate birth date range from age range
 * Mirrors the logic in getGlobalPeerPool
 */
function calculateBirthDateRange(
  ageRange: [number, number]
): { minBirthDate: string; maxBirthDate: string } {
  const [minAge, maxAge] = ageRange;
  const today = new Date();

  // For maximum age, birth date is earlier (person is older)
  const minBirthDate = new Date(
    today.getFullYear() - maxAge - 1,
    today.getMonth(),
    today.getDate()
  );

  // For minimum age, birth date is more recent (person is younger)
  const maxBirthDate = new Date(
    today.getFullYear() - minAge,
    today.getMonth(),
    today.getDate()
  );

  return {
    minBirthDate: minBirthDate.toISOString().split('T')[0],
    maxBirthDate: maxBirthDate.toISOString().split('T')[0],
  };
}

/**
 * Check if a user matches the sports filter using array overlap logic
 */
function matchesSportsFilter(userSports: string[], filterSports: string[]): boolean {
  if (!filterSports || filterSports.length === 0) return true;
  if (!userSports || userSports.length === 0) return false;

  // Array overlap: at least one sport matches
  return filterSports.some(filterSport => userSports.includes(filterSport));
}

/**
 * Check if a user's birth date falls within the age range filter
 */
function matchesAgeFilter(birthDate: string, ageRange: [number, number]): boolean {
  if (!ageRange) return true;

  const { minBirthDate, maxBirthDate } = calculateBirthDateRange(ageRange);
  return birthDate >= minBirthDate && birthDate <= maxBirthDate;
}

/**
 * Normalize filter criteria for consistent cache keys
 * Mirrors normalizeFilters from the service
 */
function normalizeFilters(filters: PeerFilterCriteria): PeerFilterCriteria {
  const normalized: PeerFilterCriteria = {};

  if (filters.ageRange) {
    normalized.ageRange = filters.ageRange;
  }
  if (filters.gender) {
    normalized.gender = filters.gender;
  }
  if (filters.orgTypes && filters.orgTypes.length > 0) {
    normalized.orgTypes = [...filters.orgTypes].sort();
  }
  if (filters.sports && filters.sports.length > 0) {
    normalized.sports = [...filters.sports].sort();
  }
  if (filters.teamIds && filters.teamIds.length > 0) {
    normalized.teamIds = [...filters.teamIds].sort();
  }

  return normalized;
}

/**
 * Count active filters for UI badge display
 */
function countActiveFilters(filters: PeerFilterCriteria, scope: 'global' | 'team'): number {
  let count = 0;
  if (scope === 'team' && filters.teamIds && filters.teamIds.length > 0) count++;
  if (filters.ageRange) count++;
  if (filters.gender) count++;
  if (filters.sports && filters.sports.length > 0) count++;
  return count;
}

describe('Peer Comparison Filter Logic - Unit Tests', () => {
  describe('Age Range Calculation', () => {
    it('should calculate correct birth date range for age 18-25', () => {
      const result = calculateBirthDateRange([18, 25]);
      const today = new Date();

      // Parse dates for comparison
      const minDate = new Date(result.minBirthDate);
      const maxDate = new Date(result.maxBirthDate);

      // Min birth date should be about 26 years ago (for max age 25)
      const expectedMinYear = today.getFullYear() - 26;
      expect(minDate.getFullYear()).toBe(expectedMinYear);

      // Max birth date should be about 18 years ago (for min age 18)
      const expectedMaxYear = today.getFullYear() - 18;
      expect(maxDate.getFullYear()).toBe(expectedMaxYear);
    });

    it('should handle same age for min and max', () => {
      const result = calculateBirthDateRange([20, 20]);
      const today = new Date();

      const minDate = new Date(result.minBirthDate);
      const maxDate = new Date(result.maxBirthDate);

      // Range should be about 1 year (for exactly 20 year olds)
      expect(maxDate.getFullYear() - minDate.getFullYear()).toBe(1);
    });

    it('should handle inverted age range', () => {
      const result = calculateBirthDateRange([30, 20]); // min > max

      // This results in minBirthDate > maxBirthDate, which means no matches
      expect(result.minBirthDate > result.maxBirthDate).toBe(true);
    });

    it('should handle edge case ages', () => {
      // Very young
      const youngResult = calculateBirthDateRange([10, 12]);
      expect(youngResult.minBirthDate).toBeTruthy();
      expect(youngResult.maxBirthDate).toBeTruthy();

      // Very old
      const oldResult = calculateBirthDateRange([50, 60]);
      expect(oldResult.minBirthDate).toBeTruthy();
      expect(oldResult.maxBirthDate).toBeTruthy();
    });
  });

  describe('Sports Filter Matching', () => {
    it('should return true when no filter is specified', () => {
      expect(matchesSportsFilter(['Soccer', 'Basketball'], [])).toBe(true);
      expect(matchesSportsFilter(['Soccer'], undefined as any)).toBe(true);
    });

    it('should return false when user has no sports but filter is specified', () => {
      expect(matchesSportsFilter([], ['Soccer'])).toBe(false);
      expect(matchesSportsFilter(undefined as any, ['Soccer'])).toBe(false);
    });

    it('should match single sport overlap', () => {
      expect(matchesSportsFilter(['Soccer'], ['Soccer'])).toBe(true);
      expect(matchesSportsFilter(['Soccer', 'Basketball'], ['Soccer'])).toBe(true);
      expect(matchesSportsFilter(['Soccer'], ['Basketball'])).toBe(false);
    });

    it('should match any sport in array (OR logic)', () => {
      expect(matchesSportsFilter(['Soccer'], ['Soccer', 'Basketball'])).toBe(true);
      expect(matchesSportsFilter(['Basketball'], ['Soccer', 'Basketball'])).toBe(true);
      expect(matchesSportsFilter(['Track'], ['Soccer', 'Basketball'])).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(matchesSportsFilter(['soccer'], ['Soccer'])).toBe(false);
      expect(matchesSportsFilter(['SOCCER'], ['Soccer'])).toBe(false);
    });
  });

  describe('Age Filter Matching', () => {
    const today = new Date();

    it('should match birth date within age range', () => {
      // Create a birth date for a 20 year old
      const birthDate = new Date(today.getFullYear() - 20, 0, 1).toISOString().split('T')[0];

      expect(matchesAgeFilter(birthDate, [18, 25])).toBe(true);
      expect(matchesAgeFilter(birthDate, [15, 19])).toBe(false);
      expect(matchesAgeFilter(birthDate, [21, 30])).toBe(false);
    });

    it('should include boundary ages', () => {
      // Exactly 18 years old
      const age18 = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()).toISOString().split('T')[0];
      expect(matchesAgeFilter(age18, [18, 25])).toBe(true);

      // Exactly 25 years old (almost 26)
      const age25 = new Date(today.getFullYear() - 25, today.getMonth(), today.getDate() - 1).toISOString().split('T')[0];
      expect(matchesAgeFilter(age25, [18, 25])).toBe(true);
    });

    it('should exclude ages outside range', () => {
      // 17 years old
      const age17 = new Date(today.getFullYear() - 17, today.getMonth(), today.getDate()).toISOString().split('T')[0];
      expect(matchesAgeFilter(age17, [18, 25])).toBe(false);

      // 30 years old
      const age30 = new Date(today.getFullYear() - 30, 0, 1).toISOString().split('T')[0];
      expect(matchesAgeFilter(age30, [18, 25])).toBe(false);
    });
  });

  describe('Filter Normalization', () => {
    it('should preserve age range', () => {
      const result = normalizeFilters({ ageRange: [20, 30] });
      expect(result.ageRange).toEqual([20, 30]);
    });

    it('should preserve gender', () => {
      const result = normalizeFilters({ gender: 'Female' });
      expect(result.gender).toBe('Female');
    });

    it('should sort sports array for consistent cache keys', () => {
      const result = normalizeFilters({ sports: ['Track', 'Basketball', 'Soccer'] });
      expect(result.sports).toEqual(['Basketball', 'Soccer', 'Track']);
    });

    it('should sort team IDs for consistent cache keys', () => {
      const result = normalizeFilters({ teamIds: ['zzz-123', 'aaa-456', 'mmm-789'] });
      expect(result.teamIds).toEqual(['aaa-456', 'mmm-789', 'zzz-123']);
    });

    it('should sort org types for consistent cache keys', () => {
      const result = normalizeFilters({ orgTypes: ['youth', 'college', 'club'] });
      expect(result.orgTypes).toEqual(['club', 'college', 'youth']);
    });

    it('should exclude empty arrays', () => {
      const result = normalizeFilters({
        sports: [],
        teamIds: [],
        orgTypes: [],
      });
      expect(result.sports).toBeUndefined();
      expect(result.teamIds).toBeUndefined();
      expect(result.orgTypes).toBeUndefined();
    });

    it('should produce consistent keys for same filters in different order', () => {
      const filters1 = normalizeFilters({ sports: ['B', 'A'], teamIds: ['2', '1'] });
      const filters2 = normalizeFilters({ sports: ['A', 'B'], teamIds: ['1', '2'] });

      expect(JSON.stringify(filters1)).toBe(JSON.stringify(filters2));
    });
  });

  describe('Active Filter Count', () => {
    it('should count no filters when empty', () => {
      expect(countActiveFilters({}, 'global')).toBe(0);
      expect(countActiveFilters({}, 'team')).toBe(0);
    });

    it('should count age range as one filter', () => {
      expect(countActiveFilters({ ageRange: [18, 25] }, 'global')).toBe(1);
    });

    it('should count gender as one filter', () => {
      expect(countActiveFilters({ gender: 'Male' }, 'global')).toBe(1);
    });

    it('should count sports as one filter regardless of array length', () => {
      expect(countActiveFilters({ sports: ['Soccer'] }, 'global')).toBe(1);
      expect(countActiveFilters({ sports: ['Soccer', 'Basketball', 'Track'] }, 'global')).toBe(1);
    });

    it('should only count team filter in team scope', () => {
      expect(countActiveFilters({ teamIds: ['team-1'] }, 'global')).toBe(0);
      expect(countActiveFilters({ teamIds: ['team-1'] }, 'team')).toBe(1);
    });

    it('should count multiple filters', () => {
      expect(countActiveFilters({
        ageRange: [18, 25],
        gender: 'Male',
        sports: ['Soccer'],
      }, 'global')).toBe(3);

      expect(countActiveFilters({
        ageRange: [18, 25],
        gender: 'Female',
        sports: ['Soccer'],
        teamIds: ['team-1'],
      }, 'team')).toBe(4);
    });

    it('should not count empty arrays', () => {
      expect(countActiveFilters({ sports: [] }, 'global')).toBe(0);
      expect(countActiveFilters({ teamIds: [] }, 'team')).toBe(0);
    });
  });

  describe('Combined Filter Logic', () => {
    interface MockUser {
      gender: string;
      birthDate: string;
      sports: string[];
      teamId: string | null;
    }

    const today = new Date();

    const mockUsers: MockUser[] = [
      // Male, 20, Soccer, Team A
      {
        gender: 'Male',
        birthDate: new Date(today.getFullYear() - 20, 0, 1).toISOString().split('T')[0],
        sports: ['Soccer'],
        teamId: 'team-a',
      },
      // Female, 22, Soccer, Team A
      {
        gender: 'Female',
        birthDate: new Date(today.getFullYear() - 22, 0, 1).toISOString().split('T')[0],
        sports: ['Soccer'],
        teamId: 'team-a',
      },
      // Male, 35, Soccer, Team A
      {
        gender: 'Male',
        birthDate: new Date(today.getFullYear() - 35, 0, 1).toISOString().split('T')[0],
        sports: ['Soccer'],
        teamId: 'team-a',
      },
      // Male, 20, Basketball, Team B
      {
        gender: 'Male',
        birthDate: new Date(today.getFullYear() - 20, 0, 1).toISOString().split('T')[0],
        sports: ['Basketball'],
        teamId: 'team-b',
      },
      // Male, 25, Track, No team
      {
        gender: 'Male',
        birthDate: new Date(today.getFullYear() - 25, 0, 1).toISOString().split('T')[0],
        sports: ['Track'],
        teamId: null,
      },
    ];

    function filterUsers(users: MockUser[], filters: PeerFilterCriteria): MockUser[] {
      return users.filter(user => {
        // Gender filter
        if (filters.gender && user.gender !== filters.gender) return false;

        // Age filter
        if (filters.ageRange && !matchesAgeFilter(user.birthDate, filters.ageRange)) return false;

        // Sports filter
        if (filters.sports && filters.sports.length > 0 && !matchesSportsFilter(user.sports, filters.sports)) return false;

        // Team filter
        if (filters.teamIds && filters.teamIds.length > 0 && (!user.teamId || !filters.teamIds.includes(user.teamId))) return false;

        return true;
      });
    }

    it('should return all users with no filters', () => {
      const result = filterUsers(mockUsers, {});
      expect(result.length).toBe(5);
    });

    it('should filter by gender only', () => {
      const males = filterUsers(mockUsers, { gender: 'Male' });
      expect(males.length).toBe(4);

      const females = filterUsers(mockUsers, { gender: 'Female' });
      expect(females.length).toBe(1);
    });

    it('should filter by age range only', () => {
      const youngAdults = filterUsers(mockUsers, { ageRange: [18, 30] });
      expect(youngAdults.length).toBe(4); // Excludes 35-year-old
    });

    it('should filter by sports only', () => {
      const soccer = filterUsers(mockUsers, { sports: ['Soccer'] });
      expect(soccer.length).toBe(3);

      const track = filterUsers(mockUsers, { sports: ['Track'] });
      expect(track.length).toBe(1);
    });

    it('should filter by team only', () => {
      const teamA = filterUsers(mockUsers, { teamIds: ['team-a'] });
      expect(teamA.length).toBe(3);

      const teamB = filterUsers(mockUsers, { teamIds: ['team-b'] });
      expect(teamB.length).toBe(1);
    });

    it('should combine gender and age filters', () => {
      const youngMales = filterUsers(mockUsers, {
        gender: 'Male',
        ageRange: [18, 30],
      });
      expect(youngMales.length).toBe(3); // Male 20 soccer, Male 20 basketball, Male 25 track
    });

    it('should combine team and gender filters', () => {
      const teamAMales = filterUsers(mockUsers, {
        teamIds: ['team-a'],
        gender: 'Male',
      });
      expect(teamAMales.length).toBe(2); // Male 20 and Male 35
    });

    it('should combine all filters', () => {
      const restrictive = filterUsers(mockUsers, {
        gender: 'Male',
        ageRange: [18, 25],
        sports: ['Soccer'],
        teamIds: ['team-a'],
      });
      expect(restrictive.length).toBe(1); // Only Male 20 Soccer Team A
    });

    it('should return empty array when no matches', () => {
      const noMatches = filterUsers(mockUsers, {
        gender: 'Female',
        teamIds: ['team-b'],
      });
      expect(noMatches.length).toBe(0);
    });
  });
});

describe('Percentile Label Generation', () => {
  interface PercentileLabel {
    label: string;
    message: string;
    colorClass: string;
  }

  function getPercentileLabel(percentile: number): PercentileLabel {
    if (percentile >= 90) {
      return { label: 'TOP 10%', message: "You're one of the best!", colorClass: 'text-purple-600' };
    }
    if (percentile >= 75) {
      return { label: 'TOP 25%', message: 'Better than 3 out of 4 peers', colorClass: 'text-blue-600' };
    }
    if (percentile >= 50) {
      return { label: 'ABOVE AVERAGE', message: 'Above the group average', colorClass: 'text-green-600' };
    }
    if (percentile >= 25) {
      return { label: 'BUILDING', message: 'On track - keep pushing!', colorClass: 'text-yellow-600' };
    }
    return { label: 'DEVELOPING', message: 'Every session counts!', colorClass: 'text-orange-600' };
  }

  it('should return TOP 10% for percentile >= 90', () => {
    expect(getPercentileLabel(90).label).toBe('TOP 10%');
    expect(getPercentileLabel(95).label).toBe('TOP 10%');
    expect(getPercentileLabel(100).label).toBe('TOP 10%');
  });

  it('should return TOP 25% for percentile 75-89', () => {
    expect(getPercentileLabel(75).label).toBe('TOP 25%');
    expect(getPercentileLabel(80).label).toBe('TOP 25%');
    expect(getPercentileLabel(89).label).toBe('TOP 25%');
  });

  it('should return ABOVE AVERAGE for percentile 50-74', () => {
    expect(getPercentileLabel(50).label).toBe('ABOVE AVERAGE');
    expect(getPercentileLabel(60).label).toBe('ABOVE AVERAGE');
    expect(getPercentileLabel(74).label).toBe('ABOVE AVERAGE');
  });

  it('should return BUILDING for percentile 25-49', () => {
    expect(getPercentileLabel(25).label).toBe('BUILDING');
    expect(getPercentileLabel(35).label).toBe('BUILDING');
    expect(getPercentileLabel(49).label).toBe('BUILDING');
  });

  it('should return DEVELOPING for percentile < 25', () => {
    expect(getPercentileLabel(0).label).toBe('DEVELOPING');
    expect(getPercentileLabel(10).label).toBe('DEVELOPING');
    expect(getPercentileLabel(24).label).toBe('DEVELOPING');
  });

  it('should return appropriate color classes', () => {
    expect(getPercentileLabel(95).colorClass).toBe('text-purple-600');
    expect(getPercentileLabel(80).colorClass).toBe('text-blue-600');
    expect(getPercentileLabel(60).colorClass).toBe('text-green-600');
    expect(getPercentileLabel(35).colorClass).toBe('text-yellow-600');
    expect(getPercentileLabel(10).colorClass).toBe('text-orange-600');
  });
});
