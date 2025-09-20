/**
 * Base Service Class
 *
 * Provides common functionality and patterns for all services including:
 * - Logging and error handling
 * - Context management
 * - Event emission
 * - Validation patterns
 */

import { EventEmitter } from 'events';
import type { DatabaseStorage } from '../../storage';

export interface ServiceContext {
  userId?: string;
  organizationId?: string;
  role?: string;
  isSiteAdmin?: boolean;
  sessionId?: string;
  requestId?: string;
}

export interface ServiceConfig {
  storage: DatabaseStorage;
  logger?: ServiceLogger;
  eventBus?: EventEmitter;
}

export interface ServiceLogger {
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error, meta?: any): void;
  debug(message: string, meta?: any): void;
}

export class DefaultLogger implements ServiceLogger {
  info(message: string, meta?: any): void {
    console.log(`[INFO] ${message}`, meta || '');
  }

  warn(message: string, meta?: any): void {
    console.warn(`[WARN] ${message}`, meta || '');
  }

  error(message: string, error?: Error, meta?: any): void {
    console.error(`[ERROR] ${message}`, error?.message || '', meta || '');
  }

  debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, meta || '');
    }
  }
}

export abstract class BaseService extends EventEmitter {
  protected storage: DatabaseStorage;
  protected logger: ServiceLogger;
  protected eventBus: EventEmitter;
  protected serviceName: string;

  constructor(config: ServiceConfig, serviceName: string) {
    super();
    this.storage = config.storage;
    this.logger = config.logger || new DefaultLogger();
    this.eventBus = config.eventBus || new EventEmitter();
    this.serviceName = serviceName;

    this.logger.info(`${this.serviceName} service initialized`);
  }

  /**
   * Execute operation with context and error handling
   */
  protected async executeWithContext<T>(
    operation: string,
    context: ServiceContext,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    const requestId = context.requestId || this.generateRequestId();

    this.logger.debug(`Starting ${operation}`, {
      service: this.serviceName,
      requestId,
      userId: context.userId,
      organizationId: context.organizationId
    });

    try {
      const result = await fn();

      const duration = Date.now() - startTime;
      this.logger.info(`Completed ${operation}`, {
        service: this.serviceName,
        requestId,
        duration: `${duration}ms`
      });

      // Emit success event
      this.eventBus.emit(`${this.serviceName}.${operation}.success`, {
        context,
        result,
        duration
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed ${operation}`, error as Error, {
        service: this.serviceName,
        requestId,
        duration: `${duration}ms`,
        context
      });

      // Emit error event
      this.eventBus.emit(`${this.serviceName}.${operation}.error`, {
        context,
        error,
        duration
      });

      throw error;
    }
  }

  /**
   * Validate user permissions for operation
   */
  protected validatePermissions(
    context: ServiceContext,
    requiredPermissions: {
      requireAuth?: boolean;
      requireSiteAdmin?: boolean;
      allowedRoles?: string[];
      requireOrganizationAccess?: boolean;
    }
  ): void {
    if (requiredPermissions.requireAuth && !context.userId) {
      throw new Error('Authentication required');
    }

    if (requiredPermissions.requireSiteAdmin && !context.isSiteAdmin) {
      throw new Error('Site administrator access required');
    }

    if (requiredPermissions.allowedRoles && context.role) {
      if (!requiredPermissions.allowedRoles.includes(context.role)) {
        throw new Error(`Access denied. Required roles: ${requiredPermissions.allowedRoles.join(', ')}`);
      }
    }

    if (requiredPermissions.requireOrganizationAccess && !context.organizationId) {
      throw new Error('Organization access required');
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `${this.serviceName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    service: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    checks: Record<string, boolean>;
  }> {
    return {
      service: this.serviceName,
      status: 'healthy',
      uptime: process.uptime(),
      checks: {
        storage: !!this.storage,
        logger: !!this.logger,
        eventBus: !!this.eventBus
      }
    };
  }
}