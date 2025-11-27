/**
 * Organization management routes
 */

import type { Express } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { OrganizationService } from "../services/organization-service";
import { OrganizationTypeService } from "../services/organization-type-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { storage } from "../storage";
// Session types are loaded globally

const organizationService = new OrganizationService();
const organizationTypeService = new OrganizationTypeService();

/**
 * Sanitize error messages for production
 * Prevents leaking sensitive implementation details in error responses
 */
function sanitizeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  // In production, only return safe error messages to prevent info disclosure
  const isProduction = process.env.NODE_ENV === 'production';

  // Allowlist of error messages safe to expose (don't reveal internal paths, SQL, etc.)
  const safeErrors = [
    'Unauthorized',
    'not found',
    'access denied',
    'Invalid',
    'confirmation',
    'dependencies',
    'already exists',
    'already'
  ];

  if (isProduction) {
    const isSafeError = safeErrors.some(safe => error.message.includes(safe));
    return isSafeError ? error.message : fallback;
  }

  // In development, return full error message for debugging
  return error.message;
}

/**
 * Rate limit configuration constants
 * These values balance security with usability for different operations
 */
const RATE_LIMITS = {
  /** Conservative: Prevent organization spam while allowing legitimate admin work */
  ORG_CREATION: 5,
  /** Conservative: Prevent abuse while allowing frequent settings updates */
  ORG_UPDATE: 5,
  /** Moderate: Balance safety with usability for user management */
  USER_DELETION: 10,
  /** Very conservative: Destructive operation requiring extra caution */
  ORG_DELETION: 5,
} as const;

// Rate limiting for organization creation
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.ORG_CREATION,
  message: { message: "Too many organization creation attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Always enforce rate limiting in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
});

// Rate limiting for organization updates
const updateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.ORG_UPDATE,
  message: { message: "Too many organization update attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Always enforce rate limiting in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
});

// Stricter rate limiting for user deletion operations
const userDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.USER_DELETION,
  message: { message: "Too many deletion attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Always enforce rate limiting in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
});

// Rate limiting for organization deletion operations
const orgDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.ORG_DELETION,
  message: { message: "Too many organization deletion attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Always enforce rate limiting in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
  // Combine IP and user ID to prevent bypass via IP spoofing
  // Uses ipKeyGenerator for proper IPv6 handling
  // SECURITY NOTE: This mitigates but does not completely prevent bypass via IP rotation
  // (e.g., cloud VPN services, mobile networks, proxy rotation). Additional protections:
  // - Audit logging captures all attempts for forensic analysis
  // - CSRF protection prevents automated attacks without valid session
  // - User account-based limiting (userId in key) prevents single-user abuse
  // - For advanced protection, consider: device fingerprinting, behavior analysis, or CAPTCHA
  keyGenerator: (req) => {
    const userId = req.session?.user?.id;
    const ip = req.ip || 'unknown';
    const normalizedIp = ipKeyGenerator(ip);
    return userId ? `${normalizedIp}-${userId}` : normalizedIp;
  },
});

/**
 * Validate that a string is a valid UUIDv4
 * Includes length check to prevent ReDoS attacks
 */
function isValidUUID(id: string): boolean {
  // Validate length first to prevent ReDoS (UUIDs are always 36 characters)
  if (!id || id.length !== 36) {
    return false;
  }
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return UUID_REGEX.test(id);
}

