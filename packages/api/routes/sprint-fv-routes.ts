/**
 * Sprint Force-Velocity Profile Routes
 *
 * Endpoints for discovering eligible sessions, generating F-V profiles
 * from existing measurements, and CRUD operations on stored profiles.
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware";
import { requireRole, requireOrgAccess } from "../permissions/middleware";
import { requireSprintFvEnabled } from "../middleware/require-sprint-fv-enabled";
import { SprintFvService, SprintFvValidationError } from "../services/sprint-fv-service";
import { generateSprintFvProfileSchema, sprintFvProfileQuerySchema } from "../validation/sprint-fv-validation";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { storage } from "../storage";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

const sprintFvService = new SprintFvService();

const standardLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.STANDARD,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const mutationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.MUTATION,
  message: { message: "Too many modification attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Check if the requesting user can view profiles for a given athlete.
 * Athletes can view their own; coaches/admins can view athletes in their org.
 */
async function canViewAthleteProfiles(user: SessionUser, athleteUserId: string): Promise<boolean> {
  if (isSiteAdmin(user)) return true;
  if (user.id === athleteUserId) return true;

  // Check if user is a coach/admin in any org that the athlete belongs to
  if (user.primaryOrganizationId) {
    const athleteRoles = await storage.getUserRoles(athleteUserId, user.primaryOrganizationId);
    if (athleteRoles.length > 0) {
      const userRoles = await storage.getUserRoles(user.id, user.primaryOrganizationId);
      return userRoles.includes('coach') || userRoles.includes('org_admin');
    }
  }
  return false;
}

