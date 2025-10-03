/**
 * Measurement management routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { MeasurementService } from "../services/measurement-service";
import { requireAuth } from "../middleware";
import { asyncHandler } from "../utils/errors";

const measurementService = new MeasurementService();

// Rate limiting for measurement creation
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 measurement creation requests per windowMs
  message: { message: "Too many measurement creation attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerMeasurementRoutes(app: Express) {
  /**
   * Get measurements with filtering
   * @route GET /api/measurements
   * @query {string} [athleteId] - Filter by athlete ID
   * @query {string} [metric] - Filter by metric type
   * @query {string} [startDate] - Filter by start date
   * @query {string} [endDate] - Filter by end date
   * @query {string} [organizationId] - Filter by organization ID
   * @query {string} [teamId] - Filter by team ID
   * @access All authenticated users (filtered by organization access)
   * @returns {Object[]} measurements - Array of measurement objects
   */
  app.get("/api/measurements", requireAuth, asyncHandler(async (req: any, res: any) => {
    const { athleteId, metric, startDate, endDate, organizationId, teamId } = req.query;

    const filters = {
      athleteId: athleteId as string | undefined,
      metric: metric as string | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      organizationId: organizationId as string | undefined,
      teamId: teamId as string | undefined
    };

    const measurements = await measurementService.getMeasurements(
      filters,
      req.session.user!.id
    );

    res.json(measurements);
  }));

  /**
   * Create a new measurement
   * @route POST /api/measurements
   * @body {Object} measurementData - Measurement creation data
   * @body {string} measurementData.userId - Athlete user ID
   * @body {string} measurementData.metric - Measurement metric type
   * @body {number} measurementData.value - Measurement value
   * @body {string} measurementData.date - Measurement date
   * @access Coaches, Organization Admins, Site Admins, Athletes (own measurements)
   * @returns {Object} measurement - Created measurement object
   */
  app.post("/api/measurements", createLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const measurement = await measurementService.createMeasurement(
      req.body,
      req.session.user!.id
    );

    res.status(201).json(measurement);
  }));

  /**
   * Verify measurement
   * @route PUT /api/measurements/:id/verify
   * @param {string} id - Measurement ID
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} measurement - Verified measurement object
   */
  app.put("/api/measurements/:id/verify", requireAuth, asyncHandler(async (req: any, res: any) => {
    const measurement = await measurementService.verifyMeasurement(
      req.params.id,
      req.session.user!.id
    );

    res.json(measurement);
  }));

  /**
   * Update measurement
   * @route PATCH /api/measurements/:id
   * @param {string} id - Measurement ID
   * @body {Object} updateData - Measurement update data
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} measurement - Updated measurement object
   */
  app.patch("/api/measurements/:id", requireAuth, asyncHandler(async (req: any, res: any) => {
    const measurement = await measurementService.updateMeasurement(
      req.params.id,
      req.body,
      req.session.user!.id
    );

    res.json(measurement);
  }));

  /**
   * Delete measurement
   * @route DELETE /api/measurements/:id
   * @param {string} id - Measurement ID
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} message - Success message
   */
  app.delete("/api/measurements/:id", requireAuth, asyncHandler(async (req: any, res: any) => {
    await measurementService.deleteMeasurement(req.params.id, req.session.user!.id);

    res.json({ message: "Measurement deleted successfully" });
  }));
}
