/**
 * Invitation management routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, asyncHandler } from "../middleware";
import { InvitationService } from "../services/invitation-service";

const invitationService = new InvitationService();

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
  app.post("/api/invitations", createLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const invitation = await invitationService.createInvitation(
      req.body,
      req.session.user!.id
    );
    res.status(201).json(invitation);
  }));

  /**
   * Get athlete invitations for organization
   */
  app.get("/api/invitations/athletes", requireAuth, asyncHandler(async (req: any, res: any) => {
    const { organizationId } = req.query;

    const invitations = await invitationService.getOrganizationInvitations(
      organizationId as string,
      req.session.user!.id
    );
    res.json(invitations);
  }));

  /**
   * Get invitation by token (public endpoint)
   */
  app.get("/api/invitations/:token", asyncHandler(async (req: any, res: any) => {
    const invitation = await invitationService.getInvitationByToken(req.params.token);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found or expired" });
    }

    res.json(invitation);
  }));

  /**
   * Delete invitation
   */
  app.delete("/api/invitations/:id", requireAuth, asyncHandler(async (req: any, res: any) => {
    await invitationService.deleteInvitation(req.params.id, req.session.user!.id);
    res.json({ message: "Invitation deleted successfully" });
  }));

  /**
   * Accept invitation
   */
  app.post("/api/invitations/:token/accept", authLimiter, asyncHandler(async (req: any, res: any) => {
    const { token } = req.params;
    const { password } = req.body;

    const result = await invitationService.acceptInvitation(token, password);
    res.json(result);
  }));
}
