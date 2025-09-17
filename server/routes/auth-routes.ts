/**
 * Authentication routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { AuthService } from "../services/auth-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
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

export function registerAuthRoutes(app: Express) {
  /**
   * User login
   */
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;

      const result = await authService.login({ username, password });
      
      if (!result.success) {
        return res.status(401).json({ message: result.error });
      }

      const user = result.user!;

      // Set session
      req.session.user = {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.emails?.[0] || user.username + '@temp.local',
        role: "athlete", // Default role, will be determined by organization context
        isSiteAdmin: user.isSiteAdmin === "true"
      };

      // Get user organizations for context
      const organizations = await authService.getUserOrganizations(user.id);

      res.json({
        user: req.session.user,
        organizations
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

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
  app.get("/api/auth/me/organizations", async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const organizations = await authService.getUserOrganizations(req.session.user.id);
      res.json(organizations);
    } catch (error) {
      console.error("Get organizations error:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

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
  app.post("/api/admin/impersonate/:userId", requireSiteAdmin, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const targetUserId = req.params.userId;
      
      const targetUser = await authService.startImpersonation(req.session.user.id, targetUserId);

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
        role: "athlete", // Default role, will be determined by organization context
        isSiteAdmin: targetUser.isSiteAdmin === "true"
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
    } catch (error) {
      console.error("Impersonation error:", error);
      const message = error instanceof Error ? error.message : "Impersonation failed";
      res.status(error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500)
         .json({ message });
    }
  });

  /**
   * Stop impersonation
   */
  app.post("/api/admin/stop-impersonation", requireAuth, (req, res) => {
    try {
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
    } catch (error) {
      console.error("Stop impersonation error:", error);
      res.status(500).json({ message: "Failed to stop impersonation" });
    }
  });

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