/**
 * Event Report routes
 * Handles report generation specifically for events with event percentiles support
 */

import type { Express, Response } from "express";
import rateLimit from "express-rate-limit";
import { ReportService } from "../services/report-service";
import { EventService, type IEventStorage } from "../services/event-service";
import { EventMetricsService, type IMetricsStorage } from "../services/event-metrics-service";
import { EventRegistrationService, type IRegistrationStorage } from "../services/event-registration-service";
import { requireAuth, type AuthenticatedRequest } from "../middleware";
import { storage } from "../storage";
import { db } from "../db";
import { reports, insertReportSchema } from "@shared/schema";
import { desc } from "drizzle-orm";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import { ZodError } from "zod";

// Rate limiting for report generation (expensive operation)
const reportGenerationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.MUTATION,
  message: { message: "Too many report generation requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Check if user can access event reports
 */
async function canAccessEventReports(
  userId: string,
  eventId: string,
  eventService: EventService
): Promise<boolean> {
  const event = await eventService.getEvent(eventId, userId);
  if (!event) return false;

  // Site admins can access all
  const user = await storage.getUser(userId);
  if (user?.isSiteAdmin) return true;

  // If event has an organization, check org membership
  if (event.organizationId) {
    const roles = await storage.getUserRoles(userId, event.organizationId);
    return roles.includes('org_admin') || roles.includes('coach');
  }

  // Public events - creator can access
  return event.createdBy === userId;
}

export function registerEventReportRoutes(app: Express) {
  const reportService = new ReportService();
  const eventService = new EventService(storage as IEventStorage);
  const eventMetricsService = new EventMetricsService(storage as IMetricsStorage);
  const eventRegistrationService = new EventRegistrationService(storage as IRegistrationStorage);

  /**
   * GET /api/events/:eventId/reports
   * List all reports associated with an event
   */
  app.get(
    "/api/events/:eventId/reports",
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        const userId = req.user!.id;

        // Check access
        const canAccess = await canAccessEventReports(userId, eventId, eventService);
        if (!canAccess) {
          return res.status(403).json({ message: "Not authorized to view event reports" });
        }

        // Get event to get organizationId
        const event = await eventService.getEvent(eventId, userId);
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }

        // Fetch reports for this organization
        const eventReports = await db
          .select()
          .from(reports)
          .orderBy(desc(reports.createdAt));

        // Filter to reports that have eventId in config
        const filteredReports = eventReports.filter(report => {
          // Only include reports from the same organization (if event has one)
          if (event.organizationId && report.organizationId !== event.organizationId) {
            return false;
          }
          const config = report.config as Record<string, unknown>;
          return config?.eventId === eventId;
        });

        return res.json(filteredReports);
      } catch (error: unknown) {
        console.error("Error fetching event reports:", error);
        const message = error instanceof Error ? error.message : "Failed to fetch event reports";
        return res.status(500).json({ message });
      }
    }
  );

  /**
   * POST /api/events/:eventId/reports
   * Create a new report for an event
   */
  app.post(
    "/api/events/:eventId/reports",
    requireAuth,
    reportGenerationLimiter,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        const userId = req.user!.id;
        const { name, reportType, athleteIds, includeEventPercentiles, metrics } = req.body;

        // Check access
        const canAccess = await canAccessEventReports(userId, eventId, eventService);
        if (!canAccess) {
          return res.status(403).json({ message: "Not authorized to create event reports" });
        }

        // Get event details
        const event = await eventService.getEvent(eventId, userId);
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }

        // Build report config with eventId
        const config: Record<string, unknown> = {
          eventId,
          includeEventPercentiles: includeEventPercentiles ?? true,
          timeframe: {
            type: 'custom',
            customStart: event.startDate ? new Date(event.startDate).toISOString().split('T')[0] : undefined,
            customEnd: event.endDate ? new Date(event.endDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          },
          metrics: metrics || [],
        };

        if (reportType === 'individual' && athleteIds) {
          config.athleteIds = athleteIds;
          // Store first athlete for individual report generation
          if (Array.isArray(athleteIds) && athleteIds.length > 0) {
            config.athleteId = athleteIds[0];
          }
        }

        // Validate and create report
        const reportData = {
          name: name || `${event.name} - ${reportType === 'team' ? 'Team Report' : 'Individual Report'}`,
          organizationId: event.organizationId,
          reportType,
          config,
          createdBy: userId,
        };

        const validated = insertReportSchema.parse(reportData);

        const [newReport] = await db
          .insert(reports)
          .values({
            ...validated,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return res.status(201).json(newReport);
      } catch (error: unknown) {
        console.error("Error creating event report:", error);
        if (error instanceof ZodError) {
          return res.status(400).json({ message: "Invalid report data", errors: error.errors });
        }
        const message = error instanceof Error ? error.message : "Failed to create event report";
        return res.status(500).json({ message });
      }
    }
  );

  /**
   * POST /api/events/:eventId/quick-report
   * Generate a quick one-click report for an event
   */
  app.post(
    "/api/events/:eventId/quick-report",
    requireAuth,
    reportGenerationLimiter,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        const userId = req.user!.id;
        const { reportType = 'team' } = req.body;

        // Check access
        const canAccess = await canAccessEventReports(userId, eventId, eventService);
        if (!canAccess) {
          return res.status(403).json({ message: "Not authorized to generate event reports" });
        }

        // Get event details
        const event = await eventService.getEvent(eventId, userId);
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }

        // Get event metrics using the dedicated service
        const eventMetrics = await eventMetricsService.listEventMetrics(eventId);
        const metricCodes = eventMetrics.map((m) => m.metricCode);

        if (metricCodes.length === 0) {
          return res.status(400).json({ message: "No metrics configured for this event" });
        }

        // Build report config
        const config: Record<string, unknown> = {
          eventId,
          includeEventPercentiles: true,
          timeframe: {
            type: 'custom',
            customStart: event.startDate ? new Date(event.startDate).toISOString().split('T')[0] : undefined,
            customEnd: event.endDate ? new Date(event.endDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          },
          metrics: metricCodes,
        };

        // For individual reports, get athlete from registrations
        let athleteId: string | undefined;
        if (reportType === 'individual') {
          const registrations = await eventRegistrationService.listRegistrations(eventId, userId);
          const approvedRegistrations = registrations.filter(
            (r) => r.status === 'approved' || r.status === 'checked_in'
          );

          if (approvedRegistrations.length === 0) {
            return res.status(400).json({ message: "No athletes registered for this event" });
          }

          athleteId = approvedRegistrations[0].userId;
          config.athleteId = athleteId;
        }

        // Create report record
        const reportData = {
          name: `${event.name} - ${reportType === 'team' ? 'Team Summary' : 'Individual Report'}`,
          organizationId: event.organizationId,
          reportType,
          config,
          createdBy: userId,
        };

        const validated = insertReportSchema.parse(reportData);

        const [newReport] = await db
          .insert(reports)
          .values({
            ...validated,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        // Generate report data using the correct service method signatures
        let generatedData;
        if (reportType === 'team') {
          generatedData = await reportService.generateTeamReport(newReport.id, userId);
        } else {
          if (!athleteId) {
            return res.status(400).json({ message: "Athlete ID required for individual report" });
          }
          generatedData = await reportService.generateIndividualReport(newReport.id, userId, athleteId);
        }

        return res.status(201).json({
          report: newReport,
          data: generatedData,
          generatedAt: new Date().toISOString(),
        });
      } catch (error: unknown) {
        console.error("Error generating quick event report:", error);
        if (error instanceof ZodError) {
          return res.status(400).json({ message: "Invalid report data", errors: error.errors });
        }
        const message = error instanceof Error ? error.message : "Failed to generate quick report";
        return res.status(500).json({ message });
      }
    }
  );
}
