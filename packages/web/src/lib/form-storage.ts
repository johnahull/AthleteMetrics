/**
 * User-scoped localStorage wrapper for measurement form state persistence
 * Provides type-safe storage with error handling for quota and disabled localStorage
 *
 * Note: This utility stores a single MeasurementFormState object per user.
 * The 'key' parameter in methods is maintained for API consistency but
 * currently all operations use the same scoped key.
 */

export interface MeasurementFormState {
  lastMetric: string | null;
  lastDate: string | null;
  lastTeamId: string | null;
}

export class FormStorage {
  private userId: string;
  private storagePrefix = 'measurement-form-state';

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Generate user-scoped storage key
   * Note: Currently ignores the key parameter and returns a single scoped key per user
   */
  getScopedKey(key: string): string {
    return `${this.storagePrefix}-${this.userId}`;
  }

  /**
   * Store value in localStorage with user scoping
   */
  set<T>(key: string, value: T): void {
    try {
      const scopedKey = this.getScopedKey(key);
      const serialized = JSON.stringify(value);
      localStorage.setItem(scopedKey, serialized);
    } catch (error) {
      // Handle QuotaExceededError, disabled localStorage, private browsing, etc.
      // Fail silently to prevent breaking the app
      if (error instanceof DOMException) {
        console.warn('localStorage.setItem failed:', error.message);
      } else if (error instanceof Error) {
        console.warn('Failed to serialize or store value:', error.message);
      }
    }
  }

  /**
   * Retrieve value from localStorage with user scoping
   */
  get<T>(key: string, defaultValue: T | null = null): T | null {
    try {
      const scopedKey = this.getScopedKey(key);
      const item = localStorage.getItem(scopedKey);

      if (item === null) {
        return defaultValue;
      }

      return JSON.parse(item) as T;
    } catch (error) {
      // Handle JSON parse errors, disabled localStorage, etc.
      if (error instanceof SyntaxError) {
        console.warn('Failed to parse stored value, returning default');
      } else if (error instanceof Error) {
        console.warn('localStorage.getItem failed:', error.message);
      }
      return defaultValue;
    }
  }

  /**
   * Remove specific key from localStorage
   */
  remove(key: string): void {
    try {
      const scopedKey = this.getScopedKey(key);
      localStorage.removeItem(scopedKey);
    } catch (error) {
      // Fail silently
      if (error instanceof Error) {
        console.warn('localStorage.removeItem failed:', error.message);
      }
    }
  }

  /**
   * Clear all user-scoped keys
   */
  clearAll(): void {
    try {
      const scopedKey = this.getScopedKey(''); // Gets base key

      // Remove all keys that start with user-scoped prefix
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(scopedKey)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      // Fail silently
      if (error instanceof Error) {
        console.warn('Failed to clear user storage:', error.message);
      }
    }
  }
}

/**
 * Helper function to clear form storage for a specific user (useful for logout)
 */
export function clearFormStorageForUser(userId: string): void {
  const storage = new FormStorage(userId);
  storage.clearAll();
}
