/**
 * Organization management service
 */

import { BaseService } from "./base-service";
import { insertOrganizationSchema } from "@shared/schema";
import type { Organization, InsertOrganization, User, UserOrganization } from "@shared/schema";
import { AuthorizationError, NotFoundError, ValidationError } from "../utils/errors";

export interface OrganizationFilters {
  search?: string;
  isActive?: string;
}

interface UserOrganizationWithOrg extends UserOrganization {
  organization: Organization;
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
      // Verify permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new AuthorizationError("Only site administrators can create organizations");
      }

      // Validate input
      const validatedData = insertOrganizationSchema.parse(orgData);

      this.logger.info('Creating organization', {
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
      this.handleError(error, 'createOrganization');
    }
  }

  /**
   * Get all organizations (site admin only)
   */
  async getAllOrganizations(requestingUserId: string): Promise<Organization[]> {
    try {
      // Verify permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new AuthorizationError("Only site administrators can view all organizations");
      }

      this.logger.info('Getting all organizations', {
        userId: requestingUserId,
      });

      return await this.executeQuery(
        'getAllOrganizations',
        () => this.storage.getOrganizations(),
        { userId: requestingUserId }
      );
    } catch (error) {
      this.handleError(error, 'getAllOrganizations');
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
      this.logger.info('Getting organization by ID', {
        userId: requestingUserId,
        organizationId,
      });

      const organization = await this.getOneOrFail(
        () => this.storage.getOrganization(organizationId),
        'Organization'
      );

      // Site admins can access any organization
      const requestingUser = await this.storage.getUser(requestingUserId);
      if (requestingUser?.isSiteAdmin === true) {
        return organization;
      }

      // Check if user has access to this organization
      const hasAccess = await this.validateOrganizationAccess(requestingUserId, organizationId);
      if (!hasAccess) {
        this.logger.security('Unauthorized organization access attempt', {
          userId: requestingUserId,
          organizationId,
        });
        throw new AuthorizationError('Access denied to this organization');
      }

      return organization;
    } catch (error) {
      this.handleError(error, 'getOrganizationById');
    }
  }

  /**
   * Get user's accessible organizations
   * Site admins get all organizations, regular users get only their assigned organizations
   * @param userId - User ID to get organizations for
   * @param cachedIsSiteAdmin - Optional cached site admin status to avoid DB query
   */
  async getUserOrganizations(userId: string, cachedIsSiteAdmin?: boolean): Promise<Organization[]> {
    try {
      this.logger.info('Getting user organizations', {
        userId,
        cachedIsSiteAdmin,
      });

      // Use cached value if provided, otherwise query database
      // This prevents N+1 queries when called multiple times with session data
      const userIsSiteAdmin = cachedIsSiteAdmin ?? await this.isSiteAdmin(userId);

      // Site admins can access all organizations
      if (userIsSiteAdmin) {
        return await this.executeQuery(
          'getUserOrganizations',
          () => this.storage.getOrganizations(),
          { userId, isSiteAdmin: true }
        );
      }

      // Regular users get only their assigned organizations
      // Extract the organization object from the nested structure
      const userOrgs = await this.executeQuery(
        'getUserOrganizations',
        () => this.storage.getUserOrganizations(userId),
        { userId }
      );

      return userOrgs.map((userOrg: UserOrganizationWithOrg) => userOrg.organization);
    } catch (error) {
      this.handleError(error, 'getUserOrganizations');
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
      this.logger.info('Getting organization profile', {
        userId: requestingUserId,
        organizationId,
      });

      // Validate access
      if (!(await this.isSiteAdmin(requestingUserId))) {
        await this.requireOrganizationAccess(requestingUserId, organizationId);
      }

      const organization = await this.getOneOrFail(
        () => this.storage.getOrganization(organizationId),
        'Organization'
      );

      // Get organization users and invitations
      const [users, invitations] = await Promise.all([
        this.executeQuery(
          'getOrganizationUsers',
          () => this.storage.getOrganizationUsers(organizationId),
          { userId: requestingUserId, organizationId }
        ),
        this.executeQuery(
          'getOrganizationInvitations',
          () => this.storage.getOrganizationInvitations(organizationId),
          { userId: requestingUserId, organizationId }
        ),
      ]);

      return {
        organization,
        users,
        invitations
      };
    } catch (error) {
      this.handleError(error, 'getOrganizationProfile');
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

      // Validate access
      if (!(await this.isSiteAdmin(requestingUserId))) {
        await this.requireOrganizationAccess(requestingUserId, organizationId);
      }

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
      this.handleError(error, 'removeUserFromOrganization');
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
        role: userData.role || 'athlete',
      });

      // Validate access
      if (!(await this.isSiteAdmin(requestingUserId))) {
        await this.requireOrganizationAccess(requestingUserId, organizationId);
      }

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
      this.handleError(error, 'addUserToOrganization');
    }
  }

  /**
   * Get organization profiles in batch (optimized to avoid N+1 queries)
   */
  async getOrganizationProfilesBatch(
    organizationIds: string[],
    requestingUserId: string
  ): Promise<Map<string, any>> {
    try {
      this.logger.info('Getting organization profiles in batch', {
        userId: requestingUserId,
        organizationCount: organizationIds.length,
      });

      const profilesMap = new Map<string, any>();

      // Fetch all organizations, users, and invitations in parallel
      const [orgs, usersArrays, invitationsArrays] = await Promise.all([
        Promise.all(
          organizationIds.map(id =>
            this.executeQuery(
              'getOrganization',
              () => this.storage.getOrganization(id),
              { userId: requestingUserId, organizationId: id }
            )
          )
        ),
        Promise.all(
          organizationIds.map(id =>
            this.executeQuery(
              'getOrganizationUsers',
              () => this.storage.getOrganizationUsers(id),
              { userId: requestingUserId, organizationId: id }
            )
          )
        ),
        Promise.all(
          organizationIds.map(id =>
            this.executeQuery(
              'getOrganizationInvitations',
              () => this.storage.getOrganizationInvitations(id),
              { userId: requestingUserId, organizationId: id }
            )
          )
        ),
      ]);

      // Build the profiles map
      organizationIds.forEach((orgId, index) => {
        profilesMap.set(orgId, {
          organization: orgs[index],
          users: usersArrays[index] || [],
          invitations: invitationsArrays[index] || []
        });
      });

      return profilesMap;
    } catch (error) {
      this.handleError(error, 'getOrganizationProfilesBatch');
    }
  }
}