/**
 * Organization Notification Settings Routes
 * Handles organization-level notification configuration for org admins
 */

import type { Express } from "express";
import { z } from "zod";
import { eq, and, desc, count } from "drizzle-orm";
import { requireAuth } from "../middleware";
import { db } from "../db";
import {
  orgNotificationSettings,
  notificationHistory,
  userOrganizations,
} from "@shared/schema";

// Validation schema for org notification settings
const updateOrgSettingsSchema = z.object({
  // Master toggle for the organization
  pushEnabled: z.boolean().optional(),
  // Which notification types are available to users in this org
  wellnessSurveysEnabled: z.boolean().optional(),
  wellnessDigestEnabled: z.boolean().optional(),
  newMeasurementsEnabled: z.boolean().optional(),
  teamAnnouncementsEnabled: z.boolean().optional(),
  // Daily digest configuration for coaches
  digestTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  digestSkipWeekends: z.boolean().optional(),
  digestTimezone: z.string().optional(),
  // Default preferences for new users
  defaultPushWellnessSurveys: z.boolean().optional(),
  defaultPushMeasurements: z.boolean().optional(),
  defaultPushAnnouncements: z.boolean().optional(),
  defaultEmailWellnessSurveys: z.boolean().optional(),
  defaultEmailMeasurements: z.boolean().optional(),
  defaultEmailAnnouncements: z.boolean().optional(),
});

// Default org settings
const DEFAULT_ORG_SETTINGS = {
  pushEnabled: true,
  wellnessSurveysEnabled: true,
  wellnessDigestEnabled: true,
  newMeasurementsEnabled: true,
  teamAnnouncementsEnabled: true,
  digestTime: '07:00',
  digestSkipWeekends: false,
  digestTimezone: 'America/New_York',
  defaultPushWellnessSurveys: true,
  defaultPushMeasurements: true,
  defaultPushAnnouncements: true,
  defaultEmailWellnessSurveys: true,
  defaultEmailMeasurements: false,
  defaultEmailAnnouncements: true,
};

/**
 * Check if user is an org admin for the given organization
 */
async function isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const userOrg = await db
    .select()
    .from(userOrganizations)
    .where(
      and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, orgId)
      )
    );

  return userOrg.length > 0 && userOrg[0].role === 'org_admin';
}

export function registerOrgNotificationRoutes(app: Express) {
  /**
   * GET /api/organizations/:orgId/notifications/settings
   * Get notification settings for an organization (org admin only)
   */
  app.get(
    "/api/organizations/:orgId/notifications/settings",
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.session.user?.id;
        const { orgId } = req.params;

        if (!userId) {
          return res.status(401).json({ message: "Not authenticated" });
        }

        // Check if user is org admin
        const isAdmin = await isOrgAdmin(userId, orgId);
        if (!isAdmin && !req.session.user?.isSiteAdmin) {
          return res.status(403).json({ message: "Access denied" });
        }

        const settings = await db
          .select()
          .from(orgNotificationSettings)
          .where(eq(orgNotificationSettings.orgId, orgId));

        if (settings.length === 0) {
          return res.json({
            ...DEFAULT_ORG_SETTINGS,
            orgId,
            isDefault: true,
          });
        }

        res.json({
          ...settings[0],
          isDefault: false,
        });
      } catch (error) {
        console.error("Error getting org notification settings:", error);
        res.status(500).json({ message: "Failed to get notification settings" });
      }
    }
  );

  /**
   * PUT /api/organizations/:orgId/notifications/settings
   * Update notification settings for an organization (org admin only)
   */
  app.put(
    "/api/organizations/:orgId/notifications/settings",
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.session.user?.id;
        const { orgId } = req.params;

        if (!userId) {
          return res.status(401).json({ message: "Not authenticated" });
        }

        // Check if user is org admin
        const isAdmin = await isOrgAdmin(userId, orgId);
        if (!isAdmin && !req.session.user?.isSiteAdmin) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Validate request body
        const parseResult = updateOrgSettingsSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            message: "Invalid settings data",
            errors: parseResult.error.flatten().fieldErrors,
          });
        }

        const updates = parseResult.data;

        // Check if settings already exist
        const existing = await db
          .select()
          .from(orgNotificationSettings)
          .where(eq(orgNotificationSettings.orgId, orgId));

        let result;

        if (existing.length === 0) {
          // Create new settings with defaults + updates
          [result] = await db
            .insert(orgNotificationSettings)
            .values({
              orgId,
              ...DEFAULT_ORG_SETTINGS,
              ...updates,
              updatedAt: new Date(),
              updatedBy: userId,
            })
            .returning();
        } else {
          // Update existing settings
          [result] = await db
            .update(orgNotificationSettings)
            .set({
              ...updates,
              updatedAt: new Date(),
              updatedBy: userId,
            })
            .where(eq(orgNotificationSettings.orgId, orgId))
            .returning();
        }

        res.json({
          ...result,
          message: "Organization notification settings updated successfully",
        });
      } catch (error) {
        console.error("Error updating org notification settings:", error);
        res.status(500).json({ message: "Failed to update notification settings" });
      }
    }
  );

  /**
   * GET /api/organizations/:orgId/notifications/analytics
   * Get notification analytics for an organization (org admin only)
   */
  app.get(
    "/api/organizations/:orgId/notifications/analytics",
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.session.user?.id;
        const { orgId } = req.params;

        if (!userId) {
          return res.status(401).json({ message: "Not authenticated" });
        }

        // Check if user is org admin
        const isAdmin = await isOrgAdmin(userId, orgId);
        if (!isAdmin && !req.session.user?.isSiteAdmin) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Get date range from query params (default: last 30 days)
        const daysBack = parseInt(req.query.days as string) || 30;
        const since = new Date();
        since.setDate(since.getDate() - daysBack);

        // Query notification history for this org
        const history = await db
          .select()
          .from(notificationHistory)
          .where(eq(notificationHistory.orgId, orgId))
          .orderBy(desc(notificationHistory.sentAt));

        // Filter by date
        const filteredHistory = history.filter(
          (h) => h.sentAt && h.sentAt >= since
        );

        // Calculate analytics
        const totalSent = filteredHistory.length;
        const delivered = filteredHistory.filter(
          (h) => h.deliveryStatus === 'delivered'
        ).length;
        const failed = filteredHistory.filter(
          (h) => h.deliveryStatus === 'failed'
        ).length;
        const clicked = filteredHistory.filter((h) => h.clickedAt).length;

        // Group by type
        const byType = filteredHistory.reduce((acc, h) => {
          const type = h.type || 'unknown';
          if (!acc[type]) {
            acc[type] = { sent: 0, delivered: 0, clicked: 0 };
          }
          acc[type].sent++;
          if (h.deliveryStatus === 'delivered') acc[type].delivered++;
          if (h.clickedAt) acc[type].clicked++;
          return acc;
        }, {} as Record<string, { sent: number; delivered: number; clicked: number }>);

        res.json({
          period: {
            days: daysBack,
            since: since.toISOString(),
          },
          summary: {
            totalSent,
            delivered,
            failed,
            clicked,
            deliveryRate: totalSent > 0 ? (delivered / totalSent * 100).toFixed(1) : '0',
            clickRate: delivered > 0 ? (clicked / delivered * 100).toFixed(1) : '0',
          },
          byType,
        });
      } catch (error) {
        console.error("Error getting org notification analytics:", error);
        res.status(500).json({ message: "Failed to get notification analytics" });
      }
    }
  );
}
