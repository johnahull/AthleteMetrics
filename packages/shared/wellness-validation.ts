/**
 * Wellness Questionnaire System - Zod Validation Schemas
 *
 * Provides runtime validation for:
 * - Template configurations
 * - Question definitions
 * - Wellness requests
 * - Response submissions
 * - JSONB structure validation
 */

import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Input Sanitization Helper
 *
 * Uses DOMPurify to remove all HTML tags and dangerous content to prevent XSS attacks.
 * This is a robust sanitization suitable for JSONB text fields.
 *
 * DOMPurify handles:
 * - All HTML tags (including malformed ones)
 * - Event handlers (onclick, onerror, etc.)
 * - JavaScript URLs (javascript:, data:, etc.)
 * - HTML entities that could decode to dangerous content
 * - Case variations and encoding bypasses
 */
function sanitizeString(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [], // Strip all HTML tags
    ALLOWED_ATTR: [], // Strip all attributes
    KEEP_CONTENT: true, // Keep text content
  }).trim();
}

/**
 * Create a sanitized string schema with length validation
 */
function sanitizedString(maxLength?: number) {
  let schema = z.string().transform(sanitizeString);
  if (maxLength) {
    schema = schema.refine(
      (val) => val.length <= maxLength,
      { message: `Text must be ${maxLength} characters or less` }
    ) as any;
  }
  return schema;
}

/**
 * Question Type Schemas
 */

// Scale Question Schema
export const scaleQuestionSchema = z.object({
  id: z.string().min(1, 'Question ID is required'),
  type: z.literal('scale'),
  label: z.string().min(1, 'Question label is required').max(200),
  description: z.string().max(500).optional(),
  scaleMin: z.number().int().min(0).max(100),
  scaleMax: z.number().int().min(1).max(100),
  minLabel: z.string().max(50).optional(),
  maxLabel: z.string().max(50).optional(),
  required: z.boolean(),
}).refine(
  (data) => data.scaleMin < data.scaleMax,
  { message: 'Scale minimum must be less than maximum', path: ['scaleMin'] }
);

// Text Question Schema
export const textQuestionSchema = z.object({
  id: z.string().min(1, 'Question ID is required'),
  type: z.literal('text'),
  label: z.string().min(1, 'Question label is required').max(200),
  description: z.string().max(500).optional(),
  placeholder: z.string().max(200).optional(),
  maxLength: z.number().int().min(1).max(5000).optional(),
  required: z.boolean(),
});

// Boolean Question Schema
export const booleanQuestionSchema = z.object({
  id: z.string().min(1, 'Question ID is required'),
  type: z.literal('boolean'),
  label: z.string().min(1, 'Question label is required').max(200),
  description: z.string().max(500).optional(),
  required: z.boolean(),
});

// Body Map Question Schema
export const bodyMapQuestionSchema = z.object({
  id: z.string().min(1, 'Question ID is required'),
  type: z.literal('body_map'),
  label: z.string().min(1, 'Question label is required').max(200),
  description: z.string().max(500).optional(),
  allowMultiple: z.boolean(),
  required: z.boolean(),
});

// Multiple Choice Question Schema
export const multipleChoiceQuestionSchema = z.object({
  id: z.string().min(1, 'Question ID is required'),
  type: z.literal('multiple_choice'),
  label: z.string().min(1, 'Question label is required').max(200),
  description: z.string().max(500).optional(),
  options: z.array(z.string().min(1).max(200))
    .min(2, 'At least 2 options are required')
    .max(10, 'Maximum 10 options allowed'),
  allowMultiple: z.boolean(),
  required: z.boolean(),
});

// Union of all question types
export const questionConfigSchema = z.union([
  scaleQuestionSchema,
  textQuestionSchema,
  booleanQuestionSchema,
  bodyMapQuestionSchema,
  multipleChoiceQuestionSchema,
]);

/**
 * Template Configuration Schema
 */
