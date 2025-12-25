/**
 * Event Results Routes
 * Handles results visibility and publishing for events
 *
 * TDD Phase 6.3: GREEN - Routes to expose EventResultsService
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { EventResultsService } from "../services/event-results-service";
import { requireAuth } from "../middleware";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { storage } from "../storage";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import type { ResultsVisibility } from "@shared/schema";

// Rate limiting for event results endpoints
const eventResultsLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.STANDARD,
  message: { message: "Too many event results requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter rate limiting for mutation operations
const eventResultsMutationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.MUTATION,
  message: { message: "Too many event results modification attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Check if user has permission to manage results for an event
 */
async function canManageEventResults(user: SessionUser, eventId: string): Promise<boolean> {
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

export function registerEventResultsRoutes(app: Express) {
  const resultsService = new EventResultsService(storage);

  /**
   * Get results visibility status for an event
   * GET /api/events/:eventId/results/status
   */
  app.get(
    "/api/events/:eventId/results/status",
    requireAuth,
    eventResultsLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const user = req.user as SessionUser;

        // Check if user has access to this event
        const hasAccess = await canManageEventResults(user, eventId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }

        const status = await resultsService.getResultsVisibilityStatus(eventId);
        return res.json(status);
      } catch (error: any) {
        console.error("Error fetching results status:", error);
        if (error.message === "Event not found") {
          return res.status(404).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
      }
    }
  );

  /**
   * Check if results are visible to current user
   * GET /api/events/:eventId/results/visible
   */
  app.get(
    "/api/events/:eventId/results/visible",
    requireAuth,
    eventResultsLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const user = req.user as SessionUser;

        const visible = await resultsService.areResultsVisible(eventId, user.id);
        const canViewOwn = await resultsService.canViewOwnResults(eventId, user.id);

        return res.json({
          visible,
          canViewOwnResults: canViewOwn,
        });
      } catch (error: any) {
        console.error("Error checking results visibility:", error);
        return res.status(500).json({ error: error.message });
      }
    }
  );

  /**
   * Publish results for an event
   * POST /api/events/:eventId/results/publish
   */
  app.post(
    "/api/events/:eventId/results/publish",
    requireAuth,
    eventResultsMutationLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const user = req.user as SessionUser;

        // Check permissions
        const hasAccess = await canManageEventResults(user, eventId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }

        const event = await resultsService.publishResults(eventId, user.id);
        return res.json({
          message: "Results published successfully",
          event,
        });
      } catch (error: any) {
        console.error("Error publishing results:", error);
        if (error.message === "Event not found") {
          return res.status(404).json({ error: error.message });
        }
        if (error.message.includes("frozen")) {
          return res.status(400).json({ error: error.message });
        }
        if (error.message.includes("already published")) {
          return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
      }
    }
  );

  /**
   * Unpublish results for an event
   * POST /api/events/:eventId/results/unpublish
   */
  app.post(
    "/api/events/:eventId/results/unpublish",
    requireAuth,
    eventResultsMutationLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const user = req.user as SessionUser;

        // Check permissions
        const hasAccess = await canManageEventResults(user, eventId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }

        const event = await resultsService.unpublishResults(eventId, user.id);
        return res.json({
          message: "Results unpublished successfully",
          event,
        });
      } catch (error: any) {
        console.error("Error unpublishing results:", error);
        if (error.message === "Event not found") {
          return res.status(404).json({ error: error.message });
        }
        if (error.message.includes("frozen")) {
          return res.status(400).json({ error: error.message });
        }
        if (error.message.includes("not published")) {
          return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
      }
    }
  );

  /**
   * Update results visibility mode for an event
   * PUT /api/events/:eventId/results/visibility
   */
  app.put(
    "/api/events/:eventId/results/visibility",
    requireAuth,
    eventResultsMutationLimiter,
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const user = req.user as SessionUser;
        const { visibility } = req.body;

        // Validate visibility value
        const validVisibilities: ResultsVisibility[] = ['immediate', 'after_event', 'manual'];
        if (!visibility || !validVisibilities.includes(visibility)) {
          return res.status(400).json({
            error: "Invalid visibility. Must be one of: immediate, after_event, manual"
          });
        }

        // Check permissions
        const hasAccess = await canManageEventResults(user, eventId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }

        const event = await resultsService.updateResultsVisibility(
          eventId,
          user.id,
          visibility as ResultsVisibility
        );

        return res.json({
          message: "Results visibility updated successfully",
          event,
        });
      } catch (error: any) {
        console.error("Error updating results visibility:", error);
        if (error.message === "Event not found") {
          return res.status(404).json({ error: error.message });
        }
        if (error.message.includes("frozen")) {
          return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
      }
    }
  );

  console.log("  ✓ Event Results routes registered");
}
