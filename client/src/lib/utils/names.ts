/**
 * Utility functions for handling athlete names
 */

/**
 * Extract the last name from a full name string
 * @param fullName - The full name (e.g., "John Michael Smith")
 * @returns The last name (e.g., "Smith")
 */
export function extractLastName(fullName: string): string {
  if (!fullName || typeof fullName !== 'string') {
    return '';
  }

  const nameParts = fullName.trim().split(' ').filter(part => part.length > 0);
  return nameParts.length > 0 ? nameParts[nameParts.length - 1] : '';
}

/**
 * Sort athletes by last name, then by first name as tiebreaker
 * @param athletes - Array of athletes with name property
 * @param nameProperty - Property name that contains the full name (default: 'name')
 * @returns Sorted array of athletes
 */
export function sortAthletesByLastName<T extends Record<string, any>>(
  athletes: T[],
  nameProperty: keyof T = 'name'
): T[] {
  return [...athletes].sort((a, b) => {
    const nameA = String(a[nameProperty] || '');
    const nameB = String(b[nameProperty] || '');

    const lastNameA = extractLastName(nameA);
    const lastNameB = extractLastName(nameB);

    // Primary sort: by last name
    if (lastNameA !== lastNameB) {
      return lastNameA.localeCompare(lastNameB, undefined, { sensitivity: 'base' });
    }

    // Tiebreaker: by full name
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  });
}

/**
 * Filter athletes by search term, checking both first and last names
 * @param athletes - Array of athletes
 * @param searchTerm - Search string
 * @param nameProperty - Property name that contains the full name
 * @returns Filtered array of athletes
 */
export function filterAthletesByName<T extends Record<string, any>>(
  athletes: T[],
  searchTerm: string,
  nameProperty: keyof T = 'name'
): T[] {
  if (!searchTerm || searchTerm.trim() === '') {
    return athletes;
  }

  const searchLower = searchTerm.toLowerCase().trim();

  return athletes.filter(athlete => {
    const fullName = String(athlete[nameProperty] || '').toLowerCase();
    const teamName = String(athlete.teamName || '').toLowerCase();

    // Search in full name or team name
    return fullName.includes(searchLower) || teamName.includes(searchLower);
  });
}