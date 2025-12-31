/**
 * Event management routes
 * Handles CRUD operations for events (combines, camps, testing days)
 * Supports organization-private and public events with freeze/unfreeze functionality
 *
 * IMPORTANT: Route registration order matters!
 * More specific paths (e.g., /api/events/public) must be registered BEFORE
 * parameterized paths (e.g., /api/events/:eventId) to avoid matching conflicts.
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { EventService, type CreateEventData, type UpdateEventData, type EventFilters, type IEventStorage } from "../services/event-service";
import { requireAuth } from "../middleware";
import { insertEventSchema, type EventVisibility, type EventStatus } from "@shared/schema";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { ZodError } from "zod";
import { storage } from "../storage";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

// Rate limiting for event endpoints
const eventLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.STANDARD,
  message: { message: "Too many event requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter rate limiting for mutation operations
const eventMutationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.MUTATION,
  message: { message: "Too many event modification attempts, please try again later." },
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
  // getUserRoles returns string[] of role names
  const roles = await storage.getUserRoles(user.id, organizationId);
  return roles.includes('org_admin') || roles.includes('coach');
}

/**
 * Check if user is a member of the organization
 */
async function isOrgMember(userId: string, organizationId: string): Promise<boolean> {
  const roles = await storage.getUserRoles(userId, organizationId);
  return roles.length > 0;
}

/**
 * Validate event code format (6-12 alphanumeric characters)
 * Generated codes are 8 chars, but allow flexibility for custom codes
 */
function isValidEventCode(code: string): boolean {
  return /^[A-Za-z0-9]{6,12}$/.test(code);
}

