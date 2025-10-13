/**
 * Organization management routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { OrganizationService } from "../services/organization-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
// Session types are loaded globally

const organizationService = new OrganizationService();

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
});

// Stricter rate limiting for user deletion operations
const userDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.USER_DELETION,
  message: { message: "Too many deletion attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Rate limiting for organization deletion operations
const orgDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.ORG_DELETION,
  message: { message: "Too many organization deletion attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Combine IP and user ID to prevent bypass via IP spoofing
  keyGenerator: (req) => {
    const userId = req.session?.user?.id;
    const ip = req.ip || 'unknown';
    return userId ? `${ip}-${userId}` : ip;
  },
});

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
      const message = error instanceof Error ? error.message : "Failed to fetch organizations";
      res.status(500).json({ message });
    }
  });

  /**
   * Get organization by ID
   */
  app.get("/api/organizations/:id", requireAuth, async (req, res) => {
    try {
      const organizationId = req.params.id;
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
      const message = error instanceof Error ? error.message : "Failed to fetch organization";
      res.status(500).json({ message });
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
      const message = error instanceof Error ? error.message : "Failed to create organization";
      res.status(400).json({ message });
    }
  });

  /**
   * Get organization profile with users
   */
  app.get("/api/organizations/:id/profile", requireAuth, async (req, res) => {
    try {
      const organizationId = req.params.id;
      const profile = await organizationService.getOrganizationProfile(
        organizationId, 
        req.session.user!.id
      );
      
      res.json(profile);
    } catch (error) {
      console.error("Get organization profile error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch organization profile";
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
      
      await organizationService.removeUserFromOrganization(
        organizationId,
        userId,
        req.session.user!.id
      );
      
      res.json({ message: "User removed from organization successfully" });
    } catch (error) {
      console.error("Remove user from organization error:", error);
      const message = error instanceof Error ? error.message : "Failed to remove user from organization";
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
      
      const user = await organizationService.addUserToOrganization(
        organizationId,
        req.body,
        req.session.user!.id
      );
      
      res.status(201).json(user);
    } catch (error) {
      console.error("Add user to organization error:", error);
      const message = error instanceof Error ? error.message : "Failed to add user to organization";
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
      const message = error instanceof Error ? error.message : "Failed to update organization status";
      const statusCode = message.includes("Unauthorized") ? 403 : message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Get organization dependency counts (site admin only)
   */
  app.get("/api/organizations/:id/dependencies", requireSiteAdmin, async (req, res) => {
    try {
      const organizationId = req.params.id;

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
      const message = error instanceof Error ? error.message : "Failed to fetch organization dependencies";
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
      const message = error instanceof Error ? error.message : "Failed to delete organization";
      const statusCode = message.includes("Unauthorized") ? 403
        : message.includes("not found") ? 404
        : message.includes("dependencies") || message.includes("confirmation") ? 400
        : 500;
      res.status(statusCode).json({ message });
    }
  });
}