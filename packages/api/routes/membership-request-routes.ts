/**
 * Membership request routes - handles athlete-initiated requests to join organizations
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requireAuth } from "../middleware";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { isSiteAdmin } from "@shared/auth-utils";
import { createMembershipRequestSchema, type OrganizationType } from "@shared/schema";

// Rate limiting for membership request creation
const requestCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10, // 10 requests per hour per user
  message: { message: "Too many membership requests. Please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'general'),
});

// Rate limiting for directory browsing (prevent scraping)
const directoryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 requests per 15 minutes
  message: { message: "Too many directory requests. Please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'general'),
});

// Rate limiting for general membership routes
const membershipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 50,
  message: { message: "Too many requests. Please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'general'),
});

export function registerMembershipRequestRoutes(app: Express) {
  /**
   * Create a new membership request
   * POST /api/membership-requests
   */
  app.post("/api/membership-requests", requestCreateLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Validate request body
      const parseResult = createMembershipRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: "Invalid request data",
          errors: parseResult.error.errors
        });
      }

      const { organizationId, discoveryMethod } = parseResult.data;

      // Create the request
      const request = await storage.createMembershipRequest({
        userId,
        organizationId,
        discoveryMethod,
      });

      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'membership_request_created',
        resourceType: 'membership_request',
        resourceId: request.id,
        details: JSON.stringify({
          organizationId,
          discoveryMethod,
          status: request.status,
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.status(201).json({
        request,
        message: request.status === 'approved'
          ? "Your request has been automatically approved! You are now a member."
          : "Your membership request has been submitted and is pending approval."
      });
    } catch (error) {
      console.error("Error creating membership request:", error);
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to create membership request" });
    }
  });

  /**
   * Get membership requests for the current user
   * GET /api/membership-requests/my
   */
  app.get("/api/membership-requests/my", membershipLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const requests = await storage.getMembershipRequestsByUser(userId);
      res.json({ requests });
    } catch (error) {
      console.error("Error fetching user's membership requests:", error);
      res.status(500).json({ message: "Failed to fetch membership requests" });
    }
  });

  /**
   * Get membership requests for an organization (admin/coach only)
   * GET /api/membership-requests/organization/:organizationId
   */
  app.get("/api/membership-requests/organization/:organizationId", membershipLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      const status = req.query.status as string | undefined;
      const userId = req.session.user?.id;
      const currentUser = req.session.user;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Check permissions - must be org admin or coach in the org
      const userOrgs = await storage.getUserOrganizations(userId);
      const userOrgRole = userOrgs.find(org => org.organizationId === organizationId);
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userOrgRole && !userIsSiteAdmin) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      // Only org_admin and coach can view requests
      if (!userIsSiteAdmin && userOrgRole?.role !== 'org_admin' && userOrgRole?.role !== 'coach') {
        return res.status(403).json({ message: "Insufficient permissions to view membership requests" });
      }

      const requests = await storage.getMembershipRequestsByOrganization(organizationId, { status });
      res.json({ requests });
    } catch (error) {
      console.error("Error fetching organization membership requests:", error);
      res.status(500).json({ message: "Failed to fetch membership requests" });
    }
  });

  /**
   * Approve a membership request
   * POST /api/membership-requests/:id/approve
   *
   * Optional body:
   * - linkToAthleteId: string - ID of an existing unlinked athlete to link
   *
   * When linkToAthleteId is provided, the existing athlete's data (measurements,
   * team memberships, profile) is transferred to the requester's account.
   */
  app.post("/api/membership-requests/:id/approve", membershipLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { linkToAthleteId } = req.body;
      const userId = req.session.user?.id;
      const currentUser = req.session.user;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get the request to check permissions
      const request = await storage.getMembershipRequest(id);
      if (!request) {
        return res.status(404).json({ message: "Membership request not found" });
      }

      // Check permissions - must be org admin or coach in the org
      const userOrgs = await storage.getUserOrganizations(userId);
      const userOrgRole = userOrgs.find(org => org.organizationId === request.organizationId);
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userOrgRole && !userIsSiteAdmin) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      // Only org_admin and coach can approve requests
      if (!userIsSiteAdmin && userOrgRole?.role !== 'org_admin' && userOrgRole?.role !== 'coach') {
        return res.status(403).json({ message: "Insufficient permissions to approve membership requests" });
      }

      // If linking to existing athlete, verify the athlete exists and is unlinked
      if (linkToAthleteId) {
        const unlinkedAthletes = await storage.getUnlinkedAthletes(request.organizationId);
        const athleteToLink = unlinkedAthletes.find(a => a.id === linkToAthleteId);
        if (!athleteToLink) {
          return res.status(400).json({
            message: "Invalid athlete to link - athlete not found or already has login credentials"
          });
        }
      }

      const updated = await storage.approveMembershipRequest(id, userId, linkToAthleteId);

      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'membership_request_approved',
        resourceType: 'membership_request',
        resourceId: id,
        details: JSON.stringify({
          requesterId: request.userId,
          organizationId: request.organizationId,
          linkedAthleteId: linkToAthleteId || null,
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        request: updated,
        message: linkToAthleteId
          ? "Membership request approved and linked to existing athlete"
          : "Membership request approved successfully"
      });
    } catch (error) {
      console.error("Error approving membership request:", error);
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to approve membership request" });
    }
  });

  /**
   * Reject a membership request
   * POST /api/membership-requests/:id/reject
   */
  app.post("/api/membership-requests/:id/reject", membershipLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.session.user?.id;
      const currentUser = req.session.user;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get the request to check permissions
      const request = await storage.getMembershipRequest(id);
      if (!request) {
        return res.status(404).json({ message: "Membership request not found" });
      }

      // Check permissions - must be org admin or coach in the org
      const userOrgs = await storage.getUserOrganizations(userId);
      const userOrgRole = userOrgs.find(org => org.organizationId === request.organizationId);
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userOrgRole && !userIsSiteAdmin) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      // Only org_admin and coach can reject requests
      if (!userIsSiteAdmin && userOrgRole?.role !== 'org_admin' && userOrgRole?.role !== 'coach') {
        return res.status(403).json({ message: "Insufficient permissions to reject membership requests" });
      }

      const updated = await storage.rejectMembershipRequest(id, userId, reason);

      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'membership_request_rejected',
        resourceType: 'membership_request',
        resourceId: id,
        details: JSON.stringify({
          requesterId: request.userId,
          organizationId: request.organizationId,
          reason,
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        request: updated,
        message: "Membership request rejected"
      });
    } catch (error) {
      console.error("Error rejecting membership request:", error);
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to reject membership request" });
    }
  });

  /**
   * Cancel own membership request
   * DELETE /api/membership-requests/:id
   */
  app.delete("/api/membership-requests/:id", membershipLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get the request to check ownership
      const request = await storage.getMembershipRequest(id);
      if (!request) {
        return res.status(404).json({ message: "Membership request not found" });
      }

      // Users can only cancel their own requests
      if (request.userId !== userId) {
        return res.status(403).json({ message: "You can only cancel your own membership requests" });
      }

      await storage.cancelMembershipRequest(id);

      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'membership_request_cancelled',
        resourceType: 'membership_request',
        resourceId: id,
        details: JSON.stringify({
          organizationId: request.organizationId,
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({ message: "Membership request cancelled" });
    } catch (error) {
      console.error("Error cancelling membership request:", error);
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to cancel membership request" });
    }
  });

  // NOTE: Public organization routes (/api/organizations/public and /api/organizations/join/:code)
  // are now in organization-routes.ts to ensure proper route ordering before /api/organizations/:id

  /**
   * Regenerate or set custom organization join code (org admin only)
   * POST /api/organizations/:id/regenerate-join-code
   * Body: { customCode?: string } - if provided, sets custom code; otherwise generates random
   */
  app.post("/api/organizations/:id/regenerate-join-code", membershipLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { customCode } = req.body;
      const userId = req.session.user?.id;
      const currentUser = req.session.user;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Verify organization exists
      const organization = await storage.getOrganization(id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check permissions - must be org admin
      const userOrgs = await storage.getUserOrganizations(userId);
      const userOrgRole = userOrgs.find(org => org.organizationId === id);
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userIsSiteAdmin && userOrgRole?.role !== 'org_admin') {
        return res.status(403).json({ message: "Only organization admins can manage join codes" });
      }

      const newCode = await storage.regenerateJoinCode(id, customCode);

      // Audit log
      await storage.createAuditLog({
        userId,
        action: customCode ? 'organization_join_code_set' : 'organization_join_code_regenerated',
        resourceType: 'organization',
        resourceId: id,
        details: JSON.stringify({ newCode, isCustom: !!customCode }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        joinCode: newCode,
        message: customCode ? "Join code updated successfully" : "Join code regenerated successfully"
      });
    } catch (error: any) {
      console.error("Error managing join code:", error);
      // Categorize errors for appropriate HTTP status codes
      const errorMessage = error.message || "Failed to update join code";
      const isValidationError =
        errorMessage.includes('must be') ||
        errorMessage.includes('can only') ||
        errorMessage.includes('already in use');

      res.status(isValidationError ? 400 : 500).json({ message: errorMessage });
    }
  });

  /**
   * Update organization membership settings (org admin only)
   * PATCH /api/organizations/:id/membership-settings
   */
  app.patch("/api/organizations/:id/membership-settings", membershipLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { isPublicDirectory, allowMembershipRequests, autoApproveRequests } = req.body;
      const userId = req.session.user?.id;
      const currentUser = req.session.user;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Check permissions - must be org admin
      const userOrgs = await storage.getUserOrganizations(userId);
      const userOrgRole = userOrgs.find(org => org.organizationId === id);
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userIsSiteAdmin && userOrgRole?.role !== 'org_admin') {
        return res.status(403).json({ message: "Only organization admins can update membership settings" });
      }

      const settings: {
        isPublicDirectory?: boolean;
        allowMembershipRequests?: boolean;
        autoApproveRequests?: boolean;
      } = {};

      if (typeof isPublicDirectory === 'boolean') settings.isPublicDirectory = isPublicDirectory;
      if (typeof allowMembershipRequests === 'boolean') settings.allowMembershipRequests = allowMembershipRequests;
      if (typeof autoApproveRequests === 'boolean') settings.autoApproveRequests = autoApproveRequests;

      if (Object.keys(settings).length === 0) {
        return res.status(400).json({ message: "No valid settings provided" });
      }

      const updated = await storage.updateOrganizationMembershipSettings(id, settings);

      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'organization_membership_settings_updated',
        resourceType: 'organization',
        resourceId: id,
        details: JSON.stringify(settings),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        organization: updated,
        message: "Membership settings updated successfully"
      });
    } catch (error) {
      console.error("Error updating membership settings:", error);
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to update membership settings" });
    }
  });

  /**
   * Get unlinked athletes in an organization
   * GET /api/organizations/:id/unlinked-athletes
   *
   * Returns athletes that have no login credentials (no password, no OAuth).
   * These athletes can be linked to incoming membership requests.
   *
   * Requires org admin or coach role.
   */
  app.get("/api/organizations/:id/unlinked-athletes", membershipLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.user?.id;
      const currentUser = req.session.user;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Check permissions - must be org admin or coach
      const userOrgs = await storage.getUserOrganizations(userId);
      const userOrgRole = userOrgs.find(org => org.organizationId === id);
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userOrgRole && !userIsSiteAdmin) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      if (!userIsSiteAdmin && userOrgRole?.role !== 'org_admin' && userOrgRole?.role !== 'coach') {
        return res.status(403).json({ message: "Insufficient permissions to view unlinked athletes" });
      }

      const unlinkedAthletes = await storage.getUnlinkedAthletes(id);

      // Return limited info for athlete selection
      const athletes = unlinkedAthletes.map(athlete => ({
        id: athlete.id,
        fullName: athlete.fullName,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        birthYear: athlete.birthYear,
        school: athlete.school,
      }));

      res.json({ athletes });
    } catch (error) {
      console.error("Error fetching unlinked athletes:", error);
      res.status(500).json({ message: "Failed to fetch unlinked athletes" });
    }
  });

  console.log("✅ Membership request routes registered");
}
