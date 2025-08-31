import type { Express } from "express";
import { createServer } from "http";
import session from "express-session";
import { storage } from "./storage";
import { insertOrganizationSchema, insertTeamSchema, insertPlayerSchema, insertMeasurementSchema, insertInvitationSchema, insertUserSchema, updateProfileSchema, changePasswordSchema, createSiteAdminSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcrypt";

// Session configuration
declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      playerId?: string;
      isSiteAdmin?: boolean; // Added for clarity
    };
    // Keep old admin for transition
    admin?: boolean;
  }
}

// Middleware to check authentication
const requireAuth = (req: any, res: any, next: any) => {
  if (!req.session.user && !req.session.admin) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
};

// Permission validation helpers
const hasRole = async (userId: string, role: string, organizationId?: string): Promise<boolean> => {
  const userRoles = await storage.getUserRoles(userId, organizationId);
  return userRoles.includes(role);
};

const isSiteAdmin = async (user: any): Promise<boolean> => {
  if (!user) return false;

  // Check legacy admin session
  if (user.admin) return true;

  // Check current user session
  if (user.isSiteAdmin) return true; // Use the boolean flag directly

  // Check database for site admin status if not in session
  if (user.id) {
    const dbUser = await storage.getUser(user.id);
    return dbUser?.isSiteAdmin === "true";
  }

  return false;
};

const canAccessOrganization = async (userId: string, organizationId: string): Promise<boolean> => {
  if (await isSiteAdmin({ id: userId })) return true;

  const userOrgs = await storage.getUserOrganizations(userId);
  return userOrgs.some(org => org.organizationId === organizationId);
};

const canManageUsers = async (userId: string, organizationId: string): Promise<boolean> => {
  if (await isSiteAdmin({ id: userId })) return true;

  const userRoles = await storage.getUserRoles(userId, organizationId);
  return userRoles.includes("org_admin");
};

const canInviteRole = async (userId: string, organizationId: string, targetRole: string): Promise<boolean> => {
  if (await isSiteAdmin({ id: userId })) return true;

  const userRoles = await storage.getUserRoles(userId, organizationId);

  // Coaches can only invite athletes
  if (userRoles.includes("coach") && !userRoles.includes("org_admin")) {
    return targetRole === "athlete";
  }

  // Org admins cannot invite site admins
  if (userRoles.includes("org_admin")) {
    return targetRole !== "site_admin";
  }

  return false;
};

const requireSiteAdmin = async (req: any, res: any, next: any) => {
  const user = req.session.user || { admin: req.session.admin };

  if (await isSiteAdmin(user)) {
    return next();
  }

  return res.status(403).json({ message: "Site admin access required" });
};

// Initialize default site admin user
async function initializeDefaultUser() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@athleteperformancehub.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

    const existingUser = await storage.getUserByEmail(adminEmail);
    if (!existingUser) {
      await storage.createUser({
        username: "admin",
        email: adminEmail,
        password: adminPassword,
        firstName: "Site",
        lastName: "Administrator",
        role: "site_admin"
      });
      console.log(`Default site admin created: ${adminEmail}`);
    }
  } catch (error) {
    console.error("Error initializing default user:", error);
  }
}

