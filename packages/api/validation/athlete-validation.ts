/**
 * Zod validation schemas for athlete API endpoints
 */
import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Schema for athlete list query parameters
 * Used by GET /api/athletes endpoint
 */
export const athleteQuerySchema = z.object({
  // teamId can be a valid UUID or 'none' for independent athletes (no team)
  teamId: z
    .string()
    .refine(
      (val) => val === 'none' || UUID_REGEX.test(val),
      'Team ID must be a valid UUID or "none"'
    )
    .optional(),

  organizationId: z
    .string()
    .regex(UUID_REGEX, 'Organization ID must be a valid UUID')
    .optional(),

  birthYearFrom: z
    .string()
    .regex(/^\d{4}$/, 'Birth year from must be a 4-digit year')
    .transform(val => parseInt(val, 10))
    .pipe(
      z.number()
        .int()
        .min(1900, 'Birth year from must be >= 1900')
        .max(new Date().getFullYear(), 'Birth year from cannot be in the future')
    )
    .optional(),

  birthYearTo: z
    .string()
    .regex(/^\d{4}$/, 'Birth year to must be a 4-digit year')
    .transform(val => parseInt(val, 10))
    .pipe(
      z.number()
        .int()
        .min(1900, 'Birth year to must be >= 1900')
        .max(new Date().getFullYear(), 'Birth year to cannot be in the future')
    )
    .optional(),

  search: z
    .string()
    .max(100, 'Search query must be less than 100 characters')
    .optional(),

  gender: z
    .enum(['Male', 'Female', 'Not Specified'])
    .optional(),

  includeUnknownBirthYear: z
    .string()
    .optional()
    .default('false')
    .transform(val => val === 'true'),
}).refine(
  (data) => {
    // Cross-field validation: birthYearFrom must be <= birthYearTo
    if (data.birthYearFrom !== undefined && data.birthYearTo !== undefined) {
      return data.birthYearFrom <= data.birthYearTo;
    }
    return true;
  },
  {
    message: 'Birth year from must be less than or equal to birth year to',
    path: ['birthYearFrom']
  }
);

/**
 * Type inferred from the schema (after transformation)
 */
export type AthleteQueryParams = z.infer<typeof athleteQuerySchema>;
