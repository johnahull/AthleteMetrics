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
 * Check if user has permission to manage measurements for an event
 */
async function canManageEventMeasurements(user: SessionUser, eventId: string): Promise<boolean> {
  if (isSiteAdmin(user)) {
    return true;
  }

  // Get the event to check organization
  const event = await storage.getEvent(eventId);
  if (!event || !event.organizationId) {
    return false;
  }

  // Check if user has org_admin or coach role in this organization
  const roles = await storage.getUserRoles(user.id, event.organizationId);
  return roles.includes('org_admin') || roles.includes('coach');
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
        const user = req.user as SessionUser;
        const requestedUserId = req.query.userId as string | undefined;

        // Get the event to check permissions
        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }

        // Check if user has management access (coach/org_admin/site_admin)
        const hasManagementAccess = await canManageEventMeasurements(user, eventId);

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
        const user = req.user as SessionUser;

        // Get the event to check permissions
        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }

        // Check if user has access
        const hasAccess = await canManageEventMeasurements(user, eventId);
        if (!hasAccess) {
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
        const user = req.user as SessionUser;

        // Check permissions
        const hasAccess = await canManageEventMeasurements(user, eventId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }

        const { userId, metric, value, date, notes } = req.body;

        if (!userId || !metric || value === undefined || !date) {
          return res.status(400).json({
            error: "Missing required fields: userId, metric, value, date"
          });
        }

        const measurement = await eventMeasurementsService.createEventMeasurement(
          eventId,
          {
            userId,
            metric,
            value: Number(value),
            date: new Date(date),
            notes,
          },
          user.id
        );

        return res.status(201).json(measurement);
      } catch (error: any) {
        console.error("Error creating event measurement:", error);
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
        const user = req.user as SessionUser;

        // Check permissions
        const hasAccess = await canManageEventMeasurements(user, eventId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }

        const { measurements } = req.body;

        if (!Array.isArray(measurements) || measurements.length === 0) {
          return res.status(400).json({ error: "measurements array is required" });
        }

        // Validate each measurement has required fields
        const validationErrors: string[] = [];
        measurements.forEach((m: any, index: number) => {
          if (!m.userId) validationErrors.push(`Item ${index}: missing userId`);
          if (!m.metric) validationErrors.push(`Item ${index}: missing metric`);
          if (m.value === undefined) validationErrors.push(`Item ${index}: missing value`);
          if (!m.date) validationErrors.push(`Item ${index}: missing date`);
        });

        if (validationErrors.length > 0) {
          return res.status(400).json({
            error: "Validation failed",
            details: validationErrors
          });
        }

        const result = await eventMeasurementsService.createEventMeasurementsBulk(
          eventId,
          measurements.map((m: any) => ({
            userId: m.userId,
            metric: m.metric,
            value: Number(m.value),
            date: new Date(m.date),
            notes: m.notes,
          })),
          user.id
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
