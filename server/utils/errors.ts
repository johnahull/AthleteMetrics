/**
 * Standardized Error Handling
 * Provides consistent error classes and handling across the application
 */

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { logger } from "./logger";
import { isProduction } from "../config/env";

/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string = "Validation failed", details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication required") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = "Access denied") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  constructor(message: string = "Resource conflict") {
    super(message, 409, "CONFLICT");
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
  constructor(message: string = "Too many requests") {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
  }
}

/**
 * Internal server error (500)
 */
export class InternalError extends AppError {
  constructor(message: string = "Internal server error", details?: unknown) {
    super(message, 500, "INTERNAL_ERROR", details);
  }
}

/**
 * Convert Zod errors to ValidationError
 */
export function fromZodError(error: z.ZodError): ValidationError {
  const messages = error.errors.map((err) => {
    const path = err.path.join('.');
    return `${path}: ${err.message}`;
  });

  return new ValidationError(
    messages.join(', '),
    {
      errors: error.errors,
      issues: messages,
    }
  );
}

/**
 * Send error response
 */
/**
 * Sanitize error object to prevent PII leakage in production
 * Removes stack traces, query details, and user inputs
 */
function sanitizeError(error: any): any {
  if (!isProduction) {
    // In development, return full error details for debugging
    return error;
  }

  // In production, create sanitized error object
  const sanitized: any = {
    name: error?.name || 'Error',
    message: error?.message || 'An error occurred',
  };

  // Remove sensitive fields that might contain PII
  // Do not include: stack, query, sql, params, input, data, details, validation, etc.

  return sanitized;
}

export function sendErrorResponse(
  res: Response,
  error: unknown,
  operation?: string
): void {
  // Sanitize error before logging in production
  const sanitizedError = sanitizeError(error);
  const errorContext: any = { error: sanitizedError };

  if (operation) {
    logger.error(`Error in ${operation}`, errorContext);
  } else {
    logger.error('Error occurred', errorContext);
  }

  // Handle known error types
  if (error instanceof AppError) {
    const response: any = {
      message: error.message,
      code: error.code,
    };
    if (error.details) {
      response.details = error.details;
    }
    res.status(error.statusCode).json(response);
    return;
  }

  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    const validationError = fromZodError(error);
    res.status(validationError.statusCode).json({
      message: validationError.message,
      code: validationError.code,
      details: validationError.details,
    });
    return;
  }

  // Handle generic errors
  if (error instanceof Error) {
    // Don't expose internal error details in production
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error.message;

    res.status(500).json({
      message,
      code: 'INTERNAL_ERROR',
    });
    return;
  }

  // Unknown error type
  res.status(500).json({
    message: 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR',
  });
}

/**
 * Async error handler wrapper
 * Wraps async route handlers to catch errors and pass to error middleware
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error middleware
 * Global error handler for Express
 */
export function errorMiddleware(
  error: unknown,
  req: any,
  res: Response,
  next: any
): void {
  sendErrorResponse(res, error, req.path);
}
