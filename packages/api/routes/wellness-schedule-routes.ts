/**
 * Wellness Schedule CRUD Routes
 *
 * Manages recurring wellness questionnaire schedules.
 * Schedules define when and how often wellness requests are automatically created.
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import {
  requireAuth,
  requireOrganizationAccess,
  requireWellnessEnabled,
} from "../middleware";
import {
  createWellnessScheduleSchema,
  updateWellnessScheduleSchema,
} from "@shared/wellness-validation";
import { wellnessRepository } from "../repositories/wellness-repository";
import { computeNextRunAt } from "../lib/wellness-schedule-utils";
import type { WellnessSchedule } from "@shared/wellness-types";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";

// Rate limiter for schedule creation
const scheduleCreationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.WELLNESS_SCHEDULE_CREATION,
  message: { message: "Too many wellness schedule creation attempts, please try again later." },
  standardHeaders: 'draft-7',
  skip: (req) => shouldSkipRateLimiting(req, 'general'),
});

export function registerWellnessScheduleRoutes(app: Express) {
  /**
   * POST /api/organizations/:orgId/wellness/schedules
   * Create a new recurring wellness schedule
   */
  app.post(
    "/api/organizations/:orgId/wellness/schedules",
    requireAuth,
    scheduleCreationLimiter,
    requireOrganizationAccess("coach"),
    requireWellnessEnabled,
    async (req: Request, res: Response) => {
      try {
        const { orgId } = req.params;
        const validation = createWellnessScheduleSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validation.error.flatten().fieldErrors,
          });
        }

        const data = validation.data;

        // Compute the first next_run_at
        const nextRunAt = computeNextRunAt({
          recurrenceType: data.recurrenceType,
          daysOfWeek: data.daysOfWeek || null,
          customIntervalDays: data.customIntervalDays || null,
          scheduledTime: data.scheduledTime,
          timezone: data.timezone,
          endDate: data.endDate || null,
          maxOccurrences: data.maxOccurrences || null,
          occurrencesSent: 0,
        });

        if (!nextRunAt) {
          return res.status(400).json({
            message: "Schedule end conditions are already met — no runs would be created",
          });
        }

        const schedule = await wellnessRepository.createWellnessSchedule({
          organizationId: orgId,
          templateId: data.templateId,
          createdBy: req.user!.id,
          distributionMethod: data.distributionMethod,
          targetAthleteIds: data.targetAthleteIds || null,
          targetTeamIds: data.targetTeamIds || null,
          requiresAuth: data.requiresAuth,
          recurrenceType: data.recurrenceType,
          daysOfWeek: data.daysOfWeek || null,
          customIntervalDays: data.customIntervalDays || null,
          scheduledTime: data.scheduledTime,
          timezone: data.timezone,
          endDate: data.endDate || null,
          maxOccurrences: data.maxOccurrences || null,
          occurrencesSent: 0,
          nextRunAt,
          status: 'active',
        });

        res.status(201).json(schedule);
      } catch (error: any) {
        console.error("Failed to create wellness schedule:", error);
        res.status(500).json({ message: "Failed to create wellness schedule" });
      }
    }
  );

  /**
   * GET /api/organizations/:orgId/wellness/schedules
   * List all schedules for an organization
   */
  app.get(
    "/api/organizations/:orgId/wellness/schedules",
    requireAuth,
    requireOrganizationAccess("coach"),
    requireWellnessEnabled,
    async (req: Request, res: Response) => {
      try {
        const { orgId } = req.params;
        const schedules = await wellnessRepository.getWellnessSchedules(orgId);
        res.json(schedules);
      } catch (error: any) {
        console.error("Failed to list wellness schedules:", error);
        res.status(500).json({ message: "Failed to list wellness schedules" });
      }
    }
  );

  /**
   * PUT /api/organizations/:orgId/wellness/schedules/:id
   * Update a schedule (pause/resume/edit)
   */
  app.put(
    "/api/organizations/:orgId/wellness/schedules/:id",
    requireAuth,
    requireOrganizationAccess("coach"),
    requireWellnessEnabled,
    async (req: Request, res: Response) => {
      try {
        const { orgId, id } = req.params;
        const validation = updateWellnessScheduleSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validation.error.flatten().fieldErrors,
          });
        }

        // Verify schedule belongs to org
        const existing = await wellnessRepository.getWellnessSchedule(id);
        if (!existing || existing.organizationId !== orgId) {
          return res.status(404).json({ message: "Schedule not found" });
        }

        const data = validation.data;

        // If resuming from pause, recompute next run
        type ScheduleUpdateData = Partial<WellnessSchedule> & {
          nextRunAt?: Date | null;
        };
        const updateData: ScheduleUpdateData = { ...data };
        if (data.status === 'active' && existing.status === 'paused') {
          const nextRunAt = computeNextRunAt({
            recurrenceType: existing.recurrenceType as 'daily' | 'weekly' | 'custom',
            daysOfWeek: data.daysOfWeek || existing.daysOfWeek,
            customIntervalDays: data.customIntervalDays ?? existing.customIntervalDays,
            scheduledTime: data.scheduledTime || existing.scheduledTime,
            timezone: data.timezone || existing.timezone,
            endDate: data.endDate !== undefined ? data.endDate : existing.endDate,
            maxOccurrences: data.maxOccurrences !== undefined ? data.maxOccurrences : existing.maxOccurrences,
            occurrencesSent: existing.occurrencesSent,
          });

          if (!nextRunAt) {
            return res.status(400).json({
              message: "Cannot resume — end conditions already met",
            });
          }
          updateData.nextRunAt = nextRunAt;
        }

        const updated = await wellnessRepository.updateWellnessSchedule(id, updateData);
        res.json(updated);
      } catch (error: any) {
        console.error("Failed to update wellness schedule:", error);
        res.status(500).json({ message: "Failed to update wellness schedule" });
      }
    }
  );

  /**
   * DELETE /api/organizations/:orgId/wellness/schedules/:id
   * Cancel a schedule
   */
  app.delete(
    "/api/organizations/:orgId/wellness/schedules/:id",
    requireAuth,
    requireOrganizationAccess("coach"),
    requireWellnessEnabled,
    async (req: Request, res: Response) => {
      try {
        const { orgId, id } = req.params;

        const existing = await wellnessRepository.getWellnessSchedule(id);
        if (!existing || existing.organizationId !== orgId) {
          return res.status(404).json({ message: "Schedule not found" });
        }

        await wellnessRepository.cancelWellnessSchedule(id);
        res.json({ message: "Schedule cancelled" });
      } catch (error: any) {
        console.error("Failed to cancel wellness schedule:", error);
        res.status(500).json({ message: "Failed to cancel wellness schedule" });
      }
    }
  );
}
