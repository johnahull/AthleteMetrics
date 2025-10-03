/**
 * Database helper utilities
 *
 * Provides transaction management, query helpers, and common patterns
 * for working with Drizzle ORM and PostgreSQL.
 */

import { db } from '../db';
import { logger } from './logger';
import { NotFoundError } from './errors';
import { env } from '../config/env';

/**
 * Execute a database operation with transaction support
 */
export async function withTransaction<T>(
  operation: (tx: any) => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await db.transaction(async (tx: any) => {
      return await operation(tx);
    });

    const duration = Date.now() - startTime;
    logger.debug('Transaction completed', { duration });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Transaction failed', { duration }, error as Error);
    throw error;
  }
}

/**
 * Execute a query with timing and error logging
 */
export async function executeQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;

    logger.logQuery(queryName, duration, context);

    // Warn on slow queries (threshold configurable via env)
    if (duration > env.SLOW_QUERY_THRESHOLD_MS) {
      logger.warn(`Slow query detected: ${queryName}`, {
        ...context,
        duration,
        threshold: env.SLOW_QUERY_THRESHOLD_MS,
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Query failed: ${queryName}`, {
      ...context,
      duration,
    }, error as Error);

    throw error;
  }
}

/**
 * Safely get a single record or throw not found error
 */
export async function getOneOrFail<T>(
  queryFn: () => Promise<T | undefined>,
  resourceType: string,
  resourceId?: string
): Promise<T> {
  const result = await queryFn();

  if (!result) {
    throw new NotFoundError(resourceType);
  }

  return result;
}

/**
 * Batch insert helper with error handling
 */
export async function batchInsert<T>(
  tableName: string,
  insertFn: () => Promise<T[]>,
  batchSize?: number
): Promise<T[]> {
  try {
    logger.debug(`Starting batch insert for ${tableName}`, { batchSize });

    const result = await insertFn();

    logger.info(`Batch insert completed for ${tableName}`, {
      count: result.length,
    });

    return result;
  } catch (error) {
    logger.error(`Batch insert failed for ${tableName}`, {}, error as Error);
    throw error;
  }
}

/**
 * Common query patterns
 */
export const QueryPatterns = {
  /**
   * Pagination helper
   */
  paginate: (page: number = 1, pageSize: number = 50) => {
    const limit = Math.min(Math.max(pageSize, 1), 100); // Max 100 items
    const offset = Math.max((page - 1) * limit, 0);

    return { limit, offset };
  },

  /**
   * Date range filter helper
   */
  dateRange: (startDate?: string, endDate?: string) => {
    const range: { start?: Date; end?: Date } = {};

    if (startDate) {
      range.start = new Date(startDate);
    }

    if (endDate) {
      range.end = new Date(endDate);
    }

    return range;
  },
};

/**
 * Database health check
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // Simple query to check connection
    await db.execute({ sql: 'SELECT 1', values: [] });

    const latency = Date.now() - startTime;

    return {
      healthy: true,
      latency,
    };
  } catch (error) {
    logger.error('Database health check failed', {}, error as Error);

    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Retry helper for transient database errors
 */
export async function retryOnTransientError<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable (connection errors, timeouts, etc.)
      const isRetryable = isTransientError(error);

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      logger.warn(`Retrying database operation (attempt ${attempt}/${maxRetries})`, {
        error: lastError.message,
      });

      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
}

/**
 * Check if error is a transient database error that can be retried
 */
function isTransientError(error: any): boolean {
  if (!error) return false;

  const transientCodes = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNRESET',
    '57P03', // PostgreSQL: cannot connect
    '08000', // PostgreSQL: connection exception
    '08003', // PostgreSQL: connection does not exist
    '08006', // PostgreSQL: connection failure
  ];

  const code = error.code || error.errno;
  return transientCodes.includes(code);
}

/**
 * Safely parse JSON fields from database
 */
export function parseJsonField<T>(field: any, defaultValue: T): T {
  try {
    if (!field) return defaultValue;
    if (typeof field === 'object') return field as T;
    return JSON.parse(field) as T;
  } catch {
    logger.warn('Failed to parse JSON field', { field });
    return defaultValue;
  }
}