export function registerRoutes(app: Express) {
  const server = createServer(app);

  // Session setup
  app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret-key',
    resave: true,  // Changed to true to force session save
    saveUninitialized: true,  // Changed to true to ensure session creation
    cookie: { 
      secure: false,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Initialize default user
  initializeDefaultUser();

  // Authentication routes - USERNAME ONLY
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Username-based authentication
      const user = await storage.authenticateUser(username, password);
      if (user) {
        // Check if user is active
        if (user.isActive === "false") {
          return res.status(401).json({ message: "Account has been deactivated. Please contact your administrator." });
        }

        // Determine the user's primary role
        let primaryRole = "athlete"; // Default role

        // If user is site admin, use site_admin role
        if (user.isSiteAdmin === "true") {
          primaryRole = "site_admin";
        } else {
          // For non-site admins, check their organization roles to determine primary role
          const userOrgs = await storage.getUserOrganizations(user.id);
          if (userOrgs && userOrgs.length > 0) {
            // Find the highest priority role across all organizations
            const roles = userOrgs.map(org => org.role);
            if (roles.includes("org_admin")) {
              primaryRole = "org_admin";
            } else if (roles.includes("coach")) {
              primaryRole = "coach";
            } else if (roles.includes("athlete")) {
              primaryRole = "athlete";
            }
          }
        }

        req.session.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: primaryRole,
          isSiteAdmin: user.isSiteAdmin === "true",
          playerId: user.playerId
        };

        let redirectUrl = "/";
        if (primaryRole === "athlete" && user.playerId) {
          // For athletes, redirect to their player profile using playerId
          redirectUrl = `/athletes/${user.playerId}`;
        } else if (primaryRole === "org_admin" || primaryRole === "coach") {
          // Org admins and coaches go to dashboard (not organization profile)
          redirectUrl = "/";
          console.log(`🏢 ${primaryRole} redirect: ${redirectUrl}`);
        }

        return res.json({ 
          success: true, 
          user: req.session.user,
          redirectUrl
        });
      }

      res.status(401).json({ message: "Invalid credentials" });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.session.user) {
      return res.json({ 
        user: {
          ...req.session.user,
          playerId: req.session.user.playerId // Ensure playerId is included
        }
      });
    }
    res.status(401).json({ message: "Not authenticated" });
  });

  // Get current user's organizations
  app.get("/api/auth/me/organizations", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userOrganizations = await storage.getUserOrganizations(currentUser.id);
      res.json(userOrganizations);
    } catch (error) {
      console.error("Error fetching user organizations:", error);
      res.status(500).json({ message: "Failed to fetch user organizations" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Organization routes (Site Admin only)
  app.get("/api/organizations", requireSiteAdmin, async (req, res) => {
    try {
      const organizations = await storage.getOrganizations();
      res.json(organizations);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  // Get organizations accessible to current user based on their role
  app.get("/api/my-organizations", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      if (userIsSiteAdmin) {
        const organizations = await storage.getOrganizations();
        res.json(organizations);
      } else {
        // Get organizations where user has any role
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        const organizations = userOrgs.map(uo => uo.organization);
        res.json(organizations);
      }
    } catch (error) {
      console.error("Error fetching user organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  app.post("/api/organizations", requireSiteAdmin, async (req, res) => {
    try {
      const organizationData = insertOrganizationSchema.parse(req.body);
      const organization = await storage.createOrganization(organizationData);
      res.status(201).json(organization);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating organization:", error);
        res.status(500).json({ message: "Failed to create organization" });
      }
    }
  });

  // User management routes (Site Admin only)
  app.post("/api/users", requireSiteAdmin, async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);

      // If organization specified, add user to it
      if (req.body.organizationId) {
        await storage.addUserToOrganization(user.id, req.body.organizationId, userData.role);
      }

      res.status(201).json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating user:", error);
        res.status(500).json({ message: "Failed to create user" });
      }
    }
  });

  // Team routes with basic organization support
  app.get("/api/teams", requireAuth, async (req, res) => {
    try {
      const teams = await storage.getTeams();
      res.json(teams);
    } catch (error) {
      console.error("Error fetching teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  app.post("/api/teams", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes cannot create teams
      if (currentUser.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot create teams" });
      }

      // Get user's organization for non-site-admins
      let organizationId = req.body.organizationId;

      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      if (!organizationId && !userIsSiteAdmin) {
        // For org admins and coaches, get their primary organization
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        if (userOrgs.length > 0) {
          organizationId = userOrgs[0].organizationId;
        } else {
          return res.status(400).json({ message: "User is not associated with any organization" });
        }
      }

      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      // Validate user has access to the organization
      if (!userIsSiteAdmin && !await canAccessOrganization(currentUser.id, organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const teamData = insertTeamSchema.parse({ ...req.body, organizationId });
      const team = await storage.createTeam(teamData);
      res.status(201).json(team);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating team:", error);
        res.status(500).json({ message: "Failed to create team" });
      }
    }
  });

  // Keep existing player routes for now
  app.get("/api/players", requireAuth, async (req, res) => {
    try {
      const {teamId, birthYearFrom, birthYearTo, search, organizationId } = req.query;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Determine organization context for filtering
      let orgContextForFiltering: string | undefined;

      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      if (userIsSiteAdmin) {
        // Site admins can request specific org or all players
        orgContextForFiltering = organizationId as string;
      } else {
        // Non-site admins should only see players from their organization
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        if (userOrgs.length === 0) {
          return res.json([]);
        }

        const requestedOrgId = organizationId as string;

        // Validate user has access to requested organization
        if (requestedOrgId) {
          if (!await canAccessOrganization(currentUser.id, requestedOrgId)) {
            return res.status(403).json({ message: "Access denied to this organization" });
          }
          orgContextForFiltering = requestedOrgId;
        } else {
          // Use user's primary organization
          orgContextForFiltering = userOrgs[0].organizationId;
        }

        // Athletes can only see their own player data
        if (currentUser.role === "athlete" && currentUser.playerId) {
          const filters: any = {
            playerId: currentUser.playerId,
            organizationId: orgContextForFiltering,
          };
          const players = await storage.getPlayers(filters);
          return res.json(players);
        }
      }

      const filters: any = {
        teamId: teamId as string,
        birthYearFrom: birthYearFrom ? parseInt(birthYearFrom as string) : undefined,
        birthYearTo: birthYearTo ? parseInt(birthYearTo as string) : undefined,
        search: search as string,
        organizationId: orgContextForFiltering,
      };

      const players = await storage.getPlayers(filters);
      res.json(players);
    } catch (error) {
      console.error("Error fetching players:", error);
      res.status(500).json({ message: "Failed to fetch players" });
    }
  });

  app.get("/api/players/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      // Athletes can only view their own player data
      if (currentUser.role === "athlete") {
        if (currentUser.playerId !== id) {
          return res.status(403).json({ message: "Athletes can only view their own profile" });
        }
      } else if (!userIsSiteAdmin) {
        // Coaches and org admins can only view players from their organization
        // First, get the player's teams to determine organization
        const playerTeams = await storage.getPlayerTeams(id);
        if (playerTeams.length === 0) {
          return res.status(403).json({ message: "Player not associated with any team" });
        }

        // Get team details to find organization
        const teams = await storage.getTeams();
        const playerOrganizations = playerTeams
          .map(pt => teams.find(t => t.id === pt.teamId))
          .filter(Boolean)
          .map(team => team!.organizationId);

        // Check if user has access to any of the player's organizations
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        const hasAccess = playerOrganizations.some(orgId => 
          userOrgs.some(userOrg => userOrg.organizationId === orgId)
        );

        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied to this player" });
        }
      }

      res.json(player);
    } catch (error) {
      console.error("Error fetching player:", error);
      res.status(500).json({ message: "Failed to fetch player" });
    }
  });

  app.post("/api/players", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      // Athletes cannot create player records
      if (currentUser?.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot create player records" });
      }

      const playerData = insertPlayerSchema.parse(req.body);
      const player = await storage.createPlayer(playerData);
      res.status(201).json(player);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating player:", error);
        res.status(500).json({ message: "Failed to create player" });
      }
    }
  });

  app.patch("/api/players/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const playerData = insertPlayerSchema.partial().parse(req.body);
      const updatedPlayer = await storage.updatePlayer(id, playerData);
      res.json(updatedPlayer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error updating player:", error);
        res.status(500).json({ message: "Failed to update player" });
      }
    }
  });

  app.delete("/api/players/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deletePlayer(id);
      res.json({ message: "Player deleted successfully" });
    } catch (error) {
      console.error("Error deleting player:", error);
      res.status(500).json({ message: "Failed to delete player" });
    }
  });

  // Keep existing measurement routes
  app.get("/api/measurements", requireAuth, async (req, res) => {
    try {
      const {playerId, teamIds, metric, dateFrom, dateTo, birthYearFrom, birthYearTo, ageFrom, ageTo, search, sport, organizationId } = req.query;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      // Athletes can only view their own measurements
      if (currentUser.role === "athlete") {
        if (!currentUser.playerId) {
          return res.json([]);
        }

        const filters: any = {
          playerId: currentUser.playerId,
          metric: metric as string,
          dateFrom: dateFrom as string,
          dateTo: dateTo as string,
          includeUnverified: true
        };

        const measurements = await storage.getMeasurements(filters);
        return res.json(measurements);
      }

      // For coaches and org admins, filter by their organization
      let orgContextForFiltering: string | undefined;

      if (userIsSiteAdmin) {
        orgContextForFiltering = organizationId as string;
      } else {
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        if (userOrgs.length === 0) {
          return res.json([]);
        }

        const requestedOrgId = organizationId as string;
        if (requestedOrgId) {
          if (!await canAccessOrganization(currentUser.id, requestedOrgId)) {
            return res.status(403).json({ message: "Access denied to this organization" });
          }
          orgContextForFiltering = requestedOrgId;
        } else {
          orgContextForFiltering = userOrgs[0].organizationId;
        }
      }

      const filters: any = {
        playerId: playerId as string,
        teamIds: teamIds ? (teamIds as string).split(',') : undefined,
        metric: metric as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        birthYearFrom: birthYearFrom ? parseInt(birthYearFrom as string) : undefined,
        birthYearTo: birthYearTo ? parseInt(birthYearTo as string) : undefined,
        ageFrom: ageFrom ? parseInt(ageFrom as string) : undefined,
        ageTo: ageTo ? parseInt(ageTo as string) : undefined,
        search: search as string,
        sport: sport as string,
        organizationId: orgContextForFiltering,
        includeUnverified: true
      };

      const measurements = await storage.getMeasurements(filters);
      res.json(measurements);
    } catch (error) {
      console.error("Error fetching measurements:", error);
      res.status(500).json({ message: "Failed to fetch measurements" });
    }
  });

  app.post("/api/measurements", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      // Get current user info for submittedBy
      let submittedById = currentUser?.id;

      // If using old admin system, find the site admin user
      if (!submittedById && req.session.admin) {
        const siteAdmin = await storage.getUserByUsername("admin");
        submittedById = siteAdmin?.id;
      }

      if (!submittedById) {
        return res.status(400).json({ message: "Unable to determine current user" });
      }

      // Athletes cannot submit measurements
      if (currentUser?.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot submit measurements" });
      }

      const measurementData = insertMeasurementSchema.parse({
        ...req.body,
        submittedBy: submittedById
      });

      // Validate user can access the player being measured
      const userIsSiteAdmin = await isSiteAdmin(currentUser);
      if (!userIsSiteAdmin) {
        const player = await storage.getPlayer(measurementData.playerId);
        if (!player) {
          return res.status(404).json({ message: "Player not found" });
        }

        // Check if player is in user's organization
        const playerTeams = await storage.getPlayerTeams(measurementData.playerId);
        const teams = await storage.getTeams();
        const playerOrganizations = playerTeams
          .map(pt => teams.find(t => t.id === pt.teamId))
          .filter(Boolean)
          .map(team => team!.organizationId);

        const userOrgs = await storage.getUserOrganizations(submittedById);
        const hasAccess = playerOrganizations.some(orgId => 
          userOrgs.some(userOrg => userOrg.organizationId === orgId)
        );

        if (!hasAccess) {
          return res.status(403).json({ message: "Cannot create measurements for players outside your organization" });
        }
      }

      const measurement = await storage.createMeasurement(measurementData);
      res.status(201).json(measurement);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating measurement:", error);
        res.status(500).json({ message: "Failed to create measurement" });
      }
    }
  });

  // Measurement verification route (org admins only)
  app.put("/api/measurements/:id/verify", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Only org admins can verify measurements
      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        // Check if user is org admin in any organization
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        const isOrgAdmin = userOrgs.some(org => org.role === "org_admin");

        if (!isOrgAdmin) {
          return res.status(403).json({ message: "Only organization administrators can verify measurements" });
        }
      }

      // Get measurement to verify user has access to the player's organization
      const measurement = await storage.getMeasurement(id);
      if (!measurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      if (!userIsSiteAdmin) {
        // Check if measurement's player is in user's organization
        const player = await storage.getPlayer(measurement.playerId);
        if (!player) {
          return res.status(404).json({ message: "Player not found" });
        }

        const playerTeams = await storage.getPlayerTeams(measurement.playerId);
        const teams = await storage.getTeams();
        const playerOrganizations = playerTeams
          .map(pt => teams.find(t => t.id === pt.teamId))
          .filter(Boolean)
          .map(team => team!.organizationId);

        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        const hasAccess = playerOrganizations.some(orgId => 
          userOrgs.some(userOrg => userOrg.organizationId === orgId && userOrg.role === "org_admin")
        );

        if (!hasAccess) {
          return res.status(403).json({ message: "Cannot verify measurements for players outside your organization" });
        }
      }

      // Update measurement verification
      const updatedMeasurement = await storage.updateMeasurement(id, {
        verifiedBy: currentUser.id,
        isVerified: "true"
      });

      res.json(updatedMeasurement);
    } catch (error) {
      console.error("Error verifying measurement:", error);
      res.status(500).json({ message: "Failed to verify measurement" });
    }
  });

  // Keep existing analytics routes
  app.get("/api/analytics/dashboard", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      const requestedOrgId = req.query.organizationId as string;

      // Determine organization context based on user role
      let organizationId: string | undefined;

      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      if (userIsSiteAdmin) {
        // Site admin can request specific org stats or site-wide stats
        organizationId = requestedOrgId || undefined;
      } else {
        // Org admins and coaches see their organization stats only
        const userOrgs = await storage.getUserOrganizations(currentUser!.id);
        organizationId = userOrgs[0]?.organizationId; // Use first organization
      }

      const stats = await storage.getDashboardStats(organizationId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/analytics/teams", requireAuth, async (req, res) => {
    try {
      const teamStats = await storage.getTeamStats();
      res.json(teamStats);
    } catch (error) {
      console.error("Error fetching team stats:", error);
      res.status(500).json({ message: "Failed to fetch team stats" });
    }
  });

  // Invitation routes
  app.post("/api/invitations", requireAuth, async (req, res) => {
    try {
      const { email, firstName, lastName, role, organizationId } = req.body;
      const currentUser = req.session.user;

      // Get current user info for invitedBy
      let invitedById = currentUser?.id;

      // If using old admin system, find the site admin user
      if (!invitedById && req.session.admin) {
        const siteAdmin = await storage.getUserByUsername("admin");
        invitedById = siteAdmin?.id;
      }

      if (!invitedById) {
        return res.status(400).json({ message: "Unable to determine current user" });
      }

      // Validate organization access
      if (organizationId && !await canAccessOrganization(invitedById, organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      // Validate role invitation permissions
      if (!await canInviteRole(invitedById, organizationId, role)) {
        const userRoles = await storage.getUserRoles(invitedById, organizationId);
        if (userRoles.includes("coach") && !userRoles.includes("org_admin")) {
          return res.status(403).json({ message: "Coaches can only invite athletes" });
        }
        return res.status(403).json({ message: "Insufficient permissions to invite this role" });
      }

      // Athletes cannot invite anyone
      if (currentUser?.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot send invitations" });
      }

      const invitation = await storage.createInvitation({
        email,
        organizationId: organizationId || null,
        role,
        invitedBy: invitedById,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });

      // Generate invitation link
      const inviteLink = `${req.protocol}://${req.get('host')}/accept-invitation?token=${invitation.token}`;

      res.status(201).json({
        id: invitation.id,
        email: invitation.email,
        token: invitation.token,
        inviteLink,
        message: `Invitation created for ${firstName} ${lastName} (${email})`
      });
    } catch (error) {
      console.error("Error creating invitation:", error);
      res.status(500).json({ message: "Failed to create invitation" });
    }
  });

  // New endpoint for player invitations (sends to all emails)
  app.post("/api/players/:playerId/invitations", requireAuth, async (req, res) => {
    try {
      const { playerId } = req.params;
      const { role, organizationId, teamIds } = req.body;

      // Get current user info for invitedBy
      let invitedById = req.session.user?.id;

      if (!invitedById && req.session.admin) {
        const siteAdmin = await storage.getUserByUsername("admin");
        invitedById = siteAdmin?.id;
      }

      if (!invitedById) {
        return res.status(400).json({ message: "Unable to determine current user" });
      }

      // Check current user's roles for restrictions
      const currentUserRoles = await storage.getUserRoles(invitedById, organizationId);

      // Coaches can only invite athletes
      if (currentUserRoles.includes("coach") && !currentUserRoles.includes("org_admin") && !await hasRole(invitedById, "site_admin")) {
        if (role !== "athlete") {
          return res.status(403).json({ message: "Coaches can only invite athletes" });
        }
      }

      // Get player info
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Create invitations for all player emails
      const invitations = await storage.createPlayerInvitations(playerId, {
        organizationId: organizationId || null,
        teamIds: teamIds || [],
        role,
        invitedBy: invitedById
      });

      // Generate invitation links with player info
      const inviteLinks = invitations.map(invitation => ({
        email: invitation.email,
        token: invitation.token,
        inviteLink: `${req.protocol}://${req.get('host')}/accept-invitation?token=${invitation.token}&player=${playerId}`,
        playerId: playerId
      }));

      res.status(201).json({
        message: `${invitations.length} invitations created for ${player.firstName} ${player.lastName}`,
        invitations: inviteLinks,
        playerName: `${player.firstName} ${player.lastName}`,
        emails: player.emails
      });
    } catch (error) {
      console.error("Error creating player invitations:", error);
      res.status(500).json({ message: "Failed to create player invitations" });
    }
  });

  app.get("/api/invitations/athletes", requireAuth, async (req, res) => {
    try {
      const user = (req as any).session.user;

      if (!user || !user.id) {
        console.log("🚫 No user in session for athlete invitations");
        return res.json([]);
      }

      const userOrgs = await storage.getUserOrganizations(user.id);

      if (userOrgs.length === 0) {
        return res.json([]);
      }

      const allInvitations = await storage.getInvitations();
      const athleteInvitations = allInvitations.filter(invitation => 
        invitation.role === 'athlete' && 
        invitation.isUsed === 'false' &&
        userOrgs.some(userOrg => userOrg.organizationId === invitation.organizationId)
      );

      // Enrich with player data
      const enrichedInvitations = await Promise.all(
        athleteInvitations.map(async (invitation) => {
          if (invitation.playerId) {
            const player = await storage.getPlayer(invitation.playerId);
            return {
              ...invitation,
              firstName: player?.firstName,
              lastName: player?.lastName
            };
          }
          return invitation;
        })
      );

      res.json(enrichedInvitations);
    } catch (error) {
      console.error("Error fetching athlete invitations:", error);
      res.status(500).json({ error: "Failed to fetch athlete invitations" });
    }
  });

  app.get("/api/invitations/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const invitation = await storage.getInvitation(token);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      if (invitation.isUsed === "true") {
        return res.status(400).json({ message: "Invitation already used" });
      }

      if (new Date() > invitation.expiresAt) {
        return res.status(400).json({ message: "Invitation expired" });
      }

      // Get existing player data if this is an athlete invitation with playerId
      let playerData = null;
      if (invitation.role === "athlete" && invitation.playerId) {
        const player = await storage.getPlayer(invitation.playerId);
        if (player) {
          // Get team information for this player
          const playerTeams = await storage.getPlayerTeams(invitation.playerId);
          const teams = await storage.getTeams();
          const playerTeamData = playerTeams.map(pt => 
            teams.find(t => t.id === pt.teamId)
          ).filter(Boolean);

          playerData = {
            id: player.id,
            firstName: player.firstName,
            lastName: player.lastName,
            emails: player.emails,
            teams: playerTeamData
          };
        }
      }

      res.json({
        email: invitation.email,
        role: invitation.role,
        organizationId: invitation.organizationId,
        playerId: invitation.playerId,
        playerData
      });
    } catch (error) {
      console.error("Error fetching invitation:", error);
      res.status(500).json({ message: "Failed to fetch invitation" });
    }
  });

  app.delete("/api/invitations/:id", requireAuth, async (req, res) => {
    try {
      const { id: invitationId } = req.params;
      const invitation = await storage.getInvitationById(invitationId);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      const currentUser = req.session.user;
      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      // Check if current user has permission to delete the invitation
      if (!userIsSiteAdmin && currentUser?.id !== invitation.invitedBy) {
        // If not site admin, they must be the one who sent the invitation
        return res.status(403).json({ message: "Access denied. You can only delete invitations you sent." });
      }

      // If the invited user is already in the organization, remove them first
      if (invitation.organizationId) {
        const invitedUser = await storage.getUserByEmail(invitation.email);
        if (invitedUser) {
          await storage.removeUserFromOrganization(invitedUser.id, invitation.organizationId);
        }
      }

      await storage.deleteInvitation(invitationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting invitation:", error);
      res.status(500).json({ error: "Failed to delete invitation" });
    }
  });

  app.post("/api/invitations/:token/accept", async (req, res) => {
    try {
      const { token } = req.params;
      const { password, firstName, lastName, username } = req.body;

      if (!username || typeof username !== 'string' || username.trim().length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters long" });
      }

      if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        return res.status(400).json({ message: "Username can only contain letters, numbers, periods, hyphens, and underscores" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already taken. Please choose a different username." });
      }

      const invitation = await storage.getInvitation(token);
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      const result = await storage.acceptInvitation(token, {
        email: invitation.email,
        username,
        password,
        firstName,
        lastName
      });

      // If this is an athlete invitation with playerId, cancel all other pending invitations for this player
      if (invitation.role === "athlete" && invitation.playerId) {
        console.log(`🚫 Auto-cancelling other invitations for player ${invitation.playerId}`);
        const allInvitations = await storage.getInvitations();
        const otherPlayerInvitations = allInvitations.filter(inv => 
          inv.playerId === invitation.playerId && 
          inv.id !== invitation.id && 
          inv.isUsed === "false"
        );

        for (const otherInv of otherPlayerInvitations) {
          await storage.updateInvitation(otherInv.id, { isUsed: "true" });
          console.log(`✅ Cancelled invitation ${otherInv.id} for ${otherInv.email}`);
        }
      }

      // Log the new user in
      req.session.user = {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
        playerId: result.user.playerId,
        isSiteAdmin: result.user.isSiteAdmin === "true" // Store as boolean
      };

      // Determine redirect URL based on user role
      let redirectUrl = "/";
      console.log(`🔍 Login redirect for user ${result.user.username}, role: ${result.user.role}, playerId: ${result.user.playerId}`);

      if (result.user.role === "athlete" && result.user.playerId) {
        redirectUrl = `/athletes/${result.user.playerId}`;
        console.log(`👤 Athlete redirect: ${redirectUrl}`);
      } else if (result.user.role === "org_admin" || result.user.role === "coach") {
        // Org admins and coaches go to dashboard
        redirectUrl = "/";
        console.log(`🏢 ${result.user.role} redirect: ${redirectUrl}`);
      }

      console.log(`➡️ Final redirect URL: ${redirectUrl}`);

      res.json({ 
        success: true, 
        user: req.session.user,
        message: "Account created successfully!",
        redirectUrl
      });
    } catch (error) {
      console.error("Error accepting invitation:", error);
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  // User management routes
  app.get("/api/organizations-with-users", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      if (userIsSiteAdmin) {
        const orgsWithUsers = await storage.getOrganizationsWithUsers();
        res.json(orgsWithUsers);
      } else {
        // Get user's roles across all organizations to check access
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        const hasOrgAccess = userOrgs.some(uo => uo.role === "org_admin" || uo.role === "coach");

        if (hasOrgAccess) {
          // Org admins and coaches can see their own organizations
          const orgsWithUsers = await storage.getOrganizationsWithUsersForUser(currentUser.id);
          res.json(orgsWithUsers);
        } else {
          // Athletes and other roles have no access
          res.json([]);
        }
      }
    } catch (error) {
      console.error("Error fetching organizations with users:", error);
      res.status(500).json({ message: "Failed to fetch organizations with users" });
    }
  });

  app.get("/api/organizations/:id/profile", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Check if user has access to this organization
      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      // Athletes have no access to organization profiles
      if (currentUser.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot access organization profiles" });
      }

      // Check if user has role in this organization (org_admin or coach)
      const userRoles = await storage.getUserRoles(currentUser.id, id);
      const hasOrgAccess = userRoles.includes("org_admin") || userRoles.includes("coach");

      if (userIsSiteAdmin || hasOrgAccess) {
        // Site admins can access any organization, org admins and coaches can access their org
        const orgProfile = await storage.getOrganizationProfile(id);
        if (!orgProfile) {
          return res.status(404).json({ message: "Organization not found" });
        }
        res.json(orgProfile);
      } else {
        // Other roles have no access
        res.status(403).json({ message: "Access denied" });
      }
    } catch (error) {
      console.error("Error fetching organization profile:", error);
      res.status(500).json({ message: "Failed to fetch organization profile" });
    }
  });

  // DELETE /api/organizations/:id/users/:userId - Remove user from organization
  app.delete("/api/organizations/:id/users/:userId", requireAuth, async (req, res) => {
    try {
      const { id: organizationId, userId } = req.params;
      const currentUser = req.session.user;

      // Check if user has admin access to this organization
      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        const userRoles = await storage.getUserRoles(currentUser.id, organizationId);
        const isOrgAdmin = userRoles.includes("org_admin") || await hasRole(currentUser.id, "org_admin", organizationId);
        if (!isOrgAdmin) {
          return res.status(403).json({ message: "Access denied. Only organization admins can delete users." });
        }
      }

      // Prevent users from deleting themselves
      if (currentUser.id === userId) {
        const isSiteAdminUser = await isSiteAdmin(currentUser);
        const userRolesToCheck = await storage.getUserRoles(userId, organizationId);
        const isOrgAdminUser = userRolesToCheck.includes("org_admin");

        if (isSiteAdminUser) {
          return res.status(400).json({ message: "Site administrators cannot delete themselves. Please have another administrator remove your access." });
        } else if (isOrgAdminUser) {
          return res.status(400).json({ message: "Organization administrators cannot delete themselves. Please have another administrator remove your access." });
        } else {
          return res.status(400).json({ message: "You cannot delete yourself from the organization." });
        }
      }

      // Check if the organization exists
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check if the user exists and is part of this organization
      const userOrgs = await storage.getUserOrganizations(userId);
      const isUserInOrg = userOrgs.some(org => org.organizationId === organizationId);
      if (!isUserInOrg) {
        return res.status(404).json({ message: "User not found in this organization" });
      }

      // Check if user is an org admin and if they're the last one
      const userRolesToDelete = await storage.getUserRoles(userId, organizationId);
      if (userRolesToDelete.includes("org_admin")) {
        // Count total org admins in this organization
        const orgProfile = await storage.getOrganizationProfile(organizationId);
        const orgAdmins = orgProfile?.coaches.filter(coach => 
          coach.roles.includes("org_admin")
        ) || [];

        if (orgAdmins.length <= 1) {
          return res.status(400).json({ 
            message: "Cannot delete the last organization administrator. Each organization must have at least one admin." 
          });
        }
      }

      // Remove user from organization
      await storage.removeUserFromOrganization(userId, organizationId);

      res.json({ message: "User removed from organization successfully" });
    } catch (error) {
      console.error("Error removing user from organization:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Organization User Management Routes (for org admins)
  app.post("/api/organizations/:id/users", requireAuth, async (req, res) => {
    try {
      const { id: organizationId } = req.params;
      const currentUser = req.session.user;

      // Check if user has access to manage this organization
      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        if (!await hasRole(currentUser.id, "org_admin", organizationId)) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const { roles, ...userData } = req.body;
      const parsedUserData = insertUserSchema.omit({ role: true }).parse(userData);

      // Validate roles array
      if (!roles || !Array.isArray(roles) || roles.length === 0) {
        return res.status(400).json({ message: "At least one role must be specified" });
      }

      // Validate role values and constraints
      const validRoles = ["org_admin", "coach", "athlete"];
      const invalidRoles = roles.filter((role: string) => !validRoles.includes(role));
      if (invalidRoles.length > 0) {
        return res.status(400).json({ message: `Invalid roles: ${invalidRoles.join(", ")}` });
      }

      // Athletes cannot have other roles
      if (roles.includes("athlete") && roles.length > 1) {
        return res.status(400).json({ message: "Athletes cannot have additional roles" });
      }

      // Org admins cannot create site admins
      if (!userIsSiteAdmin && roles.includes("site_admin")) {
        return res.status(403).json({ message: "Cannot create site administrators" });
      }

      // Check if user already exists with this email
      let user = await storage.getUserByEmail(parsedUserData.email);

      if (!user) {
        // Create new user if they don't exist
        user = await storage.createUser({
          ...parsedUserData,
          role: roles[0] // Keep primary role for backwards compatibility
        });
      } else {
        // Update existing user's basic info if needed
        if (parsedUserData.firstName || parsedUserData.lastName) {
          await storage.updateUser(user.id, {
            firstName: parsedUserData.firstName || user.firstName,
            lastName: parsedUserData.lastName || user.lastName
          });
          // Refresh user data
          user = await storage.getUser(user.id) || user;
        }
      }

      // Add user to organization with all specified roles (only if not already in org)
      const existingUserOrgs = await storage.getUserOrganizations(user.id);
      const isAlreadyInOrg = existingUserOrgs.some(org => org.organizationId === organizationId);

      if (!isAlreadyInOrg) {
        for (const role of roles) {
          await storage.addUserToOrganization(user.id, organizationId, role);
        }
      }

      // If user is an athlete, also create a player record
      if (roles.includes("athlete")) {
        await storage.createPlayer({
          firstName: userData.firstName,
          lastName: userData.lastName,
          birthYear: new Date().getFullYear() - 18, // Default age
          school: "",
          sports: [],
          emails: [userData.email],
          phoneNumbers: []
        });
      }

      res.status(201).json({ 
        id: user.id, 
        email: user.email, 
        firstName: user.firstName, 
        lastName: user.lastName, 
        role: user.role,
        message: "User created successfully"
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating user:", error);
        res.status(500).json({ message: "Failed to create user" });
      }
    }
  });

  app.post("/api/organizations/:id/invitations", requireAuth, async (req, res) => {
    try {
      const { id: organizationId } = req.params;
      const currentUser = req.session.user;

      // Check if user has access to manage this organization
      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      // Check if user belongs to this organization (as org_admin or coach)
      const userRoles = currentUser?.id ? await storage.getUserRoles(currentUser.id, organizationId) : [];
      const hasOrgAccess = userRoles.length > 0; // User has any role in this org

      if (!userIsSiteAdmin && !hasOrgAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { roles, ...invitationData } = req.body;

      // Add server-generated fields
      const invitationWithDefaults = {
        ...invitationData,
        invitedBy: currentUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
      };

      const parsedInvitationData = insertInvitationSchema.omit({ role: true }).parse(invitationWithDefaults);

      // Validate roles array
      if (!roles || !Array.isArray(roles) || roles.length === 0) {
        return res.status(400).json({ message: "At least one role must be specified" });
      }

      // Validate role values and constraints
      const validRoles = ["org_admin", "coach", "athlete"];
      const invalidRoles = roles.filter((role: string) => !validRoles.includes(role));
      if (invalidRoles.length > 0) {
        return res.status(400).json({ message: `Invalid roles: ${invalidRoles.join(", ")}` });
      }

      // Athletes cannot have other roles
      if (roles.includes("athlete") && roles.length > 1) {
        return res.status(400).json({ message: "Athletes cannot have additional roles" });
      }

      // Org admins cannot invite site admins
      if (!userIsSiteAdmin && roles.includes("site_admin")) {
        return res.status(403).json({ message: "Cannot invite site administrators" });
      }

      // Coaches can only invite athletes
      if (userRoles.includes("coach") && !userRoles.includes("org_admin") && !userIsSiteAdmin) {
        const nonAthleteRoles = roles.filter(role => role !== "athlete");
        if (nonAthleteRoles.length > 0) {
          return res.status(403).json({ message: "Coaches can only invite athletes" });
        }
      }

      // Check if user already exists, if not create them
      let existingUser = await storage.getUserByEmail(parsedInvitationData.email);

      if (!existingUser) {
        // Create a new user with invitation email
        const newUser = await storage.createUser({
          username: `user_${Date.now()}`, // Temporary username until they set one
          email: parsedInvitationData.email,
          firstName: "", // Will be filled when they accept invitation
          lastName: "",
          role: "athlete", // Default role, will be overridden by organization roles
          password: "INVITATION_PENDING" // Placeholder password until they set one
        });
        existingUser = newUser;
      }

      // Check if user is already in the organization and add them with the specified roles
      const existingUserOrgs = await storage.getUserOrganizations(existingUser.id);
      const isAlreadyInOrg = existingUserOrgs.some(org => org.organizationId === organizationId);

      if (!isAlreadyInOrg) {
        // Add user to organization with the specified roles
        for (const role of roles) {
          await storage.addUserToOrganization(existingUser.id, organizationId, role);
        }
      }

      const invitation = await storage.createInvitation({
        ...parsedInvitationData,
        role: roles[0], // Keep primary role for backwards compatibility
        organizationId
      });

      res.status(201).json({ 
        invitation,
        message: "Invitation created successfully"
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Invitation validation error:", error.errors);
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating invitation:", error);
        res.status(500).json({ message: "Failed to create invitation" });
      }
    }
  });

  // DELETE /api/organizations/:id/invitations/:invitationId - Delete pending invitation
  app.delete("/api/organizations/:id/invitations/:invitationId", requireAuth, async (req, res) => {
    try {
      const { id: organizationId, invitationId } = req.params;
      const currentUser = req.session.user;

      // Check if user has admin access to this organization
      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        const userRoles = await storage.getUserRoles(currentUser.id, organizationId);
        const hasOrgAccess = userRoles.length > 0; // User has any role in this org
        if (!hasOrgAccess) {
          return res.status(403).json({ message: "Access denied. Only organization members can delete invitations." });
        }
      }

      // Get the invitation to find the email
      const invitation = await storage.getInvitationById(invitationId);
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      // Find the user by email and remove them from organization if they exist
      const invitedUser = await storage.getUserByEmail(invitation.email);
      if (invitedUser) {
        await storage.removeUserFromOrganization(invitedUser.id, organizationId);
      }

      // Delete the invitation
      await storage.deleteInvitation(invitationId);

      res.json({ message: "Invitation deleted successfully" });
    } catch (error) {
      console.error("Error deleting invitation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/users/:id/profile - Get user profile information
  app.get("/api/users/:id/profile", requireAuth, async (req, res) => {
    try {
      const { id: userId } = req.params;
      const currentUser = req.session.user;

      // Check if user has access (site admin, org admin, or viewing own profile)
      const userIsSiteAdmin = await isSiteAdmin(currentUser);

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

      const userProfile = {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        role: user.role,
        organizations: organizations.filter(org => org.id && org.name)
      };

      res.json(userProfile);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Site Admin Management Routes
  app.get("/api/site-admins", requireSiteAdmin, async (req, res) => {
    try {
      const siteAdmins = await storage.getSiteAdminUsers();
      res.json(siteAdmins);
    } catch (error) {
      console.error("Error fetching site admins:", error);
      res.status(500).json({ message: "Failed to fetch site admins" });
    }
  });

  // Get all users (site admin only)
  app.get("/api/users", requireSiteAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      console.error("Error getting users:", error);
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  app.post("/api/site-admins", requireSiteAdmin, async (req, res) => {
    try {
      const adminData = createSiteAdminSchema.parse(req.body);

      const newUser = await storage.createUser({
        username: adminData.username,
        email: adminData.username + "@admin.local", // Use username as email with dummy domain
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        password: adminData.password,
        role: "site_admin",
      });

      res.json({
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
        },
        message: "Site admin created successfully"
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating site admin:", error);
        res.status(500).json({ message: "Failed to create site admin" });
      }
    }
  });


  app.put("/api/users/:id/role", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { role, organizationId } = req.body;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get the user to check current role and organization membership
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user belongs to any organization
      const userOrgs = await storage.getUserOrganizations(id);
      const isOrgUser = userOrgs && userOrgs.length > 0;

      // Authorization checks
      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        // For non-site admins, check org admin permissions
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for role changes" });
        }

        if (!await canManageUsers(currentUser.id, organizationId)) {
          return res.status(403).json({ message: "Access denied. Only organization admins can change user roles." });
        }

        // Check if target user is in the same organization
        const targetUserRoles = await storage.getUserRoles(id, organizationId);
        if (targetUserRoles.length === 0) {
          return res.status(403).json({ message: "User not found in this organization" });
        }

        // Prevent org admins from modifying themselves
        if (currentUser.id === id) {
          return res.status(403).json({ message: "You cannot change your own role" });
        }

        // Org admins can only change roles of coaches and other org admins (not athletes)
        const canChangeRole = targetUserRoles.some(userRole => ["org_admin", "coach"].includes(userRole));
        if (!canChangeRole) {
          return res.status(403).json({ message: "You can only change roles of coaches and organization admins" });
        }

        // Org admins cannot promote users to site admin
        if (role === "site_admin") {
          return res.status(403).json({ message: "Cannot promote users to site administrator" });
        }
      }

      // Role validation rules
      if (isOrgUser && role === "site_admin") {
        return res.status(400).json({ 
          message: "Users from organizations cannot be made site admins" 
        });
      }

      // Prevent conflicting role combinations: athlete vs coach/org_admin
      const currentRole = user.role;
      if ((currentRole === 'athlete' && (role === 'coach' || role === 'org_admin')) ||
          ((currentRole === 'coach' || currentRole === 'org_admin') && role === 'athlete')) {
        return res.status(400).json({ 
          message: "Athletes cannot be coaches or admins, and coaches/admins cannot be athletes" 
        });
      }

      // Valid roles for organization users
      if (isOrgUser && !['athlete', 'coach', 'org_admin'].includes(role)) {
        return res.status(400).json({ 
          message: "Invalid role for organization user" 
        });
      }

      // Athletes cannot have their roles changed by org admins
      if (!userIsSiteAdmin && user.role === "athlete") {
        return res.status(403).json({ message: "Athlete roles cannot be changed by organization admins" });
      }

      // Update user role differently based on who is making the change
      if (userIsSiteAdmin) {
        // Site admins can update global role and all organization roles
        const updatedUser = await storage.updateUser(id, { role });

        // Also update role in all organizations the user belongs to
        if (isOrgUser) {
          for (const userOrg of userOrgs) {
            await storage.updateUserOrganizationRole(id, userOrg.organizationId, role);
          }
        }
        res.json(updatedUser);
      } else {
        // Org admins can only update role in their specific organization
        await storage.updateUserOrganizationRole(id, organizationId!, role);

        // Get updated user info to return
        const updatedUser = await storage.getUser(id);
        res.json(updatedUser);
      }
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // PUT /api/users/:id/status - Toggle user active/inactive status (site admin only)
  app.put("/api/users/:id/status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const currentUser = req.session.user;

      // Only site admins can activate/deactivate users
      const userIsSiteAdmin = await isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        return res.status(403).json({ message: "Access denied. Only site administrators can activate/deactivate users." });
      }

      // Cannot deactivate self
      if (currentUser?.id === id) {
        return res.status(400).json({ message: "You cannot deactivate your own account." });
      }

      // Update user status
      const user = await storage.updateUser(id, { isActive: isActive ? "true" : "false" });

      res.json({ 
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        user 
      });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  // GET /api/users/check-username - Check if username is available
  app.get("/api/users/check-username", async (req, res) => {
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

  app.delete("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteUser(id);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Profile management routes
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
      req.session.user = {
        ...req.session.user,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
      };

      res.json({
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        role: updatedUser.role,
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

  return server;
}