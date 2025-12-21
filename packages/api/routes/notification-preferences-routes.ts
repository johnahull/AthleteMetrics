/**
 * Notification Preferences Routes
 * Handles user notification preference management
 */

import type { Express } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware";
import { db } from "../db";
import { notificationPreferences, notificationHistory } from "@shared/schema";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

// Rate limiter for notification history (read-heavy)
const historyLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMITS.STANDARD, // Use standard limit for read operations
  message: { message: "Too many requests. Please try again later." },
});

// Rate limiter for preference mutations (more restrictive)
const preferencesLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMITS.MUTATION, // More restrictive for write operations
  message: { message: "Too many preference updates. Please try again later." },
});

// Rate limiter for click tracking (prevent analytics spam)
const clickLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 30, // 30 clicks per minute max
  message: { message: "Too many click tracking requests." },
});

// Validation schema for updating preferences
const updatePreferencesSchema = z.object({
  // Master toggles
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  // Push notification type toggles
  pushWellnessSurveys: z.boolean().optional(),
  pushWellnessDigest: z.boolean().optional(),
  pushNewMeasurements: z.boolean().optional(),
  pushTeamAnnouncements: z.boolean().optional(),
  // Email notification type toggles
  emailWellnessSurveys: z.boolean().optional(),
  emailWellnessDigest: z.boolean().optional(),
  emailNewMeasurements: z.boolean().optional(),
  emailTeamAnnouncements: z.boolean().optional(),
  // Quiet hours
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().nullable(),
  quietHoursEnd: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().nullable(),
  quietHoursTimezone: z.string().optional().nullable(),
});

// Default preferences for new users
const DEFAULT_PREFERENCES = {
  pushEnabled: true,
  emailEnabled: true,
  pushWellnessSurveys: true,
  pushWellnessDigest: true,
  pushNewMeasurements: true,
  pushTeamAnnouncements: true,
  emailWellnessSurveys: true,
  emailWellnessDigest: true,
  emailNewMeasurements: false,
  emailTeamAnnouncements: true,
  quietHoursEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  quietHoursTimezone: 'America/New_York',
};

export function registerNotificationPreferencesRoutes(app: Express) {
  /**
   * GET /api/notifications/preferences
   * Get the current user's notification preferences
   */
  app.get("/api/notifications/preferences", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const prefs = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId));

      if (prefs.length === 0) {
        // Return default preferences if none exist
        return res.json({
          ...DEFAULT_PREFERENCES,
          isDefault: true,
        });
      }

      res.json({
        ...prefs[0],
        isDefault: false,
      });
    } catch (error) {
      console.error("Error getting notification preferences:", error);
      res.status(500).json({ message: "Failed to get notification preferences" });
    }
  });

  /**
   * PUT /api/notifications/preferences
   * Update the current user's notification preferences
   */
  app.put("/api/notifications/preferences", requireAuth, preferencesLimiter, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Validate request body
      const parseResult = updatePreferencesSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: "Invalid preferences data",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const updates = parseResult.data;

      // Check if preferences already exist
      const existing = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId));

      let result;

      if (existing.length === 0) {
        // Create new preferences with defaults + updates
        const newPrefs = {
          userId,
          ...DEFAULT_PREFERENCES,
          ...updates,
          updatedAt: new Date(),
        };

        [result] = await db
          .insert(notificationPreferences)
          .values(newPrefs)
          .returning();
      } else {
        // Update existing preferences
        [result] = await db
          .update(notificationPreferences)
          .set({
            ...updates,
            updatedAt: new Date(),
          })
          .where(eq(notificationPreferences.userId, userId))
          .returning();
      }

      res.json({
        ...result,
        message: "Notification preferences updated successfully",
      });
    } catch (error) {
      console.error("Error updating notification preferences:", error);
      res.status(500).json({ message: "Failed to update notification preferences" });
    }
  });

  /**
   * GET /api/notifications/history
   * Get notification history for the current user
   */
  app.get("/api/notifications/history", historyLimiter, requireAuth, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Parse query parameters
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const type = req.query.type as string | undefined;

      let query = db
        .select()
        .from(notificationHistory)
        .where(eq(notificationHistory.userId, userId))
        .orderBy(desc(notificationHistory.sentAt))
        .limit(limit)
        .offset(offset);

      // Note: Type filtering would require additional query builder
      // For now, filter in memory if type is specified
      let history = await query;

      if (type) {
        history = history.filter((h) => h.type === type);
      }

      res.json({
        notifications: history.map((h) => ({
          id: h.id,
          type: h.type,
          title: h.title,
          body: h.body,
          url: h.url,
          channels: h.channels,
          deliveryStatus: h.deliveryStatus,
          sentAt: h.sentAt,
          deliveredAt: h.deliveredAt,
          clickedAt: h.clickedAt,
        })),
        pagination: {
          limit,
          offset,
          hasMore: history.length === limit,
        },
      });
    } catch (error) {
      console.error("Error getting notification history:", error);
      res.status(500).json({ message: "Failed to get notification history" });
    }
  });

  /**
   * POST /api/notifications/:id/clicked
   * Mark a notification as clicked (for analytics)
   */
  app.post("/api/notifications/:id/clicked", requireAuth, clickLimiter, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const notificationId = req.params.id;

      // Verify ownership BEFORE updating (security fix)
      const [updated] = await db
        .update(notificationHistory)
        .set({ clickedAt: new Date() })
        .where(
          and(
            eq(notificationHistory.id, notificationId),
            eq(notificationHistory.userId, userId)
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Notification not found or access denied" });
      }

      res.json({ message: "Notification marked as clicked" });
    } catch (error) {
      console.error("Error marking notification as clicked:", error);
      res.status(500).json({ message: "Failed to mark notification as clicked" });
    }
  });
}
