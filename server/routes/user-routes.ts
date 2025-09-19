/**
 * User management routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { body } from "express-validator";
import { UserService } from "../services/user-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
// Session types are loaded globally

const userService = new UserService();

// Rate limiting for user creation
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Limit each IP to 10 user creation requests per windowMs
  message: { message: "Too many account creation attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerUserRoutes(app: Express) {
  /**
   * Create user (site admin only)
   */
  app.post("/api/users", createLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const user = await userService.createUser(req.body, req.session.user!.id);
      res.status(201).json(user);
    } catch (error) {
      console.error("Create user error:", error);
      const message = error instanceof Error ? error.message : "Failed to create user";
      res.status(400).json({ message });
    }
  });

  /**
   * Get users with organization filtering and team memberships
   */
  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      const { organizationId, includeTeamMemberships } = req.query;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // For now, use the basic getUsersByOrganization from storage directly
      // since UserService doesn't have this method yet
      const userIsSiteAdmin = currentUser.isSiteAdmin === "true" || currentUser.admin === true;

      if (userIsSiteAdmin) {
        const users = await userService.getUsers();
        return res.json(users);
      }

      // Use the storage layer directly for organization-based user retrieval
      const storage = (userService as any).storage;

      const userOrgs = await storage.getUserOrganizations(currentUser.id);
      if (userOrgs.length === 0) {
        return res.status(403).json({ message: "No organization access" });
      }

      const targetOrgId = organizationId || userOrgs[0].organizationId;
      const orgUsers = await storage.getUsersByOrganization(targetOrgId);

      // Include team memberships if requested
      if (includeTeamMemberships === "true") {
        const usersWithTeams = await Promise.all(
          orgUsers.map(async (user: any) => {
            const userTeams = await storage.getUserTeams(user.id);
            return {
              ...user,
              teamMemberships: userTeams.map((ut: any) => ({
                teamId: ut.team.id,
                teamName: ut.team.name,
                isActive: ut.isActive,
                season: ut.season,
                joinedAt: ut.joinedAt,
                leftAt: ut.leftAt
              }))
            };
          })
        );
        return res.json(usersWithTeams);
      }

      res.json(orgUsers);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  /**
   * Get user profile
   */
  app.get("/api/users/:id/profile", requireAuth, async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await userService.getUserById(userId, req.session.user!.id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found or access denied" });
      }

      res.json(user);
    } catch (error) {
      console.error("Get user profile error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch user profile";
      res.status(500).json({ message });
    }
  });

  /**
   * Update user profile
   */
  app.put("/api/profile", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const updatedUser = await userService.updateProfile(userId, req.body);
      
      // Update session with new user data
      req.session.user = {
        ...req.session.user!,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.emails?.[0] || req.session.user!.email
      };

      res.json(updatedUser);
    } catch (error) {
      console.error("Update profile error:", error);
      const message = error instanceof Error ? error.message : "Failed to update profile";
      res.status(400).json({ message });
    }
  });

  /**
   * Change password
   */
  app.put("/api/profile/password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.session.user!.id;
      
      await userService.changePassword(userId, currentPassword, newPassword);
      
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      const message = error instanceof Error ? error.message : "Failed to change password";
      res.status(400).json({ message });
    }
  });

  /**
   * Update user role (admin only)
   */
  app.put("/api/users/:id/role", requireAuth, async (req, res) => {
    try {
      const userId = req.params.id;
      const { role } = req.body;
      
      const updatedUser = await userService.updateUserRole(
        userId, 
        role, 
        req.session.user!.id
      );
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Update user role error:", error);
      const message = error instanceof Error ? error.message : "Failed to update user role";
      const statusCode = message.includes("Unauthorized") ? 403 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Update user status (admin only)
   */
  app.put("/api/users/:id/status", requireAuth, async (req, res) => {
    try {
      const userId = req.params.id;
      const { isActive } = req.body;
      
      const updatedUser = await userService.updateUserStatus(
        userId, 
        isActive, 
        req.session.user!.id
      );
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Update user status error:", error);
      const message = error instanceof Error ? error.message : "Failed to update user status";
      const statusCode = message.includes("Unauthorized") ? 403 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Delete user (admin only)
   */
  app.delete("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.params.id;
      
      await userService.deleteUser(userId, req.session.user!.id);
      
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Delete user error:", error);
      const message = error instanceof Error ? error.message : "Failed to delete user";
      const statusCode = message.includes("Unauthorized") ? 403 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Create site administrator
   */
  app.post("/api/site-admins", requireSiteAdmin, async (req, res) => {
    try {
      const admin = await userService.createSiteAdmin(req.body, req.session.user!.id);
      res.status(201).json(admin);
    } catch (error) {
      console.error("Create site admin error:", error);
      const message = error instanceof Error ? error.message : "Failed to create site administrator";
      res.status(400).json({ message });
    }
  });

  /**
   * Get site administrators
   */
  app.get("/api/site-admins", requireSiteAdmin, async (req, res) => {
    try {
      const admins = await userService.getUsers({ role: 'site_admin' });
      res.json(admins);
    } catch (error) {
      console.error("Get site admins error:", error);
      res.status(500).json({ message: "Failed to fetch site administrators" });
    }
  });

  /**
   * Check username availability
   */
  app.get("/api/users/check-username", async (req, res) => {
    try {
      const { username } = req.query;
      
      if (!username || typeof username !== 'string') {
        return res.status(400).json({ message: "Username is required" });
      }

      const isAvailable = await userService.checkUsernameAvailability(username);
      res.json({ available: isAvailable });
    } catch (error) {
      console.error("Check username error:", error);
      res.status(500).json({ message: "Failed to check username availability" });
    }
  });

  /**
   * Admin role verification endpoint
   */
  app.get("/api/admin/verify-roles", requireSiteAdmin, async (req, res) => {
    try {
      // This endpoint verifies that the requesting user has site admin privileges
      // and can be used for additional role-based access checks
      const users = await userService.getUsers();
      
      const roleStats = {
        totalUsers: users.length,
        siteAdmins: users.filter(u => u.isSiteAdmin === "true").length,
        orgAdmins: 0, // Role information is now organization-specific
        coaches: 0, // Role information is now organization-specific
        athletes: 0, // Role information is now organization-specific
        activeUsers: users.filter(u => u.isActive === "true").length
      };

      res.json({
        message: "Role verification successful",
        stats: roleStats,
        requestingUser: {
          id: req.session.user!.id,
          isSiteAdmin: req.session.user!.isSiteAdmin
        }
      });
    } catch (error) {
      console.error("Role verification error:", error);
      res.status(500).json({ message: "Role verification failed" });
    }
  });
}