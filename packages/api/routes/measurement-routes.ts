/**
 * Measurement management routes
 * Uses MeasurementService for direct DB access instead of storage layer
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { MeasurementService } from "../services/measurement-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { insertMeasurementSchema } from "@shared/schema";

// Helper function to check if user is site admin
function isSiteAdmin(user: any): boolean {
  return user?.isSiteAdmin === true;
}

// Rate limiting for measurement endpoints
const measurementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 200, // Higher limit for measurements (more frequent operations)
  message: { message: "Too many measurement requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter rate limiting for delete operations
const measurementDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30, // Limit each IP to 30 delete requests per windowMs
  message: { message: "Too many deletion attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerMeasurementRoutes(app: Express) {
  const measurementService = new MeasurementService();

  /**
   * Get measurements with optional filters
   */
  app.get("/api/measurements", measurementLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Build filters from query parameters
      const filters: any = {};

      if (req.query.userId) filters.userId = req.query.userId as string;
      if (req.query.athleteId) filters.athleteId = req.query.athleteId as string;
      if (req.query.metric) filters.metric = req.query.metric as string;
      if (req.query.dateFrom) filters.dateFrom = req.query.dateFrom as string;
      if (req.query.dateTo) filters.dateTo = req.query.dateTo as string;
      if (req.query.includeUnverified === 'true') filters.includeUnverified = true;

      // Parse numeric filters
      if (req.query.birthYearFrom) {
        const year = parseInt(req.query.birthYearFrom as string);
        if (!isNaN(year)) filters.birthYearFrom = year;
      }
      if (req.query.birthYearTo) {
        const year = parseInt(req.query.birthYearTo as string);
        if (!isNaN(year)) filters.birthYearTo = year;
      }
      if (req.query.ageFrom) {
        const age = parseInt(req.query.ageFrom as string);
        if (!isNaN(age)) filters.ageFrom = age;
      }
      if (req.query.ageTo) {
        const age = parseInt(req.query.ageTo as string);
        if (!isNaN(age)) filters.ageTo = age;
      }

      // TODO: Add organization-based filtering for non-admin users
      // For now, return all measurements matching filters

      const measurements = await measurementService.getMeasurements(filters);
      res.json(measurements);
    } catch (error) {
      console.error("Get measurements error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch measurements";
      res.status(500).json({ message });
    }
  });

  /**
   * Get measurement by ID
   */
  app.get("/api/measurements/:id", measurementLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const measurementId = req.params.id;
      const measurement = await measurementService.getMeasurement(measurementId);

      if (!measurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      // TODO: Add permission check based on organization
      // For now, allow any authenticated user to view

      res.json(measurement);
    } catch (error) {
      console.error("Get measurement error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch measurement";
      res.status(500).json({ message });
    }
  });

  /**
   * Create measurement (org admins, coaches, and athletes for their own data)
   */
  app.post("/api/measurements", measurementLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate request body using Zod schema
      const validatedData = insertMeasurementSchema.parse(req.body);

      // Permission check: athletes can only create measurements for themselves
      if (user.role === 'athlete' && validatedData.userId !== user.athleteId) {
        return res.status(403).json({ message: "Athletes can only create measurements for themselves" });
      }

      // TODO: Add permission check for org admins/coaches based on organization

      const measurement = await measurementService.createMeasurement(validatedData, user.id);
      res.status(201).json(measurement);
    } catch (error) {
      console.error("Create measurement error:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input data", errors: error.message });
      }
      const message = error instanceof Error ? error.message : "Failed to create measurement";
      res.status(400).json({ message });
    }
  });

  /**
   * Update measurement (submitter, org admins, and coaches)
   */
  app.put("/api/measurements/:id", measurementLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const measurementId = req.params.id;

      // Get existing measurement for permission check
      const existingMeasurement = await measurementService.getMeasurement(measurementId);
      if (!existingMeasurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      // Permission check: only submitter, org admins, or site admins can update
      if (!isSiteAdmin(user) && existingMeasurement.submittedBy !== user.id) {
        // TODO: Allow org admins/coaches to update measurements in their organization
        return res.status(403).json({ message: "Access denied - you can only update measurements you submitted" });
      }

      // Validate request body using partial schema (for updates)
      const updateSchema = insertMeasurementSchema.partial();
      const validatedData = updateSchema.parse(req.body);

      const updatedMeasurement = await measurementService.updateMeasurement(measurementId, validatedData);
      res.json(updatedMeasurement);
    } catch (error) {
      console.error("Update measurement error:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input data", errors: error.message });
      }
      const message = error instanceof Error ? error.message : "Failed to update measurement";
      res.status(400).json({ message });
    }
  });

  /**
   * Delete measurement (submitter, org admins, and coaches)
   */
  app.delete("/api/measurements/:id", measurementDeleteLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const measurementId = req.params.id;

      // Get existing measurement for permission check
      const existingMeasurement = await measurementService.getMeasurement(measurementId);
      if (!existingMeasurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      // Permission check: only submitter, org admins, or site admins can delete
      if (!isSiteAdmin(user) && existingMeasurement.submittedBy !== user.id) {
        // TODO: Allow org admins/coaches to delete measurements in their organization
        return res.status(403).json({ message: "Access denied - you can only delete measurements you submitted" });
      }

      await measurementService.deleteMeasurement(measurementId);
      res.json({ message: "Measurement deleted successfully" });
    } catch (error) {
      console.error("Delete measurement error:", error);
      const message = error instanceof Error ? error.message : "Failed to delete measurement";
      res.status(500).json({ message });
    }
  });

  /**
   * Verify measurement (org admins and coaches only)
   */
  app.post("/api/measurements/:id/verify", measurementLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Permission check: only org admins, coaches, and site admins can verify
      if (user.role === 'athlete') {
        return res.status(403).json({ message: "Athletes cannot verify measurements" });
      }

      const measurementId = req.params.id;

      // Get existing measurement
      const existingMeasurement = await measurementService.getMeasurement(measurementId);
      if (!existingMeasurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      // TODO: Add permission check based on organization

      const verifiedMeasurement = await measurementService.verifyMeasurement(measurementId, user.id);
      res.json(verifiedMeasurement);
    } catch (error) {
      console.error("Verify measurement error:", error);
      const message = error instanceof Error ? error.message : "Failed to verify measurement";
      res.status(500).json({ message });
    }
  });
}
