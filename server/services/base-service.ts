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
   * Validate organization access for the current user
   */
  protected async validateOrganizationAccess(
    userId: string, 
    organizationId: string
  ): Promise<boolean> {
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