export function registerOrganizationRoutes(app: Express) {
  /**
   * Get all organizations (site admin only)
   */
  app.get("/api/organizations", requireSiteAdmin, async (req, res) => {
    try {
      const organizations = await organizationService.getAllOrganizations(req.session.user!.id);
      res.json(organizations);
    } catch (error) {
      console.error("Get organizations error:", error);
      res.status(500).json({ message: sanitizeError(error, "Failed to fetch organizations") });
    }
  });

  /**
   * Get organization by ID
   */
  app.get("/api/organizations/:id", requireAuth, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }
      const organization = await organizationService.getOrganizationById(
        organizationId, 
        req.session.user!.id
      );
      
      if (!organization) {
        return res.status(404).json({ message: "Organization not found or access denied" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Get organization error:", error);
      res.status(500).json({ message: sanitizeError(error, "Failed to fetch organization") });
    }
  });

  /**
   * Get user's organizations
   * Returns all organizations for site admins, assigned organizations for regular users
   */
  app.get("/api/my-organizations", requireAuth, async (req, res) => {
    try {
      const organizations = await organizationService.getAccessibleOrganizations(req.session.user!.id);
      res.json(organizations);
    } catch (error) {
      console.error("Get user organizations error:", error);
      res.status(500).json({ message: "Failed to fetch user organizations" });
    }
  });

  /**
   * Create organization (site admin only)
   */
  app.post("/api/organizations", createLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const organization = await organizationService.createOrganization(
        req.body,
        req.session.user!.id
      );

      // Invalidate organization type caches when new organization is created
      organizationTypeService.invalidateCache(`orgs:`);

      res.status(201).json(organization);
    } catch (error) {
      console.error("Create organization error:", error);
      res.status(400).json({ message: sanitizeError(error, "Failed to create organization") });
    }
  });

  /**
   * Update organization settings (site admin only)
   * Used by settings page to update basic info, feature flags, and status
   */
  app.patch("/api/organizations/:id", updateLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }

      // Capture request context for audit logging
      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      const updatedOrganization = await organizationService.updateOrganization(
        organizationId,
        req.body,
        req.session.user!.id,
        context
      );

      // Invalidate organization type caches when organization is updated
      // This ensures cached metrics/benchmarks reflect any org type changes
      organizationTypeService.invalidateCache(`orgs:`);

      res.json(updatedOrganization);
    } catch (error) {
      console.error("Update organization error:", error);
      const message = sanitizeError(error, "Failed to update organization");
      const statusCode = message.includes("Unauthorized") ? 403
        : message.includes("not found") ? 404
        : message.includes("already exists") ? 400
        : message.includes("Invalid") ? 400
        : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Update organization settings (Org Admin only - limited fields)
   * PATCH /api/organizations/:id/org-settings
   *
   * Allows org admins to update only aiEnabled flag (if aiEnabledBySiteAdmin is true)
   */
  app.patch("/api/organizations/:id/org-settings", updateLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }

      // Get organization
      const org = await storage.getOrganization(organizationId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Verify user is org admin for this organization
      const userOrgs = await storage.getUserOrganizations(user.id);
      const userOrg = userOrgs.find((uo: any) => uo.organizationId === organizationId);

      if (!userOrg || userOrg.role !== 'org_admin') {
        return res.status(403).json({ message: "Access denied. Org admin role required." });
      }

      // Only allow updating aiEnabled field
      const { aiEnabled } = req.body;

      // Validate that aiEnabled is provided
      if (typeof aiEnabled !== 'boolean') {
        return res.status(400).json({ message: "aiEnabled field is required and must be boolean" });
      }

      // If trying to enable AI, check that site admin has permitted it
      if (aiEnabled === true && !org.aiEnabledBySiteAdmin) {
        return res.status(403).json({
          message: "AI features must be enabled by site administrator first"
        });
      }

      // Capture request context for audit logging
      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      // Update only the aiEnabled field
      const updated = await storage.updateOrganization(organizationId, { aiEnabled });

      // Invalidate organization type caches when organization is updated
      organizationTypeService.invalidateCache(`orgs:`);

      // Create audit log for AI flag change by org admin
      if (aiEnabled !== org.aiEnabled) {
        await storage.createAuditLog({
          userId: user.id,
          action: aiEnabled ? 'org_ai_enabled_by_org_admin' : 'org_ai_disabled_by_org_admin',
          resourceType: 'organization',
          resourceId: organizationId,
          details: JSON.stringify({
            organizationName: org.name,
            previousValue: org.aiEnabled,
            newValue: aiEnabled
          }),
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null,
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("Update organization settings error:", error);
      const message = sanitizeError(error, "Failed to update organization settings");
      const statusCode = message.includes("Unauthorized") ? 403
        : message.includes("not found") ? 404
        : message.includes("Invalid") ? 400
        : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Get organization profile with users
   */
  app.get("/api/organizations/:id/profile", requireAuth, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }
      const profile = await organizationService.getOrganizationProfile(
        organizationId, 
        req.session.user!.id
      );
      
      res.json(profile);
    } catch (error) {
      console.error("Get organization profile error:", error);
      const message = sanitizeError(error, "Failed to fetch organization profile");
      const statusCode = message.includes("Unauthorized") ? 403 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Remove user from organization
   */
  app.delete("/api/organizations/:id/users/:userId", userDeleteLimiter, requireAuth, async (req, res) => {
    try {
      const { id: organizationId, userId } = req.params;

      // Validate UUID formats
      if (!isValidUUID(organizationId) || !isValidUUID(userId)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      await organizationService.removeUserFromOrganization(
        organizationId,
        userId,
        req.session.user!.id
      );
      
      res.json({ message: "User removed from organization successfully" });
    } catch (error) {
      console.error("Remove user from organization error:", error);
      const message = sanitizeError(error, "Failed to remove user from organization");
      const statusCode = message.includes("Unauthorized") ? 403 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Add user to organization
   */
  app.post("/api/organizations/:id/users", requireAuth, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }

      const user = await organizationService.addUserToOrganization(
        organizationId,
        req.body,
        req.session.user!.id
      );

      res.status(201).json(user);
    } catch (error) {
      console.error("Add user to organization error:", error);
      const message = sanitizeError(error, "Failed to add user to organization");
      const statusCode = message.includes("Unauthorized") ? 403 : 400;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Update user role within organization
   * Allows org admins to change roles of users within their organization
   */
  app.put("/api/organizations/:id/users/:userId/role", updateLimiter, requireAuth, async (req, res) => {
    try {
      const { id: organizationId, userId } = req.params;
      const { role } = req.body;
      const requestingUser = req.session.user!;

      // Validate UUID formats
      if (!isValidUUID(organizationId) || !isValidUUID(userId)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      // Validate role
      const validRoles = ['org_admin', 'coach', 'athlete'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be org_admin, coach, or athlete" });
      }

      // Prevent users from changing their own role
      if (userId === requestingUser.id) {
        return res.status(403).json({ message: "Cannot change your own role" });
      }

      // Check requesting user's access to this organization
      const requestingUserRoles = await storage.getUserRoles(requestingUser.id, organizationId);
      const isOrgAdmin = requestingUserRoles.includes('org_admin');
      const isSiteAdmin = requestingUser.isSiteAdmin === true;

      if (!isOrgAdmin && !isSiteAdmin) {
        return res.status(403).json({ message: "Access denied. Only organization administrators can change user roles." });
      }

      // Check if target user is in this organization
      const targetUserRoles = await storage.getUserRoles(userId, organizationId);
      if (targetUserRoles.length === 0) {
        return res.status(404).json({ message: "User not found in this organization" });
      }

      // Additional permission checks for org admins (not site admins)
      if (!isSiteAdmin) {
        const targetCurrentRole = targetUserRoles[0];

        // Org admins can't demote other org admins (only site admins can)
        if (targetCurrentRole === 'org_admin' && role !== 'org_admin') {
          return res.status(403).json({ message: "Only site administrators can demote organization administrators" });
        }
      }

      // Update the user's role in the organization
      await storage.updateUserOrganizationRole(userId, organizationId, role);

      // Create audit log
      await storage.createAuditLog({
        userId: requestingUser.id,
        action: 'user_role_updated',
        resourceType: 'user_organization',
        resourceId: userId,
        details: JSON.stringify({
          organizationId,
          newRole: role,
          updatedBy: requestingUser.id
        }),
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      });

      res.json({ message: "User role updated successfully", role });
    } catch (error) {
      console.error("Update user organization role error:", error);
      const message = sanitizeError(error, "Failed to update user role");
      const statusCode = message.includes("Unauthorized") || message.includes("Access denied") ? 403 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Get organizations with users (legacy endpoint for compatibility)
   */
  app.get("/api/organizations-with-users", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user!;

      // Get user's organizations
      const userOrganizations = await organizationService.getAccessibleOrganizations(currentUser.id);

      // For site admins, get all organizations
      if (currentUser.isSiteAdmin === true) {
        const allOrganizations = await organizationService.getAllOrganizations(currentUser.id);
        const orgIds = allOrganizations.map(org => org.id);

        // Fetch all profiles in batch (optimized to avoid N+1 queries)
        const profilesMap = await organizationService.getOrganizationProfilesBatch(orgIds, currentUser.id);

        const organizationsWithUsers = allOrganizations.map(org => {
          const profile = profilesMap.get(org.id);
          return {
            ...org,
            users: profile?.users || [],
            invitations: profile?.invitations || []
          };
        });

        res.json(organizationsWithUsers);
      } else {
        // For non-admin users, return their organizations with user lists
        const orgIds = userOrganizations.map(org => org.id);

        // Fetch all profiles in batch (optimized to avoid N+1 queries)
        const profilesMap = await organizationService.getOrganizationProfilesBatch(orgIds, currentUser.id);

        const organizationsWithUsers = userOrganizations.map(org => {
          const profile = profilesMap.get(org.id);
          return {
            ...org,
            users: profile?.users || [],
            invitations: profile?.invitations || []
          };
        });

        res.json(organizationsWithUsers);
      }
    } catch (error) {
      console.error("Get organizations with users error:", error);
      res.status(500).json({ message: "Failed to fetch organizations with users" });
    }
  });

  /**
   * Update organization status (deactivate/reactivate) (site admin only)
   */
  app.patch("/api/organizations/:id/status", orgDeleteLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }

      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }

      // Capture request context for audit logging
      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      if (isActive) {
        await organizationService.reactivateOrganization(organizationId, req.session.user!.id, context);
        res.json({ message: "Organization reactivated successfully" });
      } else {
        await organizationService.deactivateOrganization(organizationId, req.session.user!.id, context);
        res.json({ message: "Organization deactivated successfully" });
      }
    } catch (error) {
      console.error("Update organization status error:", error);
      const message = sanitizeError(error, "Failed to update organization status");
      const statusCode = message.includes("Unauthorized") ? 403
        : message.includes("not found") ? 404
        : message.includes("already") ? 400
        : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Get organization dependency counts (site admin only)
   */
  app.get("/api/organizations/:id/dependencies", requireSiteAdmin, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }

      // Capture request context for audit logging
      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      const counts = await organizationService.getOrganizationDependencyCounts(
        organizationId,
        req.session.user!.id,
        context
      );
      res.json(counts);
    } catch (error) {
      console.error("Get organization dependencies error:", error);
      const message = sanitizeError(error, "Failed to fetch organization dependencies");
      const statusCode = message.includes("Unauthorized") ? 403 : message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Delete organization permanently (site admin only)
   * Requires confirmation name and organization must have no dependencies
   */
  app.delete("/api/organizations/:id", orgDeleteLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }

      const { confirmationName } = req.body;

      if (!confirmationName) {
        return res.status(400).json({ message: "Confirmation name is required" });
      }

      // Capture request context for audit logging
      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      await organizationService.deleteOrganization(
        organizationId,
        confirmationName,
        req.session.user!.id,
        context
      );

      res.json({ message: "Organization deleted successfully" });
    } catch (error) {
      console.error("Delete organization error:", error);
      const message = sanitizeError(error, "Failed to delete organization");
      const statusCode = message.includes("Unauthorized") ? 403
        : message.includes("not found") ? 404
        : message.includes("dependencies") || message.includes("confirmation") ? 400
        : 500;
      res.status(statusCode).json({ message });
    }
  });
}