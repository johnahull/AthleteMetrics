/**
 * Tests for error handling utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  asyncHandler,
  sendErrorResponse,
  convertZodErrors,
  errorHandler,
} from '../errors';

// Mock logger
vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

// Mock env
vi.mock('../../config/env', () => ({
  isProduction: false,
  isDevelopment: true,
}));

import { logger } from '../logger';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with message and status code', () => {
      const error = new AppError('Test error', 400);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('AppError');
    });

    it('should default to status code 500', () => {
      const error = new AppError('Server error');

      expect(error.statusCode).toBe(500);
    });

    it('should include error code and details', () => {
      const error = new AppError('Test error', 400, 'CUSTOM_ERROR', { field: 'email' });

      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.details).toEqual({ field: 'email' });
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with 422 status', () => {
      const error = new ValidationError('Validation failed');

      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('Validation failed');
    });

    it('should include validation details', () => {
      const details = {
        errors: [
          { field: 'email', message: 'Invalid email' },
          { field: 'password', message: 'Too short' },
        ],
      };

      const error = new ValidationError('Validation failed', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with 404 status', () => {
      const error = new NotFoundError('User');

      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('User');
      expect(error.message).toContain('not found');
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with 401 status', () => {
      const error = new UnauthorizedError();

      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Unauthorized');
    });

    it('should allow custom message', () => {
      const error = new UnauthorizedError('Invalid token');

      expect(error.message).toBe('Invalid token');
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error with 403 status', () => {
      const error = new ForbiddenError();

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Forbidden');
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error with 409 status', () => {
      const error = new ConflictError('Email already exists');

      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Email already exists');
    });
  });
});

describe('asyncHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {};
    mockNext = vi.fn();
  });

  it('should handle successful async function', async () => {
    const handler = asyncHandler(async (req, res, next) => {
      // Successful operation
    });

    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should catch and forward errors to next()', async () => {
    const error = new Error('Test error');
    const handler = asyncHandler(async (req, res, next) => {
      throw error;
    });

    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it('should handle promise rejection', async () => {
    const error = new Error('Rejection');
    const handler = asyncHandler(async (req, res, next) => {
      return Promise.reject(error);
    });

    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it('should handle async operations', async () => {
    let operationCompleted = false;

    const handler = asyncHandler(async (req, res, next) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      operationCompleted = true;
    });

    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(operationCompleted).toBe(true);
  });
});

describe('sendErrorResponse', () => {
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('should send AppError with correct status and message', () => {
    const error = new AppError('Test error', 400, 'BAD_REQUEST');

    sendErrorResponse(mockRes as Response, error);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Test error',
        code: 'BAD_REQUEST',
      })
    );
  });

  it('should include error details when present', () => {
    const error = new ValidationError('Validation failed', {
      errors: [{ field: 'email', message: 'Invalid' }],
    });

    sendErrorResponse(mockRes as Response, error);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        details: {
          errors: [{ field: 'email', message: 'Invalid' }],
        },
      })
    );
  });

  it('should handle Zod validation errors', () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().positive(),
    });

    try {
      schema.parse({ email: 'invalid', age: -5 });
    } catch (zodError) {
      sendErrorResponse(mockRes as Response, zodError);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Validation failed',
        })
      );
    }
  });

  it('should handle generic errors with 500 status', () => {
    const error = new Error('Unexpected error');

    sendErrorResponse(mockRes as Response, error);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Unexpected error',
      })
    );
  });

  it('should log errors', () => {
    const error = new Error('Test error');

    sendErrorResponse(mockRes as Response, error, 'testOperation');

    expect(logger.error).toHaveBeenCalledWith(
      'Error in testOperation',
      expect.any(Object)
    );
  });

  it('should sanitize errors in production', () => {
    // Re-mock env for production
    vi.doMock('../../config/env', () => ({
      isProduction: true,
      isDevelopment: false,
    }));

    const error = new Error('Internal error with sensitive data');
    (error as any).stack = 'Stack trace with sensitive info';
    (error as any).query = 'SELECT * FROM users WHERE password = ?';

    sendErrorResponse(mockRes as Response, error);

    // Should log sanitized error (only name and message, no stack/query)
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        error: expect.objectContaining({
          name: 'Error',
          message: expect.any(String),
        }),
      })
    );

    // Reset mock
    vi.doUnmock('../../config/env');
  });
});

describe('convertZodErrors', () => {
  it('should convert Zod errors to readable format', () => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      age: z.number().positive(),
    });

    try {
      schema.parse({
        email: 'invalid-email',
        password: 'short',
        age: -5,
      });
    } catch (zodError) {
      const errors = convertZodErrors(zodError as z.ZodError);

      expect(errors).toHaveLength(3);
      expect(errors[0]).toHaveProperty('field');
      expect(errors[0]).toHaveProperty('message');
      expect(errors[0]).toHaveProperty('code');
    }
  });

  it('should handle nested field paths', () => {
    const schema = z.object({
      user: z.object({
        profile: z.object({
          name: z.string().min(1),
        }),
      }),
    });

    try {
      schema.parse({
        user: {
          profile: {
            name: '',
          },
        },
      });
    } catch (zodError) {
      const errors = convertZodErrors(zodError as z.ZodError);

      expect(errors[0].field).toBe('user.profile.name');
    }
  });
});

describe('errorHandler middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      path: '/api/test',
      method: 'POST',
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  it('should handle AppError', () => {
    const error = new AppError('Test error', 400);

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Test error',
      })
    );
  });

  it('should handle ValidationError', () => {
    const error = new ValidationError('Validation failed');

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(422);
  });

  it('should handle unknown errors', () => {
    const error = new Error('Unknown error');

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
  });

  it('should log errors', () => {
    const error = new Error('Test');

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(logger.error).toHaveBeenCalled();
  });
});
