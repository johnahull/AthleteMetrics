/**
 * Team management routes
 * Uses TeamService for direct DB access instead of storage layer
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { TeamService, TeamServiceError } from "../services/team-service";
import { storage } from "../storage";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { insertTeamSchema, measurements, userOrganizations } from "@shared/schema";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { hasOrganizationAccess, validateOrganizationAccess } from "../helpers/org-access";
import { getAuthorizationError, AUTH_ERRORS } from "../helpers/auth-errors";
import { z, ZodError } from "zod";
import { db } from "../db";
import { and, eq, inArray } from "drizzle-orm";
import { requirePermission, getOrgRole } from "../permissions/index";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

// Rate limiting for team endpoints
const teamLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.STANDARD,
  message: { message: "Too many team requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter rate limiting for delete/archive operations
const teamMutationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.MUTATION,
  message: { message: "Too many team modification attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const bulkAthleteIdsSchema = z.object({
  athleteIds: z.array(z.string().uuid()).min(1).max(200),
}).strict();

export function registerTeamRoutes(app: Express) {
  const teamService = new TeamService();

  /**
   * Get all teams for an organization
   */
  app.get("/api/teams", teamLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get organizationId from query or user's primary organization
      const requestedOrgId = req.query.organizationId as string | undefined;

      // SECURITY: Validate organization access and get effective org ID
      const orgAccessResult = await validateOrganizationAccess(user, requestedOrgId);
      if (!orgAccessResult.allowed) {
        return res.status(403).json({
          message: getAuthorizationError(orgAccessResult.error!)
        });
      }

      const organizationId = orgAccessResult.effectiveOrgId;
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      const teams = await teamService.getTeams(organizationId);
      res.json(teams);
    } catch (error) {
      console.error("Get teams error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch teams";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Get team by ID
   */
  app.get("/api/teams/:id", teamLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const teamId = req.params.id;
      const team = await teamService.getTeam(teamId);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // SECURITY: Validate user has access to team's organization via database membership
      const hasAccess = await hasOrganizationAccess(user, team.organization.id);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.TEAM_ORG_MISMATCH) });
      }

      res.json(team);
    } catch (error) {
      console.error("Get team error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch team";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Get team members (active athletes/users on the team)
   * Returns array of { id, firstName, lastName, fullName }
   */
  app.get("/api/teams/:id/members", teamLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const teamId = req.params.id;
      const team = await teamService.getTeam(teamId);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // SECURITY: Validate user has access to team's organization via database membership
      const hasMemberAccess = await hasOrganizationAccess(user, team.organization.id);
      if (!hasMemberAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.TEAM_ORG_MISMATCH) });
      }

      // Get team members with IDOR protection at service layer
      const members = await teamService.getTeamMembers(
        teamId,
        isSiteAdmin(user) ? undefined : team.organization.id
      );

      res.json(members);
    } catch (error) {
      console.error("Get team members error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch team members";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Create team (org admins and coaches)
   */
  app.post("/api/teams", teamMutationLimiter, requireAuth, requirePermission('CREATE_TEAM'), async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate request body using Zod schema
      const validatedData = insertTeamSchema.parse(req.body);

      // SECURITY: Determine and validate organizationId
      let targetOrgId = validatedData.organizationId;
      if (!targetOrgId) {
        // If not provided, use the user's org from database membership
        const userOrgs = await storage.getUserOrganizations(user.id);
        if (userOrgs.length === 0) {
          return res.status(400).json({ message: "organizationId is required - user has no organization membership" });
        }
        targetOrgId = userOrgs[0].organizationId;
      } else {
        // If provided, validate user has access to that organization
        const hasCreateAccess = await hasOrganizationAccess(user, targetOrgId);
        if (!hasCreateAccess) {
          return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.TEAM_ORG_MISMATCH) });
        }
      }

      const team = await teamService.createTeam({ ...validatedData, organizationId: targetOrgId });
      res.status(201).json(team);
    } catch (error) {
      console.error("Create team error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input data", errors: error.errors });
      }
      const message = error instanceof Error ? error.message : "Failed to create team";
      res.status(400).json({ message });
    }
  });

  /**
   * Update team (org admins and coaches)
   */
  app.put("/api/teams/:id", teamMutationLimiter, requireAuth, requirePermission('MANAGE_TEAM'), async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const teamId = req.params.id;

      // Get existing team for permission check
      const existingTeam = await teamService.getTeam(teamId);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }

      // SECURITY: Validate user has access to team's organization via database membership
      const hasUpdateAccess = await hasOrganizationAccess(user, existingTeam.organization.id);
      if (!hasUpdateAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.TEAM_ORG_MISMATCH) });
      }

      // Validate request body using partial schema (for updates)
      const updateSchema = insertTeamSchema.partial();
      const validatedData = updateSchema.parse(req.body);

      // SECURITY FIX: Pass expectedOrganizationId for defense-in-depth IDOR protection
      const updatedTeam = await teamService.updateTeam(
        teamId,
        validatedData,
        isSiteAdmin(user) ? undefined : existingTeam.organization.id
      );
      res.json(updatedTeam);
    } catch (error) {
      console.error("Update team error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input data", errors: error.errors });
      }
      const message = error instanceof Error ? error.message : "Failed to update team";
      res.status(400).json({ message });
    }
  });

  /**
   * Delete team (org admins only)
   */
  app.delete("/api/teams/:id", teamMutationLimiter, requireAuth, requirePermission('DELETE_TEAM'), async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const teamId = req.params.id;

      // Get existing team for permission check
      const existingTeam = await teamService.getTeam(teamId);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }

      // SECURITY: Validate user has access to team's organization via database membership
      const hasAccess = await hasOrganizationAccess(user, existingTeam.organization.id);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.TEAM_ORG_MISMATCH) });
      }

      // SECURITY FIX: Measurement validation moved to service layer inside transaction
      // This prevents race condition where measurements could be created between
      // validation and deletion. Service layer now atomically checks and deletes.
      await teamService.deleteTeam(teamId);
      res.json({ message: "Team deleted successfully" });
    } catch (error) {
      console.error("Delete team error:", error);
      const message = error instanceof Error ? error.message : "Failed to delete team";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Archive team (org admins and coaches)
   */
  app.post("/api/teams/:id/archive", teamMutationLimiter, requireAuth, requirePermission('MANAGE_TEAM'), async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const teamId = req.params.id;
      const { archivedAt, season } = req.body;

      // Get existing team for permission check
      const existingTeam = await teamService.getTeam(teamId);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }

      // SECURITY: Validate user has access to team's organization via database membership
      const hasAccess = await hasOrganizationAccess(user, existingTeam.organization.id);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.TEAM_ORG_MISMATCH) });
      }

      const archiveDate = archivedAt ? new Date(archivedAt) : new Date();
      const archivedTeam = await teamService.archiveTeam(teamId, archiveDate, season);

      res.json(archivedTeam);
    } catch (error) {
      console.error("Archive team error:", error);
      const message = error instanceof Error ? error.message : "Failed to archive team";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Unarchive team (org admins and coaches)
   */
  app.post("/api/teams/:id/unarchive", teamMutationLimiter, requireAuth, requirePermission('MANAGE_TEAM'), async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const teamId = req.params.id;

      // Get existing team for permission check
      const existingTeam = await teamService.getTeam(teamId);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }

      // SECURITY: Validate user has access to team's organization via database membership
      const hasAccess = await hasOrganizationAccess(user, existingTeam.organization.id);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.TEAM_ORG_MISMATCH) });
      }

      const unarchivedTeam = await teamService.unarchiveTeam(teamId);
      res.json(unarchivedTeam);
    } catch (error) {
      console.error("Unarchive team error:", error);
      const message = error instanceof Error ? error.message : "Failed to unarchive team";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Add user to team (org admins and coaches)
   */
  app.post("/api/teams/:id/members", teamMutationLimiter, requireAuth, requirePermission('MANAGE_TEAM'), async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const teamId = req.params.id;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      // Get existing team for permission check
      const existingTeam = await teamService.getTeam(teamId);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }

      // SECURITY: Validate user has access to team's organization via database membership
      const hasAccess = await hasOrganizationAccess(user, existingTeam.organization.id);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.TEAM_ORG_MISMATCH) });
      }

      // SECURITY FIX: Pass expectedOrganizationId to service layer for TOCTOU-safe validation
      // Organization validation now happens INSIDE transaction to prevent race conditions
      // where user/team could be transferred between route check and service execution
      const membership = await teamService.addUserToTeam(
        userId,
        teamId,
        isSiteAdmin(user) ? undefined : existingTeam.organization.id
      );
      res.status(201).json(membership);
    } catch (error) {
      console.error("Add team member error:", error);
      const message = error instanceof Error ? error.message : "Failed to add member to team";
      res.status(400).json({ message });
    }
  });

  /**
   * Remove user from team (org admins and coaches)
   */
  app.delete("/api/teams/:id/members/:userId", teamMutationLimiter, requireAuth, requirePermission('MANAGE_TEAM'), async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const teamId = req.params.id;
      const userId = req.params.userId;

      // Get existing team for permission check
      const existingTeam = await teamService.getTeam(teamId);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }

      // SECURITY: Validate user has access to team's organization via database membership
      const hasAccess = await hasOrganizationAccess(user, existingTeam.organization.id);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.TEAM_ORG_MISMATCH) });
      }

      // SECURITY FIX: Pass expectedOrganizationId to service layer for TOCTOU-safe validation
      // Organization validation now happens INSIDE transaction to prevent race conditions
      await teamService.removeUserFromTeam(
        userId,
        teamId,
        isSiteAdmin(user) ? undefined : existingTeam.organization.id
      );
      res.json({ message: "Member removed from team successfully" });
    } catch (error) {
      console.error("Remove team member error:", error);
      const message = error instanceof Error ? error.message : "Failed to remove member from team";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Bulk add / remove athletes (org admins and coaches)
   * One request per bulk operation; each id is handled on its own and failures are reported per id.
   */
  const bulkMembershipHandler = (action: "add" | "remove") => async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const parsed = bulkAthleteIdsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "athleteIds must be 1 to 200 athlete ids" });
      }

      const teamId = req.params.id;
      const existingTeam = await teamService.getTeam(teamId);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }

      // SECURITY: Validate user has access to team's organization via database membership
      const hasAccess = await hasOrganizationAccess(user, existingTeam.organization.id);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.TEAM_ORG_MISMATCH) });
      }

      // The session role is the role in the caller's FIRST organization; use the role in the team's organization
      const orgRole = await getOrgRole(user, existingTeam.organization.id);
      if (orgRole !== "site_admin" && orgRole !== "org_admin" && orgRole !== "coach") {
        return res.status(403).json({ message: "Access denied - you must be an org admin or coach of this team's organization" });
      }

      if (action === "add" && existingTeam.isArchived) {
        return res.status(400).json({ message: "Cannot add athletes to an archived team" });
      }

      // Always pass the team's organization (site admins too) so the service, inside its transaction,
      // refuses athletes from other organizations (TOCTOU-safe)
      const organizationId = existingTeam.organization.id;
      const athleteIds = Array.from(new Set(parsed.data.athleteIds));

      // Role of each target in the team's organization, in one query (add only: rosters hold athletes)
      const targetRoles = new Map<string, string>();
      if (action === "add") {
        const rows = await db
          .select({ userId: userOrganizations.userId, role: userOrganizations.role })
          .from(userOrganizations)
          .where(and(eq(userOrganizations.organizationId, organizationId), inArray(userOrganizations.userId, athleteIds)));
        rows.forEach((row) => targetRoles.set(row.userId, row.role));
      }

      let success = 0;
      const errors: Array<{ athleteId: string; message: string }> = [];
      for (const athleteId of athleteIds) {
        try {
          if (action === "add") {
            const role = targetRoles.get(athleteId);
            if (role && role !== "athlete") {
              throw new TeamServiceError("Access denied - user is not an athlete in this organization");
            }
            await teamService.addUserToTeam(athleteId, teamId, organizationId);
          } else {
            // The caller's role and the team's organization are verified above, and removal only touches this
            // team's roster, so an athlete who has already left the organization can still be removed
            await teamService.removeUserFromTeam(athleteId, teamId, organizationId, { requireUserInOrganization: false });
          }
          success++;
        } catch (error) {
          // Only deliberate service errors reach the client; anything else (e.g. database errors) is logged
          if (!(error instanceof TeamServiceError)) {
            console.error(`Bulk ${action} team athlete ${athleteId} error:`, error);
          }
          errors.push({ athleteId, message: error instanceof TeamServiceError ? error.message : `Failed to ${action} athlete` });
        }
      }

      res.json({ success, errorCount: errors.length, errors });
    } catch (error) {
      console.error(`Bulk ${action} team athletes error:`, error);
      res.status(500).json({ message: `Failed to ${action} athletes` });
    }
  };

  app.post("/api/teams/:id/add-athletes", teamMutationLimiter, requireAuth, requirePermission('MANAGE_TEAM'), bulkMembershipHandler("add"));
  // DELETE with a JSON body: some proxies drop DELETE bodies, and a dropped body gets the 400 from validation
  app.delete("/api/teams/:id/remove-athletes", teamMutationLimiter, requireAuth, requirePermission('MANAGE_TEAM'), bulkMembershipHandler("remove"));

  /**
   * Update team membership (org admins and coaches)
   */
  app.patch("/api/teams/:id/members/:userId", teamMutationLimiter, requireAuth, requirePermission('MANAGE_TEAM'), async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const teamId = req.params.id;
      const userId = req.params.userId;
      const { leftAt, season } = req.body;

      // Get existing team for permission check
      const existingTeam = await teamService.getTeam(teamId);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }

      // SECURITY: Validate user has access to team's organization via database membership
      const hasAccess = await hasOrganizationAccess(user, existingTeam.organization.id);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.TEAM_ORG_MISMATCH) });
      }

      // SECURITY FIX: Pass expectedOrganizationId to service layer for TOCTOU-safe validation
      // Organization validation now happens INSIDE transaction to prevent race conditions
      const membership = await teamService.updateTeamMembership(
        teamId,
        userId,
        {
          leftAt: leftAt ? new Date(leftAt) : undefined,
          season,
        },
        isSiteAdmin(user) ? undefined : existingTeam.organization.id
      );

      res.json(membership);
    } catch (error) {
      console.error("Update team membership error:", error);
      const message = error instanceof Error ? error.message : "Failed to update team membership";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });
}
