/**
 * Event registration routes
 * Handles athlete registration for events including self-registration,
 * approval workflow, check-in, and waitlist management
 *
 * Required endpoints for frontend:
 * - POST /api/events/:eventId/register - Self-register for an event
 * - GET /api/events/:eventId/my-registration - Get own registration
 * - DELETE /api/events/:eventId/my-registration - Cancel own registration
 * - GET /api/events/:eventId/registrations - List all registrations (admin)
 * - POST /api/events/:eventId/registrations/:userId/approve - Approve registration
 * - POST /api/events/:eventId/registrations/:userId/decline - Decline registration
 * - POST /api/events/:eventId/registrations/:userId/check-in - Check in athlete
 * - GET /api/events/my-registrations - List user's own registrations
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { EventRegistrationService, type RegisterOptions, type RegistrationFilters, type IRegistrationStorage } from "../services/event-registration-service";
import { requireAuth } from "../middleware";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { storage } from "../storage";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

// Rate limiting for registration endpoints
const registrationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.STANDARD,
  message: { message: "Too many registration requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter rate limiting for mutation operations
const registrationMutationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.MUTATION,
  message: { message: "Too many registration modification attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Check if user has permission to manage event registrations
 */
async function canManageEventRegistrations(user: SessionUser, organizationId: string | null): Promise<boolean> {
  if (isSiteAdmin(user)) {
    return true;
  }

  if (!organizationId) {
    return false;
  }

  const roles = await storage.getUserRoles(user.id, organizationId);
  return roles.includes('org_admin') || roles.includes('coach');
}

