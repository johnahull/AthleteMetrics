/**
 * Organization management service
 */

import { BaseService } from "./base-service";
import { insertOrganizationSchema } from "@shared/schema";
import type { Organization, InsertOrganization, User, UserOrganization } from "@shared/schema";

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
        throw new Error("Unauthorized: Only site administrators can create organizations");
      }

      // Validate input
      const validatedData = insertOrganizationSchema.parse(orgData);
      
      return await this.storage.createOrganization(validatedData);
    } catch (error) {
      console.error("OrganizationService.createOrganization:", error);
      throw error;
    }
  }

  /**
   * Get all organizations (site admin only)
   */
  async getAllOrganizations(requestingUserId: string): Promise<Organization[]> {
    try {
      // Verify permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can view all organizations");
      }

      return await this.storage.getOrganizations();
    } catch (error) {
      console.error("OrganizationService.getAllOrganizations:", error);
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
      const organization = await this.storage.getOrganization(organizationId);
      if (!organization) return null;

      // Site admins can access any organization
      const requestingUser = await this.storage.getUser(requestingUserId);
      if (requestingUser?.isSiteAdmin === true) {
        return organization;
      }

      // Check if user has access to this organization
      const hasAccess = await this.validateOrganizationAccess(requestingUserId, organizationId);
      return hasAccess ? organization : null;
    } catch (error) {
      console.error("OrganizationService.getOrganizationById:", error);
      return null;
    }
  }

  /**
   * Get user's accessible organizations
   * Site admins get all organizations, regular users get only their assigned organizations
   * @param userId - User ID to get organizations for
   * @param cachedIsSiteAdmin - Optional cached site admin status to avoid DB query
   */
  async getAccessibleOrganizations(userId: string, cachedIsSiteAdmin?: boolean): Promise<Organization[]> {
    try {
      // Use cached value if provided, otherwise query database
      // This prevents N+1 queries when called multiple times with session data
      const userIsSiteAdmin = cachedIsSiteAdmin ?? await this.isSiteAdmin(userId);

      // Site admins can access all organizations
      if (userIsSiteAdmin) {
        return await this.storage.getOrganizations();
      }

      // Regular users get only their assigned organizations
      // Extract the organization object from the nested structure
      const userOrgs = await this.storage.getUserOrganizations(userId);
      return userOrgs.map((userOrg: UserOrganizationWithOrg) => userOrg.organization);
    } catch (error) {
      console.error("OrganizationService.getAccessibleOrganizations:", error);
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
      // Validate access
      const hasAccess = await this.validateOrganizationAccess(requestingUserId, organizationId);
      if (!hasAccess) {
        throw new Error("Unauthorized: Access denied to this organization");
      }

      const organization = await this.storage.getOrganization(organizationId);
      if (!organization) {
        throw new Error("Organization not found");
      }

      // Get organization users and invitations
      const users = await this.storage.getOrganizationUsers(organizationId);
      const invitations = await this.storage.getOrganizationInvitations(organizationId);

      // Categorize users into coaches (org_admin/coach) and athletes
      const coaches = users.filter(u => u.role === 'org_admin' || u.role === 'coach');
      const athletes = users.filter(u => u.role === 'athlete');

      return {
        organization,
        coaches,
        athletes,
        invitations
      };
    } catch (error) {
      console.error("OrganizationService.getOrganizationProfile:", error);
      throw error;
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
      // Check if requesting user is site admin
      const requestingUser = await this.storage.getUser(requestingUserId);
      const isSiteAdmin = requestingUser?.isSiteAdmin === true;

      // Validate access
      const hasAccess = await this.validateOrganizationAccess(requestingUserId, organizationId, isSiteAdmin);
      if (!hasAccess) {
        throw new Error("Unauthorized: Access denied to this organization");
      }

      // Check hierarchical permissions (unless site admin)
      if (!isSiteAdmin) {
        const requestingUserRoles = await this.storage.getUserRoles(requestingUserId, organizationId);
        const requestingUserRole = requestingUserRoles[0]; // Single role per user per organization
        const isOrgAdmin = requestingUserRole === "org_admin";
        const isCoach = requestingUserRole === "coach";

        // Must be at least a coach to delete users
        if (!isOrgAdmin && !isCoach) {
          throw new Error("Access denied. Only coaches and organization admins can delete users.");
        }

        // Check what role the target user has
        const targetUserRoles = await this.storage.getUserRoles(userId, organizationId);
        const targetUserRole = targetUserRoles[0];

        // Coaches can only delete athletes
        if (isCoach && targetUserRole !== "athlete") {
          throw new Error("Access denied. Coaches can only delete athletes.");
        }

        // Org admins can delete athletes and coaches, but not other org admins
        if (isOrgAdmin && targetUserRole === "org_admin" && userId !== requestingUserId) {
          // This will be checked in the "last admin" logic below
        }
      }

      // Prevent removing self if it's the last admin
      if (userId === requestingUserId) {
        const orgUsers = await this.storage.getOrganizationUsers(organizationId);
        const adminCount = orgUsers.filter(u => u.role === 'org_admin').length;
        if (adminCount <= 1) {
          throw new Error("Cannot remove the last organization administrator");
        }
      }

      // If trying to delete an org admin, ensure it's not the last one
      const targetUserRoles = await this.storage.getUserRoles(userId, organizationId);
      if (targetUserRoles.includes("org_admin")) {
        const orgUsers = await this.storage.getOrganizationUsers(organizationId);
        const adminCount = orgUsers.filter(u => u.role === 'org_admin').length;
        if (adminCount <= 1) {
          throw new Error("Cannot remove the last organization administrator");
        }
      }

      await this.storage.removeUserFromOrganization(userId, organizationId);
    } catch (error) {
      console.error("OrganizationService.removeUserFromOrganization:", error);
      throw error;
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
      // Validate access
      const hasAccess = await this.validateOrganizationAccess(requestingUserId, organizationId);
      if (!hasAccess) {
        throw new Error("Unauthorized: Access denied to this organization");
      }

      // Create user and add to organization
      // Each user can only have one role per organization
      const role = userData.role || 'athlete';
      const user = await this.storage.createUser(userData);
      await this.storage.addUserToOrganization(user.id, organizationId, role);

      return user;
    } catch (error) {
      console.error("OrganizationService.addUserToOrganization:", error);
      throw error;
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
      const profilesMap = new Map<string, any>();

      // Fetch all organizations in parallel
      const orgsPromise = Promise.all(
        organizationIds.map(id => this.storage.getOrganization(id))
      );

      // Fetch all users for all organizations in parallel
      const usersPromise = Promise.all(
        organizationIds.map(id => this.storage.getOrganizationUsers(id))
      );

      // Fetch all invitations for all organizations in parallel
      const invitationsPromise = Promise.all(
        organizationIds.map(id => this.storage.getOrganizationInvitations(id))
      );

      const [orgs, usersArrays, invitationsArrays] = await Promise.all([
        orgsPromise,
        usersPromise,
        invitationsPromise
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
      console.error("OrganizationService.getOrganizationProfilesBatch:", error);
      throw error;
    }
  }
}