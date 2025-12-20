/**
 * Push Notification Routes
 * Handles Web Push subscription management for authenticated users
 */

import type { Express } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { db } from "../db";
import { getPushNotificationService } from "../services/push-notification-service";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

// Validation schemas
const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  deviceName: z.string().optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

// Rate limiting for push subscription endpoints
const pushSubscriptionLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.MUTATION, // Push subscriptions are mutations
  message: { message: "Too many push subscription requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'general'),
});

export function registerPushNotificationRoutes(app: Express) {
  const pushService = getPushNotificationService(db);

  /**
   * GET /api/push/vapid-public-key
   * Get the VAPID public key for client-side subscription
   */
  app.get("/api/push/vapid-public-key", requireAuth, (req, res) => {
    try {
      const publicKey = pushService.getVapidPublicKey();

      if (!publicKey) {
        return res.status(503).json({
          message: "Push notifications are not configured on this server",
        });
      }

      res.json({ publicKey });
    } catch (error) {
      console.error("Error getting VAPID public key:", error);
      res.status(500).json({ message: "Failed to get VAPID public key" });
    }
  });

  /**
   * POST /api/push/subscribe
   * Register a push subscription for the current user
   */
  app.post(
    "/api/push/subscribe",
    requireAuth,
    pushSubscriptionLimiter,
    async (req, res) => {
      try {
        const userId = req.session.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "Not authenticated" });
        }

        // Validate request body
        const parseResult = subscribeSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            message: "Invalid subscription data",
            errors: parseResult.error.flatten().fieldErrors,
          });
        }

        const { subscription, deviceName } = parseResult.data;
        const userAgent = req.headers["user-agent"];

        const result = await pushService.subscribe(
          userId,
          subscription,
          deviceName,
          userAgent
        );

        res.status(201).json({
          id: result.id,
          endpoint: result.endpoint,
          deviceName: result.deviceName,
          message: "Push subscription registered successfully",
        });
      } catch (error: any) {
        if (error.message === "Invalid push subscription endpoint") {
          return res.status(400).json({ message: error.message });
        }
        console.error("Error subscribing to push notifications:", error);
        res.status(500).json({ message: "Failed to register push subscription" });
      }
    }
  );

  /**
   * DELETE /api/push/unsubscribe
   * Remove a push subscription for the current user
   */
  app.delete(
    "/api/push/unsubscribe",
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.session.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "Not authenticated" });
        }

        // Validate request body
        const parseResult = unsubscribeSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            message: "Invalid request",
            errors: parseResult.error.flatten().fieldErrors,
          });
        }

        const { endpoint } = parseResult.data;

        const success = await pushService.unsubscribe(userId, endpoint);

        if (success) {
          res.json({ message: "Push subscription removed successfully" });
        } else {
          res.status(404).json({ message: "Subscription not found" });
        }
      } catch (error) {
        console.error("Error unsubscribing from push notifications:", error);
        res.status(500).json({ message: "Failed to remove push subscription" });
      }
    }
  );

  /**
   * GET /api/push/subscriptions
   * Get all push subscriptions for the current user
   */
  app.get("/api/push/subscriptions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const subscriptions = await pushService.getUserSubscriptions(userId);

      res.json({
        subscriptions: subscriptions.map((sub) => ({
          id: sub.id,
          endpoint: sub.endpoint,
          deviceName: sub.deviceName,
          createdAt: sub.createdAt,
          lastUsedAt: sub.lastUsedAt,
        })),
      });
    } catch (error) {
      console.error("Error getting push subscriptions:", error);
      res.status(500).json({ message: "Failed to get push subscriptions" });
    }
  });

  /**
   * DELETE /api/push/subscriptions/:id
   * Remove a specific push subscription by ID
   */
  app.delete("/api/push/subscriptions/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const subscriptionId = req.params.id;

      // Get user's subscriptions to verify ownership
      const subscriptions = await pushService.getUserSubscriptions(userId);
      const subscription = subscriptions.find((s) => s.id === subscriptionId);

      if (!subscription) {
        return res.status(404).json({ message: "Subscription not found" });
      }

      const success = await pushService.unsubscribe(userId, subscription.endpoint);

      if (success) {
        res.json({ message: "Push subscription removed successfully" });
      } else {
        res.status(500).json({ message: "Failed to remove subscription" });
      }
    } catch (error) {
      console.error("Error removing push subscription:", error);
      res.status(500).json({ message: "Failed to remove push subscription" });
    }
  });

  /**
   * POST /api/push/test
   * Send a test notification to the current user (for testing purposes)
   */
  app.post("/api/push/test", requireAuth, pushSubscriptionLimiter, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const result = await pushService.sendToUser(userId, {
        title: "Test Notification",
        body: "This is a test push notification from AthleteMetrics",
        type: "team_announcement",
        url: "/",
        tag: `test-${Date.now()}`,
      });

      if (result.noSubscription) {
        return res.status(400).json({
          message: "No push subscriptions found. Please enable push notifications first.",
        });
      }

      if (result.skipped) {
        return res.status(400).json({
          message: `Notification skipped: ${result.reason}`,
        });
      }

      res.json({
        message: "Test notification sent",
        successful: result.successful,
        failed: result.failed,
      });
    } catch (error) {
      console.error("Error sending test notification:", error);
      res.status(500).json({ message: "Failed to send test notification" });
    }
  });
}
