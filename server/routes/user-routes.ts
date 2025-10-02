/**
 * User management routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { body } from "express-validator";
import { UserService } from "../services/user-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { sanitizeSearchTerm, validateSearchTerm } from "@shared/input-sanitization";
import { storage } from "../storage";
// Session types are loaded globally

const userService = new UserService();

// Type for user objects returned by getUsersByOrganization
interface OrganizationUser {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  emails: string[] | null;
  role: string;
}

// Rate limiting for user creation
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Limit each IP to 10 user creation requests per windowMs
  message: { message: "Too many account creation attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Rate limiting for site admin creation (more restrictive)
const siteAdminCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 3, // Limit each IP to 3 site admin creation requests per hour
  message: { message: "Too many site admin creation attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerUserRoutes(app: Express) {
  /**
   * Create user (site admin only)
   * @route POST /api/users
   * @body {Object} userData - User creation data
   * @body {string} userData.firstName - User's first name (required)
   * @body {string} userData.lastName - User's last name (required)
   * @body {string[]} userData.emails - Array of email addresses (required)
   * @body {string} userData.role - User role (required)
   * @access Site Admins only
   * @returns {Object} user - Created user object (limited fields)
   * @returns {string} user.id - User UUID
   * @returns {string[]} user.emails - User email addresses
   * @returns {string} user.firstName - User's first name
   * @returns {string} user.lastName - User's last name
   * @throws {400} Validation error or invalid input
   * @throws {401} User not authenticated
   * @throws {403} Site admin access required
   * @throws {429} Rate limit exceeded
   * @throws {500} Server error during user creation
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
   * @route GET /api/users
   * @query {string} [organizationId] - Filter by organization ID
   * @query {string} [includeTeamMemberships] - Include team membership data ("true")
   * @query {string} [role] - Filter by user role (e.g., "athlete")
   * @query {string} [search] - Search term for name filtering
   * @query {string} [excludeTeam] - Exclude users active on specific team
   * @query {string} [season] - Filter by season for team memberships
   * @access All authenticated users (filtered by organization access)
   * @returns {Object[]} users - Array of user objects
   * @returns {string} users[].id - User UUID
   * @returns {string} users[].firstName - User's first name
   * @returns {string} users[].lastName - User's last name
   * @returns {string} users[].fullName - User's full name
   * @returns {string} users[].role - User's role
   * @returns {Object[]} [users[].teamMemberships] - Team memberships (if requested)
   * @throws {401} User not authenticated
   * @throws {403} No organization access
   * @throws {500} Server error fetching users
   */
  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      const { organizationId, includeTeamMemberships, role, search, excludeTeam, season } = req.query;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Use UserService method for organization-based user retrieval
      const userIsSiteAdmin = currentUser.isSiteAdmin === true;

      if (userIsSiteAdmin) {
        const users = await userService.getUsers();
        return res.json(users);
      }

      const userOrgs = await userService.getUserOrganizations(currentUser.id);
      if (userOrgs.length === 0) {
        return res.status(403).json({ message: "No organization access" });
      }

      const targetOrgId = organizationId || userOrgs[0].organizationId;
      let orgUsers = await userService.getUsersByOrganization(targetOrgId, currentUser.id);

      // Filter by role if specified (e.g., role=athlete for players only)
      if (role) {
        orgUsers = orgUsers.filter((user: OrganizationUser) => user.role === role);
      }

      // Filter by search term if specified with sanitization
      if (search && typeof search === 'string') {
        const sanitizedSearch = sanitizeSearchTerm(search);
        if (!validateSearchTerm(sanitizedSearch)) {
          return res.status(400).json({
            message: "Invalid search term provided"
          });
        }

        if (sanitizedSearch) {
          const searchLower = sanitizedSearch.toLowerCase();
          orgUsers = orgUsers.filter((user: OrganizationUser) =>
            user.firstName?.toLowerCase().includes(searchLower) ||
            user.lastName?.toLowerCase().includes(searchLower)
          );
        }
      }

      // Include team memberships if requested - using optimized query to avoid N+1 problem
      if (includeTeamMemberships === "true") {
        // Sanitize search input to prevent injection attacks
        let sanitizedSearch: string | undefined;
        if (search && typeof search === 'string') {
          sanitizedSearch = sanitizeSearchTerm(search);
          if (!validateSearchTerm(sanitizedSearch)) {
            return res.status(400).json({
              message: "Invalid search term provided"
            });
          }
          // Empty string after sanitization means no valid search term
          sanitizedSearch = sanitizedSearch || undefined;
        }

        // Use optimized method that fetches users and team memberships in efficient queries
        const filters = {
          search: sanitizedSearch,
          role: role as string | undefined,
          excludeTeam: excludeTeam as string | undefined,
          season: season as string | undefined
        };

        const usersWithTeams = await storage.getUsersWithTeamMembershipsByOrganization(
          targetOrgId,
          filters
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

      // Validate role is a string
      if (typeof role !== 'string') {
        return res.status(400).json({ message: "Role must be a string" });
      }

      // Prevent users from changing their own role
      if (userId === req.session.user!.id) {
        return res.status(403).json({
          message: "Cannot change your own role"
        });
      }

      // Check if target user is a site admin - prevent demotion
      const targetUser = await userService.getUserById(userId, req.session.user!.id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUser.isSiteAdmin === "true" || targetUser.isSiteAdmin === true) {
        return res.status(403).json({
          message: "Cannot modify role of site administrators. Site admin status must be changed first."
        });
      }

      // Validate role - prevent site_admin assignment through this endpoint
      const validOrgRoles = ["athlete", "coach", "org_admin"] as const;
      if (!validOrgRoles.includes(role as any)) {
        return res.status(400).json({
          message: "Invalid role. Site admin status must be managed separately."
        });
      }

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
   * Get all site administrators
   */
  app.get("/api/site-admins", requireSiteAdmin, async (req, res) => {
    try {
      const admins = await userService.getSiteAdmins();
      res.json(admins);
    } catch (error) {
      console.error("Get site admins error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch site administrators";
      res.status(500).json({ message });
    }
  });

  /**
   * Create site administrator
   */
  app.post("/api/site-admins", siteAdminCreateLimiter, requireSiteAdmin, async (req, res) => {
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