/**
 * Profile and user management routes
 * Extracted from routes.ts for better maintainability
 */

import type { Express } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { isSiteAdmin } from "@shared/auth-utils";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { updateProfileSchema, changePasswordSchema, userOrganizations } from "@shared/schema";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

// Rate limiting for username check endpoint to prevent enumeration attacks
const usernameCheckLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.USERNAME_CHECK,
  message: { message: "Too many username checks, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'general'),
});

export function registerProfileRoutes(app: Express) {
  /**
   * Get user profile information
   */
  app.get("/api/users/:id/profile", requireAuth, async (req, res) => {
    try {
      const { id: userId } = req.params;
      const currentUser = req.session.user;

      // Check if user has access (site admin, org admin, or viewing own profile)
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userIsSiteAdmin && currentUser?.id !== userId) {
        // Check if current user is an org admin in any shared organization
        const userOrgs = await storage.getUserOrganizations(userId);
        const currentUserOrgs = await storage.getUserOrganizations(currentUser?.id || "");

        const hasSharedOrg = userOrgs.some(userOrg =>
          currentUserOrgs.some(currentUserOrg =>
            currentUserOrg.organizationId === userOrg.organizationId &&
            currentUserOrg.role === "org_admin"
          )
        );

        if (!hasSharedOrg) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // Get user information
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get user's organizations and roles
      const userOrgs = await storage.getUserOrganizations(userId);
      const organizations = await Promise.all(
        userOrgs.map(async (userOrg) => {
          const org = await storage.getOrganization(userOrg.organizationId);
          return {
            id: org?.id,
            name: org?.name,
            role: userOrg.role
          };
        })
      );

      // Determine user role
      let userRole = "athlete";
      if (user.isSiteAdmin === true) {
        userRole = "site_admin";
      } else if (userOrgs && userOrgs.length > 0) {
        // Use the first organization role (users should only have one role per org)
        userRole = userOrgs[0].role;
      }

      const userProfile = {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        emails: user.emails,
        role: userRole,
        organizations: organizations.filter(org => org.id && org.name)
      };

      res.json(userProfile);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Get all site admins
   */
  app.get("/api/site-admins", requireSiteAdmin, async (req, res) => {
    try {
      const siteAdmins = await storage.getSiteAdminUsers();
      res.json(siteAdmins);
    } catch (error) {
      console.error("Error fetching site admins:", error);
      res.status(500).json({ message: "Failed to fetch site admins" });
    }
  });

  /**
   * Toggle user active/inactive status (site admin only)
   */
  app.put("/api/users/:id/status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const currentUser = req.session.user;

      // Only site admins can activate/deactivate users
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        return res.status(403).json({ message: "Access denied. Only site administrators can activate/deactivate users." });
      }

      // Cannot deactivate self
      if (currentUser?.id === id) {
        return res.status(400).json({ message: "You cannot deactivate your own account." });
      }

      // Update user status
      const user = await storage.updateUser(id, { isActive: isActive ? true : false });

      res.json({
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        user
      });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  /**
   * Check if username is available
   * Rate limited to prevent username enumeration attacks
   */
  app.get("/api/users/check-username", usernameCheckLimiter, async (req, res) => {
    try {
      const { username } = req.query;

      if (!username || typeof username !== 'string') {
        return res.status(400).json({ message: "Username is required" });
      }

      const existingUser = await storage.getUserByUsername(username);

      res.json({
        available: !existingUser,
        username: username
      });
    } catch (error) {
      console.error("Error checking username:", error);
      res.status(500).json({ message: "Failed to check username availability" });
    }
  });

  /**
   * Interface for role violation reporting
   */
  interface RoleViolation {
    userId: string;
    userName: string;
    email: string;
    violations: string[];
  }

  /**
   * Interface for role fix reporting
   */
  interface RoleFix {
    userId: string;
    organizationId: string;
    keptRole: string;
    removedRoles: string[];
  }

  /**
   * Verify single role constraint (Site Admin only)
   */
  app.get("/api/admin/verify-roles", requireSiteAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      const violations: RoleViolation[] = [];
      const fixes: RoleFix[] = [];

      for (const user of users) {
        if (user.isSiteAdmin === true) continue; // Skip site admins

        const validation = await storage.validateUserRoleConstraint(user.id);
        if (!validation.valid) {
          violations.push({
            userId: user.id,
            userName: `${user.firstName} ${user.lastName}`,
            email: user.emails[0],
            violations: validation.violations
          });

          // Auto-fix by keeping only the first role per organization
          const userOrgRelations = await db.select()
            .from(userOrganizations)
            .where(eq(userOrganizations.userId, user.id));

          const orgRoleMap = new Map<string, string>();
          for (const relation of userOrgRelations) {
            if (!orgRoleMap.has(relation.organizationId)) {
              orgRoleMap.set(relation.organizationId, relation.role);
            }
          }

          // Remove all roles and re-add single role per org
          await db.delete(userOrganizations)
            .where(eq(userOrganizations.userId, user.id));

          for (const [orgId, role] of Array.from(orgRoleMap.entries())) {
            await db.insert(userOrganizations).values({
              userId: user.id,
              organizationId: orgId,
              role
            });
            // Find any removed roles for this org (duplicates that were deleted)
            const removedRoles = userOrgRelations
              .filter(r => r.organizationId === orgId && r.role !== role)
              .map(r => r.role);
            fixes.push({
              userId: user.id,
              organizationId: orgId,
              keptRole: role,
              removedRoles
            });
          }
        }
      }

      res.json({
        totalUsersChecked: users.length,
        violationsFound: violations.length,
        violations,
        fixesApplied: fixes.length,
        fixes,
        message: violations.length === 0 ? "All users have valid single roles per organization" : `Fixed ${fixes.length} role constraint violations`
      });
    } catch (error) {
      console.error("Error verifying roles:", error);
      res.status(500).json({ message: "Failed to verify role constraints" });
    }
  });

  /**
   * Delete user
   * Only site admins can delete users (except themselves)
   */
  app.delete("/api/users/:id", requireSiteAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.session.user;

      // Prevent site admins from deleting themselves
      if (currentUser?.id === id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      await storage.deleteUser(id);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  /**
   * Update current user profile
   */
  app.put("/api/profile", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      // Handle old admin system
      if (req.session.admin && !currentUser) {
        return res.status(400).json({ message: "Profile updates not available for legacy admin account. Please use the new user system." });
      }

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const profileData = updateProfileSchema.parse(req.body);
      const updatedUser = await storage.updateUser(currentUser.id, profileData);

      // Update session with new data
      if (req.session.user) {
        req.session.user = {
          ...req.session.user,
          email: updatedUser.emails?.[0] || `${updatedUser.username}@temp.local`,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
        };
      }

      res.json({
        id: updatedUser.id,
        email: updatedUser.emails?.[0] || `${updatedUser.username}@temp.local`,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error updating profile:", error);
        res.status(500).json({ message: "Failed to update profile" });
      }
    }
  });

  /**
   * Change password for current user
   */
  app.put("/api/profile/password", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      // Handle old admin system
      if (req.session.admin && !currentUser) {
        return res.status(400).json({ message: "Password changes not available for legacy admin account. Please use the new user system." });
      }

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const passwordData = changePasswordSchema.parse(req.body);

      // Get current user from database to check password
      const dbUser = await storage.getUser(currentUser.id);
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(passwordData.currentPassword, dbUser.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Update password
      await storage.updateUser(currentUser.id, { password: passwordData.newPassword });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error changing password:", error);
        res.status(500).json({ message: "Failed to change password" });
      }
    }
  });

  console.log("✅ Profile routes registered");
}
