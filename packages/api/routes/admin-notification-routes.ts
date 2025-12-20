/**
 * Admin Notification Routes
 * Site admin endpoints for global notification settings and analytics
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { eq, sql, desc, and, gte } from "drizzle-orm";
import {
  siteSettings,
  notificationHistory,
  pushSubscriptions,
  notificationPreferences,
  orgNotificationSettings,
} from "@shared/schema";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import { getPushNotificationService } from "../services/push-notification-service";
import type { NotificationPayload } from "../services/push-notification-service";
import { z } from "zod";

/**
 * Validation schema for updating site notification settings
 */
const updateSiteNotificationSettingsSchema = z.object({
  pushNotificationsEnabled: z.boolean().optional(),
  pushDefaultOrgSettings: z.object({
    pushEnabled: z.boolean().optional(),
    wellnessSurveysEnabled: z.boolean().optional(),
    wellnessDigestEnabled: z.boolean().optional(),
    newMeasurementsEnabled: z.boolean().optional(),
    teamAnnouncementsEnabled: z.boolean().optional(),
    defaultPushWellness: z.boolean().optional(),
    defaultPushMeasurements: z.boolean().optional(),
    defaultPushAnnouncements: z.boolean().optional(),
    defaultEmailWellness: z.boolean().optional(),
    defaultEmailMeasurements: z.boolean().optional(),
    defaultEmailAnnouncements: z.boolean().optional(),
  }).optional(),
});

/**
 * Validation schema for broadcast notifications
 */
const broadcastNotificationSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  url: z.string().optional(),
  urgent: z.boolean().optional().default(false),
  roleFilter: z.array(z.enum(['site_admin', 'org_admin', 'coach', 'athlete'])).optional(),
});

// Rate limiter for admin operations
const adminLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMITS.ANALYTICS,
  message: { message: "Too many requests. Please try again later." },
});

// More restrictive rate limiter for broadcast (emergency only)
const broadcastLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Only 5 broadcasts per hour
  message: { message: "Broadcast limit reached. Please wait before sending another." },
});