export function registerSprintFvRoutes(app: Express) {
  // GET /api/sprint-fv-profiles/eligible/:userId
  // List sessions eligible for F-V profile generation
  app.get(
    "/api/sprint-fv-profiles/eligible/:userId",
    requireAuth,
    requireSprintFvEnabled,
    standardLimiter,
    async (req: Request, res: Response) => {
      try {
        const user = req.user as SessionUser;
        const { userId } = req.params;

        if (!await canViewAthleteProfiles(user, userId)) {
          return res.status(403).json({ message: "Not authorized to view this athlete's data" });
        }

        const dateFrom = req.query.dateFrom as string | undefined;
        const dateTo = req.query.dateTo as string | undefined;
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if ((dateFrom && !dateRegex.test(dateFrom)) || (dateTo && !dateRegex.test(dateTo))) {
          return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
        }

        const sessions = await sprintFvService.findEligibleSessions(
          userId,
          user.primaryOrganizationId || undefined,
          dateFrom,
          dateTo,
        );

        res.json({ sessions });
      } catch (error: any) {
        console.error("Error finding eligible sessions:", error);
        res.status(500).json({ message: "Failed to find eligible sessions" });
      }
    }
  );

  // POST /api/sprint-fv-profiles/generate
  // Generate a profile from existing measurements
  app.post(
    "/api/sprint-fv-profiles/generate",
    requireAuth,
    requireRole('coach'),
    requireSprintFvEnabled,
    mutationLimiter,
    async (req: Request, res: Response) => {
      try {
        const user = req.user as SessionUser;
        const parsed = generateSprintFvProfileSchema.parse(req.body);

        // Verify the coach can access this athlete's data
        if (!await canViewAthleteProfiles(user, parsed.userId)) {
          return res.status(403).json({ message: "Not authorized to generate profiles for this athlete" });
        }

        const profile = await sprintFvService.generateProfile(
          parsed.userId,
          parsed.date,
          user.id,
          {
            eventId: parsed.eventId,
            bodyMassLbsOverride: parsed.bodyMassLbsOverride,
            notes: parsed.notes,
          },
        );

        res.status(201).json(profile);
      } catch (error: any) {
        if (error.name === 'ZodError') {
          return res.status(400).json({ message: "Validation error", errors: error.errors });
        }
        console.error("Error generating F-V profile:", error);
        const statusCode = error instanceof SprintFvValidationError ? error.statusCode : 500;
        res.status(statusCode).json({ message: error.message || "Failed to generate profile" });
      }
    }
  );

  // GET /api/sprint-fv-profiles/athlete/:userId
  // List profiles for an athlete (longitudinal view)
  app.get(
    "/api/sprint-fv-profiles/athlete/:userId",
    requireAuth,
    requireSprintFvEnabled,
    standardLimiter,
    async (req: Request, res: Response) => {
      try {
        const user = req.user as SessionUser;
        const { userId } = req.params;

        if (!await canViewAthleteProfiles(user, userId)) {
          return res.status(403).json({ message: "Not authorized to view this athlete's profiles" });
        }

        const query = sprintFvProfileQuerySchema.parse(req.query);
        const result = await sprintFvService.listByAthlete(userId, query);
        res.json(result);
      } catch (error: any) {
        if (error.name === 'ZodError') {
          return res.status(400).json({ message: "Validation error", errors: error.errors });
        }
        console.error("Error listing athlete profiles:", error);
        res.status(500).json({ message: "Failed to list profiles" });
      }
    }
  );

  // GET /api/sprint-fv-profiles/eligible-summary/:orgId
  // Lightweight: which athletes in this org have eligible sprint sessions?
  app.get(
    "/api/sprint-fv-profiles/eligible-summary/:orgId",
    requireAuth,
    requireRole('coach'),
    requireOrgAccess(),
    requireSprintFvEnabled,
    standardLimiter,
    async (req: Request, res: Response) => {
      try {
        const { orgId } = req.params;
        const summary = await sprintFvService.getEligibleSummaryByOrg(orgId);
        res.json({ athletes: summary });
      } catch (error: any) {
        console.error("Error fetching eligible summary:", error);
        res.status(500).json({ message: "Failed to fetch eligible summary" });
      }
    }
  );

  // GET /api/sprint-fv-profiles/organization/:orgId
  // List all profiles in an organization
  app.get(
    "/api/sprint-fv-profiles/organization/:orgId",
    requireAuth,
    requireRole('coach'),
    requireOrgAccess(),
    requireSprintFvEnabled,
    standardLimiter,
    async (req: Request, res: Response) => {
      try {
        const { orgId } = req.params;
        const query = sprintFvProfileQuerySchema.parse(req.query);
        const result = await sprintFvService.listByOrganization(orgId, query);
        res.json(result);
      } catch (error: any) {
        if (error.name === 'ZodError') {
          return res.status(400).json({ message: "Validation error", errors: error.errors });
        }
        console.error("Error listing org profiles:", error);
        res.status(500).json({ message: "Failed to list profiles" });
      }
    }
  );

  // GET /api/sprint-fv-profiles/:id
  // Get a single profile with analysis
  app.get(
    "/api/sprint-fv-profiles/:id",
    requireAuth,
    requireSprintFvEnabled,
    standardLimiter,
    async (req: Request, res: Response) => {
      try {
        const user = req.user as SessionUser;
        const profile = await sprintFvService.getById(req.params.id);

        if (!profile) {
          return res.status(404).json({ message: "Profile not found" });
        }

        if (!await canViewAthleteProfiles(user, profile.userId)) {
          return res.status(403).json({ message: "Not authorized to view this profile" });
        }

        res.json(profile);
      } catch (error: any) {
        console.error("Error fetching profile:", error);
        res.status(500).json({ message: "Failed to fetch profile" });
      }
    }
  );

  // DELETE /api/sprint-fv-profiles/:id
  app.delete(
    "/api/sprint-fv-profiles/:id",
    requireAuth,
    requireRole('coach'),
    requireSprintFvEnabled,
    mutationLimiter,
    async (req: Request, res: Response) => {
      try {
        const user = req.user as SessionUser;
        const profile = await sprintFvService.getById(req.params.id);

        if (!profile) {
          return res.status(404).json({ message: "Profile not found" });
        }

        // Only the submitter, org_admin, or site_admin can delete
        if (profile.submittedBy !== user.id && !isSiteAdmin(user)) {
          if (profile.organizationId && user.primaryOrganizationId === profile.organizationId) {
            const roles = await storage.getUserRoles(user.id, profile.organizationId);
            if (!roles.includes('org_admin')) {
              return res.status(403).json({ message: "Not authorized to delete this profile" });
            }
          } else {
            return res.status(403).json({ message: "Not authorized to delete this profile" });
          }
        }

        await sprintFvService.delete(req.params.id);
        res.json({ message: "Profile deleted" });
      } catch (error: any) {
        console.error("Error deleting profile:", error);
        res.status(500).json({ message: "Failed to delete profile" });
      }
    }
  );
}
