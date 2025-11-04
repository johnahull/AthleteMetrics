/**
 * Audit Log Retry Utility
 * Implements exponential backoff retry logic for audit log operations
 * to improve resilience while maintaining security guarantees
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

/**
 * Retry an async operation with exponential backoff
 * @param operation - The async function to retry
 * @param options - Retry configuration
 * @returns Promise resolving to the operation result
 * @throws Error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 100,
    maxDelayMs = 2000,
    backoffMultiplier = 2
  } = options;

  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Fast-fail on non-retryable errors (permanent failures)
      if (error instanceof Error) {
        const nonRetryable = ['permission', 'unauthorized', 'validation', 'not found', 'duplicate'];
        if (nonRetryable.some(msg => error.message.toLowerCase().includes(msg))) {
          throw error; // Don't waste retries on permanent failures
        }
      }

      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt),
        maxDelayMs
      );
      // Add ±25% jitter to prevent thundering herd
      const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
      const delay = Math.max(0, baseDelay + jitter);

      // Log retry attempt (not in production to avoid log spam)
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted, throw the last error
  throw lastError;
}

/**
 * Retry audit log creation with exponential backoff
 * @param auditLogFn - Function that creates an audit log
 * @param context - Context information for error logging
 * @returns Promise resolving when audit log is created
 * @throws Error with security alert if all retries fail in production
 */
export async function retryAuditLog(
  auditLogFn: () => Promise<void>,
  context: {
    operation: string;
    userId: string;
    resourceType?: string;
    resourceId?: string;
  }
): Promise<void> {
  try {
    await retryWithBackoff(auditLogFn, {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2
    });
  } catch (error) {
    // Log detailed error information
    console.error('SECURITY ALERT: Audit log failure after retries', {
      ...context,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    // In production, block the operation for security/compliance
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Failed to create audit log after retries - operation blocked for security (${context.operation})`);
    }

    // In development/test, only warn
    console.warn('Audit log failure in non-production environment - operation proceeding');
  }
}
