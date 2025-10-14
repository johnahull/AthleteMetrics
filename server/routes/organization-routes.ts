/**
 * Organization management routes
 */

import type { Express } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { OrganizationService } from "../services/organization-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
// Session types are loaded globally

const organizationService = new OrganizationService();

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
  skip: (req) => process.env.BYPASS_GENERAL_RATE_LIMIT === 'true',
});

// Stricter rate limiting for user deletion operations
const userDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.USER_DELETION,
  message: { message: "Too many deletion attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => process.env.BYPASS_GENERAL_RATE_LIMIT === 'true',
});

// Rate limiting for organization deletion operations
const orgDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.ORG_DELETION,
  message: { message: "Too many organization deletion attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => process.env.BYPASS_GENERAL_RATE_LIMIT === 'true',
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
    const normalizedIp = ipKeyGenerator(req);
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
      res.status(201).json(organization);
    } catch (error) {
      console.error("Create organization error:", error);
      res.status(400).json({ message: sanitizeError(error, "Failed to create organization") });
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