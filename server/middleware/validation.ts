/**
 * Validation middleware for request data
 *
 * Provides Zod schema validation for request bodies, query params, and route params.
 * Returns standardized error responses for validation failures.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

export type ValidationType = 'body' | 'query' | 'params';

/**
 * Validate request data against a Zod schema
 */
export function validate(schema: ZodSchema, type: ValidationType = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[type];
      const validated = schema.parse(data);

      // Replace request data with validated & sanitized data
      (req as any)[type] = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        logger.warn('Validation failed', {
          path: req.path,
          method: req.method,
          validationType: type,
          errors: validationErrors,
        });

        next(new ValidationError('Validation failed', { errors: validationErrors }));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate multiple request parts at once
 */
export function validateMultiple(schemas: Partial<Record<ValidationType, ZodSchema>>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors: any[] = [];

      for (const [type, schema] of Object.entries(schemas)) {
        if (!schema) continue;

        try {
          const data = req[type as ValidationType];
          const validated = schema.parse(data);
          (req as any)[type] = validated;
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(...error.errors.map(err => ({
              field: `${type}.${err.path.join('.')}`,
              message: err.message,
              code: err.code,
            })));
          } else {
            throw error;
          }
        }
      }

      if (errors.length > 0) {
        logger.warn('Multiple validation failed', {
          path: req.path,
          method: req.method,
          errors,
        });

        next(new ValidationError('Validation failed', { errors }));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Trim whitespace from string inputs recursively
 *
 * Note: This function only trims whitespace. XSS protection is provided by:
 * - Zod schema validation (rejects malicious patterns)
 * - Parameterized database queries (prevents SQL injection)
 * - Content-Security-Policy headers (prevents script injection)
 * - React's automatic escaping (prevents XSS in UI)
 */
export function trimStrings(obj: any): any {
  if (typeof obj === 'string') {
    return obj.trim();
  }

  if (Array.isArray(obj)) {
    return obj.map(trimStrings);
  }

  if (obj !== null && typeof obj === 'object') {
    const trimmed: any = {};
    for (const [key, value] of Object.entries(obj)) {
      trimmed[key] = trimStrings(value);
    }
    return trimmed;
  }

  return obj;
}

/**
 * Legacy alias for backwards compatibility
 * @deprecated Use trimStrings() instead
 */
export const sanitizeStrings = trimStrings;

/**
 * Middleware to trim whitespace from all request data
 */
export function sanitizeRequest(req: Request, res: Response, next: NextFunction) {
  if (req.body) {
    req.body = trimStrings(req.body);
  }
  if (req.query) {
    req.query = trimStrings(req.query);
  }
  if (req.params) {
    req.params = trimStrings(req.params);
  }
  next();
}
