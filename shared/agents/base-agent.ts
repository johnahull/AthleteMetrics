/**
 * Base agent implementation with common functionality
 */

import { BaseAgent, AgentHealth, AgentConfig, AgentResult, AgentError } from './types';

export abstract class AbstractBaseAgent implements BaseAgent {
  public readonly name: string;
  public readonly version: string;
  public readonly dependencies: string[];

  protected config: AgentConfig;
  protected initialized: boolean = false;
  protected lastHealthCheck?: Date;

  constructor(
    name: string,
    version: string,
    dependencies: string[] = [],
    config: Partial<AgentConfig> = {}
  ) {
    this.name = name;
    this.version = version;
    this.dependencies = dependencies;
    this.config = {
      enabled: true,
      logLevel: 'info',
      timeout: 30000, // 30 seconds
      retries: 3,
      circuitBreaker: {
        enabled: false,
        failureThreshold: 5,
        resetTimeout: 60000 // 1 minute
      },
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.log('info', `Initializing agent ${this.name} v${this.version}`);

    try {
      await this.onInitialize();
      this.initialized = true;
      this.log('info', `Agent ${this.name} initialized successfully`);
    } catch (error) {
      this.log('error', `Failed to initialize agent ${this.name}`, error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    this.log('info', `Shutting down agent ${this.name}`);

    try {
      await this.onShutdown();
      this.initialized = false;
      this.log('info', `Agent ${this.name} shut down successfully`);
    } catch (error) {
      this.log('error', `Failed to shut down agent ${this.name}`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<AgentHealth> {
    const now = new Date();

    try {
      const health = await this.onHealthCheck();
      this.lastHealthCheck = now;
      return {
        ...health,
        lastCheck: now
      };
    } catch (error) {
      this.log('error', `Health check failed for agent ${this.name}`, error);
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: now
      };
    }
  }

  // Protected methods for subclasses to implement
  protected abstract onInitialize(): Promise<void>;
  protected abstract onShutdown(): Promise<void>;
  protected abstract onHealthCheck(): Promise<AgentHealth>;

  // Utility methods for creating results
  protected createSuccessResult<T>(data: T, metadata?: any): AgentResult<T> {
    return {
      success: true,
      data,
      metadata: {
        executionTime: 0, // Set by executor
        agentVersion: this.version,
        dependencies: this.dependencies,
        ...metadata
      }
    };
  }

  protected createErrorResult(error: string | Error | AgentError, code?: string): AgentResult<never> {
    let agentError: AgentError;

    if (typeof error === 'string') {
      agentError = {
        code: code || 'UNKNOWN_ERROR',
        message: error,
        retryable: false
      };
    } else if (error instanceof Error) {
      agentError = {
        code: code || 'INTERNAL_ERROR',
        message: error.message,
        stack: error.stack,
        retryable: false
      };
    } else {
      agentError = error;
    }

    return {
      success: false,
      error: agentError,
      metadata: {
        executionTime: 0, // Set by executor
        agentVersion: this.version,
        dependencies: this.dependencies
      }
    };
  }

  // Validation helper
  protected validateRequired(obj: any, fields: string[]): void {
    const missing = fields.filter(field => obj[field] === undefined || obj[field] === null);
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
  }

  // Logging utility
  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (this.shouldLog(level)) {
      const timestamp = new Date().toISOString();
      const logData = data ? ` ${JSON.stringify(data)}` : '';
      console[level](`[${timestamp}] [${this.name}] ${message}${logData}`);
    }
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = levels.indexOf(this.config.logLevel);
    const messageLevel = levels.indexOf(level);
    return messageLevel >= configLevel;
  }

  // Timeout wrapper
  protected async withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
    const timeout = timeoutMs || this.config.timeout;

    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeout}ms`));
        }, timeout);
      })
    ]);
  }

  // Retry wrapper
  protected async withRetry<T>(
    operation: () => Promise<T>,
    retries?: number,
    delay: number = 1000
  ): Promise<T> {
    const maxRetries = retries !== undefined ? retries : this.config.retries;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          break;
        }

        this.log('warn', `Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
          error: lastError.message
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }

    throw lastError!;
  }

  // Circuit breaker implementation
  private circuitState: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime?: Date;

  protected async withCircuitBreaker<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.config.circuitBreaker?.enabled) {
      return operation();
    }

    const { failureThreshold, resetTimeout } = this.config.circuitBreaker;

    // Check if circuit should be reset
    if (this.circuitState === 'open' && this.lastFailureTime) {
      const timeSinceFailure = Date.now() - this.lastFailureTime.getTime();
      if (timeSinceFailure >= resetTimeout) {
        this.circuitState = 'half-open';
        this.log('info', 'Circuit breaker transitioning to half-open');
      }
    }

    // Reject if circuit is open
    if (this.circuitState === 'open') {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await operation();

      // Reset on success
      if (this.circuitState === 'half-open') {
        this.circuitState = 'closed';
        this.failureCount = 0;
        this.log('info', 'Circuit breaker reset to closed');
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = new Date();

      if (this.failureCount >= failureThreshold) {
        this.circuitState = 'open';
        this.log('warn', 'Circuit breaker opened due to failure threshold');
      }

      throw error;
    }
  }
}