export const wellnessTemplateConfigSchema = z.object({
  questions: z.array(questionConfigSchema).min(1, 'At least one question is required').max(50, 'Maximum 50 questions allowed'),
  settings: z.object({
    allowAnonymous: z.boolean().optional(),
    showProgressBar: z.boolean().optional(),
    requireAllQuestions: z.boolean().optional(),
    customThankYouMessage: z.string().max(500).optional(),
  }).optional(),
}).refine(
  (data) => {
    // Ensure question IDs are unique
    const ids = data.questions.map(q => q.id);
    return ids.length === new Set(ids).size;
  },
  { message: 'Question IDs must be unique', path: ['questions'] }
);

/**
 * Template CRUD Schemas
 */

// Create Template
export const createWellnessTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200),
  description: z.string().max(1000).optional(),
  config: wellnessTemplateConfigSchema,
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

// Update Template
export const updateWellnessTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  config: wellnessTemplateConfigSchema.optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/**
 * Request Distribution Schemas
 */

// Distribution Method
export const distributionMethodSchema = z.enum([
  'magic_link',
  'athlete_account',
  'team_link',
  'qr_code',
]);

// Request Status
export const requestStatusSchema = z.enum([
  'active',
  'completed',
  'expired',
  'cancelled',
]);

// Create Request
export const createWellnessRequestSchema = z.object({
  templateId: z.string().uuid('Invalid template ID'),
  distributionMethod: distributionMethodSchema,
  targetAthleteIds: z.array(z.string().uuid()).optional(),
  targetTeamIds: z.array(z.string().uuid()).optional(),
  requiresAuth: z.boolean().default(false),
  scheduledFor: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
}).refine(
  (data) => {
    // For magic_link and qr_code, at least one target must be specified
    if (data.distributionMethod === 'magic_link' || data.distributionMethod === 'qr_code') {
      return (
        (data.targetAthleteIds && data.targetAthleteIds.length > 0) ||
        (data.targetTeamIds && data.targetTeamIds.length > 0)
      );
    }
    return true;
  },
  {
    message: 'Magic links and QR codes require at least one target athlete or team',
    path: ['targetAthleteIds'],
  }
).refine(
  (data) => {
    // expiresAt must be in the future
    if (data.expiresAt) {
      return data.expiresAt > new Date();
    }
    return true;
  },
  {
    message: 'Expiration date must be in the future',
    path: ['expiresAt'],
  }
).refine(
  (data) => {
    // scheduledFor must be before expiresAt
    if (data.scheduledFor && data.expiresAt) {
      return data.scheduledFor <= data.expiresAt;
    }
    return true;
  },
  {
    message: 'Scheduled date must be before expiration date',
    path: ['scheduledFor'],
  }
);

// Update Request
export const updateWellnessRequestSchema = z.object({
  status: requestStatusSchema.optional(),
  expiresAt: z.coerce.date().optional(),
});

/**
 * Response Submission Schemas
 */

// Response value based on question type
export const responseValueSchema = z.union([
  z.number(), // Scale
  sanitizedString(5000), // Text or single-select multiple choice - sanitized to prevent XSS
  z.boolean(), // Boolean
  z.array(z.string()), // Multi-select multiple choice
  z.array(z.object({ // Body map
    x: z.number().min(0).max(1), // Percentage coordinates (0-1)
    y: z.number().min(0).max(1),
    label: sanitizedString(100).optional(), // Sanitized body part labels
  })),
]);

// Response data structure
export const responseDataSchema = z.record(
  z.string(), // Question ID
  z.object({
    value: responseValueSchema,
    label: z.string().max(200), // Question label snapshot
  })
);