export function registerEventRoutes(app: Express) {
  const eventService = new EventService(storage as IEventStorage);

  // ============================================================
  // ROUTE ORDER IS CRITICAL - Specific paths before parameterized
  // ============================================================

  /**
   * List public events (no auth required)
   * GET /api/events/public
   * MUST be registered BEFORE /api/events/:eventId
   */
  app.get("/api/events/public", eventLimiter, async (req: Request, res: Response) => {
    try {
      const filters: EventFilters = {
        visibility: 'public',
        status: 'published',
      };

      // Date range filters with validation
      if (req.query.startDateFrom) {
        const date = new Date(req.query.startDateFrom as string);
        if (!isNaN(date.getTime())) {
          filters.startDateFrom = date;
        }
      }
      if (req.query.startDateTo) {
        const date = new Date(req.query.startDateTo as string);
        if (!isNaN(date.getTime())) {
          filters.startDateTo = date;
        }
      }

      // Pagination with validation
      if (req.query.limit) {
        const limit = parseInt(req.query.limit as string, 10);
        if (!isNaN(limit) && limit > 0 && limit <= 100) {
          filters.limit = limit;
        }
      }
      if (req.query.offset) {
        const offset = parseInt(req.query.offset as string, 10);
        if (!isNaN(offset) && offset >= 0) {
          filters.offset = offset;
        }
      }

      // Authorization: Public events only (enforced via filters)
      const events = await eventService.listEvents(filters);
      res.json(events);
    } catch (error) {
      console.error("List public events error:", error);
      const message = error instanceof Error ? error.message : "Failed to list public events";
      res.status(500).json({ message });
    }
  });

  /**
   * Get event by event code (for discovery/joining)
   * GET /api/events/join/:eventCode
   * MUST be registered BEFORE /api/events/:eventId
   */
  app.get("/api/events/join/:eventCode", eventLimiter, async (req: Request, res: Response) => {
    try {
      const { eventCode } = req.params;

      // Validate event code format
      if (!eventCode || !isValidEventCode(eventCode)) {
        return res.status(400).json({ message: "Invalid event code format" });
      }

      const event = await eventService.getEventByCode(eventCode);

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Return limited information for public discovery
      res.json({
        id: event.id,
        name: event.name,
        description: event.description,
        location: event.location,
        eventType: event.eventType,
        startDate: event.startDate,
        endDate: event.endDate,
        visibility: event.visibility,
        registrationMode: event.registrationMode,
        status: event.status,
        eventCode: event.eventCode,
      });
    } catch (error) {
      console.error("Get event by code error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch event";
      res.status(500).json({ message });
    }
  });

  /**
   * Create a new event
   * POST /api/events
   */
  app.post("/api/events", eventMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate request body
      const validatedData = insertEventSchema.parse(req.body);

      // Permission check: need org_admin or coach role for org-specific events
      if (validatedData.organizationId) {
        const canManage = await canManageOrgEvents(user, validatedData.organizationId);
        if (!canManage) {
          return res.status(403).json({
            message: "Access denied - you must be an org admin or coach to create events"
          });
        }
      }

      const eventData: CreateEventData = {
        name: validatedData.name,
        description: validatedData.description,
        location: validatedData.location,
        eventType: validatedData.eventType,
        startDate: new Date(validatedData.startDate),
        endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
        timezone: validatedData.timezone,
        visibility: validatedData.visibility as EventVisibility,
        registrationMode: validatedData.registrationMode as 'open' | 'request_approval' | 'invitation_only',
        status: validatedData.status as EventStatus,
        registrationOpensAt: validatedData.registrationOpensAt ? new Date(validatedData.registrationOpensAt) : null,
        registrationClosesAt: validatedData.registrationClosesAt ? new Date(validatedData.registrationClosesAt) : null,
        maxRegistrations: validatedData.maxRegistrations,
        resultsVisibility: validatedData.resultsVisibility as 'immediate' | 'after_event' | 'manual',
        organizationId: validatedData.organizationId,
      };

      const event = await eventService.createEvent(eventData, user.id);
      res.status(201).json(event);
    } catch (error) {
      console.error("Create event error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors
        });
      }
      const message = error instanceof Error ? error.message : "Failed to create event";
      res.status(500).json({ message });
    }
  });

  /**
   * List events with filters
   * GET /api/events
   */
  app.get("/api/events", eventLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const filters: EventFilters = {};

      // Organization filter
      if (req.query.organizationId) {
        const orgId = req.query.organizationId as string;

        // Permission check: only org members can list org events (unless site admin)
        if (!isSiteAdmin(user)) {
          const isMember = await isOrgMember(user.id, orgId);
          if (!isMember) {
            return res.status(403).json({
              message: "Access denied - you are not a member of this organization"
            });
          }
        }

        filters.organizationId = orgId;
      }

      // Status filter
      if (req.query.status) {
        filters.status = req.query.status as EventStatus;
      }

      // Visibility filter
      if (req.query.visibility) {
        filters.visibility = req.query.visibility as EventVisibility;
      }

      // Date range filters with validation
      if (req.query.startDateFrom) {
        const date = new Date(req.query.startDateFrom as string);
        if (!isNaN(date.getTime())) {
          filters.startDateFrom = date;
        }
      }
      if (req.query.startDateTo) {
        const date = new Date(req.query.startDateTo as string);
        if (!isNaN(date.getTime())) {
          filters.startDateTo = date;
        }
      }

      // Pagination with validation
      if (req.query.limit) {
        const limit = parseInt(req.query.limit as string, 10);
        if (!isNaN(limit) && limit > 0 && limit <= 100) {
          filters.limit = limit;
        }
      }
      if (req.query.offset) {
        const offset = parseInt(req.query.offset as string, 10);
        if (!isNaN(offset) && offset >= 0) {
          filters.offset = offset;
        }
      }

      const events = await eventService.listEvents(filters);
      res.json(events);
    } catch (error) {
      console.error("List events error:", error);
      const message = error instanceof Error ? error.message : "Failed to list events";
      res.status(500).json({ message });
    }
  });

  /**
   * Get event by ID
   * GET /api/events/:eventId
   * MUST be registered AFTER specific paths like /api/events/public
   */
  app.get("/api/events/:eventId", eventLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId } = req.params;
      const event = await eventService.getEvent(eventId, user.id);

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      res.json(event);
    } catch (error) {
      console.error("Get event error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch event";

      // Check for access denied errors
      if (message.toLowerCase().includes('access denied') || message.toLowerCase().includes('not authorized')) {
        return res.status(403).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * Update an event
   * PATCH /api/events/:eventId
   */
  app.patch("/api/events/:eventId", eventMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId } = req.params;

      // Get the event first to check permissions
      const existingEvent = await storage.getEvent(eventId);
      if (!existingEvent) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check
      if (existingEvent.organizationId) {
        const canManage = await canManageOrgEvents(user, existingEvent.organizationId);
        if (!canManage) {
          return res.status(403).json({
            message: "Access denied - you must be an org admin or coach to update events"
          });
        }
      }

      const updates: UpdateEventData = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.location !== undefined) updates.location = req.body.location;
      if (req.body.eventType !== undefined) updates.eventType = req.body.eventType;
      if (req.body.startDate !== undefined) updates.startDate = new Date(req.body.startDate);
      if (req.body.endDate !== undefined) updates.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
      if (req.body.visibility !== undefined) updates.visibility = req.body.visibility;
      if (req.body.registrationMode !== undefined) updates.registrationMode = req.body.registrationMode;
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.registrationOpensAt !== undefined) updates.registrationOpensAt = req.body.registrationOpensAt ? new Date(req.body.registrationOpensAt) : null;
      if (req.body.registrationClosesAt !== undefined) updates.registrationClosesAt = req.body.registrationClosesAt ? new Date(req.body.registrationClosesAt) : null;
      if (req.body.maxRegistrations !== undefined) updates.maxRegistrations = req.body.maxRegistrations;
      if (req.body.resultsVisibility !== undefined) updates.resultsVisibility = req.body.resultsVisibility;

      const event = await eventService.updateEvent(eventId, updates, user.id);
      res.json(event);
    } catch (error) {
      console.error("Update event error:", error);
      const message = error instanceof Error ? error.message : "Failed to update event";

      if (message.toLowerCase().includes('frozen')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * Delete an event
   * DELETE /api/events/:eventId
   */
  app.delete("/api/events/:eventId", eventMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId } = req.params;

      // Get the event first to check permissions
      const existingEvent = await storage.getEvent(eventId);
      if (!existingEvent) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check: only org_admin can delete events
      if (existingEvent.organizationId) {
        if (!isSiteAdmin(user)) {
          const roles = await storage.getUserRoles(user.id, existingEvent.organizationId);
          const isOrgAdmin = roles.includes('org_admin');
          if (!isOrgAdmin) {
            return res.status(403).json({
              message: "Access denied - only org admins can delete events"
            });
          }
        }
      }

      await eventService.deleteEvent(eventId, user.id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete event error:", error);
      const message = error instanceof Error ? error.message : "Failed to delete event";

      if (message.toLowerCase().includes('frozen')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * Freeze an event
   * POST /api/events/:eventId/freeze
   */
  app.post("/api/events/:eventId/freeze", eventMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId } = req.params;
      const { reason } = req.body;

      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({ message: "Freeze reason is required" });
      }

      if (reason.length > 1000) {
        return res.status(400).json({ message: "Freeze reason must not exceed 1000 characters" });
      }

      // Get the event first to check permissions
      const existingEvent = await storage.getEvent(eventId);
      if (!existingEvent) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check: only org_admin can freeze events
      if (existingEvent.organizationId) {
        if (!isSiteAdmin(user)) {
          const roles = await storage.getUserRoles(user.id, existingEvent.organizationId);
          const isOrgAdmin = roles.includes('org_admin');
          if (!isOrgAdmin) {
            return res.status(403).json({
              message: "Access denied - only org admins can freeze events"
            });
          }
        }
      }

      const event = await eventService.freezeEvent(eventId, user.id, reason.trim());
      res.json(event);
    } catch (error) {
      console.error("Freeze event error:", error);
      const message = error instanceof Error ? error.message : "Failed to freeze event";

      if (message.toLowerCase().includes('already frozen')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * Unfreeze an event
   * POST /api/events/:eventId/unfreeze
   */
  app.post("/api/events/:eventId/unfreeze", eventMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId } = req.params;

      // Get the event first to check permissions
      const existingEvent = await storage.getEvent(eventId);
      if (!existingEvent) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check: only org_admin can unfreeze events
      if (existingEvent.organizationId) {
        if (!isSiteAdmin(user)) {
          const roles = await storage.getUserRoles(user.id, existingEvent.organizationId);
          const isOrgAdmin = roles.includes('org_admin');
          if (!isOrgAdmin) {
            return res.status(403).json({
              message: "Access denied - only org admins can unfreeze events"
            });
          }
        }
      }

      const event = await eventService.unfreezeEvent(eventId, user.id);
      res.json(event);
    } catch (error) {
      console.error("Unfreeze event error:", error);
      const message = error instanceof Error ? error.message : "Failed to unfreeze event";

      if (message.toLowerCase().includes('not frozen')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * Regenerate event code
   * POST /api/events/:eventId/regenerate-code
   */
  app.post("/api/events/:eventId/regenerate-code", eventMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId } = req.params;

      // Get the event first to check permissions
      const existingEvent = await storage.getEvent(eventId);
      if (!existingEvent) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check: only org_admin can regenerate codes
      if (existingEvent.organizationId) {
        if (!isSiteAdmin(user)) {
          const roles = await storage.getUserRoles(user.id, existingEvent.organizationId);
          const isOrgAdmin = roles.includes('org_admin');
          if (!isOrgAdmin) {
            return res.status(403).json({
              message: "Access denied - only org admins can regenerate event codes"
            });
          }
        }
      }

      // Check if frozen
      if (existingEvent.isFrozen) {
        return res.status(409).json({ message: "Cannot regenerate code for frozen event" });
      }

      // Generate new code and update in a single operation
      const newCode = eventService.generateEventCode();
      const updatedEvent = await storage.updateEvent(eventId, { eventCode: newCode });

      // Create audit log for code regeneration
      await storage.createAuditLog({
        userId: user.id,
        action: 'event_updated',
        resourceType: 'event',
        resourceId: eventId,
        details: JSON.stringify({
          eventName: existingEvent.name,
          changes: ['eventCode'],
          previousCode: existingEvent.eventCode,
          newCode: newCode,
        }),
      });

      res.json({ eventCode: updatedEvent.eventCode });
    } catch (error) {
      console.error("Regenerate event code error:", error);
      const message = error instanceof Error ? error.message : "Failed to regenerate event code";
      res.status(500).json({ message });
    }
  });

  console.log("  ✓ Event routes registered");
}
