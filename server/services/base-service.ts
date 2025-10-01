/**
 * Base service class providing common functionality for all services
 */

import { storage } from "../storage";
import type { IStorage } from "../storage";
import { logger } from "../utils/logger";
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  InternalError
} from "../utils/errors";
import { withTransaction, executeQuery, getOneOrFail, retryOnTransientError } from "../utils/db-helpers";
import { sanitizeUser, sanitizeUsers } from "../utils/transformers";

export abstract class BaseService {
  protected storage: IStorage;
  protected logger = logger;

  constructor() {
    this.storage = storage;
  }

  /**
   * Validate organization access for the current user
   */
  protected async validateOrganizationAccess(
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    try {
      const userOrgs = await this.storage.getUserOrganizations(userId);
      const hasAccess = userOrgs.some(org => org.organizationId === organizationId);

      if (!hasAccess) {
        this.logger.security('Unauthorized organization access attempt', {
          userId,
          organizationId,
        });
      }

      return hasAccess;
    } catch (error) {
      this.logger.error('Failed to validate organization access', {
        userId,
        organizationId,
      }, error as Error);
      throw error;
    }
  }

  /**
   * Require organization access or throw authorization error
   */
  protected async requireOrganizationAccess(
    userId: string,
    organizationId: string
  ): Promise<void> {
    const hasAccess = await this.validateOrganizationAccess(userId, organizationId);

    if (!hasAccess) {
      throw new AuthorizationError('Access denied to this organization');
    }
  }

  /**
   * Get user's accessible organizations
   */
  protected async getUserOrganizations(userId: string) {
    return executeQuery(
      'getUserOrganizations',
      () => this.storage.getUserOrganizations(userId),
      { userId }
    );
  }

  /**
   * Execute operation with transaction support
   */
  protected async withTransaction<T>(operation: (tx: any) => Promise<T>): Promise<T> {
    return withTransaction(operation);
  }

  /**
   * Execute query with logging and timing
   */
  protected async executeQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    return executeQuery(queryName, queryFn, context);
  }

  /**
   * Get one record or throw not found error
   */
  protected async getOneOrFail<T>(
    queryFn: () => Promise<T | undefined>,
    resourceType: string,
    resourceId?: string
  ): Promise<T> {
    return getOneOrFail(queryFn, resourceType, resourceId);
  }

  /**
   * Retry operation on transient errors
   */
  protected async retryOnTransientError<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    return retryOnTransientError(operation, maxRetries);
  }

  /**
   * Sanitize user data before returning
   */
  protected sanitizeUser = sanitizeUser;
  protected sanitizeUsers = sanitizeUsers;

  /**
   * Handle errors with proper logging and wrapping
   */
  protected handleError(error: unknown, context: string, userId?: string): never {
    // Log the error
    this.logger.error(`Error in ${context}`, { userId, context }, error as Error);

    // Re-throw AppError instances as-is
    if (error instanceof AppError) {
      throw error;
    }

    // Wrap unknown errors
    if (error instanceof Error) {
      throw new InternalError(error.message, { context, originalError: error.message });
    }

    throw new InternalError(`Unknown error in ${context}`, { context });
  }

  /**
   * Validate required fields
   */
  protected validateRequired(fields: Record<string, any>, fieldNames: string[]): void {
    const missing = fieldNames.filter(name => !fields[name]);

    if (missing.length > 0) {
      throw new ValidationError(
        `Missing required fields: ${missing.join(', ')}`,
        { missingFields: missing }
      );
    }
  }

  /**
   * Check if user is site admin
   */
  protected async isSiteAdmin(userId: string): Promise<boolean> {
    try {
      const user = await this.storage.getUser(userId);
      return user?.isSiteAdmin === 'true';
    } catch (error) {
      this.logger.error('Failed to check site admin status', { userId }, error as Error);
      return false;
    }
  }

  /**
   * Require site admin access or throw
   */
  protected async requireSiteAdmin(userId: string): Promise<void> {
    const isAdmin = await this.isSiteAdmin(userId);

    if (!isAdmin) {
      this.logger.security('Non-admin attempted admin operation', { userId });
      throw new AuthorizationError('Site administrator access required');
    }
  }
}