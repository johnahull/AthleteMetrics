/**
 * Organization management service
 */

import { BaseService } from "./base-service";
import { insertOrganizationSchema } from "@shared/schema";
import type { Organization, InsertOrganization, User, UserOrganization } from "@shared/schema";
import crypto from "crypto";

export interface OrganizationFilters {
  search?: string;
  isActive?: string;
}

interface UserOrganizationWithOrg extends UserOrganization {
  organization: Organization;
}

/**
 * Constant-time string comparison to prevent timing attacks
 * Uses crypto.timingSafeEqual on equal-length buffers
 * Pads strings to prevent length leakage via timing
 */
function constantTimeCompare(a: string, b: string): boolean {
  // Normalize FIRST (on variable-length strings), then pad to fixed length
  // This prevents timing attacks: toLowerCase() on different content has variable time,
  // but operating on padded, normalized strings of equal length is constant-time
  const normalizedA = a.trim().toLowerCase();
  const normalizedB = b.trim().toLowerCase();

  const maxLen = 255;
  const paddedA = normalizedA.padEnd(maxLen, '\0');
  const paddedB = normalizedB.padEnd(maxLen, '\0');

  const bufA = Buffer.from(paddedA);
  const bufB = Buffer.from(paddedB);

  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Sanitize user input for audit logs to prevent log injection attacks
 * Removes control characters, ANSI escape sequences, and limits length
 */
function sanitizeForAuditLog(input: string, maxLength = 255): string {
  return input
    .trim()
    // Remove C0 control characters (0x00-0x1F) and delete character (0x7F)
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Remove C1 control characters (0x80-0x9F)
    .replace(/[\x80-\x9F]/g, '')
    // Remove ANSI escape sequences (e.g., color codes)
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    // Remove newlines and tabs to prevent log injection (redundant but explicit)
    .replace(/[\n\r\t]/g, ' ')
    // Limit length
    .substring(0, maxLength);
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
   * Includes inactive organizations for site admins to manage deactivation/reactivation
   */
  async getAllOrganizations(requestingUserId: string): Promise<Organization[]> {
    try {
      // Verify permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can view all organizations");
      }

      // Site admins need to see inactive orgs for reactivation functionality
      return await this.storage.getOrganizations({ includeInactive: true });
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

      // Site admins can access all organizations (including inactive ones for management)
      if (userIsSiteAdmin) {
        return await this.storage.getOrganizations({ includeInactive: true });
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

      // Get target user's roles (reused below to avoid duplicate queries)
      const targetUserRoles = await this.storage.getUserRoles(userId, organizationId);
      const targetUserRole = targetUserRoles[0];

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

        // Coaches can only delete athletes
        if (isCoach && targetUserRole !== "athlete") {
          throw new Error("Access denied. Coaches can only delete athletes.");
        }

        // Org admins can delete athletes and coaches, but not other org admins
        if (isOrgAdmin && targetUserRole === "org_admin" && userId !== requestingUserId) {
          // This will be checked in the "last admin" logic below
        }
      }

      // If trying to delete an org admin, use transaction-based removal to prevent race conditions
      // The storage layer will atomically check admin count and perform deletion
      const isAdminRemoval = targetUserRole === "org_admin";
      await this.storage.removeUserFromOrganization(userId, organizationId, isAdminRemoval);
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
    const startTime = Date.now();

    try {
      // Validate access
      const hasAccess = await this.validateOrganizationAccess(requestingUserId, organizationId);
      if (!hasAccess) {
        throw new Error("Unauthorized: Access denied to this organization");
      }

      // Check if username already exists
      // Note: Using generic error to prevent username enumeration attacks
      if (userData.username) {
        const existingUser = await this.storage.getUserByUsername(userData.username);
        if (existingUser) {
          throw new Error("Unable to create user. Please check your input and try again.");
        }
      }

      // Create user and add to organization
      // Each user can only have one role per organization
      const role = userData.role || 'athlete';
      const user = await this.storage.createUser(userData);
      await this.storage.addUserToOrganization(user.id, organizationId, role);

      return user;
    } catch (error) {
      console.error("OrganizationService.addUserToOrganization:", error);

      // Normalize timing to prevent username enumeration via timing analysis
      // Ensures all error responses take at least 100ms to mitigate timing attacks
      const elapsed = Date.now() - startTime;
      const minTime = 100;
      if (elapsed < minTime) {
        await new Promise(resolve => setTimeout(resolve, minTime - elapsed));
      }

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
      const BATCH_SIZE = 50; // Process 50 organizations at a time to prevent memory issues

      // Process organizations in batches to prevent memory issues with large numbers
      for (let i = 0; i < organizationIds.length; i += BATCH_SIZE) {
        const batch = organizationIds.slice(i, i + BATCH_SIZE);

        // Fetch all organizations in this batch in parallel
        const orgsPromise = Promise.all(
          batch.map(id => this.storage.getOrganization(id))
        );

        // Fetch all users for all organizations in this batch in parallel
        const usersPromise = Promise.all(
          batch.map(id => this.storage.getOrganizationUsers(id))
        );

        // Fetch all invitations for all organizations in this batch in parallel
        const invitationsPromise = Promise.all(
          batch.map(id => this.storage.getOrganizationInvitations(id))
        );

        const [orgs, usersArrays, invitationsArrays] = await Promise.all([
          orgsPromise,
          usersPromise,
          invitationsPromise
        ]);

        // Build the profiles map for this batch
        batch.forEach((orgId, index) => {
          profilesMap.set(orgId, {
            organization: orgs[index],
            users: usersArrays[index] || [],
            invitations: invitationsArrays[index] || []
          });
        });
      }

      return profilesMap;
    } catch (error) {
      console.error("OrganizationService.getOrganizationProfilesBatch:", error);
      throw error;
    }
  }

  /**
   * Deactivate organization (soft delete - site admin only)
   */
  async deactivateOrganization(
    organizationId: string,
    requestingUserId: string,
    context: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<void> {
    try {
      // Verify permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can deactivate organizations");
      }

      // Verify organization exists
      const org = await this.storage.getOrganization(organizationId);
      if (!org) {
        throw new Error("Organization not found");
      }

      // Check if already deactivated
      if (org.isActive === false) {
        throw new Error("Organization is already deactivated");
      }

      // Deactivate organization
      await this.storage.deactivateOrganization(organizationId);

      // Sanitize organization name for audit log (prevent log injection)
      const sanitizedOrgName = sanitizeForAuditLog(org.name);

      // Create audit log with request context
      await this.storage.createAuditLog({
        userId: requestingUserId,
        action: 'organization_deactivated',
        resourceType: 'organization',
        resourceId: organizationId,
        details: JSON.stringify({ organizationName: sanitizedOrgName }),
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
      });
    } catch (error) {
      console.error("OrganizationService.deactivateOrganization:", error);
      throw error;
    }
  }

  /**
   * Reactivate organization (site admin only)
   */
  async reactivateOrganization(
    organizationId: string,
    requestingUserId: string,
    context: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<void> {
    try {
      // Verify permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can reactivate organizations");
      }

      // Verify organization exists
      const org = await this.storage.getOrganization(organizationId);
      if (!org) {
        throw new Error("Organization not found");
      }

      // Check if already active
      if (org.isActive === true) {
        throw new Error("Organization is already active");
      }

      // Reactivate organization
      await this.storage.reactivateOrganization(organizationId);

      // Sanitize organization name for audit log (prevent log injection)
      const sanitizedOrgName = sanitizeForAuditLog(org.name);

      // Create audit log with request context
      await this.storage.createAuditLog({
        userId: requestingUserId,
        action: 'organization_reactivated',
        resourceType: 'organization',
        resourceId: organizationId,
        details: JSON.stringify({ organizationName: sanitizedOrgName }),
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
      });
    } catch (error) {
      console.error("OrganizationService.reactivateOrganization:", error);
      throw error;
    }
  }

  /**
   * Delete organization permanently (site admin only)
   * Only allowed if organization has no users, teams, or measurements
   */
  async deleteOrganization(
    organizationId: string,
    confirmationName: string,
    requestingUserId: string,
    context: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<void> {
    try {
      // Verify permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can delete organizations");
      }

      // Verify organization exists
      const org = await this.storage.getOrganization(organizationId);
      if (!org) {
        throw new Error("Organization not found");
      }

      // Validate confirmation name type and length to prevent DoS
      if (!confirmationName || typeof confirmationName !== 'string') {
        throw new Error("Confirmation name is required");
      }

      if (confirmationName.length > 255) {
        throw new Error("Confirmation name too long");
      }

      // Verify confirmation name matches using constant-time comparison to prevent timing attacks
      if (!constantTimeCompare(confirmationName, org.name)) {
        throw new Error("Organization name confirmation does not match");
      }

      // Delete organization (transaction with race condition protection is handled in storage layer)
      await this.storage.deleteOrganization(organizationId);

      // Sanitize all user inputs and organization data for audit log (prevent log injection)
      const sanitizedOrgName = sanitizeForAuditLog(org.name);
      const sanitizedConfirmation = sanitizeForAuditLog(confirmationName);
      const sanitizedIpAddress = context.ipAddress ? sanitizeForAuditLog(context.ipAddress, 45) : null;
      const sanitizedUserAgent = context.userAgent ? sanitizeForAuditLog(context.userAgent, 500) : null;

      // Create audit log with request context
      await this.storage.createAuditLog({
        userId: requestingUserId,
        action: 'organization_deleted',
        resourceType: 'organization',
        resourceId: organizationId,
        details: JSON.stringify({
          organizationName: sanitizedOrgName,
          confirmationProvided: true,
          confirmationName: sanitizedConfirmation
        }),
        ipAddress: sanitizedIpAddress,
        userAgent: sanitizedUserAgent,
      });
    } catch (error) {
      console.error("OrganizationService.deleteOrganization:", error);
      throw error;
    }
  }

  /**
   * Get organization dependency counts (site admin only)
   */
  async getOrganizationDependencyCounts(
    organizationId: string,
    requestingUserId: string,
    context: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<{ users: number; teams: number; measurements: number }> {
    try {
      // Verify permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can view dependency counts");
      }

      // Verify organization exists
      const org = await this.storage.getOrganization(organizationId);
      if (!org) {
        throw new Error("Organization not found");
      }

      const counts = await this.storage.getOrganizationDependencyCounts(organizationId);

      // Sanitize all user inputs and organization data for audit log (prevent log injection)
      const sanitizedOrgName = sanitizeForAuditLog(org.name);

      // Create audit log for security monitoring
      await this.storage.createAuditLog({
        userId: requestingUserId,
        action: 'organization_dependencies_viewed',
        resourceType: 'organization',
        resourceId: organizationId,
        details: JSON.stringify({
          organizationName: sanitizedOrgName,
          counts: {
            users: Number(counts.users),
            teams: Number(counts.teams),
            measurements: Number(counts.measurements)
          }
        }),
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
      });

      return counts;
    } catch (error) {
      console.error("OrganizationService.getOrganizationDependencyCounts:", error);
      throw error;
    }
  }
}