export function registerEventRegistrationRoutes(app: Express) {
  const registrationService = new EventRegistrationService(storage as IRegistrationStorage);

  /**
   * Get user's own registrations across all events
   * GET /api/events/my-registrations
   * MUST be registered BEFORE parameterized paths
   */
  app.get("/api/events/my-registrations", registrationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get all registrations for the current user
      const registrations = await storage.getUserEventRegistrations(user.id);
      res.json(registrations);
    } catch (error) {
      console.error("List my registrations error:", error);
      const message = error instanceof Error ? error.message : "Failed to list registrations";
      res.status(500).json({ message });
    }
  });

  /**
   * Self-register for an event
   * POST /api/events/:eventId/register
   */
  app.post("/api/events/:eventId/register", registrationMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId } = req.params;
      const { discoveryMethod, athleteNotes } = req.body;

      // Validate discoveryMethod enum
      const validDiscoveryMethods = ['event_code', 'direct_link', 'invitation', 'org_roster', null];
      if (discoveryMethod && !validDiscoveryMethods.includes(discoveryMethod)) {
        return res.status(400).json({ message: "Invalid discovery method" });
      }

      // Validate athleteNotes length if provided
      if (athleteNotes && typeof athleteNotes === 'string' && athleteNotes.length > 1000) {
        return res.status(400).json({ message: "Athlete notes must be 1000 characters or less" });
      }

      const options: RegisterOptions = {
        discoveryMethod: discoveryMethod || 'direct_link',
        athleteNotes: athleteNotes || null,
      };

      const registration = await registrationService.registerForEvent(eventId, user.id, options);
      res.status(201).json(registration);
    } catch (error) {
      console.error("Register for event error:", error);
      const message = error instanceof Error ? error.message : "Failed to register for event";

      if (message.toLowerCase().includes('frozen')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('already registered')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('invite-only')) {
        return res.status(403).json({ message });
      }
      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * Get own registration for an event
   * GET /api/events/:eventId/my-registration
   */
  app.get("/api/events/:eventId/my-registration", registrationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId } = req.params;
      const registration = await registrationService.getMyRegistration(eventId, user.id);

      if (!registration) {
        return res.status(404).json({ message: "You are not registered for this event" });
      }

      res.json(registration);
    } catch (error) {
      console.error("Get my registration error:", error);
      const message = error instanceof Error ? error.message : "Failed to get registration";
      res.status(500).json({ message });
    }
  });

  /**
   * Cancel own registration for an event
   * DELETE /api/events/:eventId/my-registration
   */
  app.delete("/api/events/:eventId/my-registration", registrationMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId } = req.params;
      const registration = await registrationService.cancelRegistration(eventId, user.id, user.id);
      res.json(registration);
    } catch (error) {
      console.error("Cancel registration error:", error);
      const message = error instanceof Error ? error.message : "Failed to cancel registration";

      if (message.toLowerCase().includes('frozen')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }
      if (message.toLowerCase().includes('not authorized')) {
        return res.status(403).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * List all registrations for an event (admin view)
   * GET /api/events/:eventId/registrations
   */
  app.get("/api/events/:eventId/registrations", registrationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId } = req.params;

      // Get event to check permissions
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check: must be able to manage event registrations
      const canManage = await canManageEventRegistrations(user, event.organizationId);
      if (!canManage) {
        return res.status(403).json({
          message: "Access denied - you must be an org admin or coach to view registrations"
        });
      }

      const filters: RegistrationFilters = {};

      if (req.query.status) {
        filters.status = req.query.status as RegistrationFilters['status'];
      }
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

      const registrations = await registrationService.listRegistrations(eventId, user.id, filters);
      res.json(registrations);
    } catch (error) {
      console.error("List registrations error:", error);
      const message = error instanceof Error ? error.message : "Failed to list registrations";
      res.status(500).json({ message });
    }
  });

  /**
   * Approve a pending registration
   * POST /api/events/:eventId/registrations/:userId/approve
   */
  app.post("/api/events/:eventId/registrations/:userId/approve", registrationMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId, userId } = req.params;

      // Get event to check permissions
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check
      const canManage = await canManageEventRegistrations(user, event.organizationId);
      if (!canManage) {
        return res.status(403).json({
          message: "Access denied - you must be an org admin or coach to approve registrations"
        });
      }

      const registration = await registrationService.approveRegistration(eventId, userId, user.id);
      res.json(registration);
    } catch (error) {
      console.error("Approve registration error:", error);
      const message = error instanceof Error ? error.message : "Failed to approve registration";

      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }
      if (message.toLowerCase().includes('not pending')) {
        return res.status(409).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * Decline a pending registration
   * POST /api/events/:eventId/registrations/:userId/decline
   */
  app.post("/api/events/:eventId/registrations/:userId/decline", registrationMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId, userId } = req.params;
      const { reason } = req.body;

      // Get event to check permissions
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check
      const canManage = await canManageEventRegistrations(user, event.organizationId);
      if (!canManage) {
        return res.status(403).json({
          message: "Access denied - you must be an org admin or coach to decline registrations"
        });
      }

      const registration = await registrationService.declineRegistration(eventId, userId, user.id, reason);
      res.json(registration);
    } catch (error) {
      console.error("Decline registration error:", error);
      const message = error instanceof Error ? error.message : "Failed to decline registration";

      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }
      if (message.toLowerCase().includes('not pending')) {
        return res.status(409).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * Check in an athlete at an event
   * POST /api/events/:eventId/registrations/:userId/check-in
   */
  app.post("/api/events/:eventId/registrations/:userId/check-in", registrationMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId, userId } = req.params;

      // Get event to check permissions
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check
      const canManage = await canManageEventRegistrations(user, event.organizationId);
      if (!canManage) {
        return res.status(403).json({
          message: "Access denied - you must be an org admin or coach to check in athletes"
        });
      }

      const registration = await registrationService.checkIn(eventId, userId, user.id);
      res.json(registration);
    } catch (error) {
      console.error("Check in error:", error);
      const message = error instanceof Error ? error.message : "Failed to check in athlete";

      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }
      if (message.toLowerCase().includes('already checked in')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('not approved')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('must be approved')) {
        return res.status(409).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * Cancel a registration (admin action - can cancel any user's registration)
   * DELETE /api/events/:eventId/registrations/:userId
   */
  app.delete("/api/events/:eventId/registrations/:userId", registrationMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId, userId } = req.params;

      // Get event to check permissions
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check - admin can cancel any registration, or user can cancel their own
      if (userId !== user.id) {
        const canManage = await canManageEventRegistrations(user, event.organizationId);
        if (!canManage) {
          return res.status(403).json({
            message: "Access denied - you can only cancel your own registration"
          });
        }
      }

      const registration = await registrationService.cancelRegistration(eventId, userId, user.id);
      res.json(registration);
    } catch (error) {
      console.error("Cancel registration error:", error);
      const message = error instanceof Error ? error.message : "Failed to cancel registration";

      if (message.toLowerCase().includes('frozen')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }
      if (message.toLowerCase().includes('not authorized')) {
        return res.status(403).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  console.log("  ✓ Event registration routes registered");
}
