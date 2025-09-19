import { z } from 'zod';

// Allowed metric types
const ALLOWED_METRICS = [
  'FLY10_TIME',
  'VERTICAL_JUMP',
  'AGILITY_505',
  'AGILITY_5105',
  'T_TEST',
  'DASH_40YD',
  'RSI'
] as const;

// Allowed analysis types
const ALLOWED_ANALYSIS_TYPES = [
  'individual',
  'inter_group',
  'intra_group'
] as const;

// Allowed timeframe types (matching existing types)
const ALLOWED_TIMEFRAME_TYPES = [
  'best',
  'trends'
] as const;

// Allowed timeframe periods
const ALLOWED_TIMEFRAME_PERIODS = [
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_year',
  'all_time',
  'custom'
] as const;

// Allowed gender values (matching existing database schema)
const ALLOWED_GENDERS = ['Male', 'Female', 'Not Specified'] as const;

// UUID validation pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Analytics filters schema
const analyticsFiltersSchema = z.object({
  organizationId: z
    .string()
    .min(1, 'Organization ID is required')
    .regex(UUID_REGEX, 'Organization ID must be a valid UUID'),

  teams: z
    .array(z.string().regex(UUID_REGEX, 'Team ID must be a valid UUID'))
    .optional()
    .default([]),

  genders: z
    .array(z.enum(ALLOWED_GENDERS))
    .optional()
    .default([]),

  birthYearFrom: z
    .number()
    .int()
    .min(1900, 'Birth year from must be >= 1900')
    .max(new Date().getFullYear(), 'Birth year from cannot be in the future')
    .optional(),

  birthYearTo: z
    .number()
    .int()
    .min(1900, 'Birth year to must be >= 1900')
    .max(new Date().getFullYear(), 'Birth year to cannot be in the future')
    .optional(),

  athleteId: z
    .string()
    .regex(UUID_REGEX, 'Athlete ID must be a valid UUID')
    .optional()
}).refine(
  (data) => {
    // Birth year range validation
    if (data.birthYearFrom && data.birthYearTo) {
      return data.birthYearFrom <= data.birthYearTo;
    }
    return true;
  },
  {
    message: 'Birth year from must be less than or equal to birth year to',
    path: ['birthYearFrom']
  }
);

// Metrics selection schema
const metricsSelectionSchema = z.object({
  primary: z
    .enum(ALLOWED_METRICS, {
      errorMap: () => ({ message: `Primary metric must be one of: ${ALLOWED_METRICS.join(', ')}` })
    }),

  additional: z
    .array(z.enum(ALLOWED_METRICS))
    .optional()
    .default([])
}).refine(
  (data) => {
    // Ensure primary metric is not in additional metrics
    if (data.additional.includes(data.primary)) {
      return false;
    }
    // Limit additional metrics to prevent performance issues
    return data.additional.length <= 3;
  },
  {
    message: 'Additional metrics cannot include primary metric and must be 3 or fewer',
    path: ['additional']
  }
);

// Timeframe configuration schema
const timeframeConfigSchema = z.object({
  type: z.enum(ALLOWED_TIMEFRAME_TYPES, {
    errorMap: () => ({ message: `Timeframe type must be one of: ${ALLOWED_TIMEFRAME_TYPES.join(', ')}` })
  }),

  period: z.enum(ALLOWED_TIMEFRAME_PERIODS, {
    errorMap: () => ({ message: `Timeframe period must be one of: ${ALLOWED_TIMEFRAME_PERIODS.join(', ')}` })
  }),

  startDate: z
    .string()
    .datetime()
    .optional()
    .transform((val) => val ? new Date(val) : undefined),

  endDate: z
    .string()
    .datetime()
    .optional()
    .transform((val) => val ? new Date(val) : undefined)
}).refine(
  (data) => {
    // Date range validation
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  {
    message: 'Start date must be before or equal to end date',
    path: ['startDate']
  }
);

// Main analytics request schema
export const analyticsRequestSchema = z.object({
  analysisType: z.enum(ALLOWED_ANALYSIS_TYPES, {
    errorMap: () => ({ message: `Analysis type must be one of: ${ALLOWED_ANALYSIS_TYPES.join(', ')}` })
  }),

  filters: analyticsFiltersSchema,
  metrics: metricsSelectionSchema,
  timeframe: timeframeConfigSchema,

  athleteId: z
    .string()
    .regex(UUID_REGEX, 'Athlete ID must be a valid UUID')
    .optional()
}).refine(
  (data) => {
    // Individual analysis requires athlete ID
    if (data.analysisType === 'individual' && !data.athleteId && !data.filters.athleteId) {
      return false;
    }
    return true;
  },
  {
    message: 'Individual analysis requires an athlete ID',
    path: ['athleteId']
  }
);

// Type exports
export type AnalyticsRequestInput = z.input<typeof analyticsRequestSchema>;
export type AnalyticsRequest = z.output<typeof analyticsRequestSchema>;

// Validation helper function
export function validateAnalyticsRequest(data: unknown): {
  success: boolean;
  data?: AnalyticsRequest;
  errors?: string[];
} {
  try {
    const result = analyticsRequestSchema.safeParse(data);

    if (result.success) {
      return {
        success: true,
        data: result.data
      };
    } else {
      return {
        success: false,
        errors: result.error.issues.map(issue =>
          `${issue.path.join('.')}: ${issue.message}`
        )
      };
    }
  } catch (error) {
    return {
      success: false,
      errors: ['Invalid request format']
    };
  }
}

// Constants export for reuse
export {
  ALLOWED_METRICS,
  ALLOWED_ANALYSIS_TYPES,
  ALLOWED_TIMEFRAME_TYPES,
  ALLOWED_TIMEFRAME_PERIODS,
  ALLOWED_GENDERS,
  UUID_REGEX
};