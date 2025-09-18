/**
 * Athlete management routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { insertUserSchema, insertAthleteSchema } from "@shared/schema";
// Session types are loaded globally

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
      // Use getAthletes with search to get athlete with teams included
      const athletes = await storage.getAthletes({ search: athleteId });
      const athlete = athletes.find(a => a.id === athleteId);
      
      if (!athlete) {
        return res.status(404).json({ message: "Athlete not found" });
      }

      // Transform the data to match the frontend's expected format
      const transformedAthlete = {
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
      };

      res.json(transformedAthlete);
    } catch (error) {
      console.error("Get athlete error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch athlete";
      res.status(500).json({ message });
    }
  });

  /**
   * Create athlete (site admin only)
   */
  app.post("/api/athletes", athleteLimiter, requireSiteAdmin, async (req, res) => {
    try {
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
   * Update athlete
   */
  app.put("/api/athletes/:id", athleteLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const athleteId = req.params.id;
      
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
   * Delete athlete (site admin only)
   */
  app.delete("/api/athletes/:id", athleteLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const athleteId = req.params.id;
      await storage.deleteAthlete(athleteId);
      res.json({ message: "Athlete deleted successfully" });
    } catch (error) {
      console.error("Delete athlete error:", error);
      const message = error instanceof Error ? error.message : "Failed to delete athlete";
      res.status(500).json({ message });
    }
  });
}