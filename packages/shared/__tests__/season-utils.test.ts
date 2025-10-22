import { describe, it, expect } from 'vitest';
import { 
  getCurrentSeason, 
  getSeasonForDate, 
  validateSeasonConfig, 
  getSeasonsForYear,
  validateSeasonFormat,
  parseSeasonString,
  createSeasonString,
  normalizeSeasonString,
  getAcademicYear,
  DEFAULT_SEASON_CONFIG,
  type SeasonConfig 
} from '../season-utils';

describe('Season Utils', () => {
  describe('getCurrentSeason', () => {
    it('should return Fall season for August-December', () => {
      const fallDates = [
        new Date(2024, 7, 1),   // August 1
        new Date(2024, 8, 15),  // September 15
        new Date(2024, 9, 31),  // October 31
        new Date(2024, 10, 15), // November 15
        new Date(2024, 11, 31), // December 31
      ];

      fallDates.forEach(date => {
        expect(getCurrentSeason(DEFAULT_SEASON_CONFIG, date)).toBe('2024-Fall');
      });
    });

    it('should return Spring season for January-May', () => {
      const springDates = [
        new Date(2024, 0, 1),   // January 1
        new Date(2024, 1, 14),  // February 14
        new Date(2024, 2, 15),  // March 15
        new Date(2024, 3, 30),  // April 30
        new Date(2024, 4, 31),  // May 31
      ];

      springDates.forEach(date => {
        expect(getCurrentSeason(DEFAULT_SEASON_CONFIG, date)).toBe('2024-Spring');
      });
    });

    it('should return Summer season for June-July', () => {
      const summerDates = [
        new Date(2024, 5, 1),   // June 1
        new Date(2024, 5, 30),  // June 30
        new Date(2024, 6, 1),   // July 1
        new Date(2024, 6, 31),  // July 31
      ];

      summerDates.forEach(date => {
        expect(getCurrentSeason(DEFAULT_SEASON_CONFIG, date)).toBe('2024-Summer');
      });
    });

    it('should work with custom season configuration', () => {
      const customConfig: SeasonConfig = {
        fallStartMonth: 9,
        fallEndMonth: 11,
        springStartMonth: 3,
        springEndMonth: 5,
        summerStartMonth: 6,
        summerEndMonth: 8,
      };

      // Test winter months (1-2, 12) - should throw error with this config
      expect(() => getCurrentSeason(customConfig, new Date(2024, 0, 1))).toThrow();
      expect(() => getCurrentSeason(customConfig, new Date(2024, 11, 1))).toThrow();
      
      // Test configured months
      expect(getCurrentSeason(customConfig, new Date(2024, 8, 1))).toBe('2024-Fall');  // September
      expect(getCurrentSeason(customConfig, new Date(2024, 2, 1))).toBe('2024-Spring'); // March
      expect(getCurrentSeason(customConfig, new Date(2024, 5, 1))).toBe('2024-Summer'); // June
    });

    it('should throw error for invalid configuration', () => {
      const invalidConfig: SeasonConfig = {
        fallStartMonth: 13, // Invalid month
        fallEndMonth: 12,
        springStartMonth: 1,
        springEndMonth: 5,
        summerStartMonth: 6,
        summerEndMonth: 7,
      };

      expect(() => getCurrentSeason(invalidConfig, new Date(2024, 0, 1))).toThrow('Invalid season configuration');
    });
  });

  describe('validateSeasonConfig', () => {
    it('should validate default configuration', () => {
      expect(() => validateSeasonConfig(DEFAULT_SEASON_CONFIG)).not.toThrow();
    });

    it('should detect overlapping months', () => {
      const overlappingConfig: SeasonConfig = {
        fallStartMonth: 8,
        fallEndMonth: 10,
        springStartMonth: 10, // Overlaps with fall
        springEndMonth: 12,
        summerStartMonth: 1,
        summerEndMonth: 7,
      };

      expect(() => validateSeasonConfig(overlappingConfig)).toThrow('Month 10 is assigned to multiple seasons');
    });

    it('should detect missing months', () => {
      const incompleteConfig: SeasonConfig = {
        fallStartMonth: 8,
        fallEndMonth: 10,
        springStartMonth: 1,
        springEndMonth: 5,
        summerStartMonth: 6,
        summerEndMonth: 7, // Missing months 11-12
      };

      expect(() => validateSeasonConfig(incompleteConfig)).toThrow('Month 11 is not assigned to any season');
    });
  });

  describe('getSeasonForDate', () => {
    it('should return correct season for specific date', () => {
      expect(getSeasonForDate(new Date(2024, 0, 15))).toBe('2024-Spring');
      expect(getSeasonForDate(new Date(2024, 5, 15))).toBe('2024-Summer');
      expect(getSeasonForDate(new Date(2024, 8, 15))).toBe('2024-Fall');
    });
  });

  describe('getSeasonsForYear', () => {
    it('should return all seasons for a year', () => {
      const seasons = getSeasonsForYear(2024);
      expect(seasons).toEqual(['2024-Fall', '2024-Spring', '2024-Summer']);
    });

    it('should work for different years', () => {
      const seasons = getSeasonsForYear(2025);
      expect(seasons).toEqual(['2025-Fall', '2025-Spring', '2025-Summer']);
    });
  });

  describe('season format validation', () => {
    describe('validateSeasonFormat', () => {
      it('should validate correct season formats', () => {
        expect(validateSeasonFormat('2024-Fall')).toBe(true);
        expect(validateSeasonFormat('2024-Spring')).toBe(true);
        expect(validateSeasonFormat('2024-Summer')).toBe(true);
        expect(validateSeasonFormat('2025-Fall')).toBe(true);
      });

      it('should reject invalid season formats', () => {
        expect(validateSeasonFormat('2024-fall')).toBe(false); // lowercase
        expect(validateSeasonFormat('2024-Winter')).toBe(false); // invalid season
        expect(validateSeasonFormat('24-Fall')).toBe(false); // short year
        expect(validateSeasonFormat('2024 Fall')).toBe(false); // space instead of dash
        expect(validateSeasonFormat('Fall-2024')).toBe(false); // reversed
        expect(validateSeasonFormat('')).toBe(false); // empty
        expect(validateSeasonFormat('2024')).toBe(false); // year only
      });
    });

    describe('parseSeasonString', () => {
      it('should parse valid season strings', () => {
        expect(parseSeasonString('2024-Fall')).toEqual({ year: 2024, season: 'Fall' });
        expect(parseSeasonString('2024-Spring')).toEqual({ year: 2024, season: 'Spring' });
        expect(parseSeasonString('2024-Summer')).toEqual({ year: 2024, season: 'Summer' });
        expect(parseSeasonString('2025-Fall')).toEqual({ year: 2025, season: 'Fall' });
      });

      it('should return null for invalid season strings', () => {
        expect(parseSeasonString('2024-fall')).toBeNull();
        expect(parseSeasonString('invalid')).toBeNull();
        expect(parseSeasonString('')).toBeNull();
        expect(parseSeasonString('2024-Winter')).toBeNull();
      });
    });

    describe('createSeasonString', () => {
      it('should create valid season strings', () => {
        expect(createSeasonString(2024, 'Fall')).toBe('2024-Fall');
        expect(createSeasonString(2024, 'Spring')).toBe('2024-Spring');
        expect(createSeasonString(2024, 'Summer')).toBe('2024-Summer');
        expect(createSeasonString(2025, 'Fall')).toBe('2025-Fall');
      });
    });

    describe('normalizeSeasonString', () => {
      it('should normalize case-insensitive season strings', () => {
        expect(normalizeSeasonString('2024-fall')).toBe('2024-Fall');
        expect(normalizeSeasonString('2024-SPRING')).toBe('2024-Spring');
        expect(normalizeSeasonString('2024-summer')).toBe('2024-Summer');
        expect(normalizeSeasonString(' 2024-Fall ')).toBe('2024-Fall');
      });

      it('should return null for invalid formats', () => {
        expect(normalizeSeasonString('2024-winter')).toBeNull();
        expect(normalizeSeasonString('invalid')).toBeNull();
        expect(normalizeSeasonString('')).toBeNull();
        expect(normalizeSeasonString('2024 Fall')).toBeNull();
      });
    });

    describe('getAcademicYear', () => {
      it('should return correct academic year for Fall', () => {
        expect(getAcademicYear(new Date(2024, 8, 1))).toBe(2024); // September
        expect(getAcademicYear(new Date(2024, 11, 1))).toBe(2024); // December
      });

      it('should return correct academic year for Spring/Summer', () => {
        expect(getAcademicYear(new Date(2024, 0, 1))).toBe(2024); // January
        expect(getAcademicYear(new Date(2024, 4, 1))).toBe(2024); // May
        expect(getAcademicYear(new Date(2024, 5, 1))).toBe(2024); // June
      });
    });
  });

  describe('edge cases', () => {
    it('should handle year boundaries correctly', () => {
      // New Year's Day should be Spring
      expect(getCurrentSeason(DEFAULT_SEASON_CONFIG, new Date(2024, 0, 1))).toBe('2024-Spring');
      // New Year's Eve should be Fall
      expect(getCurrentSeason(DEFAULT_SEASON_CONFIG, new Date(2024, 11, 31))).toBe('2024-Fall');
    });

    it('should handle leap year dates', () => {
      // February 29 in leap year
      expect(getCurrentSeason(DEFAULT_SEASON_CONFIG, new Date(2024, 1, 29))).toBe('2024-Spring');
    });
  });
});