/**
 * Event Measurements Routes
 * Handles creating and retrieving measurements linked to events
 *
 * TDD Phase 6.2: Routes to expose EventMeasurementsService
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { EventMeasurementsService } from "../services/event-measurements-service";
import { requireAuth } from "../middleware";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { storage } from "../storage";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import { mediaUrlSchema } from "@shared/schema";
import { MediaUrlPermissionError } from "../services/measurement-service";

/**
 * Validate an optional mediaUrl with the shared validator (https-only, public host, <= 2048).
 * Empty string / null normalize to null (clear).
 */
function parseMediaUrl(raw: unknown): { ok: true; value: string | null | undefined } | { ok: false; message: string } {
  const result = mediaUrlSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? "Invalid mediaUrl" };
  }
  return { ok: true, value: result.data };
}

// Rate limiting for event measurements endpoints
const eventMeasurementsLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.STANDARD,
  message: { message: "Too many event measurements requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter rate limiting for mutation operations
const eventMeasurementsMutationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.MUTATION,
  message: { message: "Too many event measurements modification attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Role with which the user manages measurements for an event, or null when the user
 * may not manage them: site admin, or org_admin / coach of the event's organization.
 */
async function getEventManagerRole(user: SessionUser, eventId: string): Promise<string | null> {
  if (isSiteAdmin(user)) {
    return "site_admin";
  }

  // Get the event to check organization
  const event = await storage.getEvent(eventId);
  if (!event || !event.organizationId) {
    return null;
  }

  // Check if user has org_admin or coach role in this organization
  const roles = await storage.getUserRoles(user.id, event.organizationId);
  if (roles.includes("org_admin")) return "org_admin";
  if (roles.includes("coach")) return "coach";
  return null;
}

export function registerEventMeasurementsRoutes(app: Express) {
  const eventMeasurementsService = new EventMeasurementsService(storage);

  /**
   * List all measurements for an event
   * GET /api/events/:eventId/measurements
   *
   * Access rules:
   * - Coaches/Org Admins/Site Admins: Can view all measurements
   * - Athletes: Can view ONLY their own measurements if results are published
   */
  app.get(
    "/api/events/:eventId/measurements",
    requireAuth,
    eventMeasurementsLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ error: "User not authenticated" });
        }
        const requestedUserId = req.query.userId as string | undefined;

        // Get the event to check permissions
        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }

        // Check if user has management access (coach/org_admin/site_admin)
        const hasManagementAccess = (await getEventManagerRole(user, eventId)) !== null;

        // Athletes can only view their own measurements if results are published
        const isViewingOwnData = requestedUserId === user.id;
        const resultsPublished = !!event.resultsPublishedAt;
        const athleteCanViewOwn = isViewingOwnData && resultsPublished;

        if (!hasManagementAccess && !athleteCanViewOwn) {
          // If not a manager and either not requesting own data or results not published
          if (!resultsPublished) {
            return res.status(403).json({ error: "Results have not been published yet" });
          }
          return res.status(403).json({ error: "Access denied" });
        }

        // If athlete viewing own data, force the userId filter to their own ID
        const effectiveUserId = hasManagementAccess ? requestedUserId : user.id;

        const measurements = await eventMeasurementsService.getEventMeasurements(eventId, {
          userId: effectiveUserId,
          metricCode: req.query.metricCode as string | undefined,
        });

        return res.json(measurements);
      } catch (error: any) {
        console.error("Error fetching event measurements:", error);
        return res.status(500).json({ error: error.message });
      }
    }
  );

  /**
   * Get measurement statistics for an event
   * GET /api/events/:eventId/measurements/stats
   */
  app.get(
    "/api/events/:eventId/measurements/stats",
    requireAuth,
    eventMeasurementsLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Get the event to check permissions
        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }

        // Check if user has access
        const role = await getEventManagerRole(user, eventId);
        if (!role) {
          return res.status(403).json({ error: "Access denied" });
        }

        const stats = await eventMeasurementsService.getEventMeasurementStats(eventId);
        return res.json(stats);
      } catch (error: any) {
        console.error("Error fetching event measurement stats:", error);
        return res.status(500).json({ error: error.message });
      }
    }
  );

  /**
   * Create a measurement for an event
   * POST /api/events/:eventId/measurements
   */
  app.post(
    "/api/events/:eventId/measurements",
    requireAuth,
    eventMeasurementsMutationLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Check permissions
        const role = await getEventManagerRole(user, eventId);
        if (!role) {
          return res.status(403).json({ error: "Access denied" });
        }

        const { userId, metric, value, date, notes } = req.body;

        if (!userId || !metric || value === undefined || !date) {
          return res.status(400).json({
            error: "Missing required fields: userId, metric, value, date"
          });
        }

        const mediaUrl = parseMediaUrl(req.body.mediaUrl);
        if (!mediaUrl.ok) {
          return res.status(400).json({ error: `Invalid mediaUrl: ${mediaUrl.message}` });
        }

        const measurement = await eventMeasurementsService.createEventMeasurement(
          eventId,
          {
            userId,
            metric,
            value: Number(value),
            date: new Date(date),
            notes,
            mediaUrl: mediaUrl.value,
          },
          user.id,
          role
        );

        return res.status(201).json(measurement);
      } catch (error: any) {
        console.error("Error creating event measurement:", error);
        if (error instanceof MediaUrlPermissionError) {
          return res.status(403).json({ error: error.message });
        }
        if (error.message.includes("not a member")) {
          return res.status(400).json({ error: error.message });
        }
        if (error.message.includes("frozen")) {
          return res.status(400).json({ error: error.message });
        }
        if (error.message.includes("not found")) {
          return res.status(404).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
      }
    }
  );

  /**
   * Create multiple measurements for an event (bulk entry)
   * POST /api/events/:eventId/measurements/bulk
   */
  app.post(
    "/api/events/:eventId/measurements/bulk",
    requireAuth,
    eventMeasurementsMutationLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        // Check permissions
        const role = await getEventManagerRole(user, eventId);
        if (!role) {
          return res.status(403).json({ error: "Access denied" });
        }

        const { measurements } = req.body;

        if (!Array.isArray(measurements) || measurements.length === 0) {
          return res.status(400).json({ error: "measurements array is required" });
        }

        // Validate each measurement has required fields
        const validationErrors: string[] = [];
        const mediaUrls: Array<string | null | undefined> = [];
        measurements.forEach((m: any, index: number) => {
          if (!m.userId) validationErrors.push(`Item ${index}: missing userId`);
          if (!m.metric) validationErrors.push(`Item ${index}: missing metric`);
          if (m.value === undefined) validationErrors.push(`Item ${index}: missing value`);
          if (!m.date) validationErrors.push(`Item ${index}: missing date`);
          const parsedMedia = parseMediaUrl(m.mediaUrl);
          if (parsedMedia.ok) {
            mediaUrls[index] = parsedMedia.value;
          } else {
            validationErrors.push(`Item ${index}: invalid mediaUrl (${parsedMedia.message})`);
          }
        });

        if (validationErrors.length > 0) {
          return res.status(400).json({
            error: "Validation failed",
            details: validationErrors
          });
        }

        const result = await eventMeasurementsService.createEventMeasurementsBulk(
          eventId,
          measurements.map((m: any, index: number) => ({
            userId: m.userId,
            metric: m.metric,
            value: Number(m.value),
            date: new Date(m.date),
            notes: m.notes,
            mediaUrl: mediaUrls[index],
          })),
          user.id,
          role
        );

        return res.status(201).json(result);
      } catch (error: any) {
        console.error("Error creating bulk event measurements:", error);
        if (error.message.includes("frozen")) {
          return res.status(400).json({ error: error.message });
        }
        if (error.message.includes("not found")) {
          return res.status(404).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
      }
    }
  );

  console.log("  ✓ Event Measurements routes registered");
}