// Submit Response
export const submitWellnessResponseSchema = z.object({
  requestId: z.string().uuid().optional(),
  templateId: z.string().uuid('Invalid template ID'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  responses: responseDataSchema,
  accessMethod: z.string().max(50).optional(),
  athleteName: sanitizedString(200).optional(), // For magic link submissions - sanitized to prevent XSS
  token: z.string().optional(), // Magic link token (also available in URL params)
  athlete: z.string().uuid().optional(), // Athlete ID for middleware (required for magic link access)
  selectedAthleteId: z.string().uuid().optional(), // Athlete selected from dropdown
}).refine(
  (data) => {
    // Date cannot be in the future
    // Parse date string as midnight UTC to avoid timezone issues
    const submissionDate = new Date(data.date + 'T00:00:00Z');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return submissionDate <= today;
  },
  {
    message: 'Response date cannot be in the future',
    path: ['date'],
  }
);

/**
 * Dynamic Response Validation Generator
 *
 * Generates a Zod schema based on template configuration
 * to validate that responses match the expected question structure
 */
export function generateResponseValidationSchema(
  templateConfig: z.infer<typeof wellnessTemplateConfigSchema>
) {
  const questionSchemas: Record<string, z.ZodTypeAny> = {};

  for (const question of templateConfig.questions) {
    let valueSchema: z.ZodTypeAny | undefined;

    switch (question.type) {
      case 'scale': {
        valueSchema = z.number()
          .min(question.scaleMin, `Value must be >= ${question.scaleMin}`)
          .max(question.scaleMax, `Value must be <= ${question.scaleMax}`);
        break;
      }

      case 'text': {
        // Use sanitized string to prevent XSS attacks
        let textSchema = sanitizedString(question.maxLength || 5000);
        if (question.required) {
          textSchema = textSchema.refine(
            (val) => val.length >= 1,
            { message: 'This field is required' }
          ) as any;
        }
        valueSchema = textSchema;
        break;
      }

      case 'boolean': {
        valueSchema = z.boolean();
        break;
      }

      case 'body_map': {
        let bodyMapSchema = z.array(z.object({
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          // Sanitize body part labels to prevent XSS
          label: sanitizedString(100).optional(),
        }));
        if (question.required) {
          bodyMapSchema = bodyMapSchema.min(1, 'At least one point is required');
        }
        valueSchema = bodyMapSchema;
        break;
      }

      case 'multiple_choice': {
        if (question.allowMultiple) {
          // Multi-select: array of strings
          let multiSelectSchema = z.array(z.string().refine(
            (val) => question.options.includes(val),
            { message: 'Invalid option selected' }
          ));
          if (question.required) {
            multiSelectSchema = multiSelectSchema.min(1, 'At least one option is required');
          }
          valueSchema = multiSelectSchema;
        } else {
          // Single-select: string
          if (question.required) {
            valueSchema = z.string().min(1, 'This field is required').refine(
              (val) => question.options.includes(val),
              { message: 'Invalid option selected' }
            );
          } else {
            valueSchema = z.string().refine(
              (val) => question.options.includes(val),
              { message: 'Invalid option selected' }
            );
          }
        }
        break;
      }
    }

    if (valueSchema) {
      questionSchemas[question.id] = z.object({
        value: valueSchema,
        label: z.string(),
      });
    }
  }

  // Create schema that requires all required questions
  const requiredQuestionIds = templateConfig.questions
    .filter(q => q.required)
    .map(q => q.id);

  return z.object(questionSchemas).refine(
    (data) => {
      // Check all required questions are answered
      return requiredQuestionIds.every(id => id in data);
    },
    {
      message: 'All required questions must be answered',
      path: [],
    }
  );
}

/**
 * Analytics Filter Schemas
 */

export const wellnessAnalyticsFilterSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teamIds: z.array(z.string().uuid()).optional(),
  athleteIds: z.array(z.string().uuid()).optional(),
  questionIds: z.array(z.string()).optional(),
}).refine(
  (data) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    return start <= end;
  },
  {
    message: 'Start date must be before or equal to end date',
    path: ['startDate'],
  }
);

/**
 * Export Types
 */

export type CreateWellnessTemplate = z.infer<typeof createWellnessTemplateSchema>;
export type UpdateWellnessTemplate = z.infer<typeof updateWellnessTemplateSchema>;
export type WellnessTemplateConfig = z.infer<typeof wellnessTemplateConfigSchema>;

export type CreateWellnessRequest = z.infer<typeof createWellnessRequestSchema>;
export type UpdateWellnessRequest = z.infer<typeof updateWellnessRequestSchema>;

export type SubmitWellnessResponse = z.infer<typeof submitWellnessResponseSchema>;
export type ResponseData = z.infer<typeof responseDataSchema>;

export type WellnessAnalyticsFilter = z.infer<typeof wellnessAnalyticsFilterSchema>;
