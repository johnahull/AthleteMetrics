import { z } from "zod";

/**
 * Robust UUID validation utility
 * Replaces inline regex patterns with a centralized, well-tested validation
 */

// Zod schema for UUID validation - more robust than regex
export const uuidSchema = z.string().uuid("Invalid UUID format");

/**
 * Validates a single UUID string
 * @param value - The string to validate as UUID
 * @returns boolean indicating if the value is a valid UUID
 */
export function isValidUuid(value: string): boolean {
  try {
    uuidSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an array of UUID strings
 * @param values - Array of strings to validate as UUIDs
 * @returns object with valid UUIDs and invalid values
 */
export function validateUuids(values: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const value of values) {
    if (isValidUuid(value)) {
      valid.push(value);
    } else {
      invalid.push(value);
    }
  }

  return { valid, invalid };
}

/**
 * Validates and throws if UUID is invalid
 * @param value - The string to validate as UUID
 * @param fieldName - Name of the field for error messaging
 * @throws Error if UUID is invalid
 */
export function validateUuidOrThrow(value: string, fieldName: string = "ID"): void {
  if (!isValidUuid(value)) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID`);
  }
}

/**
 * Validates multiple UUIDs and throws if any are invalid
 * @param values - Array of strings to validate as UUIDs
 * @param fieldName - Name of the field for error messaging
 * @throws Error if any UUIDs are invalid
 */
export function validateUuidsOrThrow(values: string[], fieldName: string = "IDs"): void {
  const { invalid } = validateUuids(values);
  if (invalid.length > 0) {
    throw new Error(`Invalid ${fieldName}: ${invalid.join(", ")} are not valid UUIDs`);
  }
}

/**
 * Middleware-friendly UUID validation
 * @param req - Express request object
 * @param res - Express response object
 * @param paramNames - Array of parameter names to validate as UUIDs
 * @returns boolean indicating if all parameters are valid UUIDs
 */
export function validateUuidParams(req: any, res: any, paramNames: string[]): boolean {
  for (const paramName of paramNames) {
    const value = req.params[paramName];
    if (!value || !isValidUuid(value)) {
      res.status(400).json({
        message: `Invalid ${paramName}: must be a valid UUID`,
        field: paramName
      });
      return false;
    }
  }
  return true;
}