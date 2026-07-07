/**
 * Authentication routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { AuthService } from "../services/auth-service";
import { coppaService } from "../services/coppa-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { COPPA_ACTIONS } from "@shared/coppa-utils";
import { storage } from "../storage";
import { generateParentEmailToken } from "../services/coppa-email-token-store";
import { regenerateSession, saveSession } from "../lib/session-helpers";
import { PasswordResetService } from "../auth/password-reset";
// Session types are loaded globally

const authService = new AuthService();

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // Limit each IP to 5 requests per windowMs
  message: { message: "Too many authentication attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'auth'),
});

export function registerAuthRoutes(app: Express) {
  /**
   * User login
   */
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { username, password, mfaToken } = req.body;

      const result = await authService.login({
        username,
        password,
        mfaToken,
        ipAddress: req.ip || '0.0.0.0',
        userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
        // MFA challenge: not an error — the client should prompt for a code.
        if (result.requiresMFA) {
          return res.status(200).json({ requiresMFA: true, message: "Enter your authentication code" });
        }
        // Locked account: 423 Locked so the client can show a distinct message.
        if (result.accountLocked) {
          return res.status(423).json({
            message: result.error,
            accountLocked: true,
            lockUntil: result.lockUntil,
          });
        }
        return res.status(401).json({ message: result.error });
      }

      const user = result.user!;

      // COPPA check: block login for under-13 athletes without parental consent.
      // IMPORTANT: This check runs AFTER password validation to prevent leaking
      // whether an account exists via different error codes on wrong passwords.
      if (['pending_consent', 'needs_parent_email', 'consent_revoked'].includes(user.coppaStatus)) {
        const codeMap: Record<string, string> = {
          pending_consent: 'coppa_pending_consent',
          needs_parent_email: 'coppa_needs_parent_email',
          consent_revoked: 'coppa_consent_revoked',
        };

        // Write audit log for blocked login (fire-and-forget — never fails the request)
        const auditAction = user.coppaStatus === 'consent_revoked'
          ? COPPA_ACTIONS.LOGIN_BLOCKED_REVOKED
          : COPPA_ACTIONS.LOGIN_BLOCKED_PENDING;
        coppaService.writeCoppaAudit({
          action: auditAction,
          athleteUserId: user.id,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        }).catch((err) => {
          console.error('[COPPA] Failed to write login block audit log:', err);
        });

        // For needs_parent_email, generate an opaque token so the frontend can
        // redirect without putting the username in the URL (prevents minor enumeration).
        const parentEmailToken = user.coppaStatus === 'needs_parent_email'
          ? generateParentEmailToken(user.id)
          : undefined;

        return res.status(403).json({
          code: codeMap[user.coppaStatus],
          coppaStatus: user.coppaStatus,
          message: "Account access requires parental consent.",
          ...(parentEmailToken && { parentEmailToken }),
        });
      }

      // Determine user's actual role and organization context
      const roleContext = await authService.determineUserRoleAndContext(user);

      // Regenerate the session before storing the authenticated user to prevent
      // session fixation (mirrors the OAuth and invitation-acceptance flows).
      await regenerateSession(req);

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
        athleteId: roleContext.role === 'athlete' ? user.id : undefined,
        emailVerified: user.isEmailVerified === true,
      };

      // Get user organizations for context
      const organizations = await authService.getUserOrganizations(user.id);

      // Determine redirect URL based on role
      let redirectUrl = '/dashboard';
      if (user.isSiteAdmin) {
        redirectUrl = '/admin';
      } else if (roleContext.role === 'athlete') {
        redirectUrl = '/my-dashboard';
      } else if (roleContext.role === 'parent') {
        redirectUrl = '/parent-dashboard';
      }
      // org_admin, coach, and others default to /dashboard

      // Persist the regenerated session before responding so the Set-Cookie is
      // written before the body (avoids a race with the client's next request).
      await saveSession(req);

      res.json({
        user: req.session.user,
        organizations,
        redirectUrl
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

      const rawOrganizations = await authService.getUserOrganizations(req.session.user.id);

      // Transform to match frontend UserOrganization interface
      // Backend returns: { organizationId, role, organization: { id, name, ... } }
      // Frontend expects: { organizationId, organizationName, role, createdAt }
      // Filter out deleted organizations (where organization or organization.name is null)
      const organizations = rawOrganizations
        .filter((org) => org.organization && org.organization.name) // Exclude deleted orgs
        .map((org) => {
          // Runtime assertion for type safety - should never fail due to filter above
          if (!org.organization?.name) {
            throw new Error(`Organization data incomplete for ID ${org.organizationId}`);
          }
          return {
            organizationId: org.organizationId,
            organizationName: org.organization.name,
            role: org.role,
            createdAt: org.createdAt,
          };
        });

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

      // Block impersonation of minors without parental consent — accessing
      // a child's data before the parent has consented is a COPPA violation
      // regardless of admin privilege level.
      const targetCheck = await storage.getUser(targetUserId);
      if (targetCheck && ['pending_consent', 'needs_parent_email', 'consent_revoked'].includes(targetCheck.coppaStatus ?? '')) {
        return res.status(403).json({
          message: "Cannot impersonate this account: parental consent has not been granted.",
          code: "coppa_impersonation_blocked",
        });
      }

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
        athleteId: targetRoleContext.role === 'athlete' ? targetUser.id : undefined,
        emailVerified: targetUser.isEmailVerified === true,
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

  // ---- Password reset (pre-authentication) ----
  // Mounted at /api/auth/* to match the web client. CSRF is skipped for these
  // unauthenticated requests. Responses never reveal whether an account exists.

  app.post("/api/auth/forgot-password", authLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ success: false, message: "Email is required" });
      }
      const ipAddress = req.ip || '0.0.0.0';
      const result = await PasswordResetService.requestPasswordReset(email, ipAddress, req.get('User-Agent'));
      return res.status(200).json(result);
    } catch (error) {
      console.error("Forgot-password error:", error);
      return res.status(500).json({ success: false, message: "Failed to process request" });
    }
  });

  app.post("/api/auth/validate-reset-token", authLimiter, async (req, res) => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ valid: false, message: "Token is required" });
      }
      const validation = await PasswordResetService.validateResetToken(token);
      return res.status(200).json(validation);
    } catch (error) {
      console.error("Validate-reset-token error:", error);
      return res.status(500).json({ valid: false, message: "Failed to validate token" });
    }
  });

  app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ success: false, message: "Token and new password are required" });
      }
      const ipAddress = req.ip || '0.0.0.0';
      const result = await PasswordResetService.resetPassword(token, newPassword, ipAddress, req.get('User-Agent'));
      return res.status(200).json(result);
    } catch (error) {
      console.error("Reset-password error:", error);
      return res.status(500).json({ success: false, message: "Failed to reset password" });
    }
  });
}