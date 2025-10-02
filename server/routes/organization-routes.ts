/**
 * Organization management routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { OrganizationService } from "../services/organization-service";
import { requireAuth, requireSiteAdmin, asyncHandler } from "../middleware";
import { storage } from "../storage";
// Session types are loaded globally

const organizationService = new OrganizationService();

// Rate limiting for organization creation
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // Limit each IP to 5 organization creation requests per windowMs
  message: { message: "Too many organization creation attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerOrganizationRoutes(app: Express) {
  /**
   * Get all organizations (site admin only)
   */
  app.get("/api/organizations", requireSiteAdmin, asyncHandler(async (req: any, res: any) => {
    const organizations = await organizationService.getAllOrganizations(req.session.user!.id);
    res.json(organizations);
  }));

  /**
   * Get organization by ID
   */
  app.get("/api/organizations/:id", requireAuth, asyncHandler(async (req: any, res: any) => {
    const organizationId = req.params.id;
    const organization = await organizationService.getOrganizationById(
      organizationId,
      req.session.user!.id
    );

    if (!organization) {
      return res.status(404).json({ message: "Organization not found or access denied" });
    }

    res.json(organization);
  }));

  /**
   * Get user's organizations
   * Returns all organizations for site admins, assigned organizations for regular users
   */
  app.get("/api/my-organizations", requireAuth, asyncHandler(async (req: any, res: any) => {
    const organizations = await organizationService.getOrganizationsForUser(req.session.user!.id);
    res.json(organizations);
  }));

  /**
   * Create organization (site admin only)
   */
  app.post("/api/organizations", createLimiter, requireSiteAdmin, asyncHandler(async (req: any, res: any) => {
    const organization = await organizationService.createOrganization(
      req.body,
      req.session.user!.id
    );
    res.status(201).json(organization);
  }));

  /**
   * Get organization profile with users
   */
  app.get("/api/organizations/:id/profile", requireAuth, asyncHandler(async (req: any, res: any) => {
    const organizationId = req.params.id;
    const profile = await organizationService.getOrganizationProfile(
      organizationId,
      req.session.user!.id
    );

    res.json(profile);
  }));

  /**
   * Remove user from organization
   */
  app.delete("/api/organizations/:id/users/:userId", requireAuth, asyncHandler(async (req: any, res: any) => {
    const { id: organizationId, userId } = req.params;

    await organizationService.removeUserFromOrganization(
      organizationId,
      userId,
      req.session.user!.id
    );

    res.json({ message: "User removed from organization successfully" });
  }));

  /**
   * Add user to organization
   */
  app.post("/api/organizations/:id/users", requireAuth, asyncHandler(async (req: any, res: any) => {
    const organizationId = req.params.id;

    const user = await organizationService.addUserToOrganization(
      organizationId,
      req.body,
      req.session.user!.id
    );

    res.status(201).json(user);
  }));

  /**
   * Get organizations with users (legacy endpoint for compatibility)
   */
  app.get("/api/organizations-with-users", requireAuth, asyncHandler(async (req: any, res: any) => {
    const currentUser = req.session.user!;

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
      // Use storage to get userOrganizations with organizationId
      const userOrgs = await storage.getUserOrganizations(currentUser.id);
      const orgIds = userOrgs.map((userOrg: any) => userOrg.organizationId);

      // Fetch all profiles in batch (optimized to avoid N+1 queries)
      const profilesMap = await organizationService.getOrganizationProfilesBatch(orgIds, currentUser.id);

      const organizationsWithUsers = orgIds.map((orgId: string) => {
        const profile = profilesMap.get(orgId);
        return {
          id: orgId,
          name: profile?.organization?.name || 'Unknown Organization',
          ...profile?.organization,
          users: profile?.users || [],
          invitations: profile?.invitations || []
        };
      });

      res.json(organizationsWithUsers);
    }
  }));
}