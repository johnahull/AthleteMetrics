/**
 * Event invitation routes
 * Handles token-based event invitations for invite-only registration
 *
 * Required endpoints for frontend:
 * - POST /api/events/:eventId/invitations - Create invitation
 * - GET /api/events/:eventId/invitations - List invitations (admin)
 * - DELETE /api/events/:eventId/invitations/:invitationId - Cancel invitation
 * - POST /api/events/:eventId/invitations/:invitationId/resend - Resend invitation
 * - GET /api/event-invitations/:token - Get invitation by token (public)
 * - POST /api/event-invitations/:token/accept - Accept invitation
 * - POST /api/event-invitations/:token/decline - Decline invitation
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { EventInvitationService, type CreateInvitationOptions, type InvitationFilters } from "../services/event-invitation-service";
import { requireAuth } from "../middleware";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { storage } from "../storage";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

// Rate limiting for invitation endpoints
const invitationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.STANDARD,
  message: { message: "Too many invitation requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter rate limiting for mutation operations
const invitationMutationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.MUTATION,
  message: { message: "Too many invitation modification attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Check if user has permission to manage event invitations
 */
async function canManageEventInvitations(user: SessionUser, organizationId: string | null): Promise<boolean> {
  if (isSiteAdmin(user)) {
    return true;
  }

  if (!organizationId) {
    return false;
  }

  const roles = await storage.getUserRoles(user.id, organizationId);
  return roles.includes('org_admin') || roles.includes('coach');
}

