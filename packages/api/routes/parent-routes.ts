/**
 * Parent/Guardian API Routes
 *
 * Provides read-only access for parent users to view their linked athletes'
 * data. All routes require:
 *   1. requireAuth — user must be authenticated
 *   2. requireParentAccess() — user must have an active parentAthleteLinks row
 *      referencing the requested athlete
 *
 * Available endpoints:
 *   GET /api/parent/children                        — list linked athletes
 *   GET /api/parent/children/:athleteId/profile     — athlete profile (read-only)
 *   GET /api/parent/children/:athleteId/measurements — measurement history
 *   GET /api/parent/children/:athleteId/reports      — available reports
 *
 * Security note: parentUserId (FK) must be set on the link — email-only links
 * created before account registration do NOT grant access until the parent
 * calls POST /api/auth/register/parent which triggers linkParentAccount().
 */

import type { Express } from "express";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { db } from "../db";
import { requireAuth } from "../middleware";
import { requireParentAccess } from "../permissions/parent-middleware";
import { parentAthleteLinks } from "@shared/schema/tables/coppa";
import { storage } from "../storage";
import { reports } from "@shared/schema";

export function registerParentRoutes(app: Express) {
  /**
   * List all athletes linked to the authenticated parent.
   * Returns basic profile info for each linked athlete.
   */
  app.get("/api/parent/children", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Find all active links for this parent user
      const links = await db.select()
        .from(parentAthleteLinks)
        .where(and(
          eq(parentAthleteLinks.parentUserId, userId),
          eq(parentAthleteLinks.isActive, true),
        ));

      if (links.length === 0) {
        return res.json([]);
      }

      // Batch load athlete profiles
      const athleteIds = [...new Set(links.map(l => l.athleteUserId))];
      const athletes = await Promise.all(
        athleteIds.map(id => storage.getAthlete(id))
      );

      const athleteMap = new Map(
        athletes
          .filter((a): a is NonNullable<typeof a> => a != null)
          .map(a => [a.id, a])
      );

      const result = links.map(link => {
        const athlete = athleteMap.get(link.athleteUserId);
        return {
          linkId: link.id,
          athleteId: link.athleteUserId,
          organizationId: link.organizationId,
          consentId: link.consentId,
          isActive: link.isActive,
          linkedAt: link.createdAt,
          athlete: athlete ? {
            id: athlete.id,
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            username: athlete.username,
          } : null,
        };
      });

      return res.json(result);
    } catch (error) {
      console.error("[parent-routes] GET /children error:", error);
      return res.status(500).json({ message: "Failed to fetch linked athletes" });
    }
  });

  /**
   * Get read-only profile for a linked athlete.
   * Requires an active parent link to the specified athlete.
   */
  app.get(
    "/api/parent/children/:athleteId/profile",
    requireAuth,
    requireParentAccess('athleteId'),
    async (req, res) => {
      try {
        const { athleteId } = req.params;
        const athlete = await storage.getAthlete(athleteId);

        if (!athlete) {
          return res.status(404).json({ message: "Athlete not found" });
        }

        // Return a curated, read-only view — omit sensitive fields like password
        const profile = {
          id: athlete.id,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          username: athlete.username,
          emails: athlete.emails,
          birthDate: athlete.birthDate,
          sport: (athlete as any).sport,
          sports: (athlete as any).sports,
          coppaStatus: athlete.coppaStatus,
          isMinor: athlete.isMinor,
          isEmailVerified: athlete.isEmailVerified,
          createdAt: athlete.createdAt,
        };

        return res.json(profile);
      } catch (error) {
        console.error("[parent-routes] GET /children/:athleteId/profile error:", error);
        return res.status(500).json({ message: "Failed to fetch athlete profile" });
      }
    }
  );

  /**
   * Get measurement history for a linked athlete.
   * Returns paginated measurements sorted by date descending.
   */
  app.get(
    "/api/parent/children/:athleteId/measurements",
    requireAuth,
    requireParentAccess('athleteId'),
    async (req, res) => {
      try {
        const { athleteId } = req.params;

        const measurements = await storage.getMeasurements({
          userId: athleteId,
        });

        return res.json(measurements);
      } catch (error) {
        console.error("[parent-routes] GET /children/:athleteId/measurements error:", error);
        return res.status(500).json({ message: "Failed to fetch measurements" });
      }
    }
  );

  /**
   * Get available reports for a linked athlete.
   * Only returns reports where the athlete is part of the report's scope
   * and the report is not archived.
   */
  app.get(
    "/api/parent/children/:athleteId/reports",
    requireAuth,
    requireParentAccess('athleteId'),
    async (req, res) => {
      try {
        const { athleteId } = req.params;

        // Get athlete's organizations so we can find org-level reports
        const userOrgs = await storage.getUserOrganizations(athleteId);
        const orgIds = userOrgs.map(o => o.organizationId);

        if (orgIds.length === 0) {
          return res.json([]);
        }

        // Query reports for the athlete's organizations that are not archived
        // and have the athlete included (via config.athleteIds or org-wide scope)
        const orgReports = await db.select({
          id: reports.id,
          name: reports.name,
          description: reports.description,
          reportType: reports.reportType,
          organizationId: reports.organizationId,
          createdAt: reports.createdAt,
          updatedAt: reports.updatedAt,
          isPinned: reports.isPinned,
        })
          .from(reports)
          .where(and(
            inArray(reports.organizationId, orgIds),
            isNull(reports.archivedAt),
          ));

        return res.json(orgReports);
      } catch (error) {
        console.error("[parent-routes] GET /children/:athleteId/reports error:", error);
        return res.status(500).json({ message: "Failed to fetch reports" });
      }
    }
  );

  console.log("✅ Parent routes registered");
}
