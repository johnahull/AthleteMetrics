/**
 * Boolean utility functions for consistent boolean/string handling
 * The database stores boolean values as strings ("true"/"false") for compatibility
 */

/**
 * Converts a database boolean string to a JavaScript boolean
 * @param value Database boolean value (string "true"/"false" or actual boolean)
 * @returns JavaScript boolean value
 */
export function dbBooleanToBoolean(value: string | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return value === 'true';
}

/**
 * Converts a JavaScript boolean to a database boolean string
 * @param value JavaScript boolean value
 * @returns Database boolean string ("true" or "false")
 */
export function booleanToDbBoolean(value: boolean): "true" | "false" {
  return value ? "true" : "false";
}

/**
 * Type guard to check if a value is a valid database boolean string
 * @param value Value to check
 * @returns True if value is "true" or "false"
 */
export function isDbBoolean(value: unknown): value is "true" | "false" {
  return value === "true" || value === "false";
}

/**
 * Validates and normalizes a boolean value for database storage
 * @param value Mixed boolean value (boolean, string, or undefined)
 * @param defaultValue Default value if input is invalid
 * @returns Normalized database boolean string
 */
export function normalizeDbBoolean(
  value: boolean | string | null | undefined,
  defaultValue: boolean = false
): "true" | "false" {
  if (typeof value === 'boolean') {
    return booleanToDbBoolean(value);
  }
  if (isDbBoolean(value)) {
    return value;
  }
  return booleanToDbBoolean(defaultValue);
}

/**
 * Type definitions for database boolean fields
 */
export type DbBoolean = "true" | "false";

/**
 * Helper type for fields that can be either boolean or string
 */
export type BooleanLike = boolean | string | null | undefined;