/**
 * User-scoped localStorage wrapper for athlete organization filter persistence
 * Provides type-safe storage with error handling for quota and disabled localStorage
 */

/** Storage key prefix for athlete organization filter - exported for testing/reference */
export const ATHLETE_ORG_FILTER_STORAGE_KEY = 'athlete-org-filter' as const;

/**
 * Generate user-scoped storage key
 */
function getScopedKey(userId: string): string {
  return `${ATHLETE_ORG_FILTER_STORAGE_KEY}-${userId}`;
}

/**
 * Retrieve organization filter from localStorage
 * @param userId - User ID to scope the storage
 * @returns Filter mode ('all', 'personal', or org ID), defaults to 'all'
 */
export function getAthleteOrgFilter(userId: string | undefined): string {
  if (!userId) {
    return 'all';
  }

  try {
    const scopedKey = getScopedKey(userId);
    const item = localStorage.getItem(scopedKey);

    if (item === null) {
      return 'all';
    }

    return JSON.parse(item) as string;
  } catch (error) {
    // Handle JSON parse errors, disabled localStorage, etc.
    if (error instanceof SyntaxError) {
      console.warn('Failed to parse stored athlete org filter, returning default');
    } else if (error instanceof Error) {
      console.warn('localStorage.getItem failed:', error.message);
    }
    return 'all';
  }
}

/**
 * Store organization filter to localStorage
 * @param userId - User ID to scope the storage
 * @param mode - Filter mode to store ('all', 'personal', or org ID)
 */
export function setAthleteOrgFilter(userId: string, mode: string): void {
  try {
    const scopedKey = getScopedKey(userId);
    const serialized = JSON.stringify(mode);
    localStorage.setItem(scopedKey, serialized);
  } catch (error) {
    // Handle QuotaExceededError, disabled localStorage, private browsing, etc.
    // Fail silently to prevent breaking the app
    if (error instanceof DOMException) {
      console.warn('localStorage.setItem failed:', error.message);
    } else if (error instanceof Error) {
      console.warn('Failed to serialize or store athlete org filter:', error.message);
    }
  }
}

/**
 * Remove organization filter from localStorage
 * @param userId - User ID to scope the storage
 */
export function clearAthleteOrgFilter(userId: string): void {
  try {
    const scopedKey = getScopedKey(userId);
    localStorage.removeItem(scopedKey);
  } catch (error) {
    // Fail silently
    if (error instanceof Error) {
      console.warn('localStorage.removeItem failed:', error.message);
    }
  }
}
