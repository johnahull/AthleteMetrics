/**
 * Athlete management routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { insertUserSchema, insertAthleteSchema } from "@shared/schema";
// Session types are loaded globally

// Helper function to check if user is site admin
function isSiteAdmin(user: any): boolean {
  return user?.isSiteAdmin === true;
}

// Rate limiting for athlete endpoints
const athleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 athlete requests per windowMs
  message: { message: "Too many athlete requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerAthleteRoutes(app: Express) {
  /**
   * Get all athletes with optional filtering
   */
  app.get("/api/athletes", athleteLimiter, requireAuth, async (req, res) => {
    try {
      // Parse and validate query parameters with proper typing
      const filters: Parameters<typeof storage.getAthletes>[0] = {};
      
      if (req.query.teamId) filters.teamId = req.query.teamId as string;
      if (req.query.organizationId) filters.organizationId = req.query.organizationId as string;
      if (req.query.birthYearFrom) {
        const year = parseInt(req.query.birthYearFrom as string);
        if (!isNaN(year)) filters.birthYearFrom = year;
      }
      if (req.query.birthYearTo) {
        const year = parseInt(req.query.birthYearTo as string);
        if (!isNaN(year)) filters.birthYearTo = year;
      }
      if (req.query.search) filters.search = req.query.search as string;
      if (req.query.gender) filters.gender = req.query.gender as string;

      const athletes = await storage.getAthletes(filters);
      
      // Transform the data to match the frontend's expected format
      const transformedAthletes = athletes.map(athlete => ({
        id: athlete.id,
        name: `${athlete.firstName} ${athlete.lastName}`,
        fullName: `${athlete.firstName} ${athlete.lastName}`,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        teamName: athlete.teams && athlete.teams.length > 0 ? athlete.teams[0].name : undefined,
        teams: athlete.teams?.map(team => ({
          id: team.id,
          name: team.name,
          organization: team.organization
        })) || [],
        birthYear: athlete.birthYear,
        birthDate: athlete.birthDate,
        graduationYear: athlete.graduationYear,
        school: athlete.school,
        phoneNumbers: athlete.phoneNumbers,
        sports: athlete.sports,
        positions: athlete.positions,
        height: athlete.height,
        weight: athlete.weight,
        gender: athlete.gender,
      }));

      res.json(transformedAthletes);
    } catch (error) {
      console.error("Get athletes error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch athletes";
      res.status(500).json({ message });
    }
  });

  /**
   * Get athlete by ID
   */
  app.get("/api/athletes/:id", athleteLimiter, requireAuth, async (req, res) => {
    try {
      const athleteId = req.params.id;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const athlete = await storage.getAthlete(athleteId);
      if (!athlete) {
        return res.status(404).json({ message: "Athlete not found" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Athletes can only view their own athlete data
      if (currentUser.role === "athlete") {
        if (currentUser.athleteId !== athleteId) {
          return res.status(403).json({ message: "Athletes can only view their own profile" });
        }
      } else if (!userIsSiteAdmin) {
        // Coaches and org admins can only view athletes from their organization
        // Check if user has access to the same organization as the athlete
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        if (userOrgs.length === 0) {
          return res.status(403).json({ message: "Access denied - no organization access" });
        }

        // Get the athlete's teams to determine organization
        const athleteTeams = await storage.getUserTeams(athleteId);
        if (athleteTeams.length === 0) {
          return res.status(403).json({ message: "Athlete has no team assignments" });
        }

        // Check if user has access to any of the athlete's team organizations
        const userOrgIds = userOrgs.map(org => org.organizationId);
        const athleteOrgIds = athleteTeams.map(team => team.team.organizationId);

        const hasOrganizationAccess = athleteOrgIds.some(orgId => userOrgIds.includes(orgId));
        if (!hasOrganizationAccess) {
          return res.status(403).json({ message: "Access denied - athlete belongs to a different organization" });
        }
      }

      // Transform the data to match the frontend's expected format including teams
      const athleteTeams = await storage.getUserTeams(athleteId);
      const transformedAthlete = {
        id: athlete.id,
        name: `${athlete.firstName} ${athlete.lastName}`,
        fullName: `${athlete.firstName} ${athlete.lastName}`,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        teamName: athleteTeams.length > 0 ? athleteTeams[0].team.name : undefined,
        teams: athleteTeams.map(userTeam => ({
          id: userTeam.team.id,
          name: userTeam.team.name,
          organization: userTeam.team.organization
        })),
        birthYear: athlete.birthYear,
        birthDate: athlete.birthDate,
        graduationYear: athlete.graduationYear,
        school: athlete.school,
        phoneNumbers: athlete.phoneNumbers,
        sports: athlete.sports,
        positions: athlete.positions,
        height: athlete.height,
        weight: athlete.weight,
        gender: athlete.gender,
        emails: athlete.emails
      };

      res.json(transformedAthlete);
    } catch (error) {
      console.error("Get athlete error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch athlete";
      res.status(500).json({ message });
    }
  });

  /**
   * Create athlete (org admins and coaches can create within their organization)
   */
  app.post("/api/athletes", athleteLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = currentUser.isSiteAdmin === true;
      
      // Non-site admins must have org admin or coach role
      if (!userIsSiteAdmin) {
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        
        if (userOrgs.length === 0) {
          return res.status(403).json({ message: "No organization access" });
        }

        // Check if user has appropriate role in any organization
        const hasPermission = userOrgs.some(org => 
          org.role === 'org_admin' || org.role === 'coach'
        );

        if (!hasPermission) {
          return res.status(403).json({ message: "Organization admin or coach role required to create athletes" });
        }
      }

      // Validate request body using Zod schema
      const validatedData = insertAthleteSchema.parse(req.body);
      const athlete = await storage.createAthlete(validatedData);
      res.status(201).json(athlete);
    } catch (error) {
      console.error("Create athlete error:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input data", errors: error.message });
      }
      const message = error instanceof Error ? error.message : "Failed to create athlete";
      res.status(400).json({ message });
    }
  });

  /**
   * Update athlete (org admins and coaches can update athletes in their organization)
   */
  app.put("/api/athletes/:id", athleteLimiter, requireAuth, async (req, res) => {
    try {
      const athleteId = req.params.id;
      const currentUser = req.session.user;
      
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = currentUser.isSiteAdmin === true;
      
      // Non-site admins must have org admin or coach role and access to the athlete
      if (!userIsSiteAdmin) {
        const [userOrgs, athleteTeams] = await Promise.all([
          storage.getUserOrganizations(currentUser.id),
          storage.getUserTeams(athleteId)
        ]);

        if (userOrgs.length === 0) {
          return res.status(403).json({ message: "No organization access" });
        }

        // Check if user has appropriate role
        const hasRole = userOrgs.some(org => 
          org.role === 'org_admin' || org.role === 'coach'
        );

        if (!hasRole) {
          return res.status(403).json({ message: "Organization admin or coach role required" });
        }

        // Check if athlete is in user's organization
        const athleteOrgIds = athleteTeams.map(team => team.team.organizationId);
        const userOrgIds = userOrgs.map(org => org.organizationId);
        const hasSharedOrg = athleteOrgIds.some(orgId => userOrgIds.includes(orgId));

        if (!hasSharedOrg) {
          return res.status(403).json({ message: "Access denied - athlete not in your organization" });
        }
      }
      
      // Validate request body using partial schema (for updates)
      const updateSchema = insertAthleteSchema.partial();
      const validatedData = updateSchema.parse(req.body);
      
      const updatedAthlete = await storage.updateAthlete(athleteId, validatedData);
      res.json(updatedAthlete);
    } catch (error) {
      console.error("Update athlete error:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input data", errors: error.message });
      }
      const message = error instanceof Error ? error.message : "Failed to update athlete";
      res.status(400).json({ message });
    }
  });

  /**
   * Delete athlete (org admins only within their organization)
   */
  app.delete("/api/athletes/:id", athleteLimiter, requireAuth, async (req, res) => {
    try {
      const athleteId = req.params.id;
      const currentUser = req.session.user;
      
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = currentUser.isSiteAdmin === true;
      
      // Non-site admins must have org admin role and access to the athlete
      if (!userIsSiteAdmin) {
        const [userOrgs, athleteTeams] = await Promise.all([
          storage.getUserOrganizations(currentUser.id),
          storage.getUserTeams(athleteId)
        ]);

        if (userOrgs.length === 0) {
          return res.status(403).json({ message: "No organization access" });
        }

        // Only org admins can delete athletes
        const hasOrgAdminRole = userOrgs.some(org => org.role === 'org_admin');

        if (!hasOrgAdminRole) {
          return res.status(403).json({ message: "Organization admin role required to delete athletes" });
        }

        // Check if athlete is in user's organization
        const athleteOrgIds = athleteTeams.map(team => team.team.organizationId);
        const userOrgIds = userOrgs.map(org => org.organizationId);
        const hasSharedOrg = athleteOrgIds.some(orgId => userOrgIds.includes(orgId));

        if (!hasSharedOrg) {
          return res.status(403).json({ message: "Access denied - athlete not in your organization" });
        }
      }
      
      await storage.deleteAthlete(athleteId);
      res.json({ message: "Athlete deleted successfully" });
    } catch (error) {
      console.error("Delete athlete error:", error);
      const message = error instanceof Error ? error.message : "Failed to delete athlete";
      res.status(500).json({ message });
    }
  });
}