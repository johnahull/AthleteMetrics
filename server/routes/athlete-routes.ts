/**
 * Athlete management routes
 *
 * MIDDLEWARE MIGRATION STATUS:
 * ✅ POST /api/athletes - Uses requireAthleteManagementPermission
 * ✅ PUT /api/athletes/:id - Uses requireAthleteAccessPermission
 * ✅ DELETE /api/athletes/:id - Uses requireAthleteAccessPermission
 * ⚠️  GET /api/athletes/:id - Has inline permission checks (legacy pattern)
 * ⚠️  GET /api/athletes - No specific permission middleware (requireAuth only)
 *
 * Future: Migrate GET routes to use middleware for consistency
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { insertUserSchema, insertAthleteSchema } from "@shared/schema";
import {
  requireAthleteManagementPermission,
  requireAthleteAccessPermission
} from "../middleware/athlete-permissions";
// Session types are loaded globally

// Helper function to check if user is site admin
function isSiteAdmin(user: any): boolean {
  return user?.isSiteAdmin === true;
}

// Rate limiting for athlete endpoints
const athleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 athlete requests per windowMs
  message: { message: "Too many athlete requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter rate limiting for delete operations
const athleteDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Limit each IP to 10 delete requests per windowMs (conservative for safety)
  message: { message: "Too many deletion attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerAthleteRoutes(app: Express) {
  /**
   * Get all athletes with optional filtering
   */
  app.get("/api/athletes", athleteLimiter, requireAuth, async (req, res) => {
    try {
      // Parse and validate query parameters with proper typing
      const filters: Parameters<typeof storage.getAthletes>[0] = {};
      
      if (req.query.teamId) filters.teamId = req.query.teamId as string;
      if (req.query.organizationId) filters.organizationId = req.query.organizationId as string;
      if (req.query.birthYearFrom) {
        const year = parseInt(req.query.birthYearFrom as string);
        if (!isNaN(year)) filters.birthYearFrom = year;
      }
      if (req.query.birthYearTo) {
        const year = parseInt(req.query.birthYearTo as string);
        if (!isNaN(year)) filters.birthYearTo = year;
      }
      if (req.query.search) filters.search = req.query.search as string;
      if (req.query.gender) filters.gender = req.query.gender as string;

      const athletes = await storage.getAthletes(filters);
      
      // Transform the data to match the frontend's expected format
      const transformedAthletes = athletes.map(athlete => ({
        id: athlete.id,
        name: `${athlete.firstName} ${athlete.lastName}`,
        fullName: `${athlete.firstName} ${athlete.lastName}`,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        teamName: athlete.teams && athlete.teams.length > 0 ? athlete.teams[0].name : undefined,
        teams: athlete.teams?.map(team => ({
          id: team.id,
          name: team.name,
          organization: team.organization
        })) || [],
        birthYear: athlete.birthYear,
        birthDate: athlete.birthDate,
        graduationYear: athlete.graduationYear,
        school: athlete.school,
        phoneNumbers: athlete.phoneNumbers,
        emails: athlete.emails,
        sports: athlete.sports,
        positions: athlete.positions,
        height: athlete.height,
        weight: athlete.weight,
        gender: athlete.gender,
        isActive: athlete.isActive,
      }));

      res.json(transformedAthletes);
    } catch (error) {
      console.error("Get athletes error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch athletes";
      res.status(500).json({ message });
    }
  });

  /**
   * Get athlete by ID
   */
  app.get("/api/athletes/:id", athleteLimiter, requireAuth, async (req, res) => {
    try {
      const athleteId = req.params.id;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const athlete = await storage.getAthlete(athleteId);
      if (!athlete) {
        return res.status(404).json({ message: "Athlete not found" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Athletes can only view their own athlete data
      if (currentUser.role === "athlete") {
        if (currentUser.athleteId !== athleteId) {
          return res.status(403).json({ message: "Athletes can only view their own profile" });
        }
      } else if (!userIsSiteAdmin) {
        // Coaches and org admins can only view athletes from their organization
        // Check if user has access to the same organization as the athlete
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        if (userOrgs.length === 0) {
          return res.status(403).json({ message: "Access denied - no organization access" });
        }

        // Get the athlete's organization assignments (primary check)
        const athleteOrgs = await storage.getUserOrganizations(athleteId);

        // Also check athlete's teams for backward compatibility
        const athleteTeams = await storage.getUserTeams(athleteId);

        // Athlete must belong to at least one organization OR have team assignments
        if (athleteOrgs.length === 0 && athleteTeams.length === 0) {
          return res.status(403).json({ message: "Athlete has no organization or team assignments" });
        }

        // Check if user has access to any of the athlete's organizations
        const userOrgIds = userOrgs.map(org => org.organizationId);
        const athleteOrgIds = athleteOrgs.map(org => org.organizationId);
        const athleteTeamOrgIds = athleteTeams.map(team => team.team.organizationId);

        // Combine both organization sources
        const allAthleteOrgIds = [...new Set([...athleteOrgIds, ...athleteTeamOrgIds])];

        const hasOrganizationAccess = allAthleteOrgIds.some(orgId => userOrgIds.includes(orgId));
        if (!hasOrganizationAccess) {
          return res.status(403).json({ message: "Access denied - athlete belongs to a different organization" });
        }
      }

      // Transform the data to match the frontend's expected format including teams
      const athleteTeams = await storage.getUserTeams(athleteId);
      const transformedAthlete = {
        id: athlete.id,
        name: `${athlete.firstName} ${athlete.lastName}`,
        fullName: `${athlete.firstName} ${athlete.lastName}`,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        teamName: athleteTeams.length > 0 ? athleteTeams[0].team.name : undefined,
        teams: athleteTeams.map(userTeam => ({
          id: userTeam.team.id,
          name: userTeam.team.name,
          organization: userTeam.team.organization
        })),
        birthYear: athlete.birthYear,
        birthDate: athlete.birthDate,
        graduationYear: athlete.graduationYear,
        school: athlete.school,
        phoneNumbers: athlete.phoneNumbers,
        sports: athlete.sports,
        positions: athlete.positions,
        height: athlete.height,
        weight: athlete.weight,
        gender: athlete.gender,
        emails: athlete.emails
      };

      res.json(transformedAthlete);
    } catch (error) {
      console.error("Get athlete error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch athlete";
      res.status(500).json({ message });
    }
  });

  /**
   * Create athlete (org admins and coaches can create within their organization)
   */
  app.post("/api/athletes", athleteLimiter, requireAuth, requireAthleteManagementPermission, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate request body using Zod schema
      const validatedData = insertAthleteSchema.parse(req.body);

      // Get the user's organization context to assign the athlete
      const userOrgs = await storage.getUserOrganizations(currentUser.id);

      if (!isSiteAdmin(currentUser) && userOrgs.length === 0) {
        return res.status(403).json({ message: "No organization context found. Athletes must belong to an organization." });
      }

      // Create the athlete
      const athlete = await storage.createAthlete(validatedData);

      // Assign athlete to the user's organization
      // For site admins with no org context, or users with an org, add them to the first org
      if (userOrgs.length > 0) {
        const organizationId = userOrgs[0].organizationId;

        try {
          await storage.addUserToOrganization(athlete.id, organizationId, "athlete");
          console.log(`[CREATE ATHLETE] Assigned athlete ${athlete.id} to organization ${organizationId}`);
        } catch (error) {
          console.error(`[CREATE ATHLETE] Failed to assign athlete to organization:`, error);
          // Don't fail the request, but log the error
        }
      }

      res.status(201).json(athlete);
    } catch (error) {
      console.error("Create athlete error:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input data", errors: error.message });
      }
      const message = error instanceof Error ? error.message : "Failed to create athlete";
      res.status(400).json({ message });
    }
  });

  /**
   * Update athlete (org admins and coaches can update athletes in their organization)
   */
  app.put("/api/athletes/:id", athleteLimiter, requireAuth, requireAthleteAccessPermission, async (req, res) => {
    try {
      const athleteId = req.params.id;

      // Validate request body using partial schema (for updates)
      const updateSchema = insertAthleteSchema.partial();
      const validatedData = updateSchema.parse(req.body);

      const updatedAthlete = await storage.updateAthlete(athleteId, validatedData);
      res.json(updatedAthlete);
    } catch (error) {
      console.error("Update athlete error:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input data", errors: error.message });
      }
      const message = error instanceof Error ? error.message : "Failed to update athlete";
      res.status(400).json({ message });
    }
  });

  /**
   * Toggle athlete active status (org admins and coaches within their organization)
   */
  app.patch("/api/athletes/:id/status", athleteLimiter, requireAuth, requireAthleteAccessPermission, async (req, res) => {
    try {
      const athleteId = req.params.id;
      const { isActive } = req.body;

      // Validate isActive is a boolean
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }

      // Update user's active status
      const updatedUser = await storage.updateUser(athleteId, { isActive });

      res.json({
        id: updatedUser.id,
        isActive: updatedUser.isActive,
        message: isActive ? "Athlete activated successfully" : "Athlete deactivated successfully"
      });
    } catch (error) {
      console.error("Toggle athlete status error:", error);
      const message = error instanceof Error ? error.message : "Failed to toggle athlete status";
      res.status(500).json({ message });
    }
  });

  /**
   * Delete athlete (org admins and coaches within their organization)
   */
  app.delete("/api/athletes/:id", athleteDeleteLimiter, requireAuth, requireAthleteAccessPermission, async (req, res) => {
    try {
      const athleteId = req.params.id;

      console.log('[DELETE ATHLETE] Starting deletion for athlete:', athleteId);
      await storage.deleteAthlete(athleteId);
      console.log('[DELETE ATHLETE] Successfully deleted athlete:', athleteId);
      res.json({ message: "Athlete deleted successfully" });
    } catch (error) {
      console.error("[DELETE ATHLETE] Error:", error);
      console.error("[DELETE ATHLETE] Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      const message = error instanceof Error ? error.message : "Failed to delete athlete";
      res.status(500).json({ message, error: String(error) });
    }
  });

  /**
   * Bulk delete athletes (org admins and coaches within their organization)
   */
  app.post("/api/athletes/bulk-delete", athleteDeleteLimiter, requireAuth, async (req, res) => {
    try {
      const { athleteIds } = req.body;

      if (!Array.isArray(athleteIds) || athleteIds.length === 0) {
        return res.status(400).json({ message: "athleteIds must be a non-empty array" });
      }

      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);
      let deletedCount = 0;
      let failedCount = 0;

      for (const athleteId of athleteIds) {
        try {
          // Check permissions for each athlete
          if (!userIsSiteAdmin) {
            const athlete = await storage.getAthlete(athleteId);
            if (!athlete) {
              failedCount++;
              continue;
            }

            // Check organization access
            const userOrgs = await storage.getUserOrganizations(currentUser.id);
            const athleteTeams = await storage.getUserTeams(athleteId);

            const userOrgIds = userOrgs.map(org => org.organizationId);
            const athleteOrgIds = athleteTeams.map(team => team.team.organizationId);

            const hasAccess = athleteOrgIds.some(orgId => userOrgIds.includes(orgId));
            if (!hasAccess) {
              failedCount++;
              continue;
            }
          }

          await storage.deleteAthlete(athleteId);
          deletedCount++;
        } catch (error) {
          console.error(`[BULK DELETE] Failed to delete athlete ${athleteId}:`, error);
          failedCount++;
        }
      }

      res.json({
        deleted: deletedCount,
        failed: failedCount,
        message: `${deletedCount} athlete(s) deleted successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`
      });
    } catch (error) {
      console.error("[BULK DELETE] Error:", error);
      const message = error instanceof Error ? error.message : "Failed to bulk delete athletes";
      res.status(500).json({ message });
    }
  });

  /**
   * Bulk invite athletes (org admins and coaches within their organization)
   */
  app.post("/api/athletes/bulk-invite", athleteLimiter, requireAuth, async (req, res) => {
    try {
      const { athleteIds, organizationId } = req.body;

      if (!Array.isArray(athleteIds) || athleteIds.length === 0) {
        return res.status(400).json({ message: "athleteIds must be a non-empty array" });
      }

      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      let invitedCount = 0;
      let skippedCount = 0;

      for (const athleteId of athleteIds) {
        try {
          const athlete = await storage.getAthlete(athleteId);
          if (!athlete) {
            skippedCount++;
            continue;
          }

          // Skip if athlete has no email
          if (!athlete.emails || athlete.emails.length === 0) {
            skippedCount++;
            continue;
          }

          // Create invitation for each email
          for (const email of athlete.emails) {
            try {
              await storage.createInvitation({
                email,
                firstName: athlete.firstName,
                lastName: athlete.lastName,
                role: "athlete",
                organizationId,
                teamIds: [],
                invitedBy: currentUser.id,
                playerId: athleteId,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expires in 7 days
              });
              invitedCount++;
            } catch (error) {
              // Skip if invitation already exists or other error
              console.error(`[BULK INVITE] Failed to create invitation for ${email}:`, error);
            }
          }
        } catch (error) {
          console.error(`[BULK INVITE] Failed to process athlete ${athleteId}:`, error);
          skippedCount++;
        }
      }

      res.json({
        invited: invitedCount,
        skipped: skippedCount,
        message: `${invitedCount} invitation(s) created${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`
      });
    } catch (error) {
      console.error("[BULK INVITE] Error:", error);
      const message = error instanceof Error ? error.message : "Failed to bulk invite athletes";
      res.status(500).json({ message });
    }
  });
}