/**
 * Team management routes
 * Uses TeamService for direct DB access instead of storage layer
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { TeamService } from "../services/team-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { insertTeamSchema, measurements, userOrganizations } from "@shared/schema";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { ZodError } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { RoleManager } from "../auth/role-manager";
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
      let organizationId = req.query.organizationId as string | undefined;

      if (!organizationId && !isSiteAdmin(user)) {
        organizationId = user.primaryOrganizationId;
      }

      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      // Permission check: non-admin users can only access their organization
      if (!isSiteAdmin(user) && user.primaryOrganizationId !== organizationId) {
        return res.status(403).json({ message: "Access denied - organization mismatch" });
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

      // Permission check: non-admin users can only access their organization's teams
      if (!isSiteAdmin(user) && user.primaryOrganizationId !== team.organization.id) {
        return res.status(403).json({ message: "Access denied - team belongs to different organization" });
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
   * Create team (org admins and coaches)
   */
  app.post("/api/teams", teamMutationLimiter, requireAuth, RoleManager.requirePermission('CREATE_TEAM'), async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate request body using Zod schema
      const validatedData = insertTeamSchema.parse(req.body);

      // Permission check: non-admin users can only create teams in their organization
      if (!isSiteAdmin(user) && user.primaryOrganizationId !== validatedData.organizationId) {
        return res.status(403).json({ message: "Access denied - cannot create team in different organization" });
      }

      const team = await teamService.createTeam(validatedData);
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
  app.put("/api/teams/:id", teamMutationLimiter, requireAuth, RoleManager.requirePermission('MANAGE_TEAM'), async (req, res) => {
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

      // Permission check: non-admin users can only update their organization's teams
      if (!isSiteAdmin(user) && user.primaryOrganizationId !== existingTeam.organization.id) {
        return res.status(403).json({ message: "Access denied - team belongs to different organization" });
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
  app.delete("/api/teams/:id", teamMutationLimiter, requireAuth, RoleManager.requirePermission('DELETE_TEAM'), async (req, res) => {
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

      // Permission check: non-admin users can only delete their organization's teams
      if (!isSiteAdmin(user) && user.primaryOrganizationId !== existingTeam.organization.id) {
        return res.status(403).json({ message: "Access denied - team belongs to different organization" });
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
  app.post("/api/teams/:id/archive", teamMutationLimiter, requireAuth, RoleManager.requirePermission('MANAGE_TEAM'), async (req, res) => {
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

      // Permission check: non-admin users can only archive their organization's teams
      if (!isSiteAdmin(user) && user.primaryOrganizationId !== existingTeam.organization.id) {
        return res.status(403).json({ message: "Access denied - team belongs to different organization" });
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
  app.post("/api/teams/:id/unarchive", teamMutationLimiter, requireAuth, RoleManager.requirePermission('MANAGE_TEAM'), async (req, res) => {
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

      // Permission check: non-admin users can only unarchive their organization's teams
      if (!isSiteAdmin(user) && user.primaryOrganizationId !== existingTeam.organization.id) {
        return res.status(403).json({ message: "Access denied - team belongs to different organization" });
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
  app.post("/api/teams/:id/members", teamMutationLimiter, requireAuth, RoleManager.requirePermission('MANAGE_TEAM'), async (req, res) => {
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

      // Permission check: non-admin users can only add members to their organization's teams
      if (!isSiteAdmin(user) && user.primaryOrganizationId !== existingTeam.organization.id) {
        return res.status(403).json({ message: "Access denied - team belongs to different organization" });
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
  app.delete("/api/teams/:id/members/:userId", teamMutationLimiter, requireAuth, RoleManager.requirePermission('MANAGE_TEAM'), async (req, res) => {
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

      // Permission check: non-admin users can only remove members from their organization's teams
      if (!isSiteAdmin(user) && user.primaryOrganizationId !== existingTeam.organization.id) {
        return res.status(403).json({ message: "Access denied - team belongs to different organization" });
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
   * Update team membership (org admins and coaches)
   */
  app.patch("/api/teams/:id/members/:userId", teamMutationLimiter, requireAuth, RoleManager.requirePermission('MANAGE_TEAM'), async (req, res) => {
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

      // Permission check: non-admin users can only update memberships in their organization's teams
      if (!isSiteAdmin(user) && user.primaryOrganizationId !== existingTeam.organization.id) {
        return res.status(403).json({ message: "Access denied - team belongs to different organization" });
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
