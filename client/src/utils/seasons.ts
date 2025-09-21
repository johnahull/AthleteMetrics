import { getCurrentSeason, getSeasonsForYear, createSeasonString, type SeasonName } from '@shared/season-utils';

/**
 * Gets available seasons for filtering and selection
 * Generates current season plus surrounding seasons for flexibility
 * @param yearsBack Number of years back to include (default: 1)
 * @param yearsForward Number of years forward to include (default: 1)
 * @returns Array of season strings for dropdowns
 */
export function getAvailableSeasons(yearsBack: number = 1, yearsForward: number = 1): string[] {
  const currentYear = new Date().getFullYear();
  const seasons: string[] = [];

  // Generate seasons for the range of years
  for (let year = currentYear - yearsBack; year <= currentYear + yearsForward; year++) {
    seasons.push(...getSeasonsForYear(year));
  }

  // Sort seasons chronologically (most recent first)
  return seasons.sort((a, b) => {
    const [yearA, seasonA] = a.split('-');
    const [yearB, seasonB] = b.split('-');

    // First sort by year (descending)
    if (yearA !== yearB) {
      return parseInt(yearB) - parseInt(yearA);
    }

    // Then sort by season within the year (Fall > Summer > Spring)
    const seasonOrder: Record<string, number> = { Fall: 3, Summer: 2, Spring: 1 };
    return seasonOrder[seasonB] - seasonOrder[seasonA];
  });
}

/**
 * Gets the current season for default selection
 * @returns Current season string
 */
export function getCurrentSeasonString(): string {
  return getCurrentSeason();
}

/**
 * Formats a season string for display (e.g., "2024-Fall" -> "2024 Fall")
 * @param season Season string in format "YYYY-Season"
 * @returns Formatted display string
 */
export function formatSeasonForDisplay(season: string): string {
  return season.replace('-', ' ');
}