export function registerEventInvitationRoutes(app: Express) {
  const invitationService = new EventInvitationService(storage);

  // ============================================================
  // PUBLIC TOKEN-BASED ROUTES (no auth required)
  // These must be registered BEFORE /api/events/:eventId routes
  // ============================================================

  /**
   * Get invitation by token (public - no auth required for viewing)
   * GET /api/event-invitations/:token
   */
  app.get("/api/event-invitations/:token", invitationLimiter, async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      if (!token || token.length < 32) {
        return res.status(400).json({ message: "Invalid invitation token" });
      }

      const invitation = await invitationService.getInvitationByToken(token);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      // Get event details for display
      const event = await storage.getEvent(invitation.eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Return invitation with event details
      res.json({
        invitation: {
          id: invitation.id,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
        },
        event: {
          id: event.id,
          name: event.name,
          description: event.description,
          location: event.location,
          eventType: event.eventType,
          startDate: event.startDate,
          endDate: event.endDate,
          visibility: event.visibility,
          status: event.status,
        },
      });
    } catch (error) {
      console.error("Get invitation by token error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch invitation";
      res.status(500).json({ message });
    }
  });

  /**
   * Accept an invitation (requires auth)
   * POST /api/event-invitations/:token/accept
   */
  app.post("/api/event-invitations/:token/accept", invitationMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { token } = req.params;

      if (!token || token.length < 32) {
        return res.status(400).json({ message: "Invalid invitation token" });
      }

      const result = await invitationService.acceptInvitation(token, user.id);
      res.status(201).json(result);
    } catch (error) {
      console.error("Accept invitation error:", error);
      const message = error instanceof Error ? error.message : "Failed to accept invitation";

      if (message.toLowerCase().includes('expired')) {
        return res.status(410).json({ message });
      }
      if (message.toLowerCase().includes('already')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('frozen')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }
      if (message.toLowerCase().includes('cancelled')) {
        return res.status(410).json({ message });
      }
      if (message.toLowerCase().includes('declined')) {
        return res.status(410).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * Decline an invitation (no auth required - anyone with token can decline)
   * POST /api/event-invitations/:token/decline
   */
  app.post("/api/event-invitations/:token/decline", invitationMutationLimiter, async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      if (!token || token.length < 32) {
        return res.status(400).json({ message: "Invalid invitation token" });
      }

      const invitation = await invitationService.declineInvitation(token);
      res.json(invitation);
    } catch (error) {
      console.error("Decline invitation error:", error);
      const message = error instanceof Error ? error.message : "Failed to decline invitation";

      if (message.toLowerCase().includes('not pending')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  // ============================================================
  // ADMIN ROUTES (require auth and permission)
  // ============================================================

  /**
   * Create an invitation
   * POST /api/events/:eventId/invitations
   */
  app.post("/api/events/:eventId/invitations", invitationMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId } = req.params;
      const { userId, email, expiresAt } = req.body;

      // Get event to check permissions
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check
      const canManage = await canManageEventInvitations(user, event.organizationId);
      if (!canManage) {
        return res.status(403).json({
          message: "Access denied - you must be an org admin or coach to send invitations"
        });
      }

      const options: CreateInvitationOptions = {
        userId: userId || undefined,
        email: email || undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      };

      const invitation = await invitationService.createInvitation(eventId, user.id, options);
      res.status(201).json(invitation);
    } catch (error) {
      console.error("Create invitation error:", error);
      const message = error instanceof Error ? error.message : "Failed to create invitation";

      if (message.toLowerCase().includes('frozen')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('already been invited')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('either userid or email')) {
        return res.status(400).json({ message });
      }
      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * List invitations for an event
   * GET /api/events/:eventId/invitations
   */
  app.get("/api/events/:eventId/invitations", invitationLimiter, requireAuth, async (req: Request, res: Response) => {
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

      // Permission check
      const canManage = await canManageEventInvitations(user, event.organizationId);
      if (!canManage) {
        return res.status(403).json({
          message: "Access denied - you must be an org admin or coach to view invitations"
        });
      }

      const filters: InvitationFilters = {};

      if (req.query.status) {
        filters.status = req.query.status as InvitationFilters['status'];
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

      const invitations = await invitationService.listInvitations(eventId, filters);
      res.json(invitations);
    } catch (error) {
      console.error("List invitations error:", error);
      const message = error instanceof Error ? error.message : "Failed to list invitations";
      res.status(500).json({ message });
    }
  });

  /**
   * Cancel an invitation
   * DELETE /api/events/:eventId/invitations/:invitationId
   */
  app.delete("/api/events/:eventId/invitations/:invitationId", invitationMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId, invitationId } = req.params;

      // Get event to check permissions
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check
      const canManage = await canManageEventInvitations(user, event.organizationId);
      if (!canManage) {
        return res.status(403).json({
          message: "Access denied - you must be an org admin or coach to cancel invitations"
        });
      }

      const invitation = await invitationService.cancelInvitation(invitationId, user.id);
      res.json(invitation);
    } catch (error) {
      console.error("Cancel invitation error:", error);
      const message = error instanceof Error ? error.message : "Failed to cancel invitation";

      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }
      if (message.toLowerCase().includes('only pending')) {
        return res.status(409).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * Resend an invitation
   * POST /api/events/:eventId/invitations/:invitationId/resend
   */
  app.post("/api/events/:eventId/invitations/:invitationId/resend", invitationMutationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { eventId, invitationId } = req.params;

      // Get event to check permissions
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Permission check
      const canManage = await canManageEventInvitations(user, event.organizationId);
      if (!canManage) {
        return res.status(403).json({
          message: "Access denied - you must be an org admin or coach to resend invitations"
        });
      }

      const invitation = await invitationService.resendInvitation(invitationId, user.id);
      res.json(invitation);
    } catch (error) {
      console.error("Resend invitation error:", error);
      const message = error instanceof Error ? error.message : "Failed to resend invitation";

      if (message.toLowerCase().includes('not found')) {
        return res.status(404).json({ message });
      }
      if (message.toLowerCase().includes('already accepted')) {
        return res.status(409).json({ message });
      }
      if (message.toLowerCase().includes('cancelled')) {
        return res.status(409).json({ message });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * Get pending invitations for the authenticated user
   * GET /api/my/event-invitations
   */
  app.get("/api/my/event-invitations", invitationLimiter, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const invitations = await storage.getUserPendingInvitations(user.id);
      res.json(invitations);
    } catch (error) {
      console.error("Get my event invitations error:", error);
      const message = error instanceof Error ? error.message : "Failed to get invitations";
      res.status(500).json({ message });
    }
  });

  console.log("  ✓ Event invitation routes registered");
}
