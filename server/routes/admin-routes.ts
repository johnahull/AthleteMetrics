/**
 * Admin management routes (impersonation, verification)
 */

import type { Express } from "express";
import { AuthService } from "../services/auth-service";
import { requireAuth, requireSiteAdmin, asyncHandler } from "../middleware";

const authService = new AuthService();

export function registerAdminRoutes(app: Express) {
  /**
   * Start impersonation session
   * @route POST /api/admin/impersonate/:userId
   * @param {string} userId - Target user ID to impersonate
   * @access Site Admins only
   * @returns {Object} impersonation status and user data
   */
  app.post("/api/admin/impersonate/:userId", requireSiteAdmin, asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUser = req.session.user!;

    // Check if already impersonating
    if (req.session.isImpersonating) {
      return res.status(400).json({ message: "Already impersonating a user" });
    }

    // Use auth service to validate and get target user
    const targetUser = await authService.startImpersonation(currentUser.id, userId);

    // Don't allow impersonating yourself
    if (targetUser.id === currentUser.id) {
      return res.status(400).json({ message: "Cannot impersonate yourself" });
    }

    // Don't allow impersonating other site admins
    if (targetUser.isSiteAdmin === true) {
      return res.status(400).json({ message: "Cannot impersonate other site administrators" });
    }

    // Determine the target user's role and context
    const { role, primaryOrganizationId } = await authService.determineUserRoleAndContext(targetUser);

    // Store original user and set up impersonation
    req.session.originalUser = {
      ...currentUser,
      primaryOrganizationId: currentUser.primaryOrganizationId
    };

    req.session.user = {
      id: targetUser.id,
      username: targetUser.username,
      email: targetUser.emails?.[0] || `${targetUser.username}@temp.local`,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      role,
      isSiteAdmin: targetUser.isSiteAdmin === true,
      athleteId: role === "athlete" ? targetUser.id : undefined,
      primaryOrganizationId
    };

    req.session.isImpersonating = true;
    req.session.impersonationStartTime = new Date();

    res.json({
      success: true,
      message: `Now impersonating ${targetUser.firstName} ${targetUser.lastName}`,
      user: req.session.user,
      impersonationStatus: {
        isImpersonating: true,
        originalUser: currentUser,
        targetUser: req.session.user,
        startTime: req.session.impersonationStartTime
      }
    });
  }));

  /**
   * Stop impersonation session
   * @route POST /api/admin/stop-impersonation
   * @access Authenticated users (must be impersonating)
   * @returns {Object} success status and restored user data
   */
  app.post("/api/admin/stop-impersonation", requireAuth, asyncHandler(async (req, res) => {
    if (!req.session.isImpersonating || !req.session.originalUser) {
      return res.status(400).json({ message: "Not currently impersonating" });
    }

    const originalUser = req.session.originalUser;

    // Restore original user
    req.session.user = originalUser;
    req.session.originalUser = undefined;
    req.session.isImpersonating = false;
    req.session.impersonationStartTime = undefined;

    res.json({
      success: true,
      message: "Stopped impersonation",
      user: req.session.user,
      impersonationStatus: {
        isImpersonating: false
      }
    });
  }));

  /**
   * Get impersonation status
   * @route GET /api/admin/impersonation-status
   * @access Authenticated users
   * @returns {Object} impersonation status and details
   */
  app.get("/api/admin/impersonation-status", requireAuth, (req, res) => {
    if (req.session.isImpersonating && req.session.originalUser) {
      res.json({
        isImpersonating: true,
        originalUser: req.session.originalUser,
        targetUser: req.session.user,
        startTime: req.session.impersonationStartTime
      });
    } else {
      res.json({
        isImpersonating: false
      });
    }
  });
}
