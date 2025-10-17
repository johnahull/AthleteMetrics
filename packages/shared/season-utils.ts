/**
 * Season calculation utilities for athletic programs
 * Provides consistent season naming across the application
 */

export interface SeasonConfig {
  /** Fall season starts in August */
  fallStartMonth: number;
  /** Fall season ends in December */
  fallEndMonth: number;
  /** Spring season starts in January */
  springStartMonth: number;
  /** Spring season ends in May */
  springEndMonth: number;
  /** Summer season covers remaining months */
  summerStartMonth: number;
  summerEndMonth: number;
}

/**
 * Default season configuration for standard athletic calendar
 * Based on common North American academic/athletic year:
 * - Fall: August-December (football, soccer, cross country)
 * - Spring: January-May (basketball, baseball, track & field)  
 * - Summer: June-July (summer programs, off-season training)
 */
export const DEFAULT_SEASON_CONFIG: SeasonConfig = {
  fallStartMonth: 8,    // August
  fallEndMonth: 12,     // December
  springStartMonth: 1,  // January
  springEndMonth: 5,    // May
  summerStartMonth: 6,  // June
  summerEndMonth: 7,    // July
};

/**
 * Gets the current season based on the current date and configuration
 * @param config Season configuration (defaults to standard athletic calendar)
 * @param date Optional date to calculate season for (defaults to current date)
 * @returns Season string in format "YYYY-Season" (e.g., "2024-Fall")
 */
export function getCurrentSeason(
  config: SeasonConfig = DEFAULT_SEASON_CONFIG,
  date: Date = new Date()
): string {
  const month = date.getMonth() + 1; // JavaScript months are 0-indexed
  const year = date.getFullYear();
  
  // Validate configuration
  if (config.fallStartMonth < 1 || config.fallStartMonth > 12 ||
      config.springStartMonth < 1 || config.springStartMonth > 12 ||
      config.summerStartMonth < 1 || config.summerStartMonth > 12) {
    throw new Error('Invalid season configuration: months must be between 1 and 12');
  }
  
  // Determine season based on month ranges
  if (month >= config.fallStartMonth && month <= config.fallEndMonth) {
    return `${year}-Fall`;
  } else if (month >= config.springStartMonth && month <= config.springEndMonth) {
    return `${year}-Spring`;
  } else if (month >= config.summerStartMonth && month <= config.summerEndMonth) {
    return `${year}-Summer`;
  } else {
    // This should not happen with valid configuration, but provide fallback
    throw new Error(`Date ${date.toISOString()} does not fall within any configured season`);
  }
}

/**
 * Gets the season for a specific date
 * @param date The date to get season for
 * @param config Season configuration (defaults to standard athletic calendar)
 * @returns Season string in format "YYYY-Season"
 */
export function getSeasonForDate(
  date: Date,
  config: SeasonConfig = DEFAULT_SEASON_CONFIG
): string {
  return getCurrentSeason(config, date);
}

/**
 * Validates that a season configuration covers all 12 months without gaps or overlaps
 * @param config Season configuration to validate
 * @returns true if valid, throws error if invalid
 */
export function validateSeasonConfig(config: SeasonConfig): boolean {
  const months = new Set<number>();
  
  // Add fall months
  for (let month = config.fallStartMonth; month <= config.fallEndMonth; month++) {
    if (months.has(month)) {
      throw new Error(`Month ${month} is assigned to multiple seasons`);
    }
    months.add(month);
  }
  
  // Add spring months
  for (let month = config.springStartMonth; month <= config.springEndMonth; month++) {
    if (months.has(month)) {
      throw new Error(`Month ${month} is assigned to multiple seasons`);
    }
    months.add(month);
  }
  
  // Add summer months
  for (let month = config.summerStartMonth; month <= config.summerEndMonth; month++) {
    if (months.has(month)) {
      throw new Error(`Month ${month} is assigned to multiple seasons`);
    }
    months.add(month);
  }
  
  // Check that all 12 months are covered
  for (let month = 1; month <= 12; month++) {
    if (!months.has(month)) {
      throw new Error(`Month ${month} is not assigned to any season`);
    }
  }
  
  return true;
}

/**
 * Gets all possible seasons for a given year
 * @param year The year to get seasons for
 * @returns Array of season strings for the year
 */
export function getSeasonsForYear(year: number): string[] {
  return [
    `${year}-Fall`,
    `${year}-Spring`, 
    `${year}-Summer`
  ];
}

/**
 * Regular expression for validating season format
 * Matches: YYYY-Season where Season is Fall, Spring, or Summer
 */
export const SEASON_FORMAT_REGEX = /^\d{4}-(Fall|Spring|Summer)$/;

/**
 * Validates a season string format
 * @param season Season string to validate (e.g., "2024-Fall")
 * @returns true if season format is valid
 */
export function validateSeasonFormat(season: string): boolean {
  return SEASON_FORMAT_REGEX.test(season);
}

/**
 * Parses a season string into year and season components
 * @param season Season string to parse (e.g., "2024-Fall")
 * @returns Object with year and season, or null if invalid
 */
export function parseSeasonString(season: string): { year: number; season: 'Fall' | 'Spring' | 'Summer' } | null {
  const match = season.match(SEASON_FORMAT_REGEX);
  if (!match) {
    return null;
  }
  
  const year = parseInt(match[0].split('-')[0], 10);
  const seasonName = match[1] as 'Fall' | 'Spring' | 'Summer';
  
  return { year, season: seasonName };
}

/**
 * Creates a season string from year and season components
 * @param year The year
 * @param season The season name
 * @returns Formatted season string
 */
export function createSeasonString(year: number, season: 'Fall' | 'Spring' | 'Summer'): string {
  return `${year}-${season}`;
}

/**
 * Gets the current academic year based on a date
 * Academic year typically runs from Fall to Summer (e.g., 2024-Fall to 2025-Summer)
 * @param date Date to get academic year for (defaults to current date)
 * @param config Season configuration
 * @returns Academic year
 */
export function getAcademicYear(
  date: Date = new Date(),
  config: SeasonConfig = DEFAULT_SEASON_CONFIG
): number {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  
  // If we're in Fall semester, this is the start of the academic year
  if (month >= config.fallStartMonth && month <= config.fallEndMonth) {
    return year;
  }
  
  // If we're in Spring or Summer, we're in the academic year that started last Fall
  return year;
}

/**
 * Normalizes season strings to ensure consistent formatting
 * @param season Input season string (case-insensitive)
 * @returns Normalized season string or null if invalid
 */
export function normalizeSeasonString(season: string): string | null {
  // Trim whitespace and convert to proper case
  const trimmed = season.trim();
  
  // Handle various formats
  const normalized = trimmed
    .replace(/fall/i, 'Fall')
    .replace(/spring/i, 'Spring')
    .replace(/summer/i, 'Summer');
  
  // Validate the normalized string
  if (validateSeasonFormat(normalized)) {
    return normalized;
  }
  
  return null;
}

/**
 * Type for valid season names
 */
export type SeasonName = 'Fall' | 'Spring' | 'Summer';