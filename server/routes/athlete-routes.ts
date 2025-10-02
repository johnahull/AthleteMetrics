/**
 * Athlete management routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requireAuth, requireSiteAdmin, asyncHandler } from "../middleware";
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
  app.get("/api/athletes", athleteLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
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
  }));

  /**
   * Get athlete by ID
   */
  app.get("/api/athletes/:id", athleteLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
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
  }));

  /**
   * Create athlete (site admin only)
   */
  app.post("/api/athletes", athleteLimiter, requireSiteAdmin, asyncHandler(async (req: any, res: any) => {
    // Validate request body using Zod schema
    const validatedData = insertAthleteSchema.parse(req.body);
    const athlete = await storage.createAthlete(validatedData);
    res.status(201).json(athlete);
  }));

  /**
   * Update athlete
   */
  app.put("/api/athletes/:id", athleteLimiter, requireSiteAdmin, asyncHandler(async (req: any, res: any) => {
    const athleteId = req.params.id;

    // Validate request body using partial schema (for updates)
    const updateSchema = insertAthleteSchema.partial();
    const validatedData = updateSchema.parse(req.body);

    const updatedAthlete = await storage.updateAthlete(athleteId, validatedData);
    res.json(updatedAthlete);
  }));

  /**
   * Delete athlete (site admin only)
   */
  app.delete("/api/athletes/:id", athleteLimiter, requireSiteAdmin, asyncHandler(async (req: any, res: any) => {
    const athleteId = req.params.id;
    await storage.deleteAthlete(athleteId);
    res.json({ message: "Athlete deleted successfully" });
  }));
}