/**
 * Tests for database helper utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  withTransaction,
  executeQuery,
  getOneOrFail,
  batchInsert,
  retryOnTransientError,
  parseJsonField,
  QueryPatterns,
} from '../db-helpers';
import { NotFoundError } from '../errors';

// Mock db
vi.mock('../../db', () => ({
  db: {
    transaction: vi.fn(),
    execute: vi.fn(),
  },
}));

// Mock logger
vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logQuery: vi.fn(),
  },
}));

// Mock env
vi.mock('../../config/env', () => ({
  env: {
    SLOW_QUERY_THRESHOLD_MS: 1000,
  },
}));

import { db } from '../../db';
import { logger } from '../logger';

describe('Database Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('withTransaction()', () => {
    it('should execute operation within transaction', async () => {
      const mockResult = { id: '123', name: 'Test' };
      const operation = vi.fn().mockResolvedValue(mockResult);

      (db.transaction as any).mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withTransaction(operation);

      expect(db.transaction).toHaveBeenCalled();
      expect(operation).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });

    it('should log transaction duration', async () => {
      const operation = vi.fn().mockResolvedValue({});

      (db.transaction as any).mockImplementation(async (fn: any) => {
        return await fn({});
      });

      await withTransaction(operation);

      expect(logger.debug).toHaveBeenCalledWith(
        'Transaction completed',
        expect.objectContaining({ duration: expect.any(Number) })
      );
    });

    it('should log errors and re-throw', async () => {
      const error = new Error('Transaction failed');
      const operation = vi.fn().mockRejectedValue(error);

      (db.transaction as any).mockImplementation(async (fn: any) => {
        return await fn({});
      });

      await expect(withTransaction(operation)).rejects.toThrow('Transaction failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Transaction failed',
        expect.objectContaining({ duration: expect.any(Number) }),
        error
      );
    });
  });

  describe('executeQuery()', () => {
    it('should execute query and log timing', async () => {
      const mockResult = [{ id: '1' }, { id: '2' }];
      const queryFn = vi.fn().mockResolvedValue(mockResult);

      const result = await executeQuery('getUsersQuery', queryFn);

      expect(queryFn).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
      expect(logger.logQuery).toHaveBeenCalledWith(
        'getUsersQuery',
        expect.any(Number),
        undefined
      );
    });

    it('should log slow queries as warnings', async () => {
      const queryFn = vi.fn().mockImplementation(async () => {
        // Simulate slow query
        await new Promise(resolve => setTimeout(resolve, 1100));
        return [];
      });

      await executeQuery('slowQuery', queryFn);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Slow query detected'),
        expect.objectContaining({
          duration: expect.any(Number),
          threshold: 1000,
        })
      );
    });

    it('should include context in logs', async () => {
      const queryFn = vi.fn().mockResolvedValue([]);
      const context = { userId: 'user-123', operation: 'fetchUsers' };

      await executeQuery('contextQuery', queryFn, context);

      expect(logger.logQuery).toHaveBeenCalledWith(
        'contextQuery',
        expect.any(Number),
        context
      );
    });

    it('should log errors and re-throw', async () => {
      const error = new Error('Query failed');
      const queryFn = vi.fn().mockRejectedValue(error);

      await expect(executeQuery('failedQuery', queryFn)).rejects.toThrow('Query failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Query failed: failedQuery',
        expect.objectContaining({ duration: expect.any(Number) }),
        error
      );
    });
  });

  describe('getOneOrFail()', () => {
    it('should return result when found', async () => {
      const mockUser = { id: '123', name: 'John' };
      const queryFn = vi.fn().mockResolvedValue(mockUser);

      const result = await getOneOrFail(queryFn, 'user', '123');

      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundError when result is undefined', async () => {
      const queryFn = vi.fn().mockResolvedValue(undefined);

      await expect(getOneOrFail(queryFn, 'user', '123')).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when result is null', async () => {
      const queryFn = vi.fn().mockResolvedValue(null);

      await expect(getOneOrFail(queryFn, 'team', '456')).rejects.toThrow(NotFoundError);
    });
  });

  describe('batchInsert()', () => {
    it('should execute batch insert and log results', async () => {
      const mockResults = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const insertFn = vi.fn().mockResolvedValue(mockResults);

      const result = await batchInsert('users', insertFn);

      expect(insertFn).toHaveBeenCalled();
      expect(result).toEqual(mockResults);
      expect(logger.debug).toHaveBeenCalledWith(
        'Starting batch insert for users',
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Batch insert completed for users',
        { count: 3 }
      );
    });

    it('should log errors and re-throw', async () => {
      const error = new Error('Insert failed');
      const insertFn = vi.fn().mockRejectedValue(error);

      await expect(batchInsert('measurements', insertFn)).rejects.toThrow('Insert failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Batch insert failed for measurements',
        {},
        error
      );
    });
  });

  describe('retryOnTransientError()', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await retryOnTransientError(operation);

      expect(operation).toHaveBeenCalledTimes(1);
      expect(result).toBe('success');
    });

    it('should retry on transient connection error', async () => {
      const error = new Error('Connection failed');
      (error as any).code = 'ECONNREFUSED';

      const operation = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const result = await retryOnTransientError(operation);

      expect(operation).toHaveBeenCalledTimes(3);
      expect(result).toBe('success');
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('should retry on PostgreSQL connection errors', async () => {
      const error = new Error('Cannot connect');
      (error as any).code = '57P03'; // PostgreSQL: cannot connect

      const operation = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const result = await retryOnTransientError(operation);

      expect(operation).toHaveBeenCalledTimes(2);
      expect(result).toBe('success');
    });

    it('should not retry on non-transient errors', async () => {
      const error = new Error('Validation error');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(retryOnTransientError(operation)).rejects.toThrow('Validation error');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      const error = new Error('Timeout');
      (error as any).code = 'ETIMEDOUT';

      const operation = vi.fn().mockRejectedValue(error);

      await expect(retryOnTransientError(operation, 3)).rejects.toThrow('Timeout');

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      vi.useFakeTimers();

      const error = new Error('Connection reset');
      (error as any).code = 'ECONNRESET';

      const operation = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const promise = retryOnTransientError(operation, 3, 100);

      // First attempt fails immediately
      await vi.advanceTimersByTimeAsync(0);

      // Second attempt after 100ms delay
      await vi.advanceTimersByTimeAsync(100);

      // Third attempt after 200ms delay (exponential)
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;

      vi.useRealTimers();

      expect(result).toBe('success');
    });
  });

  describe('parseJsonField()', () => {
    it('should parse valid JSON string', () => {
      const jsonString = '{"name":"John","age":30}';
      const result = parseJsonField(jsonString, {});

      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should return object as-is if already parsed', () => {
      const obj = { name: 'John', age: 30 };
      const result = parseJsonField(obj, {});

      expect(result).toEqual(obj);
    });

    it('should return default value for null', () => {
      const defaultValue = { empty: true };
      const result = parseJsonField(null, defaultValue);

      expect(result).toEqual(defaultValue);
    });

    it('should return default value for undefined', () => {
      const defaultValue = [];
      const result = parseJsonField(undefined, defaultValue);

      expect(result).toEqual(defaultValue);
    });

    it('should return default value for invalid JSON', () => {
      const invalidJson = '{invalid json}';
      const defaultValue = { error: true };
      const result = parseJsonField(invalidJson, defaultValue);

      expect(result).toEqual(defaultValue);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to parse JSON field',
        { field: invalidJson }
      );
    });
  });

  describe('QueryPatterns', () => {
    describe('paginate()', () => {
      it('should calculate correct pagination', () => {
        const result = QueryPatterns.paginate(1, 20);

        expect(result).toEqual({ limit: 20, offset: 0 });
      });

      it('should calculate offset for page 2', () => {
        const result = QueryPatterns.paginate(2, 20);

        expect(result).toEqual({ limit: 20, offset: 20 });
      });

      it('should enforce minimum page size of 1', () => {
        const result = QueryPatterns.paginate(1, 0);

        expect(result.limit).toBe(1);
      });

      it('should enforce maximum page size of 100', () => {
        const result = QueryPatterns.paginate(1, 200);

        expect(result.limit).toBe(100);
      });

      it('should handle negative page numbers', () => {
        const result = QueryPatterns.paginate(-1, 20);

        expect(result.offset).toBeGreaterThanOrEqual(0);
      });
    });

    describe('dateRange()', () => {
      it('should parse both start and end dates', () => {
        const result = QueryPatterns.dateRange('2024-01-01', '2024-12-31');

        expect(result.start).toBeInstanceOf(Date);
        expect(result.end).toBeInstanceOf(Date);
        expect(result.start?.getFullYear()).toBe(2024);
        expect(result.end?.getFullYear()).toBe(2024);
      });

      it('should handle only start date', () => {
        const result = QueryPatterns.dateRange('2024-01-01');

        expect(result.start).toBeInstanceOf(Date);
        expect(result.end).toBeUndefined();
      });

      it('should handle only end date', () => {
        const result = QueryPatterns.dateRange(undefined, '2024-12-31');

        expect(result.start).toBeUndefined();
        expect(result.end).toBeInstanceOf(Date);
      });

      it('should handle no dates', () => {
        const result = QueryPatterns.dateRange();

        expect(result.start).toBeUndefined();
        expect(result.end).toBeUndefined();
      });
    });
  });
});
