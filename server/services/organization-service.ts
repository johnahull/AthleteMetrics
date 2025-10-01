/**
 * Organization management service
 */

import { BaseService } from "./base-service";
import { insertOrganizationSchema } from "@shared/schema";
import type { Organization, InsertOrganization, User } from "@shared/schema";
import { ValidationError } from "../utils/errors";

export interface OrganizationFilters {
  search?: string;
  isActive?: string;
}

export class OrganizationService extends BaseService {
  /**
   * Create a new organization (site admin only)
   */
  async createOrganization(
    orgData: InsertOrganization,
    requestingUserId: string
  ): Promise<Organization> {
    try {
      await this.requireSiteAdmin(requestingUserId);

      const validatedData = insertOrganizationSchema.parse(orgData);

      this.logger.info('Creating new organization', {
        userId: requestingUserId,
        organizationName: validatedData.name,
      });

      const organization = await this.executeQuery(
        'createOrganization',
        () => this.storage.createOrganization(validatedData),
        { userId: requestingUserId, organizationName: validatedData.name }
      );

      this.logger.audit('Organization created', {
        userId: requestingUserId,
        organizationId: organization.id,
        organizationName: organization.name,
      });

      return organization;
    } catch (error) {
      this.handleError(error, 'createOrganization', requestingUserId);
    }
  }

  /**
   * Get all organizations (site admin only)
   */
  async getAllOrganizations(requestingUserId: string): Promise<Organization[]> {
    try {
      await this.requireSiteAdmin(requestingUserId);

      this.logger.debug('Getting all organizations', { userId: requestingUserId });

      return await this.executeQuery(
        'getAllOrganizations',
        () => this.storage.getOrganizations(),
        { userId: requestingUserId }
      );
    } catch (error) {
      this.logger.error('Failed to get organizations', { userId: requestingUserId }, error as Error);
      return [];
    }
  }

  /**
   * Get organization by ID with access validation
   */
  async getOrganizationById(
    organizationId: string,
    requestingUserId: string
  ): Promise<Organization | null> {
    try {
      const organization = await this.getOneOrFail(
        () => this.storage.getOrganization(organizationId),
        'Organization',
        organizationId
      );

      // Site admins can access any organization
      if (await this.isSiteAdmin(requestingUserId)) {
        return organization;
      }

      // Check if user has access to this organization
      await this.requireOrganizationAccess(requestingUserId, organizationId);

      return organization;
    } catch (error) {
      this.handleError(error, 'getOrganizationById', requestingUserId);
    }
  }

  /**
   * Get user's accessible organizations
   */
  async getUserOrganizations(userId: string): Promise<any[]> {
    try {
      return await this.executeQuery(
        'getUserOrganizations',
        () => this.storage.getUserOrganizations(userId),
        { userId }
      );
    } catch (error) {
      this.logger.error('Failed to get user organizations', { userId }, error as Error);
      return [];
    }
  }

  /**
   * Get organization profile with users
   */
  async getOrganizationProfile(
    organizationId: string,
    requestingUserId: string
  ): Promise<any> {
    try {
      this.logger.debug('Getting organization profile', {
        userId: requestingUserId,
        organizationId,
      });

      await this.requireOrganizationAccess(requestingUserId, organizationId);

      const organization = await this.getOneOrFail(
        () => this.storage.getOrganization(organizationId),
        'Organization',
        organizationId
      );

      // Get organization users
      const users = await this.executeQuery(
        'getOrganizationUsers',
        () => this.storage.getOrganizationUsers(organizationId),
        { userId: requestingUserId, organizationId }
      );

      return {
        organization,
        users,
      };
    } catch (error) {
      this.handleError(error, 'getOrganizationProfile', requestingUserId);
    }
  }

  /**
   * Remove user from organization
   */
  async removeUserFromOrganization(
    organizationId: string,
    userId: string,
    requestingUserId: string
  ): Promise<void> {
    try {
      this.logger.info('Removing user from organization', {
        userId: requestingUserId,
        organizationId,
        targetUserId: userId,
      });

      await this.requireOrganizationAccess(requestingUserId, organizationId);

      // Prevent removing self if it's the last admin
      if (userId === requestingUserId) {
        const orgUsers = await this.storage.getOrganizationUsers(organizationId);
        const adminCount = orgUsers.filter(u => u.role === 'org_admin').length;
        if (adminCount <= 1) {
          throw new ValidationError("Cannot remove the last organization administrator");
        }
      }

      await this.executeQuery(
        'removeUserFromOrganization',
        () => this.storage.removeUserFromOrganization(organizationId, userId),
        { userId: requestingUserId, organizationId, targetUserId: userId }
      );

      this.logger.audit('User removed from organization', {
        userId: requestingUserId,
        organizationId,
        targetUserId: userId,
      });
    } catch (error) {
      this.handleError(error, 'removeUserFromOrganization', requestingUserId);
    }
  }

  /**
   * Add user to organization
   */
  async addUserToOrganization(
    organizationId: string,
    userData: any,
    requestingUserId: string
  ): Promise<User> {
    try {
      this.logger.info('Adding user to organization', {
        userId: requestingUserId,
        organizationId,
        role: userData.role,
      });

      await this.requireOrganizationAccess(requestingUserId, organizationId);

      // Create user and add to organization
      const user = await this.executeQuery(
        'createUser',
        () => this.storage.createUser(userData),
        { userId: requestingUserId, organizationId }
      );

      await this.executeQuery(
        'addUserToOrganization',
        () => this.storage.addUserToOrganization(user.id, organizationId, userData.role || 'athlete'),
        { userId: requestingUserId, organizationId, targetUserId: user.id }
      );

      this.logger.audit('User added to organization', {
        userId: requestingUserId,
        organizationId,
        targetUserId: user.id,
        role: userData.role || 'athlete',
      });

      return user;
    } catch (error) {
      this.handleError(error, 'addUserToOrganization', requestingUserId);
    }
  }
}