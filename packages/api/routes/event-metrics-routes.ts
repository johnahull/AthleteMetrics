/**
 * Event Metrics Routes
 * Handles configuration of which metrics are available at specific events
 *
 * TDD Phase 2: GREEN - Implementation to make tests pass
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { EventMetricsService, type AddMetricOptions, type UpdateMetricOptions } from "../services/event-metrics-service";
import { requireAuth } from "../middleware";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { storage } from "../storage";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

// Rate limiting for event metrics endpoints
const eventMetricsLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.STANDARD,
  message: { message: "Too many event metrics requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter rate limiting for mutation operations
const eventMetricsMutationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.MUTATION,
  message: { message: "Too many event metrics modification attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Check if user has permission to manage events for an organization
 */
async function canManageOrgEvents(user: SessionUser, organizationId: string): Promise<boolean> {
  if (isSiteAdmin(user)) {
    return true;
  }

  // Check if user has org_admin or coach role in this organization
  const roles = await storage.getUserRoles(user.id, organizationId);
  return roles.includes('org_admin') || roles.includes('coach');
}

export function registerEventMetricsRoutes(app: Express) {
  const eventMetricsService = new EventMetricsService(storage);

  /**
   * List all metrics configured for an event
   * GET /api/events/:eventId/metrics
   */
  app.get(
    "/api/events/:eventId/metrics",
    requireAuth,
    eventMetricsLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const includeDetails = req.query.includeDetails === 'true';

        // Get the event to check permissions
        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }

        // Check if user has access to this event's org
        const user = req.user as SessionUser;
        if (!event.organizationId) {
          return res.status(400).json({ error: "Event has no organization" });
        }

        const hasAccess = await canManageOrgEvents(user, event.organizationId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }

        const metrics = await eventMetricsService.listEventMetrics(eventId, {
          includeMetricDetails: includeDetails,
        });

        return res.json(metrics);
      } catch (error) {
        console.error("Error listing event metrics:", error);
        return res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to list event metrics"
        });
      }
    }
  );

  /**
   * Add a metric to an event
   * POST /api/events/:eventId/metrics
   */
  app.post(
    "/api/events/:eventId/metrics",
    requireAuth,
    eventMetricsMutationLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const { metricCode, displayOrder, isRequired, customLabel } = req.body;

        if (!metricCode) {
          return res.status(400).json({ error: "metricCode is required" });
        }

        // Get the event to check permissions
        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }

        // Check permissions
        const user = req.user as SessionUser;
        if (!event.organizationId) {
          return res.status(400).json({ error: "Event has no organization" });
        }

        const hasAccess = await canManageOrgEvents(user, event.organizationId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }

        const options: AddMetricOptions = {
          displayOrder,
          isRequired,
          customLabel,
        };

        const eventMetric = await eventMetricsService.addMetricToEvent(
          eventId,
          metricCode,
          user.id,
          options
        );

        return res.status(201).json(eventMetric);
      } catch (error) {
        console.error("Error adding metric to event:", error);

        // Return 400 for business logic errors (frozen event, duplicate metric, etc.)
        if (error instanceof Error) {
          if (
            error.message.includes("frozen") ||
            error.message.includes("already added") ||
            error.message.includes("not found")
          ) {
            return res.status(400).json({ error: error.message });
          }
        }

        return res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to add metric to event"
        });
      }
    }
  );

  /**
   * Update event metric configuration
   * PUT /api/events/:eventId/metrics/:code
   */
  app.put(
    "/api/events/:eventId/metrics/:code",
    requireAuth,
    eventMetricsMutationLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId, code } = req.params;
        const { displayOrder, isRequired, customLabel } = req.body;

        // Get the event to check permissions
        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }

        // Check permissions
        const user = req.user as SessionUser;
        if (!event.organizationId) {
          return res.status(400).json({ error: "Event has no organization" });
        }

        const hasAccess = await canManageOrgEvents(user, event.organizationId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }

        const updates: UpdateMetricOptions = {
          displayOrder,
          isRequired,
          customLabel,
        };

        const updated = await eventMetricsService.updateEventMetric(
          eventId,
          code,
          user.id,
          updates
        );

        return res.json(updated);
      } catch (error) {
        console.error("Error updating event metric:", error);

        // Return 400 for business logic errors
        if (error instanceof Error) {
          if (
            error.message.includes("frozen") ||
            error.message.includes("not configured")
          ) {
            return res.status(400).json({ error: error.message });
          }
        }

        return res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to update event metric"
        });
      }
    }
  );

  /**
   * Remove a metric from an event
   * DELETE /api/events/:eventId/metrics/:code
   */
  app.delete(
    "/api/events/:eventId/metrics/:code",
    requireAuth,
    eventMetricsMutationLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId, code } = req.params;

        // Get the event to check permissions
        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }

        // Check permissions
        const user = req.user as SessionUser;
        if (!event.organizationId) {
          return res.status(400).json({ error: "Event has no organization" });
        }

        const hasAccess = await canManageOrgEvents(user, event.organizationId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }

        await eventMetricsService.removeMetricFromEvent(eventId, code, user.id);

        return res.status(204).send();
      } catch (error) {
        console.error("Error removing metric from event:", error);

        // Return 400 for business logic errors
        if (error instanceof Error) {
          if (
            error.message.includes("frozen") ||
            error.message.includes("not configured")
          ) {
            return res.status(400).json({ error: error.message });
          }
        }

        return res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to remove metric from event"
        });
      }
    }
  );

  /**
   * Reorder event metrics
   * PUT /api/events/:eventId/metrics/reorder
   */
  app.put(
    "/api/events/:eventId/metrics/reorder",
    requireAuth,
    eventMetricsMutationLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const { orderedMetricCodes } = req.body;

        if (!Array.isArray(orderedMetricCodes)) {
          return res.status(400).json({ error: "orderedMetricCodes must be an array" });
        }

        // Get the event to check permissions
        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }

        // Check permissions
        const user = req.user as SessionUser;
        if (!event.organizationId) {
          return res.status(400).json({ error: "Event has no organization" });
        }

        const hasAccess = await canManageOrgEvents(user, event.organizationId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }

        await eventMetricsService.reorderEventMetrics(
          eventId,
          user.id,
          orderedMetricCodes
        );

        return res.status(204).send();
      } catch (error) {
        console.error("Error reordering event metrics:", error);

        // Return 400 for business logic errors
        if (error instanceof Error && error.message.includes("frozen")) {
          return res.status(400).json({ error: error.message });
        }

        return res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to reorder event metrics"
        });
      }
    }
  );

  console.log("✅ Event Metrics routes registered");
}
