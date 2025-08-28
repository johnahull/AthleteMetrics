import type { Express } from "express";
import { createServer } from "http";
import session from "express-session";
import { storage } from "./storage";
import { insertOrganizationSchema, insertTeamSchema, insertPlayerSchema, insertMeasurementSchema, insertInvitationSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";

// Session configuration
declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
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

// Middleware to check if user is site admin or old admin
const requireSiteAdmin = (req: any, res: any, next: any) => {
  if (req.session.admin || (req.session.user && req.session.user.role === "site_admin")) {
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
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: false,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Initialize default user
  initializeDefaultUser();

  // Authentication routes - OLD SYSTEM (temporary)
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password, email } = req.body;
      
      // Handle old admin login
      if (username === "admin" && password === process.env.ADMIN_PASS) {
        req.session.admin = true;
        return res.json({ success: true, user: { username: "admin" } });
      }
      
      // Handle new email-based login
      if (email) {
        const user = await storage.authenticateUser(email, password);
        if (user) {
          req.session.user = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
          };
          return res.json({ 
            success: true, 
            user: req.session.user 
          });
        }
      }
      
      res.status(401).json({ message: "Invalid credentials" });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.session.admin) {
      return res.json({ user: { username: "admin" } });
    }
    if (req.session.user) {
      return res.json({ user: req.session.user });
    }
    res.status(401).json({ message: "Not authenticated" });
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
      
      res.status(201).json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role });
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
      const teamData = insertTeamSchema.parse(req.body);
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
      const { teamId, birthYearFrom, birthYearTo, search } = req.query;
      const filters: any = {
        teamId: teamId as string,
        birthYearFrom: birthYearFrom ? parseInt(birthYearFrom as string) : undefined,
        birthYearTo: birthYearTo ? parseInt(birthYearTo as string) : undefined,
        search: search as string,
      };
      
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

  // Keep existing measurement routes
  app.get("/api/measurements", requireAuth, async (req, res) => {
    try {
      const { playerId, teamIds, metric, dateFrom, dateTo, birthYearFrom, birthYearTo, ageFrom, ageTo, search, sport } = req.query;
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
        includeUnverified: true
      };
      
      const measurements = await storage.getMeasurements(filters);
      res.json(measurements);
    } catch (error) {
      console.error("Error fetching measurements:", error);
      res.status(500).json({ message: "Failed to fetch measurements" });
    }
  });

  // Keep existing analytics routes
  app.get("/api/analytics/dashboard", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
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

  return server;
}