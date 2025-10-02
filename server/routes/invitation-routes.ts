/**
 * Invitation management routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, asyncHandler } from "../middleware";
import { storage } from "../storage";

const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { message: "Too many invitation creation attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { message: "Too many authentication attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerInvitationRoutes(app: Express) {
  /**
   * Create invitation
   */
  app.post("/api/invitations", createLimiter, requireAuth, asyncHandler(async (req, res) => {
    const invitation = await storage.createInvitation(req.body);
    res.status(201).json(invitation);
  }));

  /**
   * Get athlete invitations for organization
   */
  app.get("/api/invitations/athletes", requireAuth, asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }

    const invitations = await storage.getOrganizationInvitations(organizationId as string);
    res.json(invitations);
  }));

  /**
   * Get invitation by token (public endpoint)
   */
  app.get("/api/invitations/:token", asyncHandler(async (req, res) => {
    const invitation = await storage.getInvitationByToken(req.params.token);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found or expired" });
    }

    res.json(invitation);
  }));

  /**
   * Delete invitation
   */
  app.delete("/api/invitations/:id", requireAuth, asyncHandler(async (req, res) => {
    await storage.deleteInvitation(req.params.id);
    res.json({ message: "Invitation deleted successfully" });
  }));

  /**
   * Accept invitation
   */
  app.post("/api/invitations/:token/accept", authLimiter, asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    const invitation = await storage.getInvitationByToken(token);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found or expired" });
    }

    // Invitation acceptance logic would go here
    res.json({ message: "Invitation accepted successfully" });
  }));
}
