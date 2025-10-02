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
   * Check if user is a site administrator
   */
  protected async isSiteAdmin(userId: string): Promise<boolean> {
    const user = await this.storage.getUser(userId);
    return user?.isSiteAdmin === true;
  }

  /**
   * Check if a user object represents a site administrator
   * Use this when you already have the user object to avoid duplicate queries
   */
  protected isSiteAdminFromUser(user: any): boolean {
    return user?.isSiteAdmin === true;
  }

  /**
   * Validate organization access for the current user
   */
  protected async validateOrganizationAccess(
    userId: string,
    organizationId: string,
    userIsSiteAdmin?: boolean
  ): Promise<boolean> {
    try {
      // Use provided isSiteAdmin flag if available to avoid duplicate query
      const isAdmin = userIsSiteAdmin ?? await this.isSiteAdmin(userId);

      // Site admins have access to all organizations
      if (isAdmin) {
        this.logger.audit('Site admin organization access', {
          userId,
          organizationId,
          accessType: 'site_admin_override',
        });

        // Create audit log for site admin access
        await this.storage.createAuditLog({
          userId,
          action: 'site_admin_organization_access',
          resourceType: 'organization',
          resourceId: organizationId,
          details: JSON.stringify({ accessType: 'site_admin_override' }),
          ipAddress: null,
          userAgent: null,
        }).catch(err => {
          // Don't fail the request if audit logging fails
          this.logger.error('Failed to create audit log', { userId, organizationId }, err);
        });
        return true;
      }

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
   * Require organization access or throw authorization error
   */
  protected async requireOrganizationAccess(
    userId: string,
    organizationId: string,
    userIsSiteAdmin?: boolean
  ): Promise<void> {
    const hasAccess = await this.validateOrganizationAccess(userId, organizationId, userIsSiteAdmin);

    if (!hasAccess) {
      throw new AuthorizationError('Access denied to this organization');
    }
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
   * Get single resource or throw not found error
   */
  protected async getOneOrFail<T>(
    queryFn: () => Promise<T | undefined>,
    resourceType: string
  ): Promise<T> {
    return getOneOrFail(queryFn, resourceType);
  }

  /**
   * Retry operation on transient errors
   */
  protected async retryOnTransientError<T>(
    operation: () => Promise<T>,
    maxRetries?: number
  ): Promise<T> {
    return retryOnTransientError(operation, maxRetries);
  }

  /**
   * Handle common error cases
   */
  protected handleError(error: unknown, context: string): never {
    this.logger.error(`Error in ${context}`, {}, error as Error);
    throw error instanceof Error ? error : new Error(`Unknown error in ${context}`);
  }
}