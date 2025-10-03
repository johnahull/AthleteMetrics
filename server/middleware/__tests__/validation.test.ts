/**
 * Tests for validation middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Mock logger to prevent env validation at import time
vi.mock('../../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock env to prevent validation at import time
vi.mock('../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'test',
    SESSION_SECRET: 'test-secret-32-chars-minimum-required',
    ADMIN_USER: 'test',
    ADMIN_PASS: 'test-password',
  },
  isProduction: false,
  isDevelopment: false,
  isTest: true,
}));

import { validate, validateMultiple, trimStrings, sanitizeRequest } from '../validation';
import { ValidationError } from '../../utils/errors';

describe('Validation Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {},
      path: '/test',
      method: 'POST',
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();
  });

  describe('validate()', () => {
    it('should pass validation for valid data', () => {
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().positive(),
      });

      mockReq.body = { name: 'John', age: 25 };

      const middleware = validate(schema, 'body');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockReq.body).toEqual({ name: 'John', age: 25 });
    });

    it('should fail validation for invalid data', () => {
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().positive(),
      });

      mockReq.body = { name: 'Jo', age: -5 }; // Name too short, age negative

      const middleware = validate(schema, 'body');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      const error = (mockNext as any).mock.calls[0][0] as ValidationError;
      expect(error.details).toHaveProperty('errors');
      expect((error.details as any).errors).toHaveLength(2);
    });

    it('should validate query parameters', () => {
      const schema = z.object({
        page: z.coerce.number().int().positive(),
        limit: z.coerce.number().int().positive(),
      });

      mockReq.query = { page: '1', limit: '10' };

      const middleware = validate(schema, 'query');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.query).toEqual({ page: 1, limit: 10 });
    });

    it('should validate route params', () => {
      const schema = z.object({
        id: z.string().uuid(),
      });

      mockReq.params = { id: '123e4567-e89b-12d3-a456-426614174000' };

      const middleware = validate(schema, 'params');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('validateMultiple()', () => {
    it('should validate multiple request parts', () => {
      const schemas = {
        body: z.object({ name: z.string() }),
        query: z.object({ page: z.coerce.number() }),
        params: z.object({ id: z.string().uuid() }),
      };

      mockReq.body = { name: 'Test' };
      mockReq.query = { page: '1' };
      mockReq.params = { id: '123e4567-e89b-12d3-a456-426614174000' };

      const middleware = validateMultiple(schemas);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.body).toEqual({ name: 'Test' });
      expect(mockReq.query).toEqual({ page: 1 });
    });

    it('should collect errors from all parts', () => {
      const schemas = {
        body: z.object({ name: z.string().min(5) }),
        query: z.object({ page: z.coerce.number().positive() }),
      };

      mockReq.body = { name: 'Jo' }; // Too short
      mockReq.query = { page: '0' }; // Not positive

      const middleware = validateMultiple(schemas);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      const error = (mockNext as any).mock.calls[0][0] as ValidationError;
      expect((error.details as any).errors).toHaveLength(2);
    });
  });

  describe('trimStrings()', () => {
    it('should trim whitespace from strings', () => {
      expect(trimStrings('  hello  ')).toBe('hello');
      expect(trimStrings('test')).toBe('test');
    });

    it('should trim strings in objects', () => {
      const input = {
        name: '  John  ',
        email: 'test@example.com  ',
      };

      const output = trimStrings(input);
      expect(output).toEqual({
        name: 'John',
        email: 'test@example.com',
      });
    });

    it('should trim strings in nested objects', () => {
      const input = {
        user: {
          name: '  John  ',
          address: {
            city: '  Boston  ',
          },
        },
      };

      const output = trimStrings(input);
      expect(output.user.name).toBe('John');
      expect(output.user.address.city).toBe('Boston');
    });

    it('should trim strings in arrays', () => {
      const input = ['  apple  ', '  banana  ', '  cherry  '];
      const output = trimStrings(input);
      expect(output).toEqual(['apple', 'banana', 'cherry']);
    });

    it('should preserve non-string values', () => {
      const input = {
        name: '  John  ',
        age: 25,
        active: true,
        score: null,
        data: undefined,
      };

      const output = trimStrings(input);
      expect(output).toEqual({
        name: 'John',
        age: 25,
        active: true,
        score: null,
        data: undefined,
      });
    });
  });

  describe('sanitizeRequest()', () => {
    it('should trim strings in request body', () => {
      mockReq.body = {
        name: '  John  ',
        email: '  test@example.com  ',
      };

      sanitizeRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body).toEqual({
        name: 'John',
        email: 'test@example.com',
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should trim strings in query parameters', () => {
      mockReq.query = {
        search: '  keyword  ',
        filter: '  active  ',
      };

      sanitizeRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.query).toEqual({
        search: 'keyword',
        filter: 'active',
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should trim strings in route params', () => {
      mockReq.params = {
        id: '  123  ',
        slug: '  test-slug  ',
      };

      sanitizeRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.params).toEqual({
        id: '123',
        slug: 'test-slug',
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle missing request parts', () => {
      mockReq.body = undefined;
      mockReq.query = undefined;
      mockReq.params = undefined;

      sanitizeRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
