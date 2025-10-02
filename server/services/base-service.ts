/**
 * Base service class providing common functionality for all services
 */

import { storage } from "../storage";
import type { IStorage } from "../storage";

export abstract class BaseService {
  protected storage: IStorage;

  constructor() {
    this.storage = storage;
  }

  /**
   * Check if user is a site administrator
   * Handles both string "true" and boolean true for compatibility
   */
  protected async isSiteAdmin(userId: string): Promise<boolean> {
    const user = await this.storage.getUser(userId);
    return user?.isSiteAdmin === "true" || user?.isSiteAdmin === true;
  }

  /**
   * Check if a user object represents a site administrator
   * Use this when you already have the user object to avoid duplicate queries
   */
  protected isSiteAdminFromUser(user: any): boolean {
    return user?.isSiteAdmin === "true" || user?.isSiteAdmin === true;
  }

  /**
   * Validate organization access for the current user
   */
  protected async validateOrganizationAccess(
    userId: string,
    organizationId: string,
    userIsSiteAdmin?: boolean
  ): Promise<boolean> {
    // Use provided isSiteAdmin flag if available to avoid duplicate query
    const isAdmin = userIsSiteAdmin ?? await this.isSiteAdmin(userId);

    // Site admins have access to all organizations
    if (isAdmin) {
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
        console.error('Failed to create audit log:', err);
      });
      return true;
    }

    const userOrgs = await this.storage.getUserOrganizations(userId);
    return userOrgs.some(org => org.organizationId === organizationId);
  }

  /**
   * Get user's accessible organizations
   */
  protected async getUserOrganizations(userId: string) {
    return this.storage.getUserOrganizations(userId);
  }

  /**
   * Handle common error cases
   */
  protected handleError(error: unknown, context: string): never {
    console.error(`${context}:`, error);
    throw error instanceof Error ? error : new Error(`Unknown error in ${context}`);
  }
}