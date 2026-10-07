/**
 * Event Measurements Routes
 * Handles creating and retrieving measurements linked to events
 *
 * TDD Phase 6.2: Routes to expose EventMeasurementsService
 */

import { parseFlyInInput } from "@shared/fly-run-in";
import type { Express, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import {
  EventMeasurementsService,
  EventNotFoundError,
  EventFrozenError,
  EventMeasurementNotFoundError,
  EventMeasurementInputError,
  MovementQualitySaveError,
} from "../services/event-measurements-service";
import {
  MeasurementAccessDeniedError,
  MediaUrlPermissionError,
  MovementQualityPermissionError,
} from "../services/measurement-service";
import { PairedInputValidationError } from "../services/paired-input-compute";
import { requireAuth } from "../middleware";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { storage } from "../storage";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import { mediaUrlSchema } from "@shared/schema";
import { MeasurementValueValidationError } from "@shared/measurement-value-validation";
import { clipViewer, omitClipsHiddenFromViewer } from "../utils/measurement-redaction";

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

// Rate limiting for event measurements reads, per signed-in user like the mutation
// limiter below: the entry panel refetches after every save, and a staff sharing one
// gym network shares an IP.
const eventMeasurementsLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.STANDARD,
  keyGenerator: (req) => req.session?.user?.id ?? ipKeyGenerator(req.ip ?? "unknown"),
  validate: { keyGeneratorIpFallback: false },
  message: { message: "Too many event measurements requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Rate limiting for mutation operations, per signed-in user (not per IP: a whole staff on
// one gym network shares an IP). Live event data entry is a high-frequency workflow - a
// 25-athlete session is ~25 Movement Quality saves plus grid saves - so it uses the
// STANDARD tier (100 per 15 minutes per user) instead of the generic MUTATION tier.
const eventMeasurementsMutationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.STANDARD,
  keyGenerator: (req) => req.session?.user?.id ?? ipKeyGenerator(req.ip ?? "unknown"),
  validate: { keyGeneratorIpFallback: false },
  message: { message: "Too many event measurements modification attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/** Body of PUT /api/events/:eventId/athletes/:userId/movement-quality */
const movementQualitySaveSchema = z.object({
  upserts: z
    .array(
      z.object({
        metric: z.string().min(1),
        value: z.number(),
        notes: z.string().max(1000).optional(),
        mediaUrl: mediaUrlSchema,
      })
    )
    .max(12),
  deletes: z
    .array(z.string().min(1))
    .max(12)
    .refine((ids) => new Set(ids).size === ids.length, { message: "deletes must not contain duplicate ids" }),
});

/**
 * Role with which the user manages measurements for an event (used for auto-verification),
 * or null when the user may not manage them: site admin, or org_admin / coach of the
 * event's organization.
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

/** Map service errors to HTTP statuses by type; unexpected errors never leak their message. */
export function sendEventMeasurementError(res: Response, error: unknown) {
  if (error instanceof MovementQualitySaveError) {
    return res.status(400).json({ error: error.message, errors: error.errors });
  }
  if (error instanceof MeasurementValueValidationError || error instanceof PairedInputValidationError) {
    return res.status(400).json({ error: error.message, field: error.field });
  }
  if (error instanceof EventFrozenError || error instanceof EventMeasurementInputError) {
    return res.status(400).json({ error: error.message });
  }
  if (error instanceof MeasurementAccessDeniedError) {
    return res.status(403).json({ error: "Access denied" });
  }
  // Safeguard: managers pass the route gate, but a coach-only check failing must stay a 403
  if (error instanceof MovementQualityPermissionError || error instanceof MediaUrlPermissionError) {
    return res.status(403).json({ error: error.message });
  }
  if (error instanceof EventNotFoundError || error instanceof EventMeasurementNotFoundError) {
    return res.status(404).json({ error: error.message });
  }
  return res.status(500).json({ error: "Failed to save event measurement" });
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

        // Same clip rule as the measurement list (managers and the owner pass the gate above)
        const viewer = clipViewer(user, isSiteAdmin(user) ? [] : await storage.getUserOrganizations(user.id));
        return res.json(omitClipsHiddenFromViewer(measurements, viewer));
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
        if (!(await getEventManagerRole(user, eventId))) {
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

        const { userId, metric, value, date, notes, auxiliaryValue, flyInDistance } = req.body;

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
            auxiliaryValue: auxiliaryValue === undefined || auxiliaryValue === null ? undefined : Number(auxiliaryValue),
            flyInDistance: parseFlyInInput(metric, flyInDistance),
          },
          user.id,
          role
        );

        return res.status(201).json(measurement);
      } catch (error: any) {
        console.error("Error creating event measurement:", error);
        return sendEventMeasurementError(res, error);
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
            auxiliaryValue: m.auxiliaryValue === undefined || m.auxiliaryValue === null ? undefined : Number(m.auxiliaryValue),
            flyInDistance: parseFlyInInput(m.metric, m.flyInDistance),
          })),
          user.id,
          role
        );

        return res.status(201).json(result);
      } catch (error: any) {
        console.error("Error creating bulk event measurements:", error);
        return sendEventMeasurementError(res, error);
      }
    }
  );

  /**
   * Save one athlete's Movement Quality scores for an event atomically
   * PUT /api/events/:eventId/athletes/:userId/movement-quality
   * Body: { upserts: [{ metric, value, notes?, mediaUrl? }], deletes: [measurementId] }
   * All changes apply in one transaction or none do (per-metric errors are returned).
   * Same permission as create; frozen events stay frozen; deletes are event/athlete scoped.
   */
  app.put(
    "/api/events/:eventId/athletes/:userId/movement-quality",
    requireAuth,
    eventMeasurementsMutationLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId, userId } = req.params;
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ error: "User not authenticated" });
        }

        const role = await getEventManagerRole(user, eventId);
        if (!role) {
          return res.status(403).json({ error: "Access denied" });
        }

        const parsed = movementQualitySaveSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
        }

        const result = await eventMeasurementsService.saveMovementQuality(
          eventId,
          userId,
          parsed.data,
          user.id,
          role
        );
        return res.json(result);
      } catch (error) {
        console.error("Error saving Movement Quality scores:", error);
        return sendEventMeasurementError(res, error);
      }
    }
  );

  console.log("  ✓ Event Measurements routes registered");
}
