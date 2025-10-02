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
   * Validate organization access for the current user
   */
  protected async validateOrganizationAccess(
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    // Site admins have access to all organizations
    if (await this.isSiteAdmin(userId)) {
      // Audit log for site admin access
      console.log(`[AUDIT] Site admin ${userId} accessed organization ${organizationId}`, {
        timestamp: new Date().toISOString(),
        userId,
        organizationId,
        accessType: 'site_admin_override'
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