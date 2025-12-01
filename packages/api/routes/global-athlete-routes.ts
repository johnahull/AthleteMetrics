/**
 * Global Athlete Routes
 * API endpoints for cross-organization athlete identity management
 *
 * Routes:
 * - GET    /api/my/global-athlete         - Get current user's global athlete profile
 * - PATCH  /api/my/global-athlete/privacy - Update privacy settings (allowCrossOrgLinking)
 * - PATCH  /api/my/global-athlete/sharing - Update sharing settings (shareMeasurements)
 * - GET    /api/my/unified-measurements   - Get unified measurements across all linked accounts
 * - GET    /api/my/unified-dashboard      - Get aggregated dashboard data
 * - GET    /api/my/global-athlete/audit-log - Get audit log for global athlete
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import {
  globalAthletes, userGlobalAthleteLinks, globalAthleteAuditLog,
  organizations, userOrganizations
} from "@shared/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware";
import { globalAthleteService } from "../services/global-athlete-service";

// Rate limiting for global athlete endpoints
const globalAthleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per windowMs
  message: { message: "Too many requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerGlobalAthleteRoutes(app: Express) {
  /**
   * Get current user's global athlete profile
   * Returns the global athlete record and linked accounts
   */
  app.get("/api/my/global-athlete", globalAthleteLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get user's global athlete link
      const link = await globalAthleteService.getUserGlobalAthleteLink(currentUser.id);
      if (!link) {
        return res.status(404).json({
          message: "No global athlete profile found",
          hasGlobalAthlete: false
        });
      }

      // Get global athlete details
      const globalAthlete = await globalAthleteService.getGlobalAthlete(link.globalAthleteId);
      if (!globalAthlete) {
        return res.status(404).json({
          message: "Global athlete record not found",
          hasGlobalAthlete: false
        });
      }

      // Get all linked accounts
      const linkedUsers = await globalAthleteService.getLinkedUsers(link.globalAthleteId, {
        confirmedOnly: true
      });

      // Get organization details for each linked user
      const linkedAccountsWithOrgs = await Promise.all(
        linkedUsers.map(async (userLink) => {
          const userOrgs = await db.select({
            organizationId: userOrganizations.organizationId,
            role: userOrganizations.role,
            orgName: organizations.name,
          })
            .from(userOrganizations)
            .leftJoin(organizations, eq(organizations.id, userOrganizations.organizationId))
            .where(eq(userOrganizations.userId, userLink.userId));

          return {
            userId: userLink.userId,
            linkStatus: userLink.linkStatus,
            linkType: userLink.linkType,
            shareMeasurements: userLink.shareMeasurements,
            confirmedAt: userLink.confirmedAt,
            organizations: userOrgs.map(org => ({
              id: org.organizationId,
              name: org.orgName,
              role: org.role
            }))
          };
        })
      );

      res.json({
        hasGlobalAthlete: true,
        globalAthlete: {
          id: globalAthlete.id,
          primaryEmail: globalAthlete.primaryEmail,
          verifiedEmails: globalAthlete.verifiedEmails,
          canonicalFirstName: globalAthlete.canonicalFirstName,
          canonicalLastName: globalAthlete.canonicalLastName,
          canonicalFullName: globalAthlete.canonicalFullName,
          birthDate: globalAthlete.birthDate,
          allowCrossOrgLinking: globalAthlete.allowCrossOrgLinking,
          createdAt: globalAthlete.createdAt,
        },
        currentLink: {
          linkStatus: link.linkStatus,
          linkType: link.linkType,
          shareMeasurements: link.shareMeasurements,
          confirmedAt: link.confirmedAt,
        },
        linkedAccounts: linkedAccountsWithOrgs,
        linkedAccountCount: linkedAccountsWithOrgs.length,
      });
    } catch (error) {
      console.error("Get global athlete error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch global athlete profile";
      res.status(500).json({ message });
    }
  });

  /**
   * Update global athlete privacy settings
   * Allows user to enable/disable cross-org linking
   */
  app.patch("/api/my/global-athlete/privacy", globalAthleteLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { allowCrossOrgLinking } = req.body;

      if (typeof allowCrossOrgLinking !== 'boolean') {
        return res.status(400).json({ message: "allowCrossOrgLinking must be a boolean" });
      }

      // Get user's global athlete link
      const link = await globalAthleteService.getUserGlobalAthleteLink(currentUser.id);
      if (!link) {
        return res.status(404).json({ message: "No global athlete profile found" });
      }

      // Update privacy settings
      await globalAthleteService.updatePrivacySettings(link.globalAthleteId, currentUser.id, {
        allowCrossOrgLinking,
      });

      res.json({
        message: allowCrossOrgLinking
          ? "Cross-organization linking enabled"
          : "Cross-organization linking disabled. Other linked accounts have been revoked.",
        allowCrossOrgLinking,
      });
    } catch (error) {
      console.error("Update privacy settings error:", error);
      const message = error instanceof Error ? error.message : "Failed to update privacy settings";
      res.status(500).json({ message });
    }
  });

  /**
   * Update measurement sharing preference for current user's link
   */
  app.patch("/api/my/global-athlete/sharing", globalAthleteLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { shareMeasurements } = req.body;

      if (typeof shareMeasurements !== 'boolean') {
        return res.status(400).json({ message: "shareMeasurements must be a boolean" });
      }

      // Get user's global athlete link
      const link = await globalAthleteService.getUserGlobalAthleteLink(currentUser.id);
      if (!link) {
        return res.status(404).json({ message: "No global athlete profile found" });
      }

      // Update sharing preference
      await db.update(userGlobalAthleteLinks)
        .set({ shareMeasurements })
        .where(eq(userGlobalAthleteLinks.userId, currentUser.id));

      res.json({
        message: shareMeasurements
          ? "Measurement sharing enabled for linked accounts"
          : "Measurement sharing disabled for linked accounts",
        shareMeasurements,
      });
    } catch (error) {
      console.error("Update sharing settings error:", error);
      const message = error instanceof Error ? error.message : "Failed to update sharing settings";
      res.status(500).json({ message });
    }
  });

  /**
   * Get unified measurements across all linked accounts
   */
  app.get("/api/my/unified-measurements", globalAthleteLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const unifiedMeasurements = await globalAthleteService.getUnifiedMeasurements(currentUser.id);

      // Enrich with organization names
      const orgIds = [...new Set(unifiedMeasurements.map(m => m.organizationId).filter(Boolean))];
      const orgs = orgIds.length > 0
        ? await db.select({ id: organizations.id, name: organizations.name })
            .from(organizations)
            .where(inArray(organizations.id, orgIds))
        : [];

      const orgMap = new Map(orgs.map(o => [o.id, o.name]));

      const enrichedMeasurements = unifiedMeasurements.map(m => ({
        ...m,
        organizationName: m.organizationId ? orgMap.get(m.organizationId) : null,
      }));

      res.json({
        measurements: enrichedMeasurements,
        totalCount: enrichedMeasurements.length,
        organizationsRepresented: orgIds.length,
      });
    } catch (error) {
      console.error("Get unified measurements error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch unified measurements";
      res.status(500).json({ message });
    }
  });

  /**
   * Get unified dashboard data (aggregated stats across all linked accounts)
   */
  app.get("/api/my/unified-dashboard", globalAthleteLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get user's global athlete link
      const link = await globalAthleteService.getUserGlobalAthleteLink(currentUser.id);

      if (!link) {
        return res.json({
          hasGlobalAthlete: false,
          message: "No cross-organization data available",
          linkedAccountCount: 0,
          organizations: [],
          measurements: [],
          recentActivity: [],
        });
      }

      // Get global athlete details
      const globalAthlete = await globalAthleteService.getGlobalAthlete(link.globalAthleteId);
      if (!globalAthlete) {
        return res.status(404).json({ message: "Global athlete record not found" });
      }

      // Get linked accounts
      const linkedUsers = await globalAthleteService.getLinkedUsers(link.globalAthleteId, {
        confirmedOnly: true,
        shareMeasurementsOnly: false,
      });

      // Get unified measurements
      const unifiedMeasurements = await globalAthleteService.getUnifiedMeasurements(currentUser.id);

      // Get organization details
      const userOrgIds = new Set<string>();
      for (const userLink of linkedUsers) {
        const userOrgs = await db.select({ organizationId: userOrganizations.organizationId })
          .from(userOrganizations)
          .where(eq(userOrganizations.userId, userLink.userId));
        userOrgs.forEach(o => userOrgIds.add(o.organizationId));
      }

      const orgs = userOrgIds.size > 0
        ? await db.select({ id: organizations.id, name: organizations.name })
            .from(organizations)
            .where(inArray(organizations.id, [...userOrgIds]))
        : [];

      // Calculate stats by metric type
      const metricStats: Record<string, { count: number; latest: any; best: any }> = {};
      for (const m of unifiedMeasurements) {
        if (!metricStats[m.metric]) {
          metricStats[m.metric] = { count: 0, latest: null, best: null };
        }
        metricStats[m.metric].count++;
        // Track latest by date
        if (!metricStats[m.metric].latest || m.date > metricStats[m.metric].latest.date) {
          metricStats[m.metric].latest = m;
        }
      }

      res.json({
        hasGlobalAthlete: true,
        globalAthlete: {
          id: globalAthlete.id,
          canonicalFullName: globalAthlete.canonicalFullName,
          allowCrossOrgLinking: globalAthlete.allowCrossOrgLinking,
        },
        linkedAccountCount: linkedUsers.length,
        organizations: orgs.map(o => ({ id: o.id, name: o.name })),
        measurementCount: unifiedMeasurements.length,
        metricStats,
        recentMeasurements: unifiedMeasurements.slice(0, 10),
      });
    } catch (error) {
      console.error("Get unified dashboard error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch unified dashboard";
      res.status(500).json({ message });
    }
  });

  /**
   * Get audit log for global athlete
   */
  app.get("/api/my/global-athlete/audit-log", globalAthleteLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get user's global athlete link
      const link = await globalAthleteService.getUserGlobalAthleteLink(currentUser.id);
      if (!link) {
        return res.status(404).json({ message: "No global athlete profile found" });
      }

      // Get audit logs
      const logs = await db.select()
        .from(globalAthleteAuditLog)
        .where(eq(globalAthleteAuditLog.globalAthleteId, link.globalAthleteId))
        .orderBy(desc(globalAthleteAuditLog.createdAt))
        .limit(100);

      res.json({
        auditLog: logs.map(log => ({
          id: log.id,
          action: log.action,
          actorType: log.actorType,
          details: log.details,
          createdAt: log.createdAt,
        })),
        totalCount: logs.length,
      });
    } catch (error) {
      console.error("Get audit log error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch audit log";
      res.status(500).json({ message });
    }
  });
}
