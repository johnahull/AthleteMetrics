/**
 * Athlete management routes
 *
 * MIDDLEWARE MIGRATION STATUS:
 * ✅ POST /api/athletes - Uses requireAthleteManagementPermission
 * ✅ PUT /api/athletes/:id - Uses requireAthleteAccessPermission
 * ✅ DELETE /api/athletes/:id - Uses requireAthleteAccessPermission
 * ⚠️  GET /api/athletes/:id - Has inline permission checks (legacy pattern)
 * ⚠️  GET /api/athletes - No specific permission middleware (requireAuth only)
 * ⚠️  GET /api/athletes/:id/active-teams - Has inline permission checks (legacy pattern)
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
  requireAthleteAccessPermission,
  requireAthleteManagementAccess
} from "../middleware/athlete-permissions";
import { athleteQuerySchema } from "../validation/athlete-validation";
import { ZodError } from "zod";
import { isSiteAdmin } from "../utils/auth-helpers";
import { globalAthleteService } from "../services/global-athlete-service";
import { getAuthorizationError, AUTH_ERRORS } from "../helpers/auth-errors";
import { hasOrganizationAccess, validateOrganizationAccess } from "../helpers/org-access";
import { getCachedUserOrganizations } from "../helpers/cached-org-access";
import { logAuthorizationFailure } from "../helpers/audit-logging";
import { MeasurementService } from "../services/measurement-service";
import { dateStringSchema } from "@shared/date-utils";
import { z } from "zod";
import { handleParentEmailUpdate } from "../services/parent-link-helper";
// Session types are loaded globally

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
  // Create service instance once for all routes (avoid per-request instantiation)
  const measurementService = new MeasurementService();

  /**
   * Get recent athletes with measurements
   */
  app.get("/api/athletes/recent", athleteLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { organizationId, limit } = req.query;

      // Validate organizationId is provided
      if (!organizationId || typeof organizationId !== 'string') {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      // Validate limit parameter
      let parsedLimit = 5; // Default
      if (limit) {
        parsedLimit = parseInt(limit as string, 10);
        if (isNaN(parsedLimit) || parsedLimit < 1) {
          return res.status(400).json({ message: "Limit must be a positive integer" });
        }
        if (parsedLimit > 100) {
          return res.status(400).json({ message: "Limit cannot exceed 100" });
        }
      }

      // SECURITY: Validate user has access to requested organization (with caching)
      const hasAccess = await hasOrganizationAccess(currentUser, organizationId, req);
      if (!hasAccess) {
        return res.status(403).json({
          message: getAuthorizationError(AUTH_ERRORS.ORG_ACCESS_DENIED)
        });
      }

      // Fetch recent athletes
      const athletes = await storage.getRecentAthletes({
        organizationId,
        limit: parsedLimit,
      });

      res.json({ athletes });
    } catch (error) {
      console.error("Get recent athletes error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch recent athletes";
      res.status(500).json({ message });
    }
  });

  /**
   * Get all athletes with optional filtering
   */
  app.get("/api/athletes", athleteLimiter, requireAuth, async (req, res) => {
    try {
      // Validate query parameters using Zod schema
      const validatedParams = athleteQuerySchema.parse(req.query);

      // Build filters from validated parameters
      const filters: Parameters<typeof storage.getAthletes>[0] = {};

      if (validatedParams.teamId) filters.teamId = validatedParams.teamId;
      if (validatedParams.search) filters.search = validatedParams.search;
      if (validatedParams.gender) filters.gender = validatedParams.gender;
      if (validatedParams.birthYearFrom !== undefined) filters.birthYearFrom = validatedParams.birthYearFrom;
      if (validatedParams.birthYearTo !== undefined) filters.birthYearTo = validatedParams.birthYearTo;
      if (validatedParams.includeUnknownBirthYear !== undefined) filters.includeUnknownBirthYear = validatedParams.includeUnknownBirthYear;

      // For org admins and coaches, automatically filter by their organization unless they're a site admin
      const user = req.session.user;
      console.log('[GET /api/athletes] User:', {
        id: user?.id,
        username: user?.username,
        role: user?.role,
        isSiteAdmin: user?.isSiteAdmin,
        primaryOrganizationId: user?.primaryOrganizationId
      });

      // SECURITY: Validate organization access and get effective org ID (with caching)
      const orgAccessResult = await validateOrganizationAccess(user, validatedParams.organizationId, req);
      if (!orgAccessResult.allowed) {
        // Audit log: User attempted to access org they don't belong to
        logAuthorizationFailure(user?.id, 'read', 'athletes', {
          attemptedOrgId: validatedParams.organizationId,
          userOrgIds: orgAccessResult.userOrgs?.map(org => org.organizationId),
          ipAddress: req.ip ?? undefined,
          userAgent: req.get('user-agent'),
          route: req.path,
          method: req.method,
        });
        return res.status(403).json({
          message: getAuthorizationError(orgAccessResult.error!)
        });
      }

      // Set the organization filter to the effective org ID
      if (orgAccessResult.effectiveOrgId) {
        filters.organizationId = orgAccessResult.effectiveOrgId;
      }

      console.log('[GET /api/athletes] Filters:', filters);

      const athletes = await storage.getAthletes(filters);

      console.log('[GET /api/athletes] Found', athletes.length, 'athletes');

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
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Invalid query parameters",
          errors: error.errors
        });
      }
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
        const userOrgs = await getCachedUserOrganizations(req, currentUser.id);
        if (userOrgs.length === 0) {
          return res.status(403).json({ message: "Access denied - no organization access" });
        }

        // Get the athlete's organization assignments (primary check)
        const athleteOrgs = await getCachedUserOrganizations(req, athleteId);

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
          // Audit log: User attempted to access athlete from different org
          logAuthorizationFailure(currentUser.id, 'read', 'athlete', {
            attemptedOrgId: allAthleteOrgIds[0], // First org of the athlete
            userOrgIds: userOrgIds,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            route: req.path,
            method: req.method,
          });
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
        emails: athlete.emails,
        parentEmail: athlete.parentEmail,
        isMinor: athlete.isMinor,
        coppaStatus: athlete.coppaStatus,
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
      const userOrgs = await getCachedUserOrganizations(req, currentUser.id);

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

      // Auto-link athlete to global athlete identity if they have a real email
      if (athlete.emails?.[0]) {
        try {
          await globalAthleteService.linkAthleteByEmail(athlete.id, athlete.emails[0]);
        } catch (error) {
          // Don't fail the request - linking is a non-critical enhancement
          console.error(`[CREATE ATHLETE] Failed to auto-link athlete to global identity:`, error);
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

      // Setting parentEmail creates a parentAthleteLinks row and emails that
      // address with the minor's name — restrict to org_admin/site_admin so a
      // coach can't redirect that link (and notification) to an arbitrary
      // address without admin approval. Checked BEFORE any write so a denied
      // coach can't get parentEmail persisted via the main update below.
      if (validatedData.parentEmail !== undefined) {
        const currentUser = req.session.user!;
        if (!currentUser.isSiteAdmin) {
          // Must be org_admin specifically in an org shared with the athlete —
          // org_admin status in an unrelated org must not combine with a
          // shared-org coach role (already required by
          // requireAthleteAccessPermission) to authorize this.
          const [userOrgs, athleteOrgs] = await Promise.all([
            storage.getUserOrganizations(currentUser.id),
            storage.getUserOrganizations(athleteId),
          ]);
          const athleteOrgIds = new Set(athleteOrgs.map((org) => org.organizationId));
          const isOrgAdminForAthlete = userOrgs.some(
            (org) => org.role === 'org_admin' && athleteOrgIds.has(org.organizationId)
          );
          if (!isOrgAdminForAthlete) {
            return res.status(403).json({
              message: "Organization admin or site admin role required to update parent email",
            });
          }
        }
      }

      const updatedAthlete = await storage.updateAthlete(athleteId, validatedData);

      // Handle parentEmail: persist to user record and create parentAthleteLinks
      // row for minor athletes if needed. This is done after the main update so
      // the athlete record (with birthDate) is always fresh.
      if (validatedData.parentEmail !== undefined) {
        // Fetch the latest athlete state to get birthDate (may have just been
        // updated above, or was already present from a previous request).
        const freshAthlete = await storage.getUser(athleteId);
        if (freshAthlete) {
          // Determine the organization the athlete belongs to (for the link row).
          const athleteOrgs = await storage.getUserOrganizations(athleteId);
          const orgId = athleteOrgs[0]?.organizationId ?? null;

          await handleParentEmailUpdate(
            athleteId,
            validatedData.parentEmail,
            freshAthlete,
            orgId,
          );
        }
      }

      res.json(updatedAthlete);
    } catch (error) {
      console.error("Update athlete error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input data", errors: error.message });
      }
      const message = error instanceof Error ? error.message : "Failed to update athlete";
      res.status(400).json({ message });
    }
  });

  /**
   * Toggle athlete active status (org admins and coaches within their organization)
   */
  app.patch("/api/athletes/:id/status", athleteLimiter, requireAuth, requireAthleteManagementAccess, async (req, res) => {
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
  app.delete("/api/athletes/:id", athleteDeleteLimiter, requireAuth, requireAthleteManagementAccess, async (req, res) => {
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
  app.post("/api/athletes/bulk-delete", athleteDeleteLimiter, requireAuth, requireAthleteManagementPermission, async (req, res) => {
    try {
      const { athleteIds } = req.body;

      if (!Array.isArray(athleteIds) || athleteIds.length === 0) {
        return res.status(400).json({ message: "athleteIds must be a non-empty array" });
      }

      // Limit bulk operations to prevent DoS
      if (athleteIds.length > 100) {
        return res.status(400).json({ message: "Cannot delete more than 100 athletes at once" });
      }

      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);
      let deletedCount = 0;
      let failedCount = 0;

      // PERFORMANCE FIX: Batch permission checks upfront to avoid N+1 queries
      if (!userIsSiteAdmin) {
        // Get user's organizations once
        const userOrgs = await getCachedUserOrganizations(req, currentUser.id);
        const userOrgIds = userOrgs.map(org => org.organizationId);

        // Batch fetch all athletes and their organization memberships
        const athleteChecks = await Promise.all(
          athleteIds.map(async (athleteId) => {
            try {
              const athlete = await storage.getAthlete(athleteId);
              if (!athlete) {
                return { athleteId, hasAccess: false };
              }

              const athleteTeams = await storage.getUserTeams(athleteId);
              const athleteOrgIds = athleteTeams.map(team => team.team.organizationId);
              const hasAccess = athleteOrgIds.some(orgId => userOrgIds.includes(orgId));

              return { athleteId, hasAccess };
            } catch (error) {
              console.error(`[BULK DELETE] Failed to check access for athlete ${athleteId}:`, error);
              return { athleteId, hasAccess: false };
            }
          })
        );

        // Filter to only athletes the user has access to
        const authorizedAthleteIds = athleteChecks
          .filter(check => check.hasAccess)
          .map(check => check.athleteId);

        // Track unauthorized attempts
        failedCount = athleteIds.length - authorizedAthleteIds.length;

        // Delete authorized athletes in parallel
        const deleteResults = await Promise.allSettled(
          authorizedAthleteIds.map(athleteId => storage.deleteAthlete(athleteId))
        );

        // Count successes and failures
        deleteResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            deletedCount++;
          } else {
            console.error(`[BULK DELETE] Failed to delete athlete ${authorizedAthleteIds[index]}:`, result.reason);
            failedCount++;
          }
        });
      } else {
        // Site admin can delete all - process in parallel
        const deleteResults = await Promise.allSettled(
          athleteIds.map(athleteId => storage.deleteAthlete(athleteId))
        );

        deleteResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            deletedCount++;
          } else {
            console.error(`[BULK DELETE] Failed to delete athlete ${athleteIds[index]}:`, result.reason);
            failedCount++;
          }
        });
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
  app.post("/api/athletes/bulk-invite", athleteLimiter, requireAuth, requireAthleteManagementPermission, async (req, res) => {
    try {
      const { athleteIds, organizationId } = req.body;

      if (!Array.isArray(athleteIds) || athleteIds.length === 0) {
        return res.status(400).json({ message: "athleteIds must be a non-empty array" });
      }

      // Limit bulk operations to prevent DoS
      if (athleteIds.length > 100) {
        return res.status(400).json({ message: "Cannot invite more than 100 athletes at once" });
      }

      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Verify user has permission for the organization
      if (!userIsSiteAdmin) {
        const userOrgs = await getCachedUserOrganizations(req, currentUser.id);
        const hasOrgAccess = userOrgs.some(org => org.organizationId === organizationId);

        if (!hasOrgAccess) {
          // Audit log: User attempted to invite athletes to different org
          logAuthorizationFailure(currentUser.id, 'invite', 'athletes', {
            attemptedOrgId: organizationId,
            userOrgIds: userOrgs.map(org => org.organizationId),
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            route: req.path,
            method: req.method,
          });
          return res.status(403).json({ message: "You don't have permission to invite athletes to this organization" });
        }
      }

      let invitedCount = 0;
      let skippedCount = 0;

      // PERFORMANCE FIX: Batch fetch athletes and validate organization membership upfront
      // CRITICAL SECURITY FIX: Verify all athletes belong to the target organization
      const athleteData = await Promise.all(
        athleteIds.map(async (athleteId) => {
          try {
            const [athlete, athleteOrgs, athleteTeams] = await Promise.all([
              storage.getAthlete(athleteId),
              getCachedUserOrganizations(req, athleteId),
              storage.getUserTeams(athleteId)
            ]);

            if (!athlete) {
              return { athleteId, valid: false, reason: 'not_found' };
            }

            // Verify athlete belongs to the target organization
            const athleteOrgIds = athleteOrgs.map(org => org.organizationId);
            const athleteTeamOrgIds = athleteTeams.map(team => team.team.organizationId);
            const allAthleteOrgIds = [...new Set([...athleteOrgIds, ...athleteTeamOrgIds])];

            const belongsToOrganization = allAthleteOrgIds.includes(organizationId);
            if (!belongsToOrganization) {
              console.warn(`[BULK INVITE] Athlete ${athleteId} does not belong to organization ${organizationId}`);
              return { athleteId, valid: false, reason: 'wrong_organization' };
            }

            // Skip if athlete has no email
            if (!athlete.emails || athlete.emails.length === 0) {
              return { athleteId, valid: false, reason: 'no_email' };
            }

            return { athleteId, valid: true, athlete };
          } catch (error) {
            console.error(`[BULK INVITE] Failed to fetch athlete ${athleteId}:`, error);
            return { athleteId, valid: false, reason: 'error' };
          }
        })
      );

      // Process invitations in parallel for valid athletes
      const invitationPromises = athleteData
        .filter(data => data.valid)
        .flatMap(data => {
          const athlete = data.athlete!;
          return athlete.emails!.map(email =>
            storage.createInvitation({
              email,
              firstName: athlete.firstName,
              lastName: athlete.lastName,
              role: "athlete",
              organizationId,
              teamIds: [],
              invitedBy: currentUser.id,
              playerId: data.athleteId,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expires in 7 days
            }).catch(error => {
              console.error(`[BULK INVITE] Failed to create invitation for ${email}:`, error);
              return null;
            })
          );
        });

      const invitationResults = await Promise.allSettled(invitationPromises);
      invitedCount = invitationResults.filter(result => result.status === 'fulfilled' && result.value !== null).length;
      skippedCount = athleteData.filter(data => !data.valid).length +
                     invitationResults.filter(result => result.status === 'rejected' || result.value === null).length;

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

  /**
   * Get athlete's active teams at a specific date
   */
  app.get("/api/athletes/:id/active-teams", athleteLimiter, requireAuth, async (req, res) => {
    try {
      const athleteId = req.params.id;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate date parameter
      const dateParam = req.query.date;
      if (!dateParam || typeof dateParam !== 'string') {
        return res.status(400).json({ message: "Date parameter is required" });
      }

      // Validate date format using Zod schema
      const dateValidation = dateStringSchema.safeParse(dateParam);
      if (!dateValidation.success) {
        return res.status(400).json({ message: "Date parameter is invalid. Expected format: YYYY-MM-DD" });
      }

      // Check if athlete exists
      const athlete = await storage.getAthlete(athleteId);
      if (!athlete) {
        return res.status(404).json({ message: "Athlete not found" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // SECURITY: Verify user has access to the athlete's organization
      if (!userIsSiteAdmin) {
        // Get user's organizations
        const userOrgs = await getCachedUserOrganizations(req, currentUser.id);
        if (userOrgs.length === 0) {
          return res.status(403).json({ message: "Access denied - no organization access" });
        }

        // Get the athlete's organization assignments
        const athleteOrgs = await getCachedUserOrganizations(req, athleteId);
        const athleteTeams = await storage.getUserTeams(athleteId);

        // Athlete must belong to at least one organization OR have team assignments
        if (athleteOrgs.length === 0 && athleteTeams.length === 0) {
          return res.status(403).json({ message: "Access denied - athlete has no organization assignments" });
        }

        // Check if user has access to any of the athlete's organizations
        const userOrgIds = userOrgs.map(org => org.organizationId);
        const athleteOrgIds = athleteOrgs.map(org => org.organizationId);
        const athleteTeamOrgIds = athleteTeams.map(team => team.team.organizationId);

        // Combine both organization sources
        const allAthleteOrgIds = [...new Set([...athleteOrgIds, ...athleteTeamOrgIds])];

        const hasOrganizationAccess = allAthleteOrgIds.some(orgId => userOrgIds.includes(orgId));
        if (!hasOrganizationAccess) {
          // Audit log: User attempted to access athlete from different org
          logAuthorizationFailure(currentUser.id, 'read', 'athlete-active-teams', {
            attemptedOrgId: allAthleteOrgIds[0],
            userOrgIds: userOrgIds,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            route: req.path,
            method: req.method,
          });
          return res.status(403).json({ message: "Access denied - athlete belongs to a different organization" });
        }
      }

      // Convert date string to Date object
      const measurementDate = new Date(dateParam);

      // Get active teams using the MeasurementService (instance created at function scope)
      const activeTeams = await measurementService.getAthleteActiveTeamsAtDate(
        athleteId,
        measurementDate
      );

      // Filter to only teams in orgs the user has access to
      if (!userIsSiteAdmin) {
        const userOrgIds = (await getCachedUserOrganizations(req, currentUser.id))
          .map(org => org.organizationId);
        const filteredTeams = activeTeams.filter(t => userOrgIds.includes(t.organizationId));
        return res.json(filteredTeams);
      }

      res.json(activeTeams);
    } catch (error) {
      console.error("Get athlete active teams error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch athlete active teams";
      res.status(500).json({ message });
    }
  });
}