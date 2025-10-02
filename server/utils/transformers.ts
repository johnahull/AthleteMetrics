/**
 * Data transformation utilities
 *
 * Provides consistent data transformation patterns for:
 * - Converting between database and API formats
 * - Sanitizing output data
 * - Formatting dates and numbers
 * - Removing sensitive fields
 */

import type { User, Team, Organization, Measurement } from '@shared/schema';

/**
 * Remove sensitive fields from user object
 */
export function sanitizeUser(user: User): Omit<User, 'password' | 'mfaSecret' | 'backupCodes'> {
  const { password, mfaSecret, backupCodes, ...sanitized } = user;
  return sanitized;
}

/**
 * Remove sensitive fields from multiple users
 */
export function sanitizeUsers(users: User[]): Array<Omit<User, 'password' | 'mfaSecret' | 'backupCodes'>> {
  return users.map(sanitizeUser);
}

/**
 * Convert database boolean strings to actual booleans
 */
export function parseDbBooleans<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj };

  for (const [key, value] of Object.entries(result)) {
    if (value === 'true') {
      (result as any)[key] = true;
    } else if (value === 'false') {
      (result as any)[key] = false;
    }
  }

  return result;
}

/**
 * Convert booleans to database boolean strings
 */
export function toDbBooleans<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'boolean') {
      (result as any)[key] = value ? 'true' : 'false';
    }
  }

  return result;
}

/**
 * Format measurement value with appropriate precision
 */
export function formatMeasurementValue(value: string | number, metric: string): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  // Time-based metrics: 3 decimal places
  if (['FLY10_TIME', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD'].includes(metric)) {
    return numValue.toFixed(3);
  }

  // Distance/height metrics: 2 decimal places
  if (['VERTICAL_JUMP'].includes(metric)) {
    return numValue.toFixed(2);
  }

  // RSI: 2 decimal places
  if (metric === 'RSI') {
    return numValue.toFixed(2);
  }

  return numValue.toFixed(2);
}

/**
 * Transform measurement for API response
 */
export function transformMeasurement(measurement: Measurement) {
  return {
    ...measurement,
    value: formatMeasurementValue(measurement.value, measurement.metric),
    flyInDistance: measurement.flyInDistance
      ? formatMeasurementValue(measurement.flyInDistance, 'distance')
      : null,
    isVerified: measurement.isVerified === 'true',
    teamContextAuto: measurement.teamContextAuto === 'true',
  };
}

/**
 * Transform measurements for API response
 */
export function transformMeasurements(measurements: Measurement[]) {
  return measurements.map(transformMeasurement);
}

/**
 * Extract organization context from user
 */
export interface OrganizationContext {
  organizationId: string;
  role: 'org_admin' | 'coach' | 'athlete';
  isSiteAdmin: boolean;
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;

  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) return null;

  return d.toISOString().split('T')[0];
}

/**
 * Calculate age from birth date
 */
export function calculateAge(birthDate: Date | string, referenceDate?: Date | string): number {
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  const reference = referenceDate
    ? (typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate)
    : new Date();

  let age = reference.getFullYear() - birth.getFullYear();
  const monthDiff = reference.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * Extract year from birth date
 */
export function extractBirthYear(birthDate: Date | string | null | undefined): number | null {
  if (!birthDate) return null;

  const date = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;

  if (isNaN(date.getTime())) return null;

  return date.getFullYear();
}

/**
 * Generate full name from first and last name
 */
export function generateFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`;
}

/**
 * Transform team for API response
 */
export function transformTeam(team: Team) {
  return {
    ...team,
    isArchived: team.isArchived === 'true',
  };
}

/**
 * Transform teams for API response
 */
export function transformTeams(teams: Team[]) {
  return teams.map(transformTeam);
}

/**
 * Omit undefined fields from object
 */
export function omitUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Pick only specified fields from object
 */
export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result: any = {};

  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }

  return result;
}

/**
 * Omit specified fields from object
 */
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result: any = { ...obj };

  for (const key of keys) {
    delete result[key];
  }

  return result;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as any;
  }

  const cloned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    cloned[key] = deepClone(value);
  }

  return cloned;
}

/**
 * Group array items by key
 */
export function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string | number
): Record<string | number, T[]> {
  const result: Record<string | number, T[]> = {};

  for (const item of items) {
    const key = keyFn(item);

    if (!result[key]) {
      result[key] = [];
    }

    result[key].push(item);
  }

  return result;
}

/**
 * Create a Map from array using key function
 */
export function keyBy<T>(
  items: T[],
  keyFn: (item: T) => string | number
): Map<string | number, T> {
  const result = new Map<string | number, T>();

  for (const item of items) {
    result.set(keyFn(item), item);
  }

  return result;
}

/**
 * Check if two arrays have the same items (order-independent)
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;

  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  return sortedA.every((val, idx) => val === sortedB[idx]);
}
