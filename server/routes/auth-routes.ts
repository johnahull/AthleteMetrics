/**
 * Authentication routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { AuthService } from "../services/auth-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { asyncHandler } from "../utils/errors";
// Session types are loaded globally

const authService = new AuthService();

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // Limit each IP to 5 requests per windowMs
  message: { message: "Too many authentication attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Rate limiting for CSRF token endpoint
const csrfLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 10, // Limit each IP to 10 requests per minute
  message: { message: "Too many CSRF token requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerAuthRoutes(app: Express) {
  /**
   * Get CSRF token
   * Provides a token for CSRF protection on mutating requests
   */
  app.get("/api/csrf-token", csrfLimiter, asyncHandler(async (req: any, res: any) => {
    // Check if session exists
    if (!req.session) {
      console.error('CSRF token request: Session not found');
      return res.status(500).json({ message: "Session not initialized" });
    }

    // Generate CSRF token if not exists
    if (!req.session.csrfToken) {
      // Generate a random token
      req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
    }

    res.json({ csrfToken: req.session.csrfToken });
  }));

  /**
   * User login
   */
  app.post("/api/auth/login", authLimiter, asyncHandler(async (req: any, res: any) => {
    const { username, password } = req.body;

    const result = await authService.login({ username, password });

    if (!result.success) {
      return res.status(401).json({ message: result.error });
    }

    const user = result.user!;

    // Determine user's actual role and organization context
    const roleContext = await authService.determineUserRoleAndContext(user);

    // Set session
    req.session.user = {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.emails?.[0] || user.username + '@temp.local',
      role: roleContext.role,
      isSiteAdmin: user.isSiteAdmin === true,
      primaryOrganizationId: roleContext.primaryOrganizationId,
      athleteId: roleContext.role === 'athlete' ? user.id : undefined
    };

    // Get user organizations for context
    const organizations = await authService.getUserOrganizations(user.id);

    res.json({
      user: req.session.user,
      organizations
    });
  }));

  /**
   * Get current user
   */
  app.get("/api/auth/me", (req, res) => {
    if (req.session.user) {
      res.json({
        user: req.session.user,
        impersonating: req.session.isImpersonating ? {
          userId: req.session.user!.id,
          username: req.session.user!.username,
          startedAt: req.session.impersonationStartTime?.toISOString(),
          startedBy: req.session.originalUser?.id
        } : null
      });
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  /**
   * Get user organizations
   */
  app.get("/api/auth/me/organizations", asyncHandler(async (req: any, res: any) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const organizations = await authService.getUserOrganizations(req.session.user.id);
    res.json(organizations);
  }));

  /**
   * User logout
   */
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie('connect.sid');
      res.json({ message: "Logged out successfully" });
    });
  });

  /**
   * Start impersonation (site admin only)
   */
  app.post("/api/admin/impersonate/:userId", requireSiteAdmin, asyncHandler(async (req: any, res: any) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const targetUserId = req.params.userId;

    const targetUser = await authService.startImpersonation(req.session.user.id, targetUserId);

    // Determine target user's actual role and organization context
    const targetRoleContext = await authService.determineUserRoleAndContext(targetUser);

    // Store original user for stopping impersonation
    if (!req.session.originalUser) {
      req.session.originalUser = req.session.user;
    }

    // Set impersonated user as current session user
    req.session.user = {
      id: targetUser.id,
      username: targetUser.username,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      email: targetUser.emails?.[0] || targetUser.username + '@temp.local',
      role: targetRoleContext.role,
      isSiteAdmin: targetUser.isSiteAdmin === true,
      primaryOrganizationId: targetRoleContext.primaryOrganizationId,
      athleteId: targetRoleContext.role === 'athlete' ? targetUser.id : undefined
    };

    req.session.isImpersonating = true;
    req.session.impersonationStartTime = new Date();

    // Get user organizations for context
    const organizations = await authService.getUserOrganizations(targetUser.id);

    res.json({
      user: req.session.user,
      organizations,
      impersonating: req.session.isImpersonating ? {
        userId: targetUser.id,
        username: targetUser.username,
        startedAt: new Date().toISOString(),
        startedBy: req.session.originalUser!.id
      } : null
    });
  }));

  /**
   * Stop impersonation
   */
  app.post("/api/admin/stop-impersonation", requireAuth, asyncHandler(async (req: any, res: any) => {
    if (!req.session.user || !req.session.originalUser) {
      return res.status(401).json({ message: "Not impersonating any user" });
    }

    // Restore original user
    req.session.user = req.session.originalUser;
    delete req.session.originalUser;
    req.session.isImpersonating = false;
    delete req.session.impersonationStartTime;

    res.json({
      user: req.session.user,
      message: "Impersonation stopped successfully"
    });
  }));

  /**
   * Get impersonation status
   */
  app.get("/api/admin/impersonation-status", requireAuth, (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    res.json({
      isImpersonating: !!req.session.isImpersonating,
      impersonating: req.session.isImpersonating ? {
        userId: req.session.user!.id,
        username: req.session.user!.username,
        startedAt: req.session.impersonationStartTime?.toISOString(),
        startedBy: req.session.originalUser?.id
      } : null,
      originalUser: req.session.originalUser || null
    });
  });
}