export function registerAdminNotificationRoutes(app: Express) {
  /**
   * GET /api/admin/notifications/settings
   * Get global notification settings
   * Access: Site Admin only
   */
  app.get(
    "/api/admin/notifications/settings",
    adminLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const settings = await db.select().from(siteSettings).limit(1);

        if (settings.length === 0) {
          // Return defaults if no settings exist
          return res.json({
            pushNotificationsEnabled: true,
            pushDefaultOrgSettings: null,
          });
        }

        return res.json({
          pushNotificationsEnabled: settings[0].pushNotificationsEnabled,
          pushDefaultOrgSettings: settings[0].pushDefaultOrgSettings,
        });
      } catch (error: any) {
        console.error("Failed to fetch admin notification settings:", error);
        res.status(500).json({ message: "Failed to fetch settings" });
      }
    }
  );

  /**
   * PUT /api/admin/notifications/settings
   * Update global notification settings
   * Access: Site Admin only
   */
  app.put(
    "/api/admin/notifications/settings",
    adminLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const validation = updateSiteNotificationSettingsSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid settings data",
            errors: validation.error.errors,
          });
        }

        const data = validation.data;

        // Get current settings
        const currentSettings = await db.select().from(siteSettings).limit(1);

        if (currentSettings.length === 0) {
          // Create settings if they don't exist
          const newSettings = await db.insert(siteSettings).values({
            pushNotificationsEnabled: data.pushNotificationsEnabled ?? true,
            pushDefaultOrgSettings: data.pushDefaultOrgSettings ?? null,
            updatedBy: req.user!.id,
          }).returning();

          return res.json({
            pushNotificationsEnabled: newSettings[0].pushNotificationsEnabled,
            pushDefaultOrgSettings: newSettings[0].pushDefaultOrgSettings,
          });
        }

        // Update existing settings
        const updateValues: Record<string, any> = {
          updatedAt: new Date(),
          updatedBy: req.user!.id,
        };

        if (data.pushNotificationsEnabled !== undefined) {
          updateValues.pushNotificationsEnabled = data.pushNotificationsEnabled;
        }
        if (data.pushDefaultOrgSettings !== undefined) {
          updateValues.pushDefaultOrgSettings = data.pushDefaultOrgSettings;
        }

        const updated = await db
          .update(siteSettings)
          .set(updateValues)
          .where(eq(siteSettings.id, currentSettings[0].id))
          .returning();

        return res.json({
          pushNotificationsEnabled: updated[0].pushNotificationsEnabled,
          pushDefaultOrgSettings: updated[0].pushDefaultOrgSettings,
        });
      } catch (error: any) {
        console.error("Failed to update admin notification settings:", error);
        res.status(500).json({ message: "Failed to update settings" });
      }
    }
  );

  /**
   * GET /api/admin/notifications/analytics
   * Get platform-wide notification analytics
   * Access: Site Admin only
   */
  app.get(
    "/api/admin/notifications/analytics",
    adminLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Total subscriptions count
        const subscriptionCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(pushSubscriptions);

        // Users with preferences set
        const preferencesCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(notificationPreferences);

        // Organizations with custom settings
        const orgSettingsCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(orgNotificationSettings);

        // Notification counts by status (last 30 days)
        const notificationsByStatus = await db
          .select({
            status: notificationHistory.deliveryStatus,
            count: sql<number>`count(*)::int`,
          })
          .from(notificationHistory)
          .where(gte(notificationHistory.sentAt, thirtyDaysAgo))
          .groupBy(notificationHistory.deliveryStatus);

        // Notification counts by type (last 30 days)
        const notificationsByType = await db
          .select({
            type: notificationHistory.type,
            count: sql<number>`count(*)::int`,
          })
          .from(notificationHistory)
          .where(gte(notificationHistory.sentAt, thirtyDaysAgo))
          .groupBy(notificationHistory.type);

        // Click-through rate (last 30 days)
        const clickStats = await db
          .select({
            total: sql<number>`count(*)::int`,
            clicked: sql<number>`count(case when clicked_at is not null then 1 end)::int`,
          })
          .from(notificationHistory)
          .where(
            and(
              gte(notificationHistory.sentAt, thirtyDaysAgo),
              eq(notificationHistory.deliveryStatus, 'delivered')
            )
          );

        // Recent notifications (last 10)
        const recentNotifications = await db
          .select({
            id: notificationHistory.id,
            type: notificationHistory.type,
            title: notificationHistory.title,
            sentAt: notificationHistory.sentAt,
            deliveryStatus: notificationHistory.deliveryStatus,
          })
          .from(notificationHistory)
          .orderBy(desc(notificationHistory.sentAt))
          .limit(10);

        const statusMap: Record<string, number> = {};
        notificationsByStatus.forEach((s) => {
          statusMap[s.status] = s.count;
        });

        const typeMap: Record<string, number> = {};
        notificationsByType.forEach((t) => {
          typeMap[t.type] = t.count;
        });

        const clickRate = clickStats[0]?.total > 0
          ? Math.round((clickStats[0].clicked / clickStats[0].total) * 100)
          : 0;

        return res.json({
          summary: {
            totalSubscriptions: subscriptionCount[0]?.count || 0,
            usersWithPreferences: preferencesCount[0]?.count || 0,
            orgsWithCustomSettings: orgSettingsCount[0]?.count || 0,
          },
          last30Days: {
            notificationsByStatus: statusMap,
            notificationsByType: typeMap,
            totalDelivered: statusMap.delivered || 0,
            totalFailed: statusMap.failed || 0,
            clickThroughRate: clickRate,
          },
          recentNotifications,
        });
      } catch (error: any) {
        console.error("Failed to fetch notification analytics:", error);
        res.status(500).json({ message: "Failed to fetch analytics" });
      }
    }
  );

  /**
   * POST /api/admin/notifications/broadcast
   * Send emergency broadcast to all users
   * Access: Site Admin only
   */
  app.post(
    "/api/admin/notifications/broadcast",
    broadcastLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const validation = broadcastNotificationSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid broadcast data",
            errors: validation.error.errors,
          });
        }

        const data = validation.data;
        const pushService = getPushNotificationService(db);

        // Get all users with push subscriptions
        let query = db
          .select({ userId: pushSubscriptions.userId })
          .from(pushSubscriptions);

        // Note: roleFilter would require joining with userOrganizations
        // For now, we send to all subscribed users

        const userSubscriptions = await query;
        const uniqueUserIds = [...new Set(userSubscriptions.map(s => s.userId))];

        let successful = 0;
        let failed = 0;
        let noSubscription = 0;

        const notification: NotificationPayload = {
          title: data.title,
          body: data.body,
          url: data.url || '/',
          type: 'team_announcement', // Use announcement type for broadcasts
          tag: `broadcast-${Date.now()}`,
          requireInteraction: data.urgent,
          data: {
            broadcast: true,
            sentBy: req.user!.id,
          },
        };

        for (const userId of uniqueUserIds) {
          try {
            const result = await pushService.sendToUser(userId, notification);

            if (result.noSubscription) {
              noSubscription++;
            } else if (result.successful > 0) {
              successful++;
            } else {
              failed++;
            }
          } catch (error) {
            console.error(`Failed to send broadcast to user ${userId}:`, error);
            failed++;
          }
        }

        return res.json({
          message: "Broadcast sent",
          results: {
            totalTargeted: uniqueUserIds.length,
            successful,
            failed,
            noSubscription,
          },
        });
      } catch (error: any) {
        console.error("Failed to send broadcast:", error);
        res.status(500).json({ message: "Failed to send broadcast" });
      }
    }
  );

  console.log("✅ Admin notification routes registered");
}
