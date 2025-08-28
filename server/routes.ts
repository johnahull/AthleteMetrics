import express from "express";
import session from "express-session";
import { storage } from "./storage";
import { insertOrganizationSchema, insertTeamSchema, insertPlayerSchema, insertMeasurementSchema, insertInvitationSchema } from "@shared/schema";
import { z } from "zod";

const app = express();

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Extend session type
declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
    };
  }
}

// Middleware to check authentication
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
};

// Middleware to check if user is site admin
const requireSiteAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.session.user || req.session.user.role !== "site_admin") {
    return res.status(403).json({ message: "Site admin access required" });
  }
  next();
};

// Helper function to get user's accessible organization IDs
async function getUserOrganizationIds(userId: string): Promise<string[]> {
  const userOrgs = await storage.getUserOrganizations(userId);
  return userOrgs.map(uo => uo.organizationId);
}

// Authentication routes
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await storage.authenticateUser(email, password);
    
    if (user) {
      req.session.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      };
      res.json({ 
        success: true, 
        user: req.session.user 
      });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed" });
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

app.get("/api/auth/me", (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ message: "Not authenticated" });
  }
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

app.get("/api/organizations/:id", requireAuth, async (req, res) => {
  try {
    const organization = await storage.getOrganization(req.params.id);
    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    // Check if user has access to this organization
    if (req.session.user!.role !== "site_admin") {
      const userOrgIds = await getUserOrganizationIds(req.session.user!.id);
      if (!userOrgIds.includes(req.params.id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    res.json(organization);
  } catch (error) {
    console.error("Error fetching organization:", error);
    res.status(500).json({ message: "Failed to fetch organization" });
  }
});

// Team routes
app.get("/api/teams", requireAuth, async (req, res) => {
  try {
    const { organizationId } = req.query;
    
    // Site admins can see all teams, others only from their organizations
    let orgId = organizationId as string;
    if (req.session.user!.role !== "site_admin") {
      if (organizationId) {
        const userOrgIds = await getUserOrganizationIds(req.session.user!.id);
        if (!userOrgIds.includes(organizationId as string)) {
          return res.status(403).json({ message: "Access denied" });
        }
      } else {
        // If no org specified, get all teams from user's organizations
        const userOrgIds = await getUserOrganizationIds(req.session.user!.id);
        orgId = userOrgIds[0]; // For now, use first org
      }
    }
    
    const teams = await storage.getTeams(orgId);
    res.json(teams);
  } catch (error) {
    console.error("Error fetching teams:", error);
    res.status(500).json({ message: "Failed to fetch teams" });
  }
});

app.post("/api/teams", requireAuth, async (req, res) => {
  try {
    const teamData = insertTeamSchema.parse(req.body);
    
    // Check if user has access to create teams in this organization
    if (req.session.user!.role !== "site_admin") {
      const userOrgIds = await getUserOrganizationIds(req.session.user!.id);
      if (!userOrgIds.includes(teamData.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }
    
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

// Player routes
app.get("/api/players", requireAuth, async (req, res) => {
  try {
    const { teamId, organizationId, birthYearFrom, birthYearTo, search } = req.query;
    
    let filters: any = {
      birthYearFrom: birthYearFrom ? parseInt(birthYearFrom as string) : undefined,
      birthYearTo: birthYearTo ? parseInt(birthYearTo as string) : undefined,
      search: search as string,
      teamId: teamId as string,
    };

    // Apply organization restrictions for non-site-admins
    if (req.session.user!.role !== "site_admin") {
      const userOrgIds = await getUserOrganizationIds(req.session.user!.id);
      if (organizationId && !userOrgIds.includes(organizationId as string)) {
        return res.status(403).json({ message: "Access denied" });
      }
      filters.organizationId = organizationId as string || userOrgIds[0];
    } else {
      filters.organizationId = organizationId as string;
    }
    
    const players = await storage.getPlayers(filters);
    res.json(players);
  } catch (error) {
    console.error("Error fetching players:", error);
    res.status(500).json({ message: "Failed to fetch players" });
  }
});

app.post("/api/players", requireAuth, async (req, res) => {
  try {
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

app.get("/api/players/:id", requireAuth, async (req, res) => {
  try {
    const player = await storage.getPlayer(req.params.id);
    if (!player) {
      return res.status(404).json({ message: "Player not found" });
    }
    
    // Check access permissions
    if (req.session.user!.role !== "site_admin") {
      const userOrgIds = await getUserOrganizationIds(req.session.user!.id);
      const hasAccess = player.teams.some(team => userOrgIds.includes(team.organization.id));
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
    }
    
    res.json(player);
  } catch (error) {
    console.error("Error fetching player:", error);
    res.status(500).json({ message: "Failed to fetch player" });
  }
});

// Measurement routes
app.get("/api/measurements", requireAuth, async (req, res) => {
  try {
    const { playerId, teamIds, metric, dateFrom, dateTo, birthYearFrom, birthYearTo, ageFrom, ageTo, search, sport, organizationId } = req.query;
    
    let filters: any = {
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
      includeUnverified: req.session.user!.role === "coach" || req.session.user!.role === "org_admin" || req.session.user!.role === "site_admin"
    };

    // Apply organization restrictions
    if (req.session.user!.role !== "site_admin") {
      const userOrgIds = await getUserOrganizationIds(req.session.user!.id);
      if (organizationId && !userOrgIds.includes(organizationId as string)) {
        return res.status(403).json({ message: "Access denied" });
      }
      filters.organizationId = organizationId as string || userOrgIds[0];
    } else {
      filters.organizationId = organizationId as string;
    }
    
    const measurements = await storage.getMeasurements(filters);
    res.json(measurements);
  } catch (error) {
    console.error("Error fetching measurements:", error);
    res.status(500).json({ message: "Failed to fetch measurements" });
  }
});

app.post("/api/measurements", requireAuth, async (req, res) => {
  try {
    const measurementData = insertMeasurementSchema.parse({
      ...req.body,
      submittedBy: req.session.user!.id
    });
    
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

app.post("/api/measurements/:id/verify", requireAuth, async (req, res) => {
  try {
    // Only coaches, org admins, and site admins can verify measurements
    if (!["coach", "org_admin", "site_admin"].includes(req.session.user!.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    
    const measurement = await storage.verifyMeasurement(req.params.id, req.session.user!.id);
    res.json(measurement);
  } catch (error) {
    console.error("Error verifying measurement:", error);
    res.status(500).json({ message: "Failed to verify measurement" });
  }
});

// Invitation routes
app.post("/api/invitations", requireAuth, async (req, res) => {
  try {
    // Only coaches, org admins, and site admins can send invitations
    if (!["coach", "org_admin", "site_admin"].includes(req.session.user!.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    
    const invitationData = insertInvitationSchema.parse({
      ...req.body,
      invitedBy: req.session.user!.id
    });
    
    const invitation = await storage.createInvitation(invitationData);
    res.status(201).json(invitation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Validation error", errors: error.errors });
    } else {
      console.error("Error creating invitation:", error);
      res.status(500).json({ message: "Failed to create invitation" });
    }
  }
});

app.post("/api/invitations/:token/accept", async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    const user = await storage.acceptInvitation(req.params.token, {
      email,
      password,
      firstName,
      lastName
    });
    
    // Auto-login the new user
    req.session.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    };
    
    res.status(201).json({ user: req.session.user });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    res.status(400).json({ message: error instanceof Error ? error.message : "Failed to accept invitation" });
  }
});

app.get("/api/invitations/:token", async (req, res) => {
  try {
    const invitation = await storage.getInvitation(req.params.token);
    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found or expired" });
    }
    
    res.json({
      email: invitation.email,
      organizationId: invitation.organizationId,
      role: invitation.role
    });
  } catch (error) {
    console.error("Error fetching invitation:", error);
    res.status(500).json({ message: "Failed to fetch invitation" });
  }
});

// Analytics routes
app.get("/api/analytics/dashboard", requireAuth, async (req, res) => {
  try {
    const { organizationId } = req.query;
    
    let orgId = organizationId as string;
    if (req.session.user!.role !== "site_admin") {
      const userOrgIds = await getUserOrganizationIds(req.session.user!.id);
      if (organizationId && !userOrgIds.includes(organizationId as string)) {
        return res.status(403).json({ message: "Access denied" });
      }
      orgId = organizationId as string || userOrgIds[0];
    }
    
    const stats = await storage.getDashboardStats(orgId);
    res.json(stats);
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ message: "Failed to fetch dashboard stats" });
  }
});

app.get("/api/analytics/teams", requireAuth, async (req, res) => {
  try {
    const { organizationId } = req.query;
    
    let orgId = organizationId as string;
    if (req.session.user!.role !== "site_admin") {
      const userOrgIds = await getUserOrganizationIds(req.session.user!.id);
      if (organizationId && !userOrgIds.includes(organizationId as string)) {
        return res.status(403).json({ message: "Access denied" });
      }
      orgId = organizationId as string || userOrgIds[0];
    }
    
    const teamStats = await storage.getTeamStats(orgId);
    res.json(teamStats);
  } catch (error) {
    console.error("Error fetching team stats:", error);
    res.status(500).json({ message: "Failed to fetch team stats" });
  }
});

// Create default site admin user on startup
export async function initializeDefaultUser() {
  try {
    // Check if any site admin exists
    const adminEmail = process.env.ADMIN_EMAIL || "admin@athleteperformancehub.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    
    const existingUser = await storage.getUserByEmail(adminEmail);
    if (!existingUser) {
      await storage.createUser({
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